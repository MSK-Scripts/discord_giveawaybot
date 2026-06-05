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

export default parseDuration;
