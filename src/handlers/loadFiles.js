// Hilfsfunktion: rekursiv alle .js-Dateien eines Verzeichnisses als ESM-Module
// importieren. Auf Windows ist pathToFileURL Pflicht (sonst ERR_UNSUPPORTED_ESM_URL_SCHEME).
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @param {string} dir absoluter Pfad
 * @returns {Promise<Array<{ path: string, module: any }>>}
 */
export async function loadModules(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out; // Verzeichnis existiert nicht -> leer
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await loadModules(full)));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const module = await import(pathToFileURL(full).href);
      out.push({ path: full, module });
    }
  }
  return out;
}

export default loadModules;
