/**
 * Sprachliste und Locale-Dateien müssen sich decken.
 *
 * Die Dateien allein reichen nicht: `SUPPORTED_LANGS` entscheidet, was
 * `/gsettings set lang` zur Auswahl stellt und was `resolveLang` durchlässt.
 * Liegt eine Datei da, die dort fehlt, ist die Sprache vollständig übersetzt
 * und trotzdem unerreichbar — genau so lagen `hu`, `pl` und `pt` eine Weile im
 * Repo. Andersherum wäre es lauter, aber nicht besser: ein Eintrag ohne Datei
 * lässt sich einstellen und liefert dann englische Texte.
 *
 * `i18n:check` kann das nicht sehen, das Skript liest nur das Verzeichnis.
 *
 * Ohne Datenbank, läuft überall.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { t, loadLocales, SUPPORTED_LANGS, DEFAULT_LANG } from '../src/utils/i18n.js';

const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'locales');
const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));

test('jede Locale-Datei steht in SUPPORTED_LANGS und umgekehrt', () => {
  assert.deepEqual([...files].sort(), [...SUPPORTED_LANGS].sort());
});

test('die Standardsprache ist eine der unterstützten', () => {
  assert.ok(SUPPORTED_LANGS.includes(DEFAULT_LANG));
});

test('die Sprachauswahl bleibt unter Discords Grenze von 25 Choices', () => {
  // /gsettings set lang baut seine Choices aus dieser Liste. Ab 26 Sprachen
  // lehnt Discord die Registrierung des Commands ab, und zwar beim Deploy,
  // nicht beim Bearbeiten dieser Datei.
  assert.ok(SUPPORTED_LANGS.length <= 25, `${SUPPORTED_LANGS.length} Sprachen`);
});

test('jede unterstützte Sprache liefert ihren eigenen Text, nicht den englischen Fallback', () => {
  loadLocales();
  // t() nimmt einen Sprachcode direkt entgegen, der Umweg über eine Guild
  // entfällt hier. Der Titel ist in jeder Sprache anders formuliert.
  const key = 'modal.title';
  const english = t(DEFAULT_LANG, key);

  for (const lang of SUPPORTED_LANGS) {
    const value = t(lang, key);
    assert.ok(value && value !== key, `${lang}: ${key} fehlt`);
    if (lang !== DEFAULT_LANG) assert.notEqual(value, english, `${lang}: ${key} ist noch englisch`);
  }
});
