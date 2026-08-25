// Leichtgewichtiges i18n. Lädt alle Locale-JSONs beim Boot in den Speicher.
// t(guildId, key, vars) ist SYNCHRON: die Sprache kommt aus dem Settings-Cache
// (settingsService.getLang). Der interactionCreate-Router füllt den Cache vorab.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getLang } from '../services/settingsService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, '..', 'locales');

export const SUPPORTED_LANGS = ['en', 'de', 'fr', 'es', 'hu', 'pl', 'pt'];
export const DEFAULT_LANG = 'en';

/** @type {Map<string, Record<string,string>>} */
const locales = new Map();

/** Lädt alle *.json aus src/locales/ in den Speicher. Beim Boot einmal aufrufen. */
export function loadLocales() {
  locales.clear();
  for (const file of readdirSync(LOCALES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const lang = file.slice(0, -5);
    const raw = readFileSync(join(LOCALES_DIR, file), 'utf8');
    locales.set(lang, JSON.parse(raw));
  }
  return [...locales.keys()];
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/**
 * Übersetzt einen Key. Reihenfolge: Guild-Sprache -> Default (en) -> Key selbst.
 * @param {string|null} guildId  Guild-ID (für Sprachauflösung) ODER direkt ein Sprachcode.
 * @param {string} key
 * @param {Record<string, unknown>} [vars]
 */
export function t(guildId, key, vars) {
  const lang = resolveLang(guildId);
  const primary = locales.get(lang);
  if (primary && key in primary) return interpolate(primary[key], vars);

  const fallback = locales.get(DEFAULT_LANG);
  if (fallback && key in fallback) return interpolate(fallback[key], vars);

  return key;
}

function resolveLang(guildIdOrLang) {
  if (guildIdOrLang && SUPPORTED_LANGS.includes(guildIdOrLang)) {
    return guildIdOrLang; // direkter Sprachcode
  }
  const lang = getLang(guildIdOrLang);
  return SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
}

export default t;
