// Statischer Lade-Smoke-Test: importiert alle Commands/Events/Components,
// prüft die erwarteten Exporte und serialisiert die SlashCommandBuilder
// (validiert Discord-Constraints) — ohne Token oder DB-Verbindung.
import 'dotenv/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModules } from '../src/handlers/loadFiles.js';
import { loadLocales } from '../src/utils/i18n.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');

let errors = 0;
const fail = (msg) => {
  console.error(`❌ ${msg}`);
  errors++;
};
const ok = (msg) => console.log(`✅ ${msg}`);

async function main() {
  const langs = loadLocales();
  ok(`Locales geladen: ${langs.join(', ')}`);

  // Commands
  const commandNames = new Set();
  for (const { path, module } of await loadModules(join(SRC, 'commands'))) {
    const cmd = module.default;
    if (!cmd?.data || typeof cmd.execute !== 'function') {
      fail(`Command ohne data/execute: ${path}`);
      continue;
    }
    try {
      const json = cmd.data.toJSON();
      if (commandNames.has(json.name)) fail(`Doppelter Command-Name: ${json.name}`);
      commandNames.add(json.name);
    } catch (err) {
      fail(`Command-Builder ungültig (${path}): ${err.message}`);
    }
  }
  ok(`${commandNames.size} Commands valide: ${[...commandNames].join(', ')}`);

  // Events
  let eventCount = 0;
  for (const { path, module } of await loadModules(join(SRC, 'events'))) {
    const evt = module.default;
    if (!evt?.name || typeof evt.execute !== 'function') {
      fail(`Event ohne name/execute: ${path}`);
      continue;
    }
    eventCount++;
  }
  ok(`${eventCount} Events valide`);

  // Components
  let compCount = 0;
  for (const { path, module } of await loadModules(join(SRC, 'components'))) {
    const comp = module.default;
    if (typeof comp?.execute !== 'function' || (!comp.customId && !comp.prefix)) {
      fail(`Component ohne customId/prefix/execute: ${path}`);
      continue;
    }
    compCount++;
  }
  ok(`${compCount} Components valide`);

  if (errors > 0) {
    console.error(`\n${errors} Fehler.`);
    process.exit(1);
  }
  console.log('\nSmoke-Test bestanden.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Smoke-Test abgebrochen:', err);
  process.exit(1);
});
