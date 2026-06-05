import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import { getGiveaway, endGiveaway } from '../services/giveawayService.js';
import { isManager } from '../utils/permissions.js';
import { t } from '../utils/i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gend')
    .setDescription('End an active giveaway immediately and draw winners')
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

    // endGiveaway zieht Gewinner, postet Ergebnis und editiert die Original-Nachricht.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await endGiveaway(giveaway, client);
    return interaction.editReply({ content: t(guildId, 'end.success', { id }) });
  },
};
