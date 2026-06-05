import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import { getGuildStats } from '../services/giveawayService.js';
import { buildStatsEmbed } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gstats')
    .setDescription("Show this server's giveaway statistics")
    .setDMPermission(false),

  async execute(client, interaction) {
    const guildId = interaction.guildId;
    const settings = await getSettings(guildId);
    const stats = await getGuildStats(guildId);
    return interaction.reply({
      embeds: [buildStatsEmbed(guildId, settings, stats)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
