import { logger } from '../utils/logger.js';
import { createDefaults } from '../services/settingsService.js';

export default {
  name: 'guildCreate',
  async execute(client, guild) {
    logger.info(`Neue Guild beigetreten: ${guild.name} (${guild.id}).`);
    await createDefaults(guild.id);
  },
};
