/**
 * The control endpoints the shop dashboard reads: the server name, winner
 * names, scheduled giveaways, deleting, the daily history and the live preview.
 *
 * Runs the real control server on 127.0.0.1 against a fake Discord client, the
 * same way control-tebex.test.js does. The fake records every message it sends,
 * edits or deletes and counts every REST-shaped lookup, so a test can assert
 * "no Discord call" instead of trusting that nothing happened.
 *
 * Skipped without TEST_DATABASE_URL, see tests/helpers/db.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openTestDb, skipDb, cleanup, testSnowflake } from './helpers/db.js';

process.env.CONTROL_SECRET = randomBytes(16).toString('hex');
process.env.CONTROL_PORT = '18791';

const prisma = await openTestDb();
const skip = skipDb;

const control = skip ? {} : await import('../src/services/controlServer.js');
const settingsService = skip ? {} : await import('../src/services/settingsService.js');
if (!skip) (await import('../src/utils/i18n.js')).loadLocales();

const BASE = 'http://127.0.0.1:18791';
const CHANNEL = '700000000000000011';
const LOG_CHANNEL = '700000000000000012';
const BOT = '999999999999999999';

let guildId;      // has a settings row, an icon and a log channel
let bareGuildId;  // in the cache, but no settings row and no icon
const guilds = new Map(); // the bot's guild cache, by reference

/** Everything the fake client was asked to do, reset before every test. */
const state = {
  sent: [], logs: [], edits: [], deleted: [],
  userFetches: 0, guildFetches: 0, channelFetches: 0,
  messageError: null,
};

function resetState() {
  Object.assign(state, {
    sent: [], logs: [], edits: [], deleted: [],
    userFetches: 0, guildFetches: 0, channelFetches: 0,
    messageError: null,
  });
}

function fakeControlClient(guilds) {
  const channel = {
    id: CHANNEL,
    get guildId() { return guildId; },
    isTextBased: () => true,
    async send(payload) {
      state.sent.push(payload);
      return { id: `8${String(state.sent.length).padStart(17, '0')}` };
    },
    messages: {
      async fetch(messageId) {
        if (state.messageError) throw state.messageError;
        return {
          id: messageId,
          async edit(payload) { state.edits.push({ messageId, payload }); },
          async delete() { state.deleted.push(messageId); },
        };
      },
    },
  };
  const logChannel = {
    id: LOG_CHANNEL,
    async send(payload) { state.logs.push(payload.content); return { id: 'log' }; },
  };
  return {
    user: { id: BOT },
    guilds: {
      cache: { has: (g) => guilds.has(g), get: (g) => guilds.get(g) ?? null },
      fetch: async (g) => { state.guildFetches++; return guilds.get(g) ?? null; },
    },
    channels: {
      fetch: async (c) => {
        state.channelFetches++;
        if (c === CHANNEL) return channel;
        if (c === LOG_CHANNEL) return logChannel;
        return null;
      },
    },
    users: {
      fetch: async (userId) => {
        state.userFetches++;
        return {
          id: userId,
          username: `user${userId.slice(-4)}`,
          globalName: `Global ${userId.slice(-4)}`,
          displayAvatarURL: ({ size } = {}) => `https://cdn.discordapp.com/avatars/${userId}/a.png?size=${size}`,
        };
      },
    },
  };
}

async function call(path, { method = 'GET', body, secret = process.env.CONTROL_SECRET } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(secret ? { 'X-Control-Secret': secret } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const post = (path, body) => call(path, { method: 'POST', body: { guildId, ...body } });

test.before(async () => {
  if (skip) return;
  guildId = testSnowflake();
  bareGuildId = testSnowflake();
  await prisma.guildSettings.create({ data: { guildId, logChannel: LOG_CHANNEL } });
  settingsService.evict(guildId);
  settingsService.evict(bareGuildId);

  guilds.set(guildId, {
    id: guildId, ownerId: '400000000000000009', name: 'Dashboard Guild', memberCount: 1234,
    iconURL: ({ size } = {}) => `https://cdn.discordapp.com/icons/${guildId}/abc.webp?size=${size}`,
  });
  guilds.set(bareGuildId, { id: bareGuildId, ownerId: '400000000000000009', name: 'Bare Guild', memberCount: 3, iconURL: () => null });
  control.startControlServer(fakeControlClient(guilds));
});

/** Puts one more guild into the bot's cache, for tests that need their own. */
function addGuild() {
  const id = testSnowflake();
  guilds.set(id, { id, ownerId: '400000000000000009', name: 'Extra Guild', memberCount: 1, iconURL: () => null });
  return id;
}

test.beforeEach(() => resetState());

test.after(async () => {
  control.stopControlServer?.();
  await cleanup(prisma);
  await prisma?.$disconnect();
});

// ── GET /guild ───────────────────────────────────────────────────────────────

test('GET /guild answers name, icon and member count from the cache, without a REST call', { skip }, async () => {
  const { status, json } = await call(`/guild?guildId=${guildId}`);
  assert.equal(status, 200);
  assert.deepEqual(json.guild, {
    id: guildId,
    name: 'Dashboard Guild',
    iconUrl: `https://cdn.discordapp.com/icons/${guildId}/abc.webp?size=128`,
    memberCount: 1234,
  });
  assert.equal(state.guildFetches, 0, 'no guilds.fetch, the cache is enough');

  const bare = await call(`/guild?guildId=${bareGuildId}`);
  assert.equal(bare.status, 200);
  assert.equal(bare.json.guild.iconUrl, null, 'a guild without an icon answers null');
});

test('GET /guild keeps the secret and the guild check', { skip }, async () => {
  assert.equal((await call(`/guild?guildId=${guildId}`, { secret: null })).status, 401);
  assert.equal((await call(`/guild?guildId=${guildId}`, { secret: 'wrong' })).status, 401);
  assert.equal((await call('/guild?guildId=abc')).status, 400);
  assert.equal((await call(`/guild?guildId=${testSnowflake()}`)).status, 403, 'a guild the bot is not in');
});

// ── helpers for rows the endpoints can address ─────────────────────────────
// The control server only accepts IDs like the real ones (/^[A-Z0-9]{4,12}$/),
// so the `test-` prefix of createTestGiveaway does not fit here. The guild ID
// is a test snowflake, which is what cleanup() removes.

let idCounter = 0;
function controlId() {
  idCounter += 1;
  return `T${randomBytes(3).toString('hex').toUpperCase()}${String(idCounter).padStart(3, '0')}`;
}

async function giveawayRow(overrides = {}) {
  return prisma.giveaway.create({
    data: {
      id: controlId(),
      guildId,
      channelId: CHANNEL,
      hostId: '100000000000000002',
      title: 'Dashboard test',
      description: 'created by control-dashboard.test.js',
      winnersCount: 1,
      endAt: new Date(Date.now() + 3_600_000),
      status: 'ACTIVE',
      ...overrides,
    },
  });
}

const userId = (n) => `50000000000000${String(n).padStart(4, '0')}`;

// ── winner names in the list and the detail ────────────────────────────────

test('GET /giveaways returns the stored winner names and never asks Discord', { skip }, async () => {
  const gw = await giveawayRow({ status: 'ENDED', endedAt: new Date() });
  await prisma.winner.createMany({
    data: [
      { giveawayId: gw.id, userId: userId(1), prizeIndex: null, displayName: 'Stored Nick', avatarUrl: 'https://cdn.discordapp.com/a.png' },
      { giveawayId: gw.id, userId: userId(2), prizeIndex: null },
    ],
  });

  const { status, json } = await call(`/giveaways?guildId=${guildId}`);
  assert.equal(status, 200);
  const item = json.giveaways.find((g) => g.id === gw.id);
  const byUser = Object.fromEntries(item.winners.map((w) => [w.userId, w]));
  assert.equal(byUser[userId(1)].displayName, 'Stored Nick');
  assert.equal(byUser[userId(1)].avatarUrl, 'https://cdn.discordapp.com/a.png');
  assert.equal(byUser[userId(2)].displayName, null, 'an old winner stays null in the list');
  assert.equal(state.userFetches, 0, 'the list never fetches users');
});

test('GET /giveaway fills missing names lazily, capped, and writes nothing back', { skip }, async () => {
  const gw = await giveawayRow({ status: 'ENDED', endedAt: new Date(), winnersCount: 31 });
  await prisma.winner.createMany({
    data: [
      { giveawayId: gw.id, userId: userId(100), displayName: 'Stored Nick' },
      ...Array.from({ length: 30 }, (_, i) => ({ giveawayId: gw.id, userId: userId(200 + i) })),
    ],
  });

  const { status, json } = await call(`/giveaway?guildId=${guildId}&id=${gw.id}`);
  assert.equal(status, 200);
  const winners = json.giveaway.winners;
  assert.equal(winners.length, 31);
  assert.equal(state.userFetches, 25, 'at most 25 lookups per request');

  const stored = winners.find((w) => w.userId === userId(100));
  assert.equal(stored.displayName, 'Stored Nick', 'a stored name is not replaced by a lookup');

  const looked = winners.filter((w) => w.displayName?.startsWith('Global '));
  assert.equal(looked.length, 25);
  assert.ok(looked.every((w) => /size=128$/.test(w.avatarUrl)));
  assert.equal(winners.filter((w) => w.displayName === null).length, 5, 'the rest stays null');

  const untouched = await prisma.winner.count({ where: { giveawayId: gw.id, displayName: null } });
  assert.equal(untouched, 30, 'read-only: nothing is written back');
});

test('GET /giveaway refuses a malformed id before any lookup', { skip }, async () => {
  assert.equal((await call(`/giveaway?guildId=${guildId}&id=not-an-id`)).status, 400);
  assert.equal((await call(`/giveaway?guildId=${guildId}&id=ZZZZ9999`)).status, 404);
  assert.equal(state.userFetches, 0);
});

// ── scheduled giveaways over the control endpoint ──────────────────────────

const createBody = (extra = {}) => ({
  channelId: CHANNEL, title: 'Scheduled', description: 'Text', winnersCount: 1, duration: '1h', prizes: ['Prize'], ...extra,
});

test('POST /giveaway/create with a startAt stores a SCHEDULED giveaway and posts nothing', { skip }, async () => {
  const startAt = new Date(Math.ceil((Date.now() + 2 * 3_600_000) / 1000) * 1000);
  const { status, json } = await post('/giveaway/create', createBody({ startAt: startAt.toISOString(), couponPercent: 10 }));
  assert.equal(status, 200);
  assert.equal(json.status, 'SCHEDULED');
  assert.equal(json.startAt, startAt.toISOString());
  assert.equal(json.endAt, new Date(startAt.getTime() + 3_600_000).toISOString(), 'the duration counts from the start');

  const gw = await prisma.giveaway.findUnique({ where: { id: json.id } });
  assert.equal(gw.status, 'SCHEDULED');
  assert.equal(gw.messageId, null);
  assert.equal(gw.startAt.getTime(), startAt.getTime());
  assert.equal(gw.couponPercent, 10, 'coupon settings are stored for later as well');
  assert.equal(state.sent.length, 0, 'no Discord message before the start');
  assert.ok(state.logs.some((l) => l.includes(json.id) && l.includes('scheduled')), 'logged like a create');

  const detail = await call(`/giveaway?guildId=${guildId}&id=${json.id}`);
  assert.equal(detail.json.giveaway.startAt, startAt.toISOString());

  // Epoch milliseconds work the same way.
  const epoch = await post('/giveaway/create', createBody({ startAt: startAt.getTime() }));
  assert.equal(epoch.status, 200);
  assert.equal(epoch.json.status, 'SCHEDULED');
});

test('POST /giveaway/create without a startAt still posts right away', { skip }, async () => {
  const { status, json } = await post('/giveaway/create', createBody());
  assert.equal(status, 200);
  assert.equal(json.status, 'ACTIVE');
  assert.equal(json.startAt, null);
  assert.equal(state.sent.length, 1);
});

test('POST /giveaway/create refuses a bad startAt and creates nothing', { skip }, async () => {
  const before = await prisma.giveaway.count({ where: { guildId } });
  const cases = [
    ['2026-10-28T14:00', 'invalid_start'],
    ['next week', 'invalid_start'],
    [{ when: 'later' }, 'invalid_start'],
    [new Date(Date.now() - 60_000).toISOString(), 'start_in_past'],
    [Date.now() + 366 * 24 * 3_600_000, 'start_too_far'],
  ];
  for (const [startAt, error] of cases) {
    const res = await post('/giveaway/create', createBody({ startAt }));
    assert.equal(res.status, 400, JSON.stringify(startAt));
    assert.equal(res.json.error, error, JSON.stringify(startAt));
  }
  assert.equal(await prisma.giveaway.count({ where: { guildId } }), before);
  assert.equal(state.sent.length, 0);
});

test('a scheduled giveaway can be cancelled, but not extended, paused, ended, resumed or rerolled', { skip }, async () => {
  const gw = await giveawayRow({ status: 'SCHEDULED', startAt: new Date(Date.now() + 3_600_000), endAt: new Date(Date.now() + 7_200_000) });
  for (const action of ['extend', 'pause', 'end', 'resume', 'reroll']) {
    const res = await post(`/giveaway/${action}`, { id: gw.id, duration: '1h' });
    assert.equal(res.status, 409, action);
    assert.equal(res.json.error, 'not_started', action);
  }
  assert.equal((await prisma.giveaway.findUnique({ where: { id: gw.id } })).status, 'SCHEDULED');

  const cancel = await post('/giveaway/cancel', { id: gw.id });
  assert.equal(cancel.status, 200);
  assert.equal((await prisma.giveaway.findUnique({ where: { id: gw.id } })).status, 'CANCELLED');
  assert.equal(state.edits.length, 0, 'there was no message to edit');
});

test('editing a scheduled giveaway can move its start and duration', { skip }, async () => {
  const start = Date.now() + 3_600_000;
  const gw = await giveawayRow({ status: 'SCHEDULED', startAt: new Date(start), endAt: new Date(start + 2 * 3_600_000) });

  const title = await post('/giveaway/edit', { id: gw.id, title: 'New title' });
  assert.equal(title.status, 200);
  assert.equal(title.json.giveaway.title, 'New title');
  assert.equal(state.edits.length, 0, 'no message to edit yet');

  const later = start + 24 * 3_600_000;
  const moved = await post('/giveaway/edit', { id: gw.id, startAt: later });
  assert.equal(moved.status, 200);
  assert.equal(moved.json.giveaway.startAt, new Date(later).toISOString());
  assert.equal(moved.json.giveaway.endAt, new Date(later + 2 * 3_600_000).toISOString(), 'the duration moves along');

  const shorter = await post('/giveaway/edit', { id: gw.id, duration: '30m' });
  assert.equal(shorter.status, 200);
  assert.equal(shorter.json.giveaway.endAt, new Date(later + 30 * 60_000).toISOString(), 'from the start, not from now');

  assert.equal((await post('/giveaway/edit', { id: gw.id, startAt: 'whenever' })).json.error, 'invalid_start');
  assert.equal((await post('/giveaway/edit', { id: gw.id, duration: '5' })).json.error, 'invalid_duration');
});

test('start and duration cannot be moved through an edit once a giveaway runs', { skip }, async () => {
  const gw = await giveawayRow({ status: 'ACTIVE', messageId: '800000000000000099' });
  for (const patch of [{ startAt: Date.now() + 3_600_000 }, { duration: '2h' }]) {
    const res = await post('/giveaway/edit', { id: gw.id, ...patch });
    assert.equal(res.status, 409);
    assert.equal(res.json.error, 'not_scheduled');
  }
  const row = await prisma.giveaway.findUnique({ where: { id: gw.id } });
  assert.equal(row.endAt.getTime(), gw.endAt.getTime(), 'the end did not move');
});

// ── deleting ────────────────────────────────────────────────────────────────

async function withHistory(gw) {
  await prisma.entry.createMany({ data: [{ giveawayId: gw.id, userId: userId(1) }, { giveawayId: gw.id, userId: userId(2) }] });
  await prisma.winner.create({ data: { giveawayId: gw.id, userId: userId(1) } });
  await prisma.giveawayCoupon.createMany({
    data: [
      { giveawayId: gw.id, userId: userId(1), code: 'CODE-LIVE', percent: 10 },
      { giveawayId: gw.id, userId: userId(2), code: 'CODE-REVOKED', percent: 10, revokedAt: new Date() },
    ],
  });
  return gw;
}

async function leftovers(id) {
  const [giveaways, entries, winners, coupons] = await Promise.all([
    prisma.giveaway.count({ where: { id } }),
    prisma.entry.count({ where: { giveawayId: id } }),
    prisma.winner.count({ where: { giveawayId: id } }),
    prisma.giveawayCoupon.count({ where: { giveawayId: id } }),
  ]);
  return giveaways + entries + winners + coupons;
}

test('GET /giveaway reports the coupon codes still out, so the shop can warn before deleting', { skip }, async () => {
  const gw = await withHistory(await giveawayRow({ status: 'ENDED', endedAt: new Date() }));
  const { json } = await call(`/giveaway?guildId=${guildId}&id=${gw.id}`);
  assert.equal(json.giveaway.couponsIssued, 1, 'the revoked code does not count');
});

test('POST /giveaway/delete removes ended, cancelled and scheduled giveaways with everything attached', { skip }, async () => {
  const cases = [
    { status: 'ENDED', endedAt: new Date(), messageId: '800000000000000001' },
    { status: 'CANCELLED', endedAt: new Date(), messageId: '800000000000000002' },
    { status: 'SCHEDULED', startAt: new Date(Date.now() + 3_600_000), endAt: new Date(Date.now() + 7_200_000) },
  ];
  for (const overrides of cases) {
    resetState();
    const gw = await withHistory(await giveawayRow(overrides));
    const { status, json } = await post('/giveaway/delete', { id: gw.id });
    assert.equal(status, 200, overrides.status);
    assert.deepEqual(json, { ok: true, couponsIssued: 1, message: overrides.messageId ? 'deleted' : 'none' });
    assert.equal(await leftovers(gw.id), 0, `${overrides.status}: giveaway, entries, winners and coupons are gone`);
    assert.deepEqual(state.deleted, overrides.messageId ? [overrides.messageId] : []);
    assert.ok(state.logs.some((l) => l.includes(gw.id) && l.includes('deleted')), 'logged like other admin actions');
  }
});

test('a running giveaway cannot be deleted', { skip }, async () => {
  for (const status of ['ACTIVE', 'PAUSED']) {
    const gw = await withHistory(await giveawayRow({ status, messageId: '800000000000000003' }));
    const res = await post('/giveaway/delete', { id: gw.id });
    assert.equal(res.status, 409, status);
    assert.equal(res.json.error, 'still_running', status);
    assert.equal(await prisma.giveaway.count({ where: { id: gw.id } }), 1);
    assert.equal(await prisma.entry.count({ where: { giveawayId: gw.id } }), 2, 'entries untouched');
  }
  assert.equal(state.deleted.length, 0, 'and its message stays');
});

test('a message that is already gone does not stop the delete, other failures are logged and skipped', { skip }, async () => {
  state.messageError = Object.assign(new Error('Unknown Message'), { code: 10008 });
  const gone = await giveawayRow({ status: 'ENDED', endedAt: new Date(), messageId: '800000000000000004' });
  const res1 = await post('/giveaway/delete', { id: gone.id });
  assert.equal(res1.status, 200);
  assert.equal(res1.json.message, 'gone');
  assert.equal(await leftovers(gone.id), 0);

  state.messageError = Object.assign(new Error('Missing Access'), { code: 50001 });
  const locked = await giveawayRow({ status: 'CANCELLED', endedAt: new Date(), messageId: '800000000000000005' });
  const res2 = await post('/giveaway/delete', { id: locked.id });
  assert.equal(res2.status, 200);
  assert.equal(res2.json.message, 'failed', 'the shop learns the message could not be removed');
  assert.equal(await leftovers(locked.id), 0, 'the record is deleted anyway');
});

test('a scheduled giveaway the scheduler started in the meantime is not deleted', { skip }, async () => {
  const service = await import('../src/services/giveawayService.js');
  const stale = await giveawayRow({ status: 'SCHEDULED', startAt: new Date(Date.now() - 1000) });
  // The scheduler claims it between the read and the delete.
  await prisma.giveaway.update({ where: { id: stale.id }, data: { status: 'ACTIVE', messageId: '800000000000000006' } });

  const res = await service.deleteGiveaway({ channels: { fetch: async () => null } }, stale, {}, { actor: 'test' });
  assert.deepEqual(res, { ok: false, error: 'still_running' });
  assert.equal((await prisma.giveaway.findUnique({ where: { id: stale.id } })).status, 'ACTIVE');
});

test('POST /giveaway/delete validates the id and stays inside the guild', { skip }, async () => {
  assert.equal((await post('/giveaway/delete', { id: 'bad id!' })).json.error, 'invalid_id');
  assert.equal((await post('/giveaway/delete', {})).json.error, 'invalid_id');
  assert.equal((await post('/giveaway/delete', { id: 'ZZZZ9999' })).status, 404);

  // A giveaway of another guild is not found from this one.
  const other = await prisma.giveaway.create({
    data: {
      id: controlId(), guildId: bareGuildId, channelId: CHANNEL, hostId: '100000000000000002',
      title: 'Other guild', description: 'x', winnersCount: 1, endAt: new Date(), status: 'ENDED',
    },
  });
  assert.equal((await post('/giveaway/delete', { id: other.id })).status, 404);
  assert.equal(await prisma.giveaway.count({ where: { id: other.id } }), 1);
});

// ── GET /history ────────────────────────────────────────────────────────────

const DAY = 24 * 3_600_000;
const utcDate = (ms) => new Date(ms).toISOString().slice(0, 10);

test('GET /history counts created, ended and entries per UTC day, for this guild only', { skip }, async () => {
  const hist = addGuild();
  const today = Date.parse(`${utcDate(Date.now())}T00:00:00Z`);
  const at = (daysAgo, h = 12, m = 0, s = 0, ms = 0) => new Date(today - daysAgo * DAY + ((h * 60 + m) * 60 + s) * 1000 + ms);
  const row = (overrides) => prisma.giveaway.create({
    data: {
      id: controlId(), guildId: hist, channelId: CHANNEL, hostId: '100000000000000002',
      title: 'History', description: 'x', winnersCount: 1, endAt: at(0, 23), status: 'ACTIVE', ...overrides,
    },
  });
  const entries = (gw, ...times) => prisma.entry.createMany({
    data: times.map((joinedAt, i) => ({ giveawayId: gw.id, userId: userId(900 + i), joinedAt })),
  });

  // Ended yesterday, created the day before; one entry right before and one
  // right after UTC midnight, so the day boundary is pinned down.
  const ended = await row({ createdAt: at(2, 10), status: 'ENDED', endedAt: at(1, 12) });
  await entries(ended, at(2, 11), at(2, 23, 59, 59, 999), at(1, 0, 0, 0, 0));
  // Cancelled yesterday: created counts, ended does not.
  const cancelled = await row({ createdAt: at(1, 8), status: 'CANCELLED', endedAt: at(1, 9) });
  await entries(cancelled, at(1, 8, 30));
  // Running, created today.
  const running = await row({ createdAt: at(0, 1) });
  await entries(running, at(0, 2), at(0, 3), at(0, 4));
  // Five days ago: outside a three-day window.
  const old = await row({ createdAt: at(5, 9), status: 'ENDED', endedAt: at(5, 10) });
  await entries(old, at(5, 9, 30));
  // Another guild's activity today must not leak in.
  const foreign = await giveawayRow({ createdAt: at(0, 1) });
  await prisma.entry.createMany({ data: [1, 2, 3, 4].map((n) => ({ giveawayId: foreign.id, userId: userId(950 + n), joinedAt: at(0, 5) })) });

  const { status, json } = await call(`/history?guildId=${hist}&days=3`);
  assert.equal(status, 200);
  assert.equal(json.days, 3);
  assert.deepEqual(json.history, [
    { date: utcDate(today - 2 * DAY), created: 1, ended: 0, entries: 2 },
    { date: utcDate(today - DAY), created: 1, ended: 1, entries: 2 },
    { date: utcDate(today), created: 1, ended: 0, entries: 3 },
  ]);

  const week = await call(`/history?guildId=${hist}&days=7`);
  assert.equal(week.json.history.length, 7, 'every day is present, quiet days as zeros');
  assert.deepEqual(week.json.history[1], { date: utcDate(today - 5 * DAY), created: 1, ended: 1, entries: 1 });
  assert.deepEqual(week.json.history[0], { date: utcDate(today - 6 * DAY), created: 0, ended: 0, entries: 0 });
});

test('GET /history defaults to 90 days and refuses anything outside 1..365', { skip }, async () => {
  const hist = addGuild();
  const def = await call(`/history?guildId=${hist}`);
  assert.equal(def.status, 200);
  assert.equal(def.json.days, 90);
  assert.equal(def.json.history.length, 90);
  assert.equal(def.json.history.at(-1).date, utcDate(Date.now()), 'today is the last day');

  assert.equal((await call(`/history?guildId=${hist}&days=1`)).json.history.length, 1);
  assert.equal((await call(`/history?guildId=${hist}&days=365`)).json.history.length, 365);

  for (const days of ['0', '366', '-1', '1.5', 'abc', '1e2', '0090', ' 7']) {
    const res = await call(`/history?guildId=${hist}&days=${encodeURIComponent(days)}`);
    assert.equal(res.status, 400, days);
    assert.equal(res.json.error, 'invalid_days', days);
  }
  assert.equal((await call(`/history?guildId=${testSnowflake()}&days=7`)).status, 403, 'the guild check applies');
});

// ── POST /giveaway/preview ──────────────────────────────────────────────────

const ROLE_A = '600000000000000001';
const ROLE_B = '600000000000000002';

/** The parts of a message that differ between two renderings of the same giveaway. */
function normalized(json, id) {
  const text = JSON.stringify(json)
    .replaceAll(id, 'PREVIEW')
    .replace(/<t:\d+:R>/g, '<t:X:R>');
  const out = JSON.parse(text);
  delete out.timestamp;
  return out;
}

const toJson = (x) => (typeof x?.toJSON === 'function' ? x.toJSON() : x);

test('the preview is exactly the message a create posts, minus ID and clock', { skip }, async () => {
  const bodies = [
    createBody({
      title: 'Big one', description: 'With **markdown**', winnersCount: 2, prizes: ['Key A', 'Key B'],
      blacklistRoles: [ROLE_B], whitelistRoles: [ROLE_A], bonusRoles: { [ROLE_A]: 3 },
    }),
    createBody({ prizeMode: 'INDIVIDUAL', prizes: ['First', 'Second', 'Third'], winnerMode: 'FIRST_CLICK', duration: '2d' }),
  ];
  for (const body of bodies) {
    resetState();
    const created = await post('/giveaway/create', body);
    assert.equal(created.status, 200);
    const posted = state.sent[0];

    resetState();
    const preview = await post('/giveaway/preview', body);
    assert.equal(preview.status, 200);
    assert.equal(preview.json.lang, 'en');
    assert.deepEqual(normalized(preview.json.embed, 'PREVIEW'), normalized(toJson(posted.embeds[0]), created.json.id));
    assert.deepEqual(
      normalized(preview.json.components, 'PREVIEW'),
      normalized(posted.components.map(toJson), created.json.id),
      'the same button, label, style and emoji',
    );
    assert.ok(preview.json.embed.fields.some((f) => f.value === `<@${BOT}>`), 'the bot is the host');
    assert.equal(preview.json.embed.footer.text.includes('PREVIEW'), true, 'a placeholder ID');
  }
});

test('the preview writes nothing and calls nothing on Discord', { skip }, async () => {
  const before = await Promise.all([prisma.giveaway.count(), prisma.guildSettings.count()]);
  const { status, json } = await call('/giveaway/preview', { method: 'POST', body: { guildId: bareGuildId, ...createBody() } });
  assert.equal(status, 200);
  assert.equal(json.status, 'ACTIVE');
  const after = await Promise.all([prisma.giveaway.count(), prisma.guildSettings.count()]);
  assert.deepEqual(after, before, 'no giveaway and no settings row, not even the default one');
  assert.equal(await prisma.guildSettings.count({ where: { guildId: bareGuildId } }), 0);
  assert.deepEqual(
    { sent: state.sent.length, channels: state.channelFetches, users: state.userFetches, guilds: state.guildFetches },
    { sent: 0, channels: 0, users: 0, guilds: 0 },
  );
});

test('the preview speaks the guild language, or the one asked for', { skip }, async () => {
  const french = addGuild();
  await prisma.guildSettings.create({ data: { guildId: french, lang: 'fr' } });
  settingsService.evict(french);

  const asGuild = await call('/giveaway/preview', { method: 'POST', body: { guildId: french, ...createBody() } });
  assert.equal(asGuild.json.lang, 'fr');
  const i18n = await import('../src/utils/i18n.js');
  assert.ok(asGuild.json.embed.fields.some((f) => f.name === i18n.t('fr', 'giveaway.field.ends')));

  const asked = await call('/giveaway/preview', { method: 'POST', body: { guildId: french, lang: 'de', ...createBody() } });
  assert.equal(asked.json.lang, 'de');
  assert.ok(asked.json.embed.fields.some((f) => f.name === i18n.t('de', 'giveaway.field.ends')));
  assert.equal(asked.json.components[0].components[0].label, i18n.t('de', 'giveaway.button'));

  const bad = await call('/giveaway/preview', { method: 'POST', body: { guildId: french, lang: 'xx', ...createBody() } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'invalid_lang');
});

test('the preview validates like create, but needs no channel', { skip }, async () => {
  const cases = [
    [{ duration: '5' }, 'invalid_duration'],
    [{ title: '' }, 'missing_fields'],
    [{ winnersCount: 0 }, 'invalid_winners'],
    [{ startAt: 'later' }, 'invalid_start'],
    [{ winnerMode: 'FASTEST' }, 'invalid_winner_mode'],
    [{ couponPercent: 500 }, 'invalid_percent'],
    [{ channelId: 'abc' }, 'invalid_channel'],
    [{ bonusRoles: { [ROLE_A]: 1000 } }, null],
  ];
  for (const [patch, error] of cases) {
    const res = await post('/giveaway/preview', createBody(patch));
    if (error) {
      assert.equal(res.json.error, error, JSON.stringify(patch));
    } else {
      assert.equal(res.status, 400, `${JSON.stringify(patch)} is refused like on create`);
    }
  }
  const noChannel = await post('/giveaway/preview', { ...createBody(), channelId: undefined });
  assert.equal(noChannel.status, 200, 'a draft without a channel can be previewed');

  const later = Date.now() + 5 * 3_600_000;
  const scheduledPreview = await post('/giveaway/preview', createBody({ startAt: later }));
  assert.equal(scheduledPreview.json.status, 'SCHEDULED');
  assert.equal(scheduledPreview.json.endAt, new Date(later + 3_600_000).toISOString(), 'ends one hour after the start');
  assert.equal(state.sent.length, 0);
});
