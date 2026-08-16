import { SlashCommandBuilder, MessageFlags, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import {
  saveTemplate, listTemplates, getTemplate, deleteTemplate, countTemplates,
  normalizeTemplateInput, MAX_TEMPLATES,
} from '../services/templateService.js';
import { postGiveaway, sendGuildLog } from '../services/giveawayService.js';
import { isManager } from '../utils/permissions.js';
import { parseDuration } from '../utils/duration.js';
import { resolveColor } from '../utils/embeds.js';
import { parsePrizes, inlinePrizes, PRIZE_MODES, MAX_PRIZES } from '../utils/prizes.js';
import { t } from '../utils/i18n.js';
import { logger } from '../utils/logger.js';

const REQUIRED_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

export default {
  data: new SlashCommandBuilder()
    .setName('gtemplate')
    .setDescription('Manage giveaway templates')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName('save')
        .setDescription('Save (or overwrite) a template')
        .addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true))
        .addStringOption((o) => o.setName('title').setDescription('Giveaway title').setRequired(true))
        .addStringOption((o) => o.setName('description').setDescription('Giveaway description').setRequired(true))
        .addStringOption((o) => o.setName('duration').setDescription('e.g. 1d2h30m').setRequired(true))
        .addIntegerOption((o) => o.setName('winners').setDescription('Number of winners (1-100)').setMinValue(1).setMaxValue(100))
        .addStringOption((o) => o.setName('prizes').setDescription('Prizes, separated by | (e.g. Script A | Script B)'))
        .addStringOption((o) =>
          o
            .setName('mode')
            .setDescription('How the prizes are handed out')
            .addChoices(
              { name: 'Everyone gets all prizes', value: 'ALL' },
              { name: 'One prize per winner', value: 'INDIVIDUAL' },
            ),
        ),
    )
    .addSubcommand((s) => s.setName('list').setDescription('List all templates'))
    .addSubcommand((s) =>
      s.setName('delete').setDescription('Delete a template').addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName('use').setDescription('Create a giveaway from a template in this channel').addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true)),
    ),

  async execute(client, interaction) {
    const guildId = interaction.guildId;
    const settings = await getSettings(guildId);
    if (!isManager(interaction, settings)) {
      return interaction.reply({ content: t(guildId, 'error.no_permission'), flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

    if (sub === 'save') {
      const name = interaction.options.getString('name', true).trim();

      // Geprüft wird zentral, damit Command und Dashboard dieselbe Vorstellung
      // davon haben, was eine gültige Vorlage ist.
      const input = normalizeTemplateInput({
        name,
        title: interaction.options.getString('title', true),
        description: interaction.options.getString('description', true),
        duration: interaction.options.getString('duration', true),
        winnersCount: interaction.options.getInteger('winners') ?? 1,
        prizes: interaction.options.getString('prizes') ?? '',
        prizeMode: interaction.options.getString('mode') ?? PRIZE_MODES[0],
      });
      if (!input.ok) {
        if (input.error === 'invalid_duration') return reply(t(guildId, 'create.invalid_duration'));
        if (input.error === 'winners_locked') return reply(t(guildId, 'edit.winners_locked'));
        if (input.error === 'too_many_prizes' || input.error === 'individual_needs_prizes') {
          const key = input.error === 'too_many_prizes' ? 'create.too_many_prizes' : 'create.no_prizes';
          return reply(t(guildId, key, { max: MAX_PRIZES }));
        }
        return reply(t(guildId, 'error.generic'));
      }

      // Nur beim Anlegen begrenzen: ein Überschreiben muss auch am Limit gehen,
      // sonst sperrt sich eine Guild mit vollen Vorlagen selbst aus.
      const existing = await getTemplate(guildId, name);
      if (!existing && (await countTemplates(guildId)) >= MAX_TEMPLATES) {
        return reply(t(guildId, 'template.limit', { max: MAX_TEMPLATES }));
      }

      await saveTemplate(guildId, input.data);
      await sendGuildLog(client, settings, t(guildId, 'log.template_saved', { name, user: `<@${interaction.user.id}>` }));
      return reply(t(guildId, 'template.saved', { name }));
    }

    if (sub === 'list') {
      const templates = await listTemplates(guildId);
      if (!templates.length) return reply(t(guildId, 'template.empty'));
      const embed = new EmbedBuilder()
        .setColor(resolveColor(settings.embedColor))
        .setTitle(t(guildId, 'template.list_title'))
        .setDescription(
          templates
            .map((tpl) => {
              let line = t(guildId, 'template.entry', {
                name: tpl.name, title: tpl.title, duration: tpl.duration, winners: tpl.winnersCount,
              });
              const prizes = parsePrizes(tpl.prizes);
              // Die Preise stehen in einer zweiten Zeile: sie können lang werden
              // und würden die Übersicht sonst unlesbar machen.
              if (prizes.length) line += `\n   ${t(guildId, 'template.prizes')}: ${inlinePrizes(prizes)}`;
              return line;
            })
            .join('\n'),
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'delete') {
      const name = interaction.options.getString('name', true).trim();
      const ok = await deleteTemplate(guildId, name);
      if (ok) await sendGuildLog(client, settings, t(guildId, 'log.template_deleted', { name, user: `<@${interaction.user.id}>` }));
      return reply(ok ? t(guildId, 'template.deleted', { name }) : t(guildId, 'template.not_found', { name }));
    }

    if (sub === 'use') {
      const name = interaction.options.getString('name', true).trim();
      const tpl = await getTemplate(guildId, name);
      if (!tpl) return reply(t(guildId, 'template.not_found', { name }));

      const dur = parseDuration(tpl.duration);
      if (!dur.ok) return reply(t(guildId, 'create.invalid_duration'));

      const channel = interaction.channel ?? (await client.channels.fetch(interaction.channelId).catch(() => null));
      if (!channel) return reply(t(guildId, 'error.no_channel'));
      const perms = channel.permissionsFor(client.user);
      if (!perms || !perms.has(REQUIRED_PERMS)) {
        const missing = ['ViewChannel', 'SendMessages', 'EmbedLinks'].filter((p) => !perms?.has(PermissionFlagsBits[p]));
        return reply(t(guildId, 'error.channel_perms', { perms: missing.join(', ') }));
      }

      try {
        // Preise und Modus reisen mit. postGiveaway leitet die Gewinnerzahl im
        // INDIVIDUAL-Modus selbst aus der Preisliste ab.
        const id = await postGiveaway(client, channel, settings, {
          guildId,
          hostId: interaction.user.id,
          title: tpl.title,
          description: tpl.description,
          prizes: parsePrizes(tpl.prizes),
          prizeMode: tpl.prizeMode,
          winnersCount: tpl.winnersCount,
          endAt: new Date(Date.now() + dur.ms),
        });
        return reply(t(guildId, 'create.success', { id }));
      } catch (err) {
        logger.error('gtemplate use postGiveaway:', err);
        return reply(t(guildId, 'error.generic'));
      }
    }
  },
};
