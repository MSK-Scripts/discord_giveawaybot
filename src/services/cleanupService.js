// Guild-Daten-Löschung + periodischer Abgleich (Orphan-Cleanup).
// Schließt die Lücke, falls der Bot beim Entfernen aus einer Guild offline war.
import { prisma } from '../database/prisma.js';
import { logger } from '../utils/logger.js';
import { evict } from './settingsService.js';

/**
 * Löscht ALLE Daten einer Guild. Giveaways kaskadieren auf Entry/Winner.
 * @returns {Promise<{ giveaways: number, templates: number }>}
 */
export async function deleteGuildData(guildId) {
  const [giveaways, templates] = await prisma.$transaction([
    prisma.giveaway.deleteMany({ where: { guildId } }),
    prisma.giveawayTemplate.deleteMany({ where: { guildId } }),
    prisma.guildSettings.deleteMany({ where: { guildId } }),
  ]);
  evict(guildId);
  return { giveaways: giveaways.count, templates: templates.count };
}

/** Alle in der DB gespeicherten Guild-IDs (Union über alle Tabellen). */
async function storedGuildIds() {
  const [settings, giveaways, templates] = await Promise.all([
    prisma.guildSettings.findMany({ select: { guildId: true } }),
    prisma.giveaway.findMany({ select: { guildId: true }, distinct: ['guildId'] }),
    prisma.giveawayTemplate.findMany({ select: { guildId: true }, distinct: ['guildId'] }),
  ]);
  return new Set([...settings, ...giveaways, ...templates].map((r) => r.guildId));
}

/**
 * Löscht Daten von Guilds, in denen der Bot nicht mehr Mitglied ist.
 * Sicherheitsnetz: bei leerem Guild-Cache (ungewöhnlich) wird NICHTS gelöscht,
 * um versehentliche Massenlöschung bei einem Gateway-Problem zu verhindern.
 */
export async function purgeOrphanedGuilds(client) {
  try {
    const ids = await storedGuildIds();
    if (ids.size === 0) return;

    if (client.guilds.cache.size === 0) {
      logger.warn('Orphan-Cleanup übersprungen: Guild-Cache ist leer (ungewöhnlich).');
      return;
    }

    let purged = 0;
    for (const guildId of ids) {
      // has() ist auch bei (vorübergehend) nicht verfügbaren Guilds true -> bleiben erhalten.
      if (client.guilds.cache.has(guildId)) continue;
      const res = await deleteGuildData(guildId);
      purged++;
      logger.info(
        `Orphan-Cleanup: Guild ${guildId} (nicht mehr Mitglied) gelöscht (${res.giveaways} Giveaways, ${res.templates} Vorlagen).`,
      );
    }
    logger.info(purged === 0 ? 'Orphan-Cleanup: keine verwaisten Guilds.' : `Orphan-Cleanup: ${purged} Guild(s) bereinigt.`);
  } catch (err) {
    logger.error('purgeOrphanedGuilds:', err);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
let timer = null;

/** Startet den Abgleich: einmal beim Aufruf, danach täglich. */
export function startMaintenance(client) {
  if (timer) clearInterval(timer);
  timer = setInterval(() => purgeOrphanedGuilds(client), DAY_MS);
  logger.info('Maintenance (Orphan-Cleanup) gestartet — täglich.');
  purgeOrphanedGuilds(client);
}

export function stopMaintenance() {
  if (timer) clearInterval(timer);
  timer = null;
}
