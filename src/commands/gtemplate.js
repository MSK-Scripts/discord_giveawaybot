import { SlashCommandBuilder, MessageFlags, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import { saveTemplate, listTemplates, getTemplate, deleteTemplate } from '../services/templateService.js';
import { postGiveaway } from '../services/giveawayService.js';
import { isManager } from '../utils/permissions.js';
import { parseDuration } from '../utils/duration.js';
import { resolveColor } from '../utils/embeds.js';
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
        .addIntegerOption((o) => o.setName('winners').setDescription('Number of winners (1-100)').setMinValue(1).setMaxValue(100).setRequired(true)),
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
      const duration = interaction.options.getString('duration', true).trim();
      if (!parseDuration(duration).ok) return reply(t(guildId, 'create.invalid_duration'));
      await saveTemplate(guildId, {
        name,
        title: interaction.options.getString('title', true).trim(),
        description: interaction.options.getString('description', true).trim(),
        duration,
        winnersCount: interaction.options.getInteger('winners', true),
      });
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
            .map((tpl) => t(guildId, 'template.entry', { name: tpl.name, title: tpl.title, duration: tpl.duration, winners: tpl.winnersCount }))
            .join('\n'),
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'delete') {
      const name = interaction.options.getString('name', true).trim();
      const ok = await deleteTemplate(guildId, name);
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
        const id = await postGiveaway(client, channel, settings, {
          guildId,
          hostId: interaction.user.id,
          title: tpl.title,
          description: tpl.description,
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
