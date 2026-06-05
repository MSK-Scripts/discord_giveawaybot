import { logger } from '../utils/logger.js';
import { deleteGuildData } from '../services/cleanupService.js';

export default {
  name: 'guildDelete',
  async execute(client, guild) {
    // guildDelete feuert auch bei einem Discord-Ausfall (Guild „unavailable").
    // In dem Fall NICHT löschen — der Bot wurde nicht entfernt.
    if (guild.available === false) {
      logger.warn(`Guild ${guild.id} momentan nicht verfügbar (Ausfall) — keine Löschung.`);
      return;
    }

    // Bot wurde aus der Guild entfernt -> alle Daten dieser Guild umgehend löschen.
    try {
      const res = await deleteGuildData(guild.id);
      logger.info(
        `Guild ${guild.id} entfernt — Daten gelöscht (${res.giveaways} Giveaways inkl. Entries/Winners, ${res.templates} Vorlagen, Settings).`,
      );
    } catch (err) {
      logger.error(`guildDelete-Cleanup (${guild.id}):`, err);
    }
  },
};
