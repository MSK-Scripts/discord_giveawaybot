import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import { getGiveaway, rerollAll, rerollSingle } from '../services/giveawayService.js';
import { isManager } from '../utils/permissions.js';
import { t } from '../utils/i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('greroll')
    .setDescription('Draw new winners for an ended giveaway')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('id').setDescription('Giveaway ID').setRequired(true))
    .addUserOption((o) => o.setName('winner').setDescription('Replace only this single winner (optional)').setRequired(false)),

  async execute(client, interaction) {
    const guildId = interaction.guildId;
    const settings = await getSettings(guildId);
    if (!isManager(interaction, settings)) {
      return interaction.reply({ content: t(guildId, 'error.no_permission'), flags: MessageFlags.Ephemeral });
    }

    const id = interaction.options.getString('id', true).trim().toUpperCase();
    const targetWinner = interaction.options.getUser('winner', false);
    const giveaway = await getGiveaway(id, guildId);
    if (!giveaway) {
      return interaction.reply({ content: t(guildId, 'error.not_found'), flags: MessageFlags.Ephemeral });
    }
    if (giveaway.status !== 'ENDED') {
      return interaction.reply({ content: t(guildId, 'error.not_ended'), flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const actor = `<@${interaction.user.id}>`;

    // ── Einzelnen Gewinner ersetzen ──────────────────────────────────────────
    if (targetWinner) {
      const res = await rerollSingle(client, giveaway, settings, targetWinner.id, { actor });
      if (res.error === 'not_winner') {
        return interaction.editReply({ content: t(guildId, 'reroll.not_winner', { user: `<@${targetWinner.id}>` }) });
      }
      if (res.error === 'no_valid' || !res.newWinner) {
        return interaction.editReply({ content: t(guildId, 'reroll.no_valid', { title: giveaway.title }) });
      }
      return interaction.editReply({ content: t(guildId, 'reroll.success', { id }) });
    }

    // ── Alle Gewinner neu ziehen ─────────────────────────────────────────────
    const newWinners = await rerollAll(client, giveaway, settings, { actor });
    if (newWinners.length === 0) {
      return interaction.editReply({ content: t(guildId, 'reroll.no_valid', { title: giveaway.title }) });
    }
    return interaction.editReply({ content: t(guildId, 'reroll.success', { id }) });
  },
};
