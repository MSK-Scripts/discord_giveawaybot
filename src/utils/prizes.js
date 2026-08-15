// Preise eines Giveaways: Liste + Verteilmodus.
//
// Ein Giveaway hat 0..n Preise (JSON-Array in `Giveaway.prizes`). `prizeMode`
// entscheidet, wer was bekommt:
//
//   ALL        — jeder Gewinner bekommt alle Preise.
//   INDIVIDUAL — Gewinner 1 bekommt Preis 1, Gewinner 2 Preis 2, usw.
//
// Im INDIVIDUAL-Modus ist die Gewinnerzahl keine eigene Angabe mehr: sie ist die
// Anzahl der Preise. Deshalb gibt es `resolveWinnersCount`, und deshalb tragen
// die Gewinner-Zeilen einen `prizeIndex` — sonst würde ein Reroll die Zuordnung
// aller nachfolgenden Gewinner verschieben.

export const PRIZE_MODES = ['ALL', 'INDIVIDUAL'];
export const MAX_PRIZES = 20;
export const MAX_PRIZE_LENGTH = 256;

/** Unbekannte/leere Werte fallen auf ALL zurück (der bisherige Zustand). */
export function normalizePrizeMode(mode) {
  const value = String(mode ?? '').trim().toUpperCase();
  return PRIZE_MODES.includes(value) ? value : 'ALL';
}

/** Trimmt, wirft Leerzeilen weg, kürzt Text und Liste auf die Maxima. */
function cleanPrizes(list) {
  return list
    .map((v) => String(v ?? '').trim().slice(0, MAX_PRIZE_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_PRIZES);
}

/** JSON-Spalte -> Array. Ein defekter Wert ergibt eine leere Liste, keinen Fehler. */
export function parsePrizes(raw) {
  if (Array.isArray(raw)) return cleanPrizes(raw);
  try {
    const parsed = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? cleanPrizes(parsed) : [];
  } catch {
    return [];
  }
}

/** Array -> JSON-Spalte. */
export function serializePrizes(list) {
  return JSON.stringify(cleanPrizes(Array.isArray(list) ? list : []));
}

/**
 * Freitext -> Preis-Array. Ein Preis pro Zeile (Modal) oder mit `|` getrennt
 * (Slash-Optionen kennen keine Zeilenumbrüche).
 */
export function splitPrizes(text) {
  if (text == null) return [];
  return cleanPrizes(String(text).split(/\r?\n|\|/));
}

/** Die Preise eines Giveaway-Datensatzes. */
export function giveawayPrizes(giveaway) {
  return parsePrizes(giveaway?.prizes);
}

/**
 * Gewinnerzahl aus Preisliste und Modus.
 * INDIVIDUAL koppelt sie an die Anzahl der Preise, ALL lässt sie frei.
 */
export function resolveWinnersCount(prizes, mode, requested = 1) {
  if (normalizePrizeMode(mode) === 'INDIVIDUAL' && prizes.length) return prizes.length;
  const n = Number(requested);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 1;
}

/**
 * Die Preise für einen einzelnen Gewinner.
 * @param {string[]} prizes  Preisliste des Giveaways
 * @param {string} mode      ALL | INDIVIDUAL
 * @param {number|null} index Slot des Gewinners (nur INDIVIDUAL)
 * @returns {string[]} kann leer sein (Giveaway ohne Preisangabe)
 */
export function prizesForWinner(prizes, mode, index) {
  if (!prizes.length) return [];
  if (normalizePrizeMode(mode) !== 'INDIVIDUAL') return prizes;
  const prize = Number.isInteger(index) ? prizes[index] : undefined;
  return prize ? [prize] : [];
}

/**
 * Ordnet frisch gezogenen Gewinnern ihren Preis-Slot zu (Ziehungsreihenfolge).
 * @returns {{userId: string, prizeIndex: number|null}[]}
 */
export function assignPrizes(userIds, mode) {
  const individual = normalizePrizeMode(mode) === 'INDIVIDUAL';
  return userIds.map((userId, i) => ({ userId, prizeIndex: individual ? i : null }));
}

/** "A, B, C" — für einzeilige Stellen (Embed-Feld, DM-Text). */
export function inlinePrizes(prizes) {
  return prizes.join(', ');
}

/** Aufzählung mit Punkten, für mehrzeilige Stellen. */
export function bulletList(prizes) {
  return prizes.map((p) => `• ${p}`).join('\n');
}

/** Nummerierte Aufzählung — im INDIVIDUAL-Modus entspricht die Nummer dem Gewinner. */
export function numberedList(prizes) {
  return prizes.map((p, i) => `${i + 1}. ${p}`).join('\n');
}

/**
 * Prüft und normalisiert eine Preis-Eingabe (Dashboard, Modal, /gedit).
 * @param {{prizes?: string[]|string, mode?: string, winnersCount?: number}} input
 * @returns {{ok: true, prizes: string[], mode: string, winnersCount: number}
 *          |{ok: false, error: 'too_many_prizes'|'individual_needs_prizes'}}
 */
export function normalizePrizeInput({ prizes, mode, winnersCount = 1 } = {}) {
  const raw = Array.isArray(prizes) ? prizes : splitPrizes(prizes);
  // Vor dem Kürzen zählen, sonst verschluckt die Liste stillschweigend Preise.
  if (raw.length > MAX_PRIZES) return { ok: false, error: 'too_many_prizes' };

  const list = cleanPrizes(raw);
  const resolved = normalizePrizeMode(mode);
  if (resolved === 'INDIVIDUAL' && list.length === 0) return { ok: false, error: 'individual_needs_prizes' };

  return {
    ok: true,
    prizes: list,
    mode: resolved,
    winnersCount: resolveWinnersCount(list, resolved, winnersCount),
  };
}
