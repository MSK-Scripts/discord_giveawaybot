// Lädt alle Components (Buttons/Modals) rekursiv aus src/components/.
// Jede Component exportiert entweder `customId` (exakter Match) oder `prefix`.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModules } from './loadFiles.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPONENTS_DIR = join(__dirname, '..', 'components');

export async function loadComponents(client) {
  const modules = await loadModules(COMPONENTS_DIR);
  for (const { path, module } of modules) {
    const comp = module.default;
    if (typeof comp?.execute !== 'function' || (!comp.customId && !comp.prefix)) {
      logger.warn(`Component übersprungen (kein customId/prefix/execute): ${path}`);
      continue;
    }
    if (comp.prefix) client.componentPrefixes.set(comp.prefix, comp);
    else client.components.set(comp.customId, comp);
  }
  logger.success(
    `${client.components.size + client.componentPrefixes.size} Components geladen.`,
  );
}

/** Findet den passenden Component-Handler zu einer customId. */
export function resolveComponent(client, customId) {
  if (client.components.has(customId)) return client.components.get(customId);
  for (const [prefix, comp] of client.componentPrefixes) {
    if (customId.startsWith(prefix)) return comp;
  }
  return null;
}

export default loadComponents;
