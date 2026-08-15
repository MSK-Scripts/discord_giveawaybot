// Veröffentlicht das Ergebnis eines beendeten Giveaways an die msk-shop-API,
// die daraus eine öffentliche, gehostete Ergebnis-Seite macht (analog zum
// Ticketbot-Transcript). Datenschutz: es werden NUR die Gewinner (mit Username)
// und die anonyme Teilnehmerzahl übertragen — niemals die Teilnehmerliste.
//
// Deaktiviert (gibt null zurück), solange RESULT_PUBLISH_URL/-SECRET fehlen.
import { prisma } from '../database/prisma.js';
import { logger } from '../utils/logger.js';
import { giveawayPrizes, prizesForWinner, normalizePrizeMode, inlinePrizes } from '../utils/prizes.js';

/**
 * @param {import('discord.js').Client} client
 * @param {object} giveaway   Giveaway-Row
 * @param {object} settings   Guild-Settings (aktuell ungenutzt, für spätere Optionen)
 * @param {{userId: string, prizeIndex: number|null}[]} winnerList aktuelle Gewinner
 * @returns {Promise<string|null>} öffentliche URL der Ergebnis-Seite oder null
 */
export async function publishResult(client, giveaway, settings, winnerList = []) {
  const url = process.env.RESULT_PUBLISH_URL;
  const secret = process.env.RESULT_PUBLISH_SECRET;
  if (!url || !secret) return null; // Feature nicht konfiguriert

  try {
    const entryCount = await prisma.entry.count({ where: { giveawayId: giveaway.id } });

    const prizes = giveawayPrizes(giveaway);
    const mode = normalizePrizeMode(giveaway.prizeMode);

    // Nur die Gewinner-Usernamen auflösen (keine Teilnehmer!) — parallel (≤100).
    const winners = await Promise.all(
      winnerList.map(async ({ userId, prizeIndex }) => {
        let username = userId;
        try {
          const user = await client.users.fetch(userId);
          username = user?.username ?? userId;
        } catch {
          // unbekannter/gelöschter User -> ID als Fallback
        }
        // Nur im INDIVIDUAL-Modus gehört ein Preis zu einer Person. Sonst gilt
        // die gemeinsame Liste, die ohnehin im Payload steht.
        const own = mode === 'INDIVIDUAL' ? prizesForWinner(prizes, mode, prizeIndex) : [];
        return { userId, username, prize: own.length ? inlinePrizes(own) : null };
      }),
    );

    const endedAt = giveaway.endedAt instanceof Date ? giveaway.endedAt : new Date();
    const payload = {
      giveawayId: giveaway.id,
      guildId: giveaway.guildId,
      title: giveaway.title,
      // `prize` bleibt als Zusammenfassung im Payload, damit eine Shop-Version
      // ohne Preisliste weiter etwas anzuzeigen hat.
      prize: prizes.length ? inlinePrizes(prizes).slice(0, 256) : null,
      prizes,
      prizeMode: mode,
      endedAt: endedAt.toISOString(),
      winnersCount: giveaway.winnersCount,
      entryCount,
      winners,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      logger.warn(`publishResult(${giveaway.id}): HTTP ${res.status}`);
      return null;
    }
    const data = await res.json().catch(() => null);
    return data?.url ?? null;
  } catch (err) {
    logger.warn(`publishResult(${giveaway.id}):`, err?.message ?? err);
    return null;
  }
}

/**
 * Löscht alle öffentlichen Ergebnis-Seiten einer Guild im msk-shop (beim
 * Guild-Leave / Datenlöschung). Fire-and-forget, no-op ohne Konfiguration.
 */
export async function deleteGuildResults(guildId) {
  const url = process.env.RESULT_PUBLISH_URL;
  const secret = process.env.RESULT_PUBLISH_SECRET;
  if (!url || !secret) return;
  try {
    const deleteUrl = url.replace(/\/publish\/?$/, '/delete');
    await fetch(deleteUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ guildId }),
    });
  } catch (err) {
    logger.warn(`deleteGuildResults(${guildId}):`, err?.message ?? err);
  }
}

export default publishResult;
