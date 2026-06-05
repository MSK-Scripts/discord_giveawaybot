import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import { getGiveaway, cancelGiveaway, sendGuildLog } from '../services/giveawayService.js';
import { isManager } from '../utils/permissions.js';
import { buildCancelledEmbed, buildButtonRow } from '../utils/embeds.js';
import { t } from '../utils/i18n.js';
import { logger } from '../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gcancel')
    .setDescription('Cancel an active giveaway (no winner)')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('id').setDescription('Giveaway ID').setRequired(true)),

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
    if (giveaway.status !== 'ACTIVE') {
      return interaction.reply({ content: t(guildId, 'error.not_active'), flags: MessageFlags.Ephemeral });
    }

    await cancelGiveaway(id, guildId);

    // Original-Nachricht aktualisieren (gelöschte Nachricht abfangen).
    if (giveaway.messageId) {
      try {
        const channel = await client.channels.fetch(giveaway.channelId);
        const msg = await channel.messages.fetch(giveaway.messageId);
        await msg.edit({
          embeds: [buildCancelledEmbed(giveaway, settings)],
          components: [buildButtonRow(giveaway, settings, { disabled: true })],
        });
      } catch (err) {
        logger.warn(`gcancel: Original-Nachricht nicht editierbar:`, err?.message ?? err);
      }
    }

    await sendGuildLog(client, settings, t(guildId, 'log.cancelled', { id, title: giveaway.title, user: `<@${interaction.user.id}>` }));
    return interaction.reply({ content: t(guildId, 'cancel.success', { id }), flags: MessageFlags.Ephemeral });
  },
};
