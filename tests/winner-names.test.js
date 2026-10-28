/**
 * Winner names stored at draw time.
 *
 * The dashboard used to show bare user IDs. Every draw path (ending, rerolling
 * all, replacing one winner) has to store the name and avatar of the member it
 * fetched for the draw anyway. A path that forgets it would show IDs again for
 * exactly those winners, and nothing would fail.
 *
 * The profile helpers run without a database, the rest is skipped without
 * TEST_DATABASE_URL (see tests/helpers/db.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb, skipDb, cleanup, createTestGiveaway, testGuildId } from './helpers/db.js';
import { fakeClient, fakeGuild } from './helpers/discord.js';
import { memberProfile, userProfile, MAX_DISPLAY_NAME } from '../src/utils/profile.js';

const prisma = await openTestDb();
const skip = skipDb;

const service = skip ? {} : await import('../src/services/giveawayService.js');
const settingsService = skip ? {} : await import('../src/services/settingsService.js');
if (!skip) (await import('../src/utils/i18n.js')).loadLocales();

const users = ['400000000000000011', '400000000000000012', '400000000000000013'];
const AVATAR = /^https:\/\/cdn\.discordapp\.com\/.+\?size=128$/;

test.after(async () => {
  await cleanup(prisma);
  await prisma?.$disconnect();
});

async function giveawayWithEntries(overrides = {}) {
  const gw = await createTestGiveaway(prisma, testGuildId(), overrides);
  await prisma.entry.createMany({ data: users.map((userId) => ({ giveawayId: gw.id, userId })) });
  return gw;
}

const rowsOf = (giveawayId, where = {}) =>
  prisma.winner.findMany({ where: { giveawayId, ...where }, orderBy: { pickedAt: 'asc' } });

// ── pure helpers ────────────────────────────────────────────────────────────

test('memberProfile prefers the server nickname, then the global name, then the username', () => {
  const avatar = () => 'https://cdn.discordapp.com/a.png?size=128';
  assert.equal(memberProfile({ displayName: 'Nick', user: { globalName: 'Global', username: 'user' } }).displayName, 'Nick');
  assert.equal(memberProfile({ user: { globalName: 'Global', username: 'user' } }).displayName, 'Global');
  assert.equal(memberProfile({ user: { username: 'user' } }).displayName, 'user');
  assert.equal(memberProfile({ displayName: 'Nick', displayAvatarURL: avatar }).avatarUrl, avatar());
  assert.deepEqual(memberProfile(null), { displayName: null, avatarUrl: null });
});

test('the profile helpers never throw and cap what does not fit the columns', () => {
  const throwing = { displayName: 'x', displayAvatarURL: () => { throw new Error('boom'); } };
  assert.equal(memberProfile(throwing).avatarUrl, null);
  assert.equal(memberProfile({ displayName: 'n'.repeat(500) }).displayName.length, MAX_DISPLAY_NAME);
  assert.equal(memberProfile({ displayName: 'x', displayAvatarURL: () => `https://${'a'.repeat(600)}` }).avatarUrl, null);
  assert.equal(memberProfile({ displayName: '   ' }).displayName, null, 'blank is no name');
  assert.equal(userProfile({ globalName: null, username: 'plain' }).displayName, 'plain');
  assert.deepEqual(userProfile(undefined), { displayName: null, avatarUrl: null });
});

// ── every draw path stores the profile ─────────────────────────────────────

test('ending stores the display name and avatar of every winner', { skip }, async () => {
  const gw = await giveawayWithEntries({ winnersCount: 2 });
  const guild = fakeGuild(users, { memberOptions: { [users[0]]: { displayName: 'Server Nick' } } });
  const winnerIds = await service.endGiveaway(gw, fakeClient({ guild }));
  assert.equal(winnerIds.length, 2);

  const rows = await rowsOf(gw.id);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    const expected = row.userId === users[0] ? 'Server Nick' : `nick${row.userId.slice(-4)}`;
    assert.equal(row.displayName, expected, 'the nickname on the server, as the draw saw it');
    assert.match(row.avatarUrl, AVATAR);
  }
});

test('first click wins stores the profile too', { skip }, async () => {
  const gw = await giveawayWithEntries({ winnersCount: 1, winnerMode: 'FIRST_CLICK' });
  await service.endGiveaway(gw, fakeClient({ guild: fakeGuild(users) }));
  const [row] = await rowsOf(gw.id);
  assert.ok(row.displayName, 'pickFirstEntries hands its member over like drawWinners');
  assert.match(row.avatarUrl, AVATAR);
});

test('rerolling all winners stores the profile of the new ones', { skip }, async () => {
  const gw = await giveawayWithEntries({ winnersCount: 2 });
  const client = fakeClient({ guild: fakeGuild(users) });
  await service.endGiveaway(gw, client);
  const ended = await prisma.giveaway.findUnique({ where: { id: gw.id } });
  const settings = await settingsService.getSettings(gw.guildId);

  const fresh = await service.rerollAll(client, ended, settings, { actor: 'test' });
  assert.equal(fresh.length, 1, 'one entrant left who has not won yet');

  const [row] = await rowsOf(gw.id, { rerolled: false });
  assert.equal(row.userId, fresh[0]);
  assert.equal(row.displayName, `nick${row.userId.slice(-4)}`);
  assert.match(row.avatarUrl, AVATAR);
});

test('replacing one winner stores the profile of the replacement', { skip }, async () => {
  const gw = await giveawayWithEntries({ winnersCount: 1 });
  const client = fakeClient({ guild: fakeGuild(users) });
  const [first] = await service.endGiveaway(gw, client);
  const ended = await prisma.giveaway.findUnique({ where: { id: gw.id } });
  const settings = await settingsService.getSettings(gw.guildId);

  const res = await service.rerollSingle(client, ended, settings, first, { actor: 'test' });
  assert.ok(res.newWinner);

  const row = await prisma.winner.findUnique({ where: { giveawayId_userId: { giveawayId: gw.id, userId: res.newWinner } } });
  assert.equal(row.rerolled, false);
  assert.equal(row.displayName, `nick${res.newWinner.slice(-4)}`);
  assert.match(row.avatarUrl, AVATAR);
});
