/**
 * Overlapping scheduler ticks.
 *
 * A tick runs every 10 seconds and does REST work. If one tick is still ending
 * a giveaway when the next one starts, both see the same due row — before the
 * bot restarts, and across two bot processes as well. Reminder and ending both
 * claim their row atomically, and these tests check the observable result:
 * exactly one message, no matter how many ticks overlap.
 *
 * Skipped without TEST_DATABASE_URL — see tests/helpers/db.js. The tick queries
 * every due giveaway in the database, which is why a dedicated one is required.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb, skipDb, cleanup, createTestGiveaway, addEntries, testGuildId } from './helpers/db.js';
import { fakeClient, fakeGuild } from './helpers/discord.js';

const prisma = await openTestDb();
const skip = skipDb;

const { runSchedulerTick } = skip ? {} : await import('../src/services/scheduler.js');
const settingsService = skip ? {} : await import('../src/services/settingsService.js');
if (!skip) (await import('../src/utils/i18n.js')).loadLocales();

// A tick is not scoped to one guild, so leftovers from an aborted earlier run
// would show up as extra due giveaways here.
test.before(async () => {
  await cleanup(prisma);
});

test.after(async () => {
  await cleanup(prisma);
  await prisma?.$disconnect();
});

test('overlapping ticks end a due giveaway exactly once', { skip }, async () => {
  const guildId = testGuildId();
  const gw = await createTestGiveaway(prisma, guildId);
  const users = await addEntries(prisma, gw.id, 4);

  // The draw takes 200ms, so the second and third tick start while the first
  // one is still inside it.
  const client = fakeClient({ guild: fakeGuild(users, { delayMs: 200 }) });
  await Promise.all([runSchedulerTick(client), runSchedulerTick(client), runSchedulerTick(client)]);

  const row = await prisma.giveaway.findUnique({ where: { id: gw.id } });
  assert.equal(row.status, 'ENDED');
  assert.equal(await prisma.winner.count({ where: { giveawayId: gw.id } }), 1, 'one prize, not three');
  assert.equal(client.sent.length, 1, 'one result message, not three');
});

test('overlapping ticks post an "ending soon" reminder exactly once', { skip }, async () => {
  const guildId = testGuildId();
  const gw = await createTestGiveaway(prisma, guildId, {
    endAt: new Date(Date.now() + 60 * 60 * 1000), // still running
    reminderAt: new Date(Date.now() - 1000), // reminder is due
    reminderSent: false,
  });

  const client = fakeClient({ guild: fakeGuild([]) });
  await Promise.all([runSchedulerTick(client), runSchedulerTick(client), runSchedulerTick(client)]);

  assert.equal(client.sent.length, 1, 'one reminder, not three');
  const row = await prisma.giveaway.findUnique({ where: { id: gw.id } });
  assert.equal(row.reminderSent, true);
  assert.equal(row.status, 'ACTIVE', 'a reminder does not end the giveaway');
});

test('a tick leaves giveaways alone that are not due', { skip }, async () => {
  const guildId = testGuildId();
  const future = await createTestGiveaway(prisma, guildId, { endAt: new Date(Date.now() + 60 * 60 * 1000) });
  const paused = await createTestGiveaway(prisma, guildId, { status: 'PAUSED', pausedAt: new Date() });

  const client = fakeClient({ guild: fakeGuild([]) });
  await runSchedulerTick(client);

  assert.equal((await prisma.giveaway.findUnique({ where: { id: future.id } })).status, 'ACTIVE');
  assert.equal(
    (await prisma.giveaway.findUnique({ where: { id: paused.id } })).status,
    'PAUSED',
    'a paused giveaway is frozen even though its endAt has passed',
  );
  assert.equal(client.sent.length, 0);
  settingsService.evict(guildId);
});
