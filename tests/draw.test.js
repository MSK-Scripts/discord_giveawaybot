/**
 * The winner draw.
 *
 * Days can pass between joining and the draw, and in that time someone can lose
 * a role, get blacklisted or leave the server. That is why the entry conditions
 * are checked a second time here and not only at the button.
 *
 * Skipped without TEST_DATABASE_URL — the entries live in the database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb, skipDb, cleanup, createTestGiveaway, testGuildId } from './helpers/db.js';
import { fakeGuild } from './helpers/discord.js';

const prisma = await openTestDb();
const skip = skipDb;

const service = skip ? {} : await import('../src/services/giveawayService.js');

const BLOCKED = 'role-blocked';
const users = ['400000000000000001', '400000000000000002', '400000000000000003'];
const NO_LIMITS = { blacklist: [], whitelist: [], bonusRoles: {}, minAccountDays: 0, minMemberDays: 0 };

test.after(async () => {
  await cleanup(prisma);
  await prisma?.$disconnect();
});

async function giveawayWithEntries(overrides = {}) {
  const gw = await createTestGiveaway(prisma, testGuildId(), overrides);
  await prisma.entry.createMany({ data: users.map((userId) => ({ giveawayId: gw.id, userId })) });
  return gw;
}

test('every eligible entrant can win, capped by winnersCount', { skip }, async () => {
  const gw = await giveawayWithEntries({ winnersCount: 2 });
  const winners = await service.drawWinners(gw, fakeGuild(users), NO_LIMITS);

  assert.equal(winners.length, 2);
  assert.equal(new Set(winners).size, 2, 'nobody wins twice');
  for (const id of winners) assert.ok(users.includes(id));
});

test('a role blacklisted after joining loses the entry', { skip }, async () => {
  const gw = await giveawayWithEntries({ winnersCount: 3 });
  const guild = fakeGuild(users, { memberOptions: { [users[0]]: { roles: [BLOCKED] } } });

  const winners = await service.drawWinners(gw, guild, { ...NO_LIMITS, blacklist: [BLOCKED] });
  assert.equal(winners.length, 2);
  assert.ok(!winners.includes(users[0]), 'the blacklisted entrant is dropped at draw time');
});

test('a per-giveaway blacklist applies on top of the server-wide one', { skip }, async () => {
  const gw = await giveawayWithEntries({ winnersCount: 3, blacklistRoles: JSON.stringify([BLOCKED]) });
  const guild = fakeGuild(users, { memberOptions: { [users[1]]: { roles: [BLOCKED] } } });

  const winners = await service.drawWinners(gw, guild, NO_LIMITS);
  assert.equal(winners.length, 2);
  assert.ok(!winners.includes(users[1]));
});

test('someone who left the server is skipped, not drawn', { skip }, async () => {
  const gw = await giveawayWithEntries({ winnersCount: 3 });
  // Only two of the three are still members.
  const winners = await service.drawWinners(gw, fakeGuild(users.slice(0, 2)), NO_LIMITS);

  assert.equal(winners.length, 2);
  assert.ok(!winners.includes(users[2]));
});

test('excluded users are left out — this is what a reroll relies on', { skip }, async () => {
  const gw = await giveawayWithEntries({ winnersCount: 3 });
  const winners = await service.drawWinners(gw, fakeGuild(users), NO_LIMITS, { exclude: [users[0], users[1]] });

  assert.deepEqual(winners, [users[2]]);
});

test('no eligible entrant means no winner, not an error', { skip }, async () => {
  const gw = await giveawayWithEntries({ winnersCount: 1 });

  assert.deepEqual(await service.drawWinners(gw, fakeGuild([]), NO_LIMITS), [], 'nobody is in the guild any more');
  assert.deepEqual(
    await service.drawWinners(gw, fakeGuild(users), { ...NO_LIMITS, whitelist: ['role-nobody-has'] }),
    [],
    'a whitelist nobody satisfies',
  );
  assert.deepEqual(await service.drawWinners(gw, fakeGuild(users), NO_LIMITS, { exclude: users }), []);

  const empty = await createTestGiveaway(prisma, testGuildId());
  assert.deepEqual(await service.drawWinners(empty, fakeGuild(users), NO_LIMITS), [], 'no entries at all');
});

test('bonus tickets do not let one user win the same giveaway twice', { skip }, async () => {
  // The draw shuffles a multiset of tickets, so a heavily weighted user holds
  // several of them. Collecting first occurrences is what keeps the winner list
  // free of duplicates.
  const gw = await giveawayWithEntries({ winnersCount: 3, bonusRoles: JSON.stringify({ 'role-vip': 20 }) });
  const guild = fakeGuild(users, { memberOptions: { [users[0]]: { roles: ['role-vip'] } } });

  const winners = await service.drawWinners(gw, guild, NO_LIMITS);
  assert.equal(winners.length, 3);
  assert.equal(new Set(winners).size, 3);
});
