import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import { buildHelpEmbed } from '../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ghelp')
    .setDescription('Show all commands with a short description'),

  async execute(client, interaction) {
    const guildId = interaction.guildId;
    const settings = interaction.inGuild() ? await getSettings(guildId) : null;
    return interaction.reply({
      embeds: [buildHelpEmbed(guildId, settings)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
