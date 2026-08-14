/**
 * Verschlüsselung der fremden Tebex-Plugin-Secrets.
 *
 * Diese Werte sind Vollzugriff auf einen fremden Shop — Tebex kennt kein
 * Scoping. Entsprechend ist hier nicht nur der Roundtrip interessant, sondern
 * vor allem, dass Manipulation auffällt und dass ein falscher Schlüssel nicht
 * stillschweigend Datenmüll liefert.
 *
 * Kein Datenbankzugriff, läuft überall.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const KEY_A = randomBytes(32).toString('hex');
const KEY_B = randomBytes(32).toString('hex');

process.env.TEBEX_SECRET_KEY = KEY_A;
const box = await import('../src/utils/secretBox.js');

const SECRET = 'tebex_plugin_secret_1234567890abcdef';

test('ein verschlüsseltes Secret lässt sich wieder lesen', () => {
  const blob = box.encryptSecret(SECRET);
  assert.equal(box.decryptSecret(blob), SECRET);
});

test('der Klartext taucht im Blob nirgends auf', () => {
  const blob = box.encryptSecret(SECRET);
  assert.ok(!blob.includes(SECRET), 'sonst wäre die Verschlüsselung sinnlos');
  assert.ok(!Buffer.from(blob).includes(Buffer.from(SECRET)));
  assert.match(blob, /^v1:[0-9a-f]{24}:[0-9a-f]+:[0-9a-f]{32}$/, 'Format v1:iv:ct:tag');
});

test('zweimal dasselbe Secret ergibt zwei verschiedene Blobs', () => {
  // Zufälliger IV pro Datensatz: sonst verrät ein Dump, welche Guilds dasselbe
  // Secret benutzen.
  const a = box.encryptSecret(SECRET);
  const b = box.encryptSecret(SECRET);
  assert.notEqual(a, b);
  assert.equal(box.decryptSecret(a), box.decryptSecret(b));
});

test('ein verändertes Byte fliegt auf, statt Datenmüll zu liefern', () => {
  const blob = box.encryptSecret(SECRET);
  const [v, iv, ct, tag] = blob.split(':');

  // Chiffretext angefasst
  const flipped = ct.slice(0, -1) + (ct.at(-1) === 'a' ? 'b' : 'a');
  assert.throws(() => box.decryptSecret(`${v}:${iv}:${flipped}:${tag}`));

  // Auth-Tag angefasst
  const badTag = tag.slice(0, -1) + (tag.at(-1) === 'a' ? 'b' : 'a');
  assert.throws(() => box.decryptSecret(`${v}:${iv}:${ct}:${badTag}`));

  // IV angefasst
  const badIv = iv.slice(0, -1) + (iv.at(-1) === 'a' ? 'b' : 'a');
  assert.throws(() => box.decryptSecret(`${v}:${badIv}:${ct}:${tag}`));
});

test('kaputte oder fremde Formate werden abgewiesen', () => {
  assert.throws(() => box.decryptSecret('nicht mal ansatzweise'), /Format/);
  assert.throws(() => box.decryptSecret('v2:aa:bb:cc'), /Version/);
  assert.throws(() => box.decryptSecret(null), /kein String/);
  assert.throws(() => box.decryptSecret('v1::' + ':'), /beschädigt|Format/);
});

test('ein anderer Schlüssel kann den Blob nicht öffnen', () => {
  const blob = box.encryptSecret(SECRET);
  process.env.TEBEX_SECRET_KEY = KEY_B;
  assert.throws(() => box.decryptSecret(blob), 'Schlüsselwechsel macht alte Secrets unlesbar, nicht falsch lesbar');
  process.env.TEBEX_SECRET_KEY = KEY_A;
  assert.equal(box.decryptSecret(blob), SECRET);
});

test('ein fehlender oder unbrauchbarer Schlüssel meldet sich deutlich', () => {
  const saved = process.env.TEBEX_SECRET_KEY;

  delete process.env.TEBEX_SECRET_KEY;
  assert.equal(box.checkEncryptionKey().ok, false);
  assert.throws(() => box.encryptSecret(SECRET), /TEBEX_SECRET_KEY fehlt/);

  process.env.TEBEX_SECRET_KEY = 'zu kurz';
  assert.equal(box.checkEncryptionKey().ok, false);
  assert.throws(() => box.encryptSecret(SECRET), /64 Zeichen/);

  process.env.TEBEX_SECRET_KEY = saved;
  assert.equal(box.checkEncryptionKey().ok, true);
});

test('der Hinweis zeigt nur die letzten vier Zeichen', () => {
  assert.equal(box.secretHint(SECRET), SECRET.slice(-4));
  assert.equal(box.secretHint('kurz'), '', 'kurze Werte geben gar nichts preis');
  assert.equal(box.secretHint(null), '');
});

test('leere Eingaben werden nicht verschlüsselt', () => {
  assert.throws(() => box.encryptSecret(''), /leerer Wert/);
  assert.throws(() => box.encryptSecret(undefined), /leerer Wert/);
});
