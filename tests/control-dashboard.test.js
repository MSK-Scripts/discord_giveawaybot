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
