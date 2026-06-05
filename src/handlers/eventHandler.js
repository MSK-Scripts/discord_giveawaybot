// Lädt alle Events rekursiv aus src/events/ und registriert sie am Client.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModules } from './loadFiles.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENTS_DIR = join(__dirname, '..', 'events');

export async function loadEvents(client) {
  const modules = await loadModules(EVENTS_DIR);
  let count = 0;
  for (const { path, module } of modules) {
    const evt = module.default;
    if (!evt?.name || typeof evt.execute !== 'function') {
      logger.warn(`Event übersprungen (kein name/execute): ${path}`);
      continue;
    }
    const bound = (...args) => evt.execute(client, ...args);
    if (evt.once) client.once(evt.name, bound);
    else client.on(evt.name, bound);
    count++;
  }
  logger.success(`${count} Events geladen.`);
}

export default loadEvents;
