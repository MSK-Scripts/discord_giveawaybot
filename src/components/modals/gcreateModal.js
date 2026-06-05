// Modal-Submit-Handler für /gcreate (customId "gw:create").
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { parseDuration } from '../../utils/duration.js';
import { getSettings } from '../../services/settingsService.js';
import { postGiveaway } from '../../services/giveawayService.js';
import { t } from '../../utils/i18n.js';
import { logger } from '../../utils/logger.js';

const REQUIRED_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

export default {
  customId: 'gw:create',
  async execute(client, interaction) {
    const guildId = interaction.guildId;
    const settings = await getSettings(guildId);

    const title = interaction.fields.getTextInputValue('title').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    const durationRaw = interaction.fields.getTextInputValue('duration').trim();
    const winnersRaw = interaction.fields.getTextInputValue('winners').trim();
    const prize = interaction.fields.getTextInputValue('prize')?.trim() || null;

    // Dauer validieren.
    const dur = parseDuration(durationRaw);
    if (!dur.ok) {
      return interaction.reply({ content: t(guildId, 'create.invalid_duration'), flags: MessageFlags.Ephemeral });
    }

    // Gewinneranzahl validieren (1..100).
    const winnersCount = Number.parseInt(winnersRaw, 10);
    if (!Number.isInteger(winnersCount) || winnersCount < 1 || winnersCount > 100) {
      return interaction.reply({ content: t(guildId, 'create.invalid_winners'), flags: MessageFlags.Ephemeral });
    }

    // Ziel-Channel ermitteln (kann uncached null sein).
    const channel = interaction.channel ?? (await client.channels.fetch(interaction.channelId).catch(() => null));
    if (!channel) {
      return interaction.reply({ content: t(guildId, 'error.no_channel'), flags: MessageFlags.Ephemeral });
    }

    // Channel-Override-Check: effektive Rechte des Bots im Ziel-Channel.
    const perms = channel.permissionsFor(client.user);
    if (!perms || !perms.has(REQUIRED_PERMS)) {
      const missing = ['ViewChannel', 'SendMessages', 'EmbedLinks'].filter(
        (p) => !perms?.has(PermissionFlagsBits[p]),
      );
      return interaction.reply({
        content: t(guildId, 'error.channel_perms', { perms: missing.join(', ') }),
        flags: MessageFlags.Ephemeral,
      });
    }

    const endAt = new Date(Date.now() + dur.ms);

    // Giveaway anlegen + posten (gemeinsame Logik, mit Rollback bei Sende-Fehler).
    let id;
    try {
      id = await postGiveaway(client, channel, settings, {
        guildId,
        hostId: interaction.user.id,
        title,
        description,
        prize,
        winnersCount,
        endAt,
      });
    } catch (err) {
      logger.error('gcreateModal postGiveaway:', err);
      return interaction.reply({ content: t(guildId, 'error.generic'), flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({ content: t(guildId, 'create.success', { id }), flags: MessageFlags.Ephemeral });
  },
};
