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

  const guilds = new Map([
    [guildId, {
      id: guildId, ownerId: '400000000000000009', name: 'Dashboard Guild', memberCount: 1234,
      iconURL: ({ size } = {}) => `https://cdn.discordapp.com/icons/${guildId}/abc.webp?size=${size}`,
    }],
    [bareGuildId, { id: bareGuildId, ownerId: '400000000000000009', name: 'Bare Guild', memberCount: 3, iconURL: () => null }],
  ]);
  control.startControlServer(fakeControlClient(guilds));
});

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
