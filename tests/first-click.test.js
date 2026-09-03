/**
 * "First click wins" (`winnerMode = FIRST_CLICK`).
 *
 * The mode turns the button into the draw itself, which moves two things that
 * used to be harmless into the critical path:
 *
 *  1. **The order of the entries is the result.** In RANDOM it does not matter
 *     who joined first; here it decides who gets the prize. The tests below pin
 *     the ordering down with explicit `joinedAt` values, because a test that
 *     relied on insertion order would pass for the wrong reason.
 *  2. **Every click may end the giveaway.** Ten people pressing at the same
 *     moment produce ten attempts to end it. Exactly one may go through, and
 *     which one wins that race must not change who gets the prize.
 *
 * Skipped without TEST_DATABASE_URL — see tests/helpers/db.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb, skipDb, cleanup, createTestGiveaway, testGuildId } from './helpers/db.js';
import { fakeClient, fakeGuild } from './helpers/discord.js';

const prisma = await openTestDb();
const skip = skipDb;

const service = skip ? {} : await import('../src/services/giveawayService.js');
const settingsService = skip ? {} : await import('../src/services/settingsService.js');
if (!skip) (await import('../src/utils/i18n.js')).loadLocales();

const NO_LIMITS = { blacklist: [], whitelist: [], bonusRoles: {}, minAccountDays: 0, minMemberDays: 0 };
const BLOCKED = 'role-blocked';

// In click order: fast[0] was there first.
const fast = ['500000000000000001', '500000000000000002', '500000000000000003'];

test.after(async () => {
  await cleanup(prisma);
  await prisma?.$disconnect();
});

/** A FIRST_CLICK giveaway whose deadline has not passed yet. */
async function firstClickGiveaway(overrides = {}) {
  return createTestGiveaway(prisma, testGuildId(), {
    winnerMode: 'FIRST_CLICK',
    endAt: new Date(Date.now() + 3_600_000),
    ...overrides,
  });
}

/** Entries with an explicit click time, one second apart. */
async function clicksInOrder(giveawayId, userIds) {
  const base = Date.now() - userIds.length * 1000;
  for (const [i, userId] of userIds.entries()) {
    await prisma.entry.create({
      data: { giveawayId, userId, joinedAt: new Date(base + i * 1000) },
    });
  }
  return userIds;
}

test('the fastest click wins, not a random entrant', { skip }, async () => {
  const gw = await firstClickGiveaway();
  await clicksInOrder(gw.id, fast);

  // Ten times so that a random result would show up: with three entrants the
  // chance of drawing the same one ten times running is below one in a thousand.
  for (let i = 0; i < 10; i++) {
    const winners = await service.pickFirstEntries(gw, fakeGuild(fast), NO_LIMITS);
    assert.deepEqual(winners, [fast[0]], 'the earliest entry wins every time');
  }
});

test('several winners follow the click order', { skip }, async () => {
  const gw = await firstClickGiveaway({ winnersCount: 2 });
  await clicksInOrder(gw.id, fast);

  const winners = await service.pickFirstEntries(gw, fakeGuild(fast), NO_LIMITS);
  assert.deepEqual(winners, [fast[0], fast[1]], 'the two fastest, in that order');
});

test('somebody blacklisted after clicking lets the next one move up', { skip }, async () => {
  const gw = await firstClickGiveaway();
  await clicksInOrder(gw.id, fast);

  // Exactly the point where checking at the button is not enough: the role was
  // only added after the click.
  const guild = fakeGuild(fast, { memberOptions: { [fast[0]]: { roles: [BLOCKED] } } });
  const winners = await service.pickFirstEntries(gw, guild, { ...NO_LIMITS, blacklist: [BLOCKED] });
  assert.deepEqual(winners, [fast[1]], 'the fastest valid entry wins, not the fastest entry');
});

test('somebody who left the server lets the next one move up', { skip }, async () => {
  const gw = await firstClickGiveaway();
  await clicksInOrder(gw.id, fast);

  // fast[0] is missing from the guild -> Unknown Member.
  const winners = await service.pickFirstEntries(gw, fakeGuild(fast.slice(1)), NO_LIMITS);
  assert.deepEqual(winners, [fast[1]]);
});

test('a reroll takes the next fastest, it does not draw', { skip }, async () => {
  const gw = await firstClickGiveaway();
  await clicksInOrder(gw.id, fast);

  const winners = await service.selectWinners(gw, fakeGuild(fast), NO_LIMITS, { exclude: [fast[0]] });
  assert.deepEqual(winners, [fast[1]], 'the replacement is the runner-up, not a random entrant');
});

test('an entry cannot be withdrawn in this mode', { skip }, async () => {
  const gw = await firstClickGiveaway();
  const user = fast[0];

  assert.equal(await service.addOrRemoveEntry(gw.id, user, { toggle: false }), 'added');
  // In RANDOM a second click would withdraw the entry. Here it would have
  // handed back a prize that was already won.
  assert.equal(await service.addOrRemoveEntry(gw.id, user, { toggle: false }), 'already');
  assert.equal(await service.countEntries(gw.id), 1, 'the entry is still there');
});

test('the giveaway ends on the click that fills the last slot', { skip }, async () => {
  const guildId = testGuildId();
  const gw = await createTestGiveaway(prisma, guildId, {
    winnerMode: 'FIRST_CLICK',
    winnersCount: 2,
    endAt: new Date(Date.now() + 3_600_000),
  });
  const client = fakeClient({ guild: fakeGuild(fast) });

  await clicksInOrder(gw.id, fast.slice(0, 1));
  assert.equal(await service.endIfFirstClickComplete(client, gw), null, 'one of two slots is not enough');
  assert.equal((await prisma.giveaway.findUnique({ where: { id: gw.id } })).status, 'ACTIVE');

  await clicksInOrder(gw.id, fast.slice(1, 2));
  const winners = await service.endIfFirstClickComplete(client, gw);
  assert.equal(winners.length, 2);
  assert.equal((await prisma.giveaway.findUnique({ where: { id: gw.id } })).status, 'ENDED');
  settingsService.evict(guildId);
});

test('a RANDOM giveaway is never ended by a click', { skip }, async () => {
  const gw = await createTestGiveaway(prisma, testGuildId(), { endAt: new Date(Date.now() + 3_600_000) });
  await clicksInOrder(gw.id, fast);

  const client = fakeClient({ guild: fakeGuild(fast) });
  assert.equal(await service.endIfFirstClickComplete(client, gw), null);
  assert.equal((await prisma.giveaway.findUnique({ where: { id: gw.id } })).status, 'ACTIVE');
  assert.equal(client.sent.length, 0, 'nothing is posted');
});

test('many simultaneous clicks hand out the prize exactly once', { skip }, async () => {
  const guildId = testGuildId();
  const gw = await createTestGiveaway(prisma, guildId, {
    winnerMode: 'FIRST_CLICK',
    endAt: new Date(Date.now() + 3_600_000),
  });
  await clicksInOrder(gw.id, fast);
  const client = fakeClient({ guild: fakeGuild(fast) });

  // Every click checks for itself whether the giveaway is full. Ten of them at
  // once are ten attempts to end it — the claim in endGiveaway lets exactly one
  // through.
  const results = await Promise.all(
    Array.from({ length: 10 }, () => service.endIfFirstClickComplete(client, gw)),
  );

  const done = results.filter((r) => r !== null);
  assert.equal(done.length, 1, 'exactly one caller ends the giveaway');
  assert.deepEqual(done[0], [fast[0]], 'and the winner is the fastest click, not the fastest caller');
  assert.equal(await prisma.winner.count({ where: { giveawayId: gw.id } }), 1);
  assert.equal(client.sent.length, 1, 'exactly one result message is posted');
  settingsService.evict(guildId);
});

test('with one prize per winner the fastest gets prize 1', { skip }, async () => {
  const guildId = testGuildId();
  const gw = await createTestGiveaway(prisma, guildId, {
    winnerMode: 'FIRST_CLICK',
    prizeMode: 'INDIVIDUAL',
    prizes: JSON.stringify(['Crate key', 'Sticker']),
    winnersCount: 2,
    endAt: new Date(Date.now() + 3_600_000),
  });
  await clicksInOrder(gw.id, fast);

  await service.endGiveaway(gw, fakeClient({ guild: fakeGuild(fast) }));
  const winners = await service.getWinners(gw.id);
  assert.deepEqual(winners, [
    { userId: fast[0], prizeIndex: 0 },
    { userId: fast[1], prizeIndex: 1 },
  ]);
  settingsService.evict(guildId);
});
