import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import { getGiveaway, countEntries, getWinnerIds } from '../services/giveawayService.js';
import { buildInfoEmbed } from '../utils/embeds.js';
import { t } from '../utils/i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ginfo')
    .setDescription('Show details about a giveaway')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('id').setDescription('Giveaway ID').setRequired(true)),

  async execute(client, interaction) {
    const guildId = interaction.guildId;
    const settings = await getSettings(guildId);

    const id = interaction.options.getString('id', true).trim().toUpperCase();
    const giveaway = await getGiveaway(id, guildId);
    if (!giveaway) {
      return interaction.reply({ content: t(guildId, 'error.not_found'), flags: MessageFlags.Ephemeral });
    }

    const [entryCount, winnerIds] = await Promise.all([
      countEntries(id),
      getWinnerIds(id, { onlyActive: true }),
    ]);

    return interaction.reply({
      embeds: [buildInfoEmbed(guildId, giveaway, { entryCount, winnerIds, settings })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
