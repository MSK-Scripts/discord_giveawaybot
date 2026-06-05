import { ActivityType } from 'discord.js';
import { logger } from '../utils/logger.js';
import { startScheduler } from '../services/scheduler.js';

export default {
  // v14.16+: 'ready' ist deprecated zugunsten von 'clientReady' (ab v15 Pflicht).
  name: 'clientReady',
  once: true,
  async execute(client) {
    logger.success(`Eingeloggt als ${client.user.tag} (${client.user.id}).`);
    client.user.setActivity('🎉 Giveaways', { type: ActivityType.Watching });
    startScheduler(client);
  },
};
