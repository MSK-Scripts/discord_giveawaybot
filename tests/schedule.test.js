/**
 * The rules for start times of scheduled giveaways, without a database.
 *
 * What is at stake: a start the bot misreads posts the giveaway at the wrong
 * time, and nobody notices until it is too late to fix. So the input is
 * checked strictly (an ISO time without an offset is refused instead of being
 * read in the bot host's time zone) and the bounds match those of a duration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStartAt, parseStartOffset, activationTimes, startsLabel,
  MAX_START_AHEAD_MS, LATE_START_GRACE_MS,
} from '../src/utils/schedule.js';
import { templateInputFromGiveaway } from '../src/services/templateService.js';

const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
const HOUR = 3_600_000;

test('a start can be given as ISO with offset or as epoch milliseconds', () => {
  assert.equal(parseStartAt('2026-10-28T14:00:00Z', NOW).startAt.getTime(), NOW + 2 * HOUR);
  assert.equal(parseStartAt('2026-10-28T16:00+02:00', NOW).startAt.getTime(), NOW + 2 * HOUR);
  assert.equal(parseStartAt('2026-10-28T14:00:00.500Z', NOW).startAt.getTime(), NOW + 2 * HOUR + 500);
  assert.equal(parseStartAt(NOW + HOUR, NOW).startAt.getTime(), NOW + HOUR);
  assert.equal(parseStartAt(String(NOW + HOUR), NOW).startAt.getTime(), NOW + HOUR);
});

test('no start means "now", not an error', () => {
  for (const raw of [undefined, null, '']) assert.deepEqual(parseStartAt(raw, NOW), { ok: true, startAt: null });
});

test('ambiguous or malformed starts are refused with invalid_start', () => {
  const bad = [
    '2026-10-28T14:00',          // no offset: would be read in the host's time zone
    '2026-02-30T10:00:00Z',      // V8 would roll this over to March 2
    '2026-13-01T10:00:00Z',
    'tomorrow',
    '2h',
    { at: NOW + HOUR },
    [NOW + HOUR],
    true,
    NOW + HOUR + 0.5,            // no fractions of a millisecond
    Number.POSITIVE_INFINITY,
  ];
  for (const raw of bad) assert.equal(parseStartAt(raw, NOW).error, 'invalid_start', JSON.stringify(raw));
});

test('a start must lie in the future and at most a year ahead', () => {
  assert.equal(parseStartAt(NOW, NOW).error, 'start_in_past', 'now is not the future');
  assert.equal(parseStartAt(NOW - 1, NOW).error, 'start_in_past');
  assert.equal(parseStartAt('2026-10-28T11:59:59Z', NOW).error, 'start_in_past');
  assert.ok(parseStartAt(NOW + MAX_START_AHEAD_MS, NOW).ok, 'exactly the limit is still fine');
  assert.equal(parseStartAt(NOW + MAX_START_AHEAD_MS + 1, NOW).error, 'start_too_far');
  assert.equal(MAX_START_AHEAD_MS, 365 * 24 * HOUR, 'the same one-year bound as a duration');
});

test('the start offset from the /gcreate customId is checked again', () => {
  assert.equal(parseStartOffset(undefined), null);
  assert.equal(parseStartOffset(''), null);
  assert.equal(parseStartOffset('7200000'), 2 * HOUR);
  assert.equal(parseStartOffset('5'), false, 'below the 10 s minimum of a duration');
  assert.equal(parseStartOffset(String(366 * 24 * HOUR)), false, 'beyond one year');
  assert.equal(parseStartOffset('12abc'), false);
  assert.equal(parseStartOffset('-7200000'), false);
});

test('a start on time keeps the planned times, a late one keeps the full duration', () => {
  const planned = { startAt: new Date(NOW), endAt: new Date(NOW + HOUR) };

  const onTime = activationTimes(planned, NOW + 5_000);
  assert.equal(onTime.startAt.getTime(), NOW);
  assert.equal(onTime.endAt.getTime(), NOW + HOUR, 'a tick later is not "late"');

  const atGrace = activationTimes(planned, NOW + LATE_START_GRACE_MS);
  assert.equal(atGrace.endAt.getTime(), NOW + HOUR);

  const late = activationTimes(planned, NOW + 2 * HOUR);
  assert.equal(late.startAt.getTime(), NOW + 2 * HOUR, 'startAt says when it really went out');
  assert.equal(late.endAt.getTime(), NOW + 3 * HOUR, 'still runs its hour');
});

test('startsLabel renders a Discord timestamp of the start', () => {
  assert.equal(startsLabel({ startAt: new Date(NOW) }), `<t:${NOW / 1000}:R>`);
  assert.equal(startsLabel({ startAt: new Date(NOW) }, 'F'), `<t:${NOW / 1000}:F>`);
});

test('a template from a scheduled giveaway takes the duration from the start, not from creation', () => {
  const giveaway = {
    title: 'Later', description: 'x', winnersCount: 1, prizes: '[]', prizeMode: 'ALL', winnerMode: 'RANDOM',
    createdAt: new Date(NOW),
    startAt: new Date(NOW + 24 * HOUR),
    endAt: new Date(NOW + 26 * HOUR),
    blacklistRoles: null, whitelistRoles: null, bonusRoles: null,
  };
  assert.equal(templateInputFromGiveaway(giveaway, 'n').duration, '2h', 'the waiting day is not part of it');
  assert.equal(templateInputFromGiveaway({ ...giveaway, startAt: null }, 'n').duration, '1d2h', 'unscheduled: from creation');
});
