import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import { getGiveaway, drawWinners, getWinnerIds, sendGuildLog } from '../services/giveawayService.js';
import { isManager } from '../utils/permissions.js';
import { prisma } from '../database/prisma.js';
import { t } from '../utils/i18n.js';
import { logger } from '../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('greroll')
    .setDescription('Draw new winners for an ended giveaway')
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
    if (giveaway.status !== 'ENDED') {
      return interaction.reply({ content: t(guildId, 'error.not_ended'), flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const previousWinners = await getWinnerIds(id);
    const newWinners = guild
      ? await drawWinners(giveaway, guild, settings, { exclude: previousWinners })
      : [];

    if (newWinners.length === 0) {
      return interaction.editReply({ content: t(guildId, 'reroll.no_valid', { title: giveaway.title }) });
    }

    // Alte Gewinner als rerolled markieren, neue eintragen.
    await prisma.winner.updateMany({ where: { giveawayId: id }, data: { rerolled: true } });
    await prisma.winner.createMany({
      data: newWinners.map((userId) => ({ giveawayId: id, userId })),
      skipDuplicates: true,
    });

    // Reroll-Nachricht im Giveaway-Channel posten.
    try {
      const channel = await client.channels.fetch(giveaway.channelId);
      const mentions = newWinners.map((u) => `<@${u}>`).join(', ');
      await channel.send({
        content: t(guildId, 'reroll.winners', { title: giveaway.title, winners: mentions }),
        allowedMentions: { users: newWinners },
      });
    } catch (err) {
      logger.warn('greroll: Nachricht konnte nicht gepostet werden:', err?.message ?? err);
    }

    await sendGuildLog(client, settings, t(guildId, 'log.rerolled', { id, title: giveaway.title, user: `<@${interaction.user.id}>` }));
    return interaction.editReply({ content: t(guildId, 'reroll.success', { id }) });
  },
};
