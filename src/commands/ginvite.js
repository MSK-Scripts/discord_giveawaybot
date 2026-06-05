import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  PermissionFlagsBits,
  OAuth2Scopes,
} from 'discord.js';
import { getSettings } from '../services/settingsService.js';
import { resolveColor } from '../utils/embeds.js';
import { t } from '../utils/i18n.js';

// Benötigte Bot-Permissions — NICHT hartkodiert, aus den Flags zusammengesetzt.
// Entspricht dem empfohlenen Integer 478208 (inkl. MentionEveryone für
// nicht-mentionbare Notify-Rollen). allowedMentions begrenzt Pings zur Laufzeit.
const PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.UseExternalEmojis,
  PermissionFlagsBits.MentionEveryone,
];

export default {
  data: new SlashCommandBuilder().setName('ginvite').setDescription("Get the bot's invite link"),

  async execute(client, interaction) {
    const guildId = interaction.guildId;
    const settings = interaction.inGuild() ? await getSettings(guildId) : null;

    const url = client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: PERMISSIONS,
    });

    const embed = new EmbedBuilder()
      .setColor(resolveColor(settings?.embedColor))
      .setTitle(t(guildId, 'invite.title'))
      .setDescription(t(guildId, 'invite.description', { url }));

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
