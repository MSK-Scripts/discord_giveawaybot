// Checks that every locale file has the same key set as en.json and uses the
// same placeholders in every value.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, '..', 'src', 'locales');

const load = (lang) => JSON.parse(readFileSync(join(DIR, `${lang}.json`), 'utf8'));

// Must match the interpolation in src/utils/i18n.js: /\{(\w+)\}/g.
const placeholders = (value) =>
  [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const en = load('en');
const enKeys = new Set(Object.keys(en));
let problems = 0;

for (const file of readdirSync(DIR)) {
  if (!file.endsWith('.json') || file === 'en.json') continue;
  const lang = file.slice(0, -5);
  const values = load(lang);
  const keys = new Set(Object.keys(values));

  const missing = [...enKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enKeys.has(k));

  if (missing.length) {
    console.error(`❌ ${lang}: ${missing.length} missing keys: ${missing.join(', ')}`);
    problems++;
  }
  if (extra.length) {
    console.error(`⚠️  ${lang}: ${extra.length} extra keys: ${extra.join(', ')}`);
    problems++;
  }

  // A dropped placeholder silently loses information, a misspelled one
  // ({titel} instead of {title}) renders the literal braces to the user.
  const badPlaceholders = [];
  for (const key of enKeys) {
    if (!keys.has(key)) continue;
    const expected = placeholders(en[key]);
    const actual = placeholders(values[key]);
    if (expected.join('|') !== actual.join('|')) {
      badPlaceholders.push(`${key} (en: ${expected.join(', ') || '–'} / ${lang}: ${actual.join(', ') || '–'})`);
    }
  }
  if (badPlaceholders.length) {
    console.error(`❌ ${lang}: ${badPlaceholders.length} keys whose placeholders differ from English:`);
    for (const line of badPlaceholders) console.error(`   ${line}`);
    problems++;
  }

  if (!missing.length && !extra.length && !badPlaceholders.length) {
    console.log(`✅ ${lang}: complete (${keys.size} keys, placeholders match)`);
  }
}

if (problems > 0) process.exit(1);
console.log('\ni18n check passed.');
