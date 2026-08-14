/**
 * Verschlüsselung für fremde Tebex-Plugin-Secrets (AES-256-GCM).
 *
 * Warum verschlüsselt und nicht gehasht: der Bot muss den Klartext an Tebex
 * senden (`X-Tebex-Secret`), jedes Mal wenn ein Giveaway endet. Ein Hash ist
 * eine Einbahnstraße und damit hier unbrauchbar.
 *
 * Was das schützt und was nicht: ein gestohlener Datenbank-Dump, ein verlorenes
 * Backup oder eine SQL-Injection bringen nur Chiffretext, weil der Schlüssel in
 * TEBEX_SECRET_KEY liegt und damit außerhalb der Datenbank. Wer den Bot-Prozess
 * kontrolliert, kommt an beides. Das lässt sich nicht wegdesignen: ein Dienst,
 * der einen fremden Schlüssel benutzen soll, muss ihn lesen können.
 *
 * Ein Tebex-Plugin-Secret ist Vollzugriff auf den Store — Tebex kennt kein
 * Scoping. Diese Daten sind entsprechend heikel.
 *
 * Format: `v1:<iv hex>:<ciphertext hex>:<auth tag hex>`. Das Präfix macht einen
 * späteren Schlüssel- oder Verfahrenswechsel möglich, ohne alte Werte zu raten.
 */
import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // GCM-Standard
const KEY_BYTES = 32; // AES-256

/** @returns {Buffer} */
function loadKey() {
  const raw = process.env.TEBEX_SECRET_KEY;
  if (!raw) {
    throw new Error('TEBEX_SECRET_KEY fehlt. Ohne den Schlüssel kann kein Tebex-Secret gespeichert oder gelesen werden.');
  }
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error('TEBEX_SECRET_KEY muss 32 Byte als Hex sein (64 Zeichen). Erzeugen mit: openssl rand -hex 32');
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== KEY_BYTES) throw new Error('TEBEX_SECRET_KEY hat die falsche Länge.');
  return key;
}

/**
 * Ist die Verschlüsselung einsatzbereit? Wird beim Boot und vom Control-Server
 * geprüft, damit ein fehlender Schlüssel eine klare Meldung gibt statt eines
 * Fehlers mitten im Beenden eines Giveaways.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function checkEncryptionKey() {
  try {
    loadKey();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Verschlüsselt einen Klartext für die Datenbank.
 * @param {string} plaintext
 * @returns {string} Blob im Format v1:iv:ct:tag
 */
export function encryptSecret(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encryptSecret: leerer Wert');
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, loadKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('hex')}:${ciphertext.toString('hex')}:${tag.toString('hex')}`;
}

/**
 * Entschlüsselt einen Blob aus der Datenbank.
 *
 * Wirft bei jeder Manipulation: GCM prüft den Auth-Tag, ein verändertes Byte im
 * Chiffretext fliegt hier auf und kommt nicht als stiller Datenmüll durch.
 *
 * @param {string} blob
 * @returns {string} Klartext
 */
export function decryptSecret(blob) {
  if (typeof blob !== 'string') throw new Error('decryptSecret: kein String');

  const parts = blob.split(':');
  if (parts.length !== 4) throw new Error('decryptSecret: unbekanntes Format');

  const [version, ivHex, ctHex, tagHex] = parts;
  if (version !== VERSION) throw new Error(`decryptSecret: unbekannte Version "${version}"`);

  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(ctHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  if (iv.length !== IV_BYTES || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error('decryptSecret: beschädigter Datensatz');
  }

  const decipher = createDecipheriv(ALGO, loadKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Die letzten vier Zeichen, für die maskierte Anzeige im Dashboard
 * ("gesetzt · ••••3f2a"). Kurze Werte geben nichts preis.
 */
export function secretHint(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length < 8) return '';
  return plaintext.slice(-4);
}

/** Vergleicht zwei Secrets ohne Laufzeit-Seitenkanal. */
export function secretsEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
