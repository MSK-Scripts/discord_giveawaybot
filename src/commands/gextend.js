import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import { getGiveaway, editActiveMessage, sendGuildLog } from '../services/giveawayService.js';
import { isManager } from '../utils/permissions.js';
import { parseDuration } from '../utils/duration.js';
import { prisma } from '../database/prisma.js';
import { t } from '../utils/i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gextend')
    .setDescription('Extend the end time of a running giveaway')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('id').setDescription('Giveaway ID').setRequired(true))
    .addStringOption((o) => o.setName('duration').setDescription('How much to add, e.g. 1h, 30m, 1d').setRequired(true)),

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

    const dur = parseDuration(interaction.options.getString('duration', true).trim());
    if (!dur.ok) {
      return interaction.reply({ content: t(guildId, 'create.invalid_duration'), flags: MessageFlags.Ephemeral });
    }

    const newEndAt = new Date(new Date(giveaway.endAt).getTime() + dur.ms);
    const data = { endAt: newEndAt };

    // Reminder neu einplanen, falls aktiviert und der neue Zeitpunkt in der Zukunft liegt.
    const reminderMin = Number(settings.reminderMinutes) || 0;
    if (reminderMin > 0) {
      const r = new Date(newEndAt.getTime() - reminderMin * 60000);
      if (r.getTime() > Date.now()) {
        data.reminderAt = r;
        data.reminderSent = false;
      }
    }

    const updated = await prisma.giveaway.update({ where: { id }, data });
    await editActiveMessage(client, updated, settings, {
      disabled: updated.status !== 'ACTIVE',
      paused: updated.status === 'PAUSED',
    });
    const ends = `<t:${Math.floor(newEndAt.getTime() / 1000)}:R>`;
    return interaction.reply({ content: t(guildId, 'extend.success', { id, ends }), flags: MessageFlags.Ephemeral });
  },
};
