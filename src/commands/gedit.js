import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import { getGiveaway, editActiveMessage, sendGuildLog } from '../services/giveawayService.js';
import { isManager } from '../utils/permissions.js';
import { prisma } from '../database/prisma.js';
import { t } from '../utils/i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gedit')
    .setDescription('Edit a running giveaway (title, description, winners, prize)')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('id').setDescription('Giveaway ID').setRequired(true))
    .addStringOption((o) => o.setName('title').setDescription('New title').setMaxLength(256).setRequired(false))
    .addStringOption((o) => o.setName('description').setDescription('New description').setMaxLength(2000).setRequired(false))
    .addIntegerOption((o) => o.setName('winners').setDescription('Number of winners (1-100)').setMinValue(1).setMaxValue(100).setRequired(false))
    .addStringOption((o) => o.setName('prize').setDescription('New prize').setMaxLength(256).setRequired(false)),

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
    const prize = interaction.options.getString('prize', false);
    if (title != null) data.title = title.trim();
    if (description != null) data.description = description.trim();
    if (winners != null) data.winnersCount = winners;
    if (prize != null) data.prize = prize.trim();

    if (Object.keys(data).length === 0) {
      return interaction.reply({ content: t(guildId, 'edit.nothing'), flags: MessageFlags.Ephemeral });
    }

    const updated = await prisma.giveaway.update({ where: { id }, data });
    await editActiveMessage(client, updated, settings, {
      disabled: updated.status !== 'ACTIVE',
      paused: updated.status === 'PAUSED',
    });
    await sendGuildLog(client, settings, t(guildId, 'log.edited', { id, title: updated.title, user: `<@${interaction.user.id}>` }));
    return interaction.reply({ content: t(guildId, 'edit.success', { id }), flags: MessageFlags.Ephemeral });
  },
};
