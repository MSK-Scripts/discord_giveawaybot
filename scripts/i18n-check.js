// Prüft, dass alle Locale-Dateien dasselbe Keyset wie en.json haben.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, '..', 'src', 'locales');

const load = (lang) => JSON.parse(readFileSync(join(DIR, `${lang}.json`), 'utf8'));

const en = load('en');
const enKeys = new Set(Object.keys(en));
let problems = 0;

for (const file of readdirSync(DIR)) {
  if (!file.endsWith('.json') || file === 'en.json') continue;
  const lang = file.slice(0, -5);
  const keys = new Set(Object.keys(load(lang)));

  const missing = [...enKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enKeys.has(k));

  if (missing.length) {
    console.error(`❌ ${lang}: ${missing.length} fehlende Keys: ${missing.join(', ')}`);
    problems++;
  }
  if (extra.length) {
    console.error(`⚠️  ${lang}: ${extra.length} zusätzliche Keys: ${extra.join(', ')}`);
    problems++;
  }
  if (!missing.length && !extra.length) console.log(`✅ ${lang}: vollständig (${keys.size} Keys)`);
}

if (problems > 0) process.exit(1);
console.log('\ni18n-Check bestanden.');
