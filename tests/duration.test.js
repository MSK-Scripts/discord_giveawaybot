/**
 * Duration parsing for the /gcreate modal. No database, no Discord.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, formatDuration } from '../src/utils/duration.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test('single and combined units are added up', () => {
  assert.deepEqual(parseDuration('45m'), { ok: true, ms: 45 * MIN });
  assert.deepEqual(parseDuration('2h'), { ok: true, ms: 2 * HOUR });
  assert.deepEqual(parseDuration('1d2h30m'), { ok: true, ms: DAY + 2 * HOUR + 30 * MIN });
  assert.deepEqual(parseDuration('1D2H30M'), { ok: true, ms: DAY + 2 * HOUR + 30 * MIN }, 'case does not matter');
  assert.deepEqual(parseDuration('  1d 2h '), { ok: true, ms: DAY + 2 * HOUR }, 'spaces are allowed');
});

test('empty and malformed input is rejected', () => {
  assert.equal(parseDuration('').reason, 'empty');
  assert.equal(parseDuration(null).reason, 'empty');
  assert.equal(parseDuration('   ').reason, 'empty');
  assert.equal(parseDuration('tomorrow').reason, 'invalid');
  assert.equal(parseDuration('1w').reason, 'invalid', 'weeks are not a unit');
  assert.equal(parseDuration('10m please').reason, 'invalid', 'trailing junk is not silently ignored');
  assert.equal(parseDuration('5').reason, 'invalid', 'a bare number has no unit');
});

test('a span turns back into a duration string', () => {
  // Needed when a giveaway becomes a template: it stores a point in time, a
  // template stores a duration.
  assert.equal(formatDuration(45 * MIN), '45m');
  assert.equal(formatDuration(DAY + 2 * HOUR + 30 * MIN), '1d2h30m');
  assert.equal(formatDuration(2 * HOUR), '2h', 'empty units are left out');
  assert.equal(formatDuration(30_000), '30s');
  assert.equal(formatDuration(HOUR + 12_000), '1h', 'seconds only show up when nothing else is left');
});

test('a formatted duration can always be parsed again', () => {
  // Otherwise a template could be saved and never used.
  for (const ms of [0, 1, 9_000, 90 * DAY, 400 * DAY, Number.NaN]) {
    const text = formatDuration(ms);
    assert.equal(parseDuration(text).ok, true, `${ms} -> ${text}`);
  }
  assert.equal(formatDuration(0), '10s', 'clamped to the lower bound');
  assert.equal(formatDuration(400 * DAY), '365d', 'clamped to the upper bound');
});

test('the bounds keep a giveaway schedulable', () => {
  // Below one scheduler tick the giveaway would be over before the poll sees it.
  assert.equal(parseDuration('9s').reason, 'too_short');
  assert.deepEqual(parseDuration('10s'), { ok: true, ms: 10_000 });

  assert.deepEqual(parseDuration('365d'), { ok: true, ms: 365 * DAY });
  assert.equal(parseDuration('366d').reason, 'too_long');
});
