import { logger } from '../utils/logger.js';

export default {
  name: 'guildDelete',
  async execute(client, guild) {
    // MVP: kein automatisches Löschen der Daten (Wiederbeitritt soll Settings/
    // Giveaways behalten). Nur loggen. Cleanup kann später ergänzt werden.
    logger.info(`Guild verlassen/entfernt: ${guild.id}.`);
  },
};
