import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import { getGiveaway, editActiveMessage, sendGuildLog } from '../services/giveawayService.js';
import { isManager } from '../utils/permissions.js';
import { prisma } from '../database/prisma.js';
import { giveawayPrizes, normalizePrizeInput, serializePrizes, normalizePrizeMode, MAX_PRIZES } from '../utils/prizes.js';
import { normalizeWinnerMode } from '../utils/winnerMode.js';
import { t } from '../utils/i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gedit')
    .setDescription('Edit a running giveaway (title, description, winners, prizes)')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('id').setDescription('Giveaway ID').setRequired(true))
    .addStringOption((o) => o.setName('title').setDescription('New title').setMaxLength(256).setRequired(false))
    .addStringOption((o) => o.setName('description').setDescription('New description').setMaxLength(2000).setRequired(false))
    .addIntegerOption((o) => o.setName('winners').setDescription('Number of winners (1-100)').setMinValue(1).setMaxValue(100).setRequired(false))
    // Slash-Optionen kennen keine Zeilenumbrüche, deshalb hier mit | getrennt.
    .addStringOption((o) => o.setName('prizes').setDescription('New prizes, separated by | (e.g. "Nitro | Steam key")').setMaxLength(2000).setRequired(false))
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('How multiple prizes are handed out')
        .setRequired(false)
        .addChoices(
          { name: 'Everyone gets all prizes', value: 'ALL' },
          { name: 'One prize per winner', value: 'INDIVIDUAL' },
        ),
    )
    .addStringOption((o) =>
      o
        .setName('draw')
        .setDescription('How winners are determined')
        .setRequired(false)
        .addChoices(
          { name: 'Random draw when it ends', value: 'RANDOM' },
          { name: 'First click wins (ends instantly)', value: 'FIRST_CLICK' },
        ),
    ),

  async execute(client, interaction) {
    const guildId = interaction.guildId;
    const settings = await getSettings(guildId);
    if (!isManager(interaction, settings)) {
      return interaction.reply({ content: t(guildId, 'error.no_permission'), flags: MessageFlags.Ephemeral });
    }

    const id = interaction.options.getString('id', true).trim().toUpperCase();
    const giveaway = await getGiveaway(id, guildId);
    if (!giveaway) {
      return interaction.reply({ content: t(guildId, 'error.not_found'), flags: MessageFlags.Ephemeral });
    }
    if (giveaway.status !== 'ACTIVE' && giveaway.status !== 'PAUSED') {
      return interaction.reply({ content: t(guildId, 'error.not_active'), flags: MessageFlags.Ephemeral });
    }

    const data = {};
    const title = interaction.options.getString('title', false);
    const description = interaction.options.getString('description', false);
    const winners = interaction.options.getInteger('winners', false);
    const prizes = interaction.options.getString('prizes', false);
    const mode = interaction.options.getString('mode', false);
    const draw = interaction.options.getString('draw', false);
    if (title != null) data.title = title.trim();
    if (description != null) data.description = description.trim();
    if (winners != null) data.winnersCount = winners;
    // The mode can be switched while the giveaway runs, but switching ends
    // nothing. Entries that already exist keep their order: if the fastest wins
    // from now on, that is whoever clicked first, even if that was hours ago.
    // Ending therefore waits for the next click or the deadline, because an
    // edit must not hand out prizes.
    if (draw != null) data.winnerMode = normalizeWinnerMode(draw);

    // Preise und Modus hängen zusammen: wer nur eines von beiden ändert, bekommt
    // den bestehenden Wert des anderen dazu, sonst stimmt die Gewinnerzahl nicht mehr.
    if (prizes != null || mode != null) {
      const input = normalizePrizeInput({
        prizes: prizes != null ? prizes : giveawayPrizes(giveaway),
        mode: mode ?? giveaway.prizeMode,
        winnersCount: winners ?? giveaway.winnersCount,
      });
      if (!input.ok) {
        const key = input.error === 'too_many_prizes' ? 'create.too_many_prizes' : 'create.no_prizes';
        return interaction.reply({ content: t(guildId, key, { max: MAX_PRIZES }), flags: MessageFlags.Ephemeral });
      }
      if (winners != null && input.mode === 'INDIVIDUAL' && winners !== input.winnersCount) {
        return interaction.reply({ content: t(guildId, 'edit.winners_locked'), flags: MessageFlags.Ephemeral });
      }
      data.prizes = serializePrizes(input.prizes);
      data.prizeMode = input.mode;
      data.winnersCount = input.winnersCount;
    } else if (winners != null && normalizePrizeMode(giveaway.prizeMode) === 'INDIVIDUAL') {
      // Ein Preis pro Gewinner: die Gewinnerzahl folgt der Preisliste, nicht der Eingabe.
      return interaction.reply({ content: t(guildId, 'edit.winners_locked'), flags: MessageFlags.Ephemeral });
    }

    if (Object.keys(data).length === 0) {
      return interaction.reply({ content: t(guildId, 'edit.nothing'), flags: MessageFlags.Ephemeral });
    }

    const updated = await prisma.giveaway.update({ where: { id }, data });
    await editActiveMessage(client, updated, settings, {
      disabled: updated.status !== 'ACTIVE',
      paused: updated.status === 'PAUSED',
    });
    await sendGuildLog(client, settings, t(guildId, 'log.edited', { id, title: updated.title, user: `<@${interaction.user.id}>` }));
    let content = t(guildId, 'edit.success', { id });
    if (data.winnerMode === 'FIRST_CLICK') content += `
${t(guildId, 'edit.first_click_note')}`;
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  },
};
