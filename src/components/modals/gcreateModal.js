// Modal-Submit-Handler für /gcreate (customId "gw:create:<PRIZE_MODE>").
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { parseDuration } from '../../utils/duration.js';
import { getSettings } from '../../services/settingsService.js';
import { postGiveaway } from '../../services/giveawayService.js';
import { normalizePrizeInput, MAX_PRIZES } from '../../utils/prizes.js';
import { normalizeWinnerMode } from '../../utils/winnerMode.js';
import { t } from '../../utils/i18n.js';
import { logger } from '../../utils/logger.js';

const REQUIRED_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

export default {
  // A prefix instead of an exact match: the prize distribution and the winner
  // selection travel along in the customId, because both are set as a slash
  // option on /gcreate and the modal cannot ask back.
  prefix: 'gw:create',
  async execute(client, interaction) {
    const guildId = interaction.guildId;
    const settings = await getSettings(guildId);
    const parts = interaction.customId.split(':');
    const mode = parts[2] ?? 'ALL';
    // A missing fourth part means the customId comes from before the first-click
    // change. RANDOM is the right behaviour there.
    const winnerMode = normalizeWinnerMode(parts[3]);

    // getTextInputValue wirft für nicht gesendete Felder — im INDIVIDUAL-Modus
    // enthält das Modal kein Gewinner-Feld, dort bestimmt die Preisliste die Zahl.
    const field = (id, fallback = '') => {
      try {
        return interaction.fields.getTextInputValue(id) ?? fallback;
      } catch {
        return fallback;
      }
    };

    const title = field('title').trim();
    const description = field('description').trim();
    const durationRaw = field('duration').trim();
    const prizesRaw = field('prizes');
    const winnersRaw = field('winners', '1').trim();

    // Dauer validieren.
    const dur = parseDuration(durationRaw);
    if (!dur.ok) {
      return interaction.reply({ content: t(guildId, 'create.invalid_duration'), flags: MessageFlags.Ephemeral });
    }

    // Gewinneranzahl validieren (1..100).
    const requestedWinners = Number.parseInt(winnersRaw, 10);
    if (!Number.isInteger(requestedWinners) || requestedWinners < 1 || requestedWinners > 100) {
      return interaction.reply({ content: t(guildId, 'create.invalid_winners'), flags: MessageFlags.Ephemeral });
    }

    // Preise + Modus normalisieren; im INDIVIDUAL-Modus fällt dabei die
    // Gewinnerzahl aus der Preisliste.
    const prizeInput = normalizePrizeInput({ prizes: prizesRaw, mode, winnersCount: requestedWinners });
    if (!prizeInput.ok) {
      const key = prizeInput.error === 'too_many_prizes' ? 'create.too_many_prizes' : 'create.no_prizes';
      return interaction.reply({ content: t(guildId, key, { max: MAX_PRIZES }), flags: MessageFlags.Ephemeral });
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
        prizes: prizeInput.prizes,
        prizeMode: prizeInput.mode,
        winnerMode,
        winnersCount: prizeInput.winnersCount,
        endAt,
      });
    } catch (err) {
      logger.error('gcreateModal postGiveaway:', err);
      return interaction.reply({ content: t(guildId, 'error.generic'), flags: MessageFlags.Ephemeral });
    }

    // Im INDIVIDUAL-Modus die abgeleitete Gewinnerzahl nennen, damit sie nicht überrascht.
    let content = prizeInput.mode === 'INDIVIDUAL'
      ? t(guildId, 'create.success_individual', { id, count: prizeInput.winnersCount })
      : t(guildId, 'create.success', { id });
    // The mode changes what the button does. Somebody who set it by accident
    // should find out here and not once the prize is gone.
    if (winnerMode === 'FIRST_CLICK') content += `
${t(guildId, 'create.first_click_note')}`;
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  },
};
