/**
 * The ACTIVE -> ENDED claim in `endGiveaway`.
 *
 * The bug this guards against: the old implementation checked the status, drew
 * the winners (seconds of REST calls) and only then wrote ENDED. A second
 * caller passing the check inside that window handed out the same prize twice,
 * and a prize handed out twice cannot be taken back. The claim now happens as a
 * single conditional UPDATE before the draw, so only one caller can continue.
 *
 * These tests drive real concurrency against a real database. Skipped without
 * TEST_DATABASE_URL — see tests/helpers/db.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
// Must come first: it points DATABASE_URL at the test database before any src
// module (and with it the Prisma singleton) is loaded.
import { openTestDb, skipDb, cleanup, createTestGiveaway, addEntries, testGuildId, sleep } from './helpers/db.js';
import { fakeClient, fakeGuild } from './helpers/discord.js';

const prisma = await openTestDb();
const skip = skipDb;

const { endGiveaway } = skip ? {} : await import('../src/services/giveawayService.js');
const settingsService = skip ? {} : await import('../src/services/settingsService.js');
if (!skip) (await import('../src/utils/i18n.js')).loadLocales();

test.after(async () => {
  await cleanup(prisma);
  await prisma?.$disconnect();
});

test('only one of many concurrent calls ends a giveaway', { skip }, async () => {
  const guildId = testGuildId();
  const gw = await createTestGiveaway(prisma, guildId);
  const users = await addEntries(prisma, gw.id, 5);
  const client = fakeClient({ guild: fakeGuild(users) });

  const results = await Promise.all(Array.from({ length: 8 }, () => endGiveaway(gw, client)));

  const winners = results.filter((r) => r !== null);
  assert.equal(winners.length, 1, 'exactly one caller may end the giveaway');
  assert.equal(winners[0].length, 1, 'the winning caller draws the configured number of winners');

  const row = await prisma.giveaway.findUnique({ where: { id: gw.id } });
  assert.equal(row.status, 'ENDED');
  assert.ok(row.endedAt, 'endedAt is set by the claim');

  const recorded = await prisma.winner.count({ where: { giveawayId: gw.id } });
  assert.equal(recorded, 1, 'the prize is recorded once, not once per caller');
  assert.equal(client.sent.length, 1, 'exactly one result message is posted');
});

test('the claim closes the entry window before the draw starts', { skip }, async () => {
  const guildId = testGuildId();
  const gw = await createTestGiveaway(prisma, guildId);
  const users = await addEntries(prisma, gw.id, 3);

  // A draw that takes 300ms — the window the old in-memory lock left open.
  const slow = fakeClient({ guild: fakeGuild(users, { delayMs: 300 }) });
  const pending = endGiveaway(gw, slow);
  await sleep(60); // mid-draw

  const during = await prisma.giveaway.findUnique({ where: { id: gw.id } });
  assert.equal(during.status, 'ENDED', 'the status changes before the draw, not after it');

  // The participate button checks for ACTIVE, so nobody can still join here, and
  // a second ending attempt has nothing left to claim.
  const second = await endGiveaway(gw, fakeClient({ guild: fakeGuild(users) }));
  assert.equal(second, null, 'a caller arriving during the draw gets nothing');

  const first = await pending;
  assert.equal(first.length, 1);
  assert.equal(await prisma.winner.count({ where: { giveawayId: gw.id } }), 1);
});

test('a cancelled or already ended giveaway cannot be ended again', { skip }, async () => {
  const guildId = testGuildId();
  const client = fakeClient({ guild: fakeGuild([]) });

  const cancelled = await createTestGiveaway(prisma, guildId, { status: 'CANCELLED' });
  assert.equal(await endGiveaway(cancelled, client), null);
  assert.equal((await prisma.giveaway.findUnique({ where: { id: cancelled.id } })).status, 'CANCELLED');

  const paused = await createTestGiveaway(prisma, guildId, { status: 'PAUSED' });
  assert.equal(await endGiveaway(paused, client), null, 'a paused giveaway is frozen, not due');

  const gw = await createTestGiveaway(prisma, guildId);
  assert.notEqual(await endGiveaway(gw, client), null);
  assert.equal(await endGiveaway(gw, client), null, 'the second call finds nothing to claim');
});

test('the giveaway stays ENDED when the guild is gone, so /greroll can repair it', { skip }, async () => {
  const guildId = testGuildId();
  const gw = await createTestGiveaway(prisma, guildId);
  await addEntries(prisma, gw.id, 3);

  // No guild -> no draw. The claim still stands: ending without a result is
  // repairable, ending twice is not.
  const result = await endGiveaway(gw, fakeClient({ guild: null }));
  assert.deepEqual(result, [], 'ended with no winners');

  const row = await prisma.giveaway.findUnique({ where: { id: gw.id } });
  assert.equal(row.status, 'ENDED');
  assert.equal(await prisma.winner.count({ where: { giveawayId: gw.id } }), 0);
});

test('concurrent endings of different giveaways do not block each other', { skip }, async () => {
  const guildId = testGuildId();
  const gws = await Promise.all([
    createTestGiveaway(prisma, guildId),
    createTestGiveaway(prisma, guildId),
    createTestGiveaway(prisma, guildId),
  ]);
  for (const gw of gws) await addEntries(prisma, gw.id, 2);

  const client = fakeClient({ guild: fakeGuild(await addEntries(prisma, gws[0].id, 2)) });
  const results = await Promise.all(gws.map((gw) => endGiveaway(gw, client)));

  assert.equal(results.filter((r) => r !== null).length, 3, 'the claim is per giveaway, not a global lock');
  settingsService.evict(guildId);
});
