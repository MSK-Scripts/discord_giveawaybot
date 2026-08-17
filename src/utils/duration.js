// Dauer-Parsing: "1d2h30m", "45m", "90s" -> Millisekunden.
const UNIT_MS = {
  d: 24 * 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  m: 60 * 1000,
  s: 1000,
};

const TOKEN_RE = /(\d+)\s*(d|h|m|s)/gi;

// Sinnvolle Schranken: mind. 10s (damit der 10s-Scheduler-Tick greift),
// max. 1 Jahr.
const MIN_MS = 10 * 1000;
const MAX_MS = 365 * UNIT_MS.d;

/**
 * Parst einen Dauer-String in Millisekunden.
 * @param {string} input
 * @returns {{ ok: true, ms: number } | { ok: false, reason: 'empty'|'invalid'|'too_short'|'too_long' }}
 */
export function parseDuration(input) {
  if (!input || typeof input !== 'string') return { ok: false, reason: 'empty' };

  const str = input.trim().toLowerCase();
  if (!str) return { ok: false, reason: 'empty' };

  let ms = 0;
  let matched = false;
  let consumed = 0;

  for (const m of str.matchAll(TOKEN_RE)) {
    matched = true;
    consumed += m[0].length;
    ms += parseInt(m[1], 10) * UNIT_MS[m[2]];
  }

  // Es muss mindestens ein gültiges Token geben und der String darf keine
  // sonstigen "Müll"-Zeichen enthalten (grobe Plausibilität).
  const cleaned = str.replace(/\s+/g, '');
  if (!matched || consumed < cleaned.length) return { ok: false, reason: 'invalid' };

  if (ms < MIN_MS) return { ok: false, reason: 'too_short' };
  if (ms > MAX_MS) return { ok: false, reason: 'too_long' };

  return { ok: true, ms };
}

/**
 * Millisekunden -> Dauer-String, den `parseDuration` wieder versteht.
 *
 * Gebraucht wird das, wenn aus einem gelaufenen Giveaway eine Vorlage wird: dort
 * steht ein Zeitraum (Erstellung bis Ende), eine Vorlage speichert aber eine
 * Dauer. Das Ergebnis wird auf denselben Bereich beschnitten, den `parseDuration`
 * zulässt — eine Vorlage mit "0s" oder "400d" ließe sich sonst speichern und nie
 * wieder benutzen.
 *
 * Sekunden tauchen nur auf, wenn sonst nichts übrig bleibt: "1d2h30m" ist die
 * Angabe, die jemand von Hand eingetippt hätte, "1d2h30m12s" nicht.
 *
 * @param {number} ms
 * @returns {string} z.B. "1d2h30m"
 */
export function formatDuration(ms) {
  const clamped = Math.min(Math.max(Math.round(Number(ms) || 0), MIN_MS), MAX_MS);
  let rest = Math.floor(clamped / 1000) * 1000;

  const parts = [];
  for (const unit of ['d', 'h', 'm']) {
    const count = Math.floor(rest / UNIT_MS[unit]);
    if (count > 0) {
      parts.push(`${count}${unit}`);
      rest -= count * UNIT_MS[unit];
    }
  }
  const seconds = Math.floor(rest / UNIT_MS.s);
  if (seconds > 0 && parts.length === 0) parts.push(`${seconds}s`);
  return parts.join('') || '10s';
}

export default parseDuration;
