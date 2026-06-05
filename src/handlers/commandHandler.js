// Lädt alle Slash-Commands rekursiv aus src/commands/.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModules } from './loadFiles.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = join(__dirname, '..', 'commands');

export async function loadCommands(client) {
  const modules = await loadModules(COMMANDS_DIR);
  for (const { path, module } of modules) {
    const cmd = module.default;
    if (!cmd?.data || typeof cmd.execute !== 'function') {
      logger.warn(`Command übersprungen (kein data/execute): ${path}`);
      continue;
    }
    client.commands.set(cmd.data.name, cmd);
  }
  logger.success(`${client.commands.size} Commands geladen.`);
  return client.commands;
}

export default loadCommands;
