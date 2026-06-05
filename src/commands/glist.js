import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import { listActive } from '../services/giveawayService.js';
import { buildListEmbed } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('glist')
    .setDescription('List the active giveaways in this server')
    .setDMPermission(false),

  async execute(client, interaction) {
    const guildId = interaction.guildId;
    const settings = await getSettings(guildId);
    const giveaways = await listActive(guildId);
    return interaction.reply({
      embeds: [buildListEmbed(guildId, giveaways, settings)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
