// Rollen-basierte Teilnahmebedingungen: Blacklist, Whitelist und Bonus-Lose.
//
// Dieselben drei Angaben gibt es zweimal — serverweit in `GuildSettings` und
// je Giveaway in `Giveaway.*Roles`. Was am Giveaway steht, ersetzt die
// serverweite Einstellung (aufgelöst in `resolveGiveawayEligibility`,
// utils/eligibility.js), gespeichert sind sie überall als JSON-Text.
//
// Hier steht die Eingabeseite: was aus dem Dashboard hereinkommt, wird geprüft
// statt still zurechtgebogen. Eine falsche Rollen-ID ist ein Tippfehler oder ein
// Fehler im Aufrufer, und beides fällt sonst erst auf, wenn ein Giveaway endet
// und die Bedingung nicht gegriffen hat.
//
// Die Grenzen entsprechen dem, was `/gsettings` erlaubt (Bonus 1-100), damit
// Dashboard und Slash-Command nicht unterschiedliche Regeln haben.

const ROLE_ID_RE = /^\d{17,20}$/;

export const MAX_ROLES = 25;
export const MAX_BONUS_ROLES = 25;
export const MIN_BONUS_AMOUNT = 1;
export const MAX_BONUS_AMOUNT = 100;

/** JSON-Spalte (oder fertiges Array) -> Rollen-IDs. Defekte Werte ergeben eine leere Liste. */
export function parseRoleArray(raw) {
  const value = Array.isArray(raw) ? raw : safeJson(raw, []);
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id ?? '')).filter((id) => ROLE_ID_RE.test(id)))].slice(0, MAX_ROLES);
}

/** Rollen-IDs -> JSON-Spalte. */
export function serializeRoleArray(list) {
  return JSON.stringify(parseRoleArray(list));
}

/** JSON-Spalte (oder fertiges Objekt) -> { roleId: Anzahl }. Defekte Werte ergeben ein leeres Objekt. */
export function parseBonusRoles(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : safeJson(raw, {});
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [roleId, amount] of Object.entries(value)) {
    if (!ROLE_ID_RE.test(String(roleId))) continue;
    const n = Number(amount);
    if (!Number.isInteger(n) || n < MIN_BONUS_AMOUNT || n > MAX_BONUS_AMOUNT) continue;
    if (Object.keys(out).length >= MAX_BONUS_ROLES) break;
    out[roleId] = n;
  }
  return out;
}

/** { roleId: Anzahl } -> JSON-Spalte. */
export function serializeBonusRoles(bonus) {
  return JSON.stringify(parseBonusRoles(bonus));
}

function safeJson(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Eingabe aus dem Dashboard prüfen: Liste von Rollen-IDs.
 * @returns {{ ok: true, roles: string[] } | { ok: false, error: string }}
 */
export function normalizeRoleArray(value) {
  if (value == null) return { ok: true, roles: [] };
  if (!Array.isArray(value)) return { ok: false, error: 'invalid_roles' };
  if (value.length > MAX_ROLES) return { ok: false, error: 'too_many_roles' };
  const roles = [];
  for (const raw of value) {
    const id = String(raw ?? '').trim();
    if (!ROLE_ID_RE.test(id)) return { ok: false, error: 'invalid_roles' };
    if (!roles.includes(id)) roles.push(id);
  }
  return { ok: true, roles };
}

/**
 * Eingabe aus dem Dashboard prüfen: Bonus-Lose je Rolle.
 *
 * Erlaubt sind ganze Zahlen von 1 bis 100, genau wie bei `/gsettings bonus set`.
 * Eine Rolle ohne Bonus wird weggelassen, nicht auf 0 gesetzt — 0 wäre ein Wert,
 * den `ticketWeight` ohnehin ignoriert, und er würde nur die Liste füllen.
 * @returns {{ ok: true, bonus: Record<string, number> } | { ok: false, error: string }}
 */
export function normalizeBonusRoles(value) {
  if (value == null) return { ok: true, bonus: {} };
  if (typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'invalid_bonus' };
  const entries = Object.entries(value);
  if (entries.length > MAX_BONUS_ROLES) return { ok: false, error: 'too_many_bonus_roles' };
  const bonus = {};
  for (const [roleId, raw] of entries) {
    const id = String(roleId).trim();
    if (!ROLE_ID_RE.test(id)) return { ok: false, error: 'invalid_bonus' };
    const n = Number(raw);
    if (!Number.isInteger(n) || n < MIN_BONUS_AMOUNT || n > MAX_BONUS_AMOUNT) return { ok: false, error: 'invalid_bonus_amount' };
    bonus[id] = n;
  }
  return { ok: true, bonus };
}
