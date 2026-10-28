/**
 * Start times of scheduled giveaways.
 *
 * A scheduled giveaway is stored with status SCHEDULED and no Discord message.
 * The scheduler claims it at `startAt` and posts the message then. Everything
 * here is pure (no database, no Discord), so the rules can be tested without
 * either.
 */
import { DURATION_LIMITS } from './duration.js';

// How far ahead a start may lie: the same one-year bound a duration has.
export const MAX_START_AHEAD_MS = DURATION_LIMITS.maxMs;

// A start that comes later than this (the bot was offline at startAt) keeps its
// full runtime: endAt moves by the delay. Below it, the tick interval (10 s)
// would shift every end time by a few seconds for no benefit.
export const LATE_START_GRACE_MS = 60_000;

// ISO 8601 with an explicit offset. Without one, "2026-11-01T18:00" would be
// read in the time zone of the bot host, which is not what the person meant.
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i;
const EPOCH_RE = /^\d{1,16}$/;

/** Rejects dates V8 would quietly roll over, e.g. Feb 30 -> Mar 2. */
function realCalendarDay(year, month, day) {
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/**
 * Parses a requested start: an ISO string with offset, or epoch milliseconds
 * (as a number or a string of digits). Absent, null or '' means "start now".
 *
 * @param {unknown} raw
 * @param {number} [now] current time in ms (for tests)
 * @returns {{ok: true, startAt: Date|null} | {ok: false, error: 'invalid_start'|'start_in_past'|'start_too_far'}}
 */
export function parseStartAt(raw, now = Date.now()) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, startAt: null };

  let ms;
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw)) return { ok: false, error: 'invalid_start' };
    ms = raw;
  } else if (typeof raw === 'string') {
    const value = raw.trim();
    if (EPOCH_RE.test(value)) {
      ms = Number(value);
    } else {
      const m = ISO_RE.exec(value);
      if (!m || !realCalendarDay(Number(m[1]), Number(m[2]), Number(m[3]))) return { ok: false, error: 'invalid_start' };
      ms = Date.parse(value);
    }
  } else {
    return { ok: false, error: 'invalid_start' };
  }

  if (!Number.isFinite(ms)) return { ok: false, error: 'invalid_start' };
  if (ms <= now) return { ok: false, error: 'start_in_past' };
  if (ms - now > MAX_START_AHEAD_MS) return { ok: false, error: 'start_too_far' };
  return { ok: true, startAt: new Date(ms) };
}

/**
 * Start and end time a scheduled giveaway gets when it actually starts.
 *
 * Normally those are the stored values (endAt = startAt + duration). If the
 * start comes more than LATE_START_GRACE_MS late, both move by the delay, so the
 * giveaway still runs for its full duration instead of starting and ending in
 * the same tick after a longer downtime, and `startAt` says when it really went
 * out. Same idea as resuming a paused giveaway.
 *
 * @returns {{startAt: Date, endAt: Date}}
 */
export function activationTimes(giveaway, now = Date.now()) {
  const end = new Date(giveaway.endAt).getTime();
  const start = giveaway.startAt ? new Date(giveaway.startAt).getTime() : now;
  const late = now - start;
  if (late > LATE_START_GRACE_MS) return { startAt: new Date(now), endAt: new Date(end + late) };
  return { startAt: new Date(start), endAt: new Date(end) };
}

/**
 * The start offset that /gcreate carries in the modal customId, in ms.
 *
 * The customId comes back from the client, so it is checked again with the
 * bounds of a duration rather than trusted.
 *
 * @returns {number|null|false} the offset, null when there is none, false when invalid
 */
export function parseStartOffset(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (!/^\d{1,12}$/.test(String(raw))) return false;
  const ms = Number(raw);
  return ms >= DURATION_LIMITS.minMs && ms <= DURATION_LIMITS.maxMs ? ms : false;
}

/** Discord timestamp of the start, e.g. "in 2 hours" (style R) or a full date (F). */
export function startsLabel(giveaway, style = 'R') {
  const ms = giveaway?.startAt ? new Date(giveaway.startAt).getTime() : Date.now();
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}
