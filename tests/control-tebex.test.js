/**
 * Der Steuer-Endpunkt rund um den Tebex-Store.
 *
 * Zwei Dinge stehen hier auf dem Spiel. Erstens darf der verschlüsselte
 * Store-Schlüssel den Bot über die normalen Settings NIE verlassen. Zweitens
 * ist ein Tebex-Plugin-Secret Vollzugriff auf einen fremden Shop, deshalb hängt
 * alles daran am Guild-Besitzer — und zwar geprüft gegen Discords `ownerId`,
 * nicht gegen ein Flag, das der Shop mitschickt.
 *
 * Übersprungen ohne TEST_DATABASE_URL — siehe tests/helpers/db.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openTestDb, skipDb, cleanup, testSnowflake } from './helpers/db.js';

process.env.TEBEX_SECRET_KEY = randomBytes(32).toString('hex');
process.env.CONTROL_SECRET = randomBytes(16).toString('hex');
process.env.CONTROL_PORT = '18787';

const prisma = await openTestDb();
const skip = skipDb;

const control = skip ? {} : await import('../src/services/controlServer.js');
const settingsService = skip ? {} : await import('../src/services/settingsService.js');
if (!skip) (await import('../src/utils/i18n.js')).loadLocales();

const OWNER = '400000000000000001';
const ADMIN = '400000000000000002';
const PLUGIN_SECRET = 'tebex-plugin-secret-abcdef123456';
const BASE = 'http://127.0.0.1:18787';

// Nur Tebex abfangen, alles andere (also die Testanfragen an den eigenen
// Server) durchreichen. Verglichen wird der geparste Host, nicht ein Präfix des
// Strings: sonst gilt auch plugin.tebex.io.beliebig.example als Tebex.
const realFetch = globalThis.fetch;

function hostOf(href) {
  try {
    return new URL(href).host;
  } catch {
    return '';
  }
}

globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  if (hostOf(href) !== 'plugin.tebex.io') return realFetch(url, init);
  if (href.endsWith('/information')) {
    const secret = init.headers?.['X-Tebex-Secret'];
    if (secret !== PLUGIN_SECRET) return new Response('forbidden', { status: 403 });
    return Response.json({ account: { name: 'Test Store' } });
  }
  return new Response('not stubbed', { status: 404 });
};

let guildId;

function fakeControlClient(id, ownerId) {
  const guild = { id, ownerId, name: 'Test Guild' };
  return {
    user: { id: '999999999999999999' },
    guilds: {
      cache: { has: (g) => g === id, get: (g) => (g === id ? guild : null) },
      fetch: async (g) => (g === id ? guild : null),
    },
    channels: { fetch: async () => null },
    users: { fetch: async () => null },
  };
}

async function call(path, { method = 'GET', body, secret = process.env.CONTROL_SECRET } = {}) {
  const res = await realFetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(secret ? { 'X-Control-Secret': secret } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test.before(async () => {
  if (skip) return;
  guildId = testSnowflake();
  await prisma.guildSettings.create({ data: { guildId } });
  settingsService.evict(guildId);
  control.startControlServer(fakeControlClient(guildId, OWNER));
});

test.after(async () => {
  globalThis.fetch = realFetch;
  control.stopControlServer?.();
  await cleanup(prisma);
  await prisma?.$disconnect();
});

test('ohne gültiges Shared Secret kommt man gar nicht erst rein', { skip }, async () => {
  assert.equal((await call(`/settings?guildId=${guildId}`, { secret: null })).status, 401);
  assert.equal((await call(`/settings?guildId=${guildId}`, { secret: 'falsch' })).status, 401);
});

test('die normalen Settings enthalten den Store-Schlüssel nicht', { skip }, async () => {
  await prisma.guildSettings.update({
    where: { guildId },
    data: { tebexSecret: 'v1:deadbeef:cafe:babe', tebexSecretHint: '3f2a', tebexSecretSetAt: new Date() },
  });
  settingsService.evict(guildId);

  const { status, json } = await call(`/settings?guildId=${guildId}`);
  assert.equal(status, 200);

  const raw = JSON.stringify(json);
  assert.ok(!raw.includes('v1:deadbeef'), 'der verschlüsselte Blob darf hier nicht auftauchen');
  assert.equal(json.settings.tebexSecret, undefined);
  assert.deepEqual(json.settings.tebex.configured, true, 'nur die Tatsache, dass eines gesetzt ist');
  assert.equal(json.settings.tebex.hint, '3f2a');

  await prisma.guildSettings.update({
    where: { guildId },
    data: { tebexSecret: null, tebexSecretHint: null, tebexSecretSetAt: null },
  });
  settingsService.evict(guildId);
});

test('alles unter /tebex bleibt dem Guild-Besitzer vorbehalten', { skip }, async () => {
  // Ein Server-Admin reicht hier ausdrücklich nicht.
  assert.equal((await call(`/tebex?guildId=${guildId}&userId=${ADMIN}`)).status, 403);
  assert.equal((await call(`/tebex?guildId=${guildId}`)).status, 403, 'ohne userId erst recht nicht');
  assert.equal((await call('/tebex/secret', { method: 'POST', body: { guildId, userId: ADMIN, secret: PLUGIN_SECRET } })).status, 403);
  assert.equal((await call('/tebex/reveal', { method: 'POST', body: { guildId, userId: ADMIN } })).status, 403);
  assert.equal((await call('/tebex/clear', { method: 'POST', body: { guildId, userId: ADMIN } })).status, 403);

  const owner = await call(`/tebex?guildId=${guildId}&userId=${OWNER}`);
  assert.equal(owner.status, 200);
  assert.equal(owner.json.tebex.configured, false);
  assert.equal(owner.json.tebex.encryptionReady, true);
});

test('eine erfundene Besitzer-ID hilft nicht weiter', { skip }, async () => {
  // Der Bot glaubt dem Shop nicht, er fragt Discord.
  assert.equal((await call(`/tebex?guildId=${guildId}&userId=123`)).status, 403);
  assert.equal((await call(`/tebex?guildId=${guildId}&userId=${OWNER}xyz`)).status, 403);
});

test('ein falsches Secret wird abgelehnt, bevor es gespeichert wird', { skip }, async () => {
  const bad = await call('/tebex/secret', { method: 'POST', body: { guildId, userId: OWNER, secret: 'falsches-secret-mit-genug-laenge' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'invalid_secret');

  const row = await prisma.guildSettings.findUnique({ where: { guildId } });
  assert.equal(row.tebexSecret, null, 'nichts gespeichert');
});

test('ein gültiges Secret landet verschlüsselt in der Datenbank', { skip }, async () => {
  const ok = await call('/tebex/secret', { method: 'POST', body: { guildId, userId: OWNER, secret: PLUGIN_SECRET } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.store, 'Test Store', 'der Store-Name bestätigt dem Besitzer, dass er den richtigen Key hat');
  assert.equal(ok.json.hint, PLUGIN_SECRET.slice(-4));

  const row = await prisma.guildSettings.findUnique({ where: { guildId } });
  assert.ok(row.tebexSecret.startsWith('v1:'));
  assert.ok(!row.tebexSecret.includes(PLUGIN_SECRET), 'kein Klartext in der Spalte');
  assert.equal(row.tebexSecretHint, PLUGIN_SECRET.slice(-4));
  assert.ok(row.tebexSecretSetAt);
});

test('der Besitzer kann sich den Klartext ausdrücklich zeigen lassen', { skip }, async () => {
  const revealed = await call('/tebex/reveal', { method: 'POST', body: { guildId, userId: OWNER } });
  assert.equal(revealed.status, 200);
  assert.equal(revealed.json.secret, PLUGIN_SECRET);
});

test('Store-Adresse und öffentlicher Token werden geprüft', { skip }, async () => {
  assert.equal(
    (await call('/tebex/store', { method: 'POST', body: { guildId, userId: OWNER, storeUrl: 'javascript:alert(1)' } })).status,
    400,
  );
  const ok = await call('/tebex/store', {
    method: 'POST',
    body: { guildId, userId: OWNER, storeUrl: 'https://store.example.com', publicToken: 'abc123' },
  });
  assert.equal(ok.status, 200);

  const row = await prisma.guildSettings.findUnique({ where: { guildId } });
  assert.equal(row.tebexStoreUrl, 'https://store.example.com');
  assert.equal(row.tebexPublicToken, 'abc123');
});

test('das Löschen entfernt den Schlüssel wirklich', { skip }, async () => {
  assert.equal((await call('/tebex/clear', { method: 'POST', body: { guildId, userId: OWNER } })).status, 200);

  const row = await prisma.guildSettings.findUnique({ where: { guildId } });
  assert.equal(row.tebexSecret, null);
  assert.equal(row.tebexSecretHint, null);
  assert.equal(row.tebexSecretSetAt, null);

  assert.equal((await call('/tebex/reveal', { method: 'POST', body: { guildId, userId: OWNER } })).status, 404);
});

test('die Coupon-Felder eines Giveaways werden validiert', { skip }, async () => {
  // Die Konfiguration selbst darf jeder Manager setzen, nur das Store-Secret
  // hängt am Besitzer. Ein Rabatt ist trotzdem bares Geld, also wird geprüft.
  const id = 'TSTCPN01';
  await prisma.giveaway.create({
    data: {
      id, guildId, channelId: '100000000000000001', hostId: '100000000000000002',
      title: 'Coupon-Test', description: 'validation', winnersCount: 1,
      endAt: new Date(Date.now() + 3_600_000), status: 'ACTIVE',
    },
  });

  const edit = async (patch) => (await call('/giveaway/edit', { method: 'POST', body: { guildId, id, ...patch } })).json?.error;

  assert.equal(await edit({ couponPercent: 0 }), 'invalid_percent');
  assert.equal(await edit({ couponPercent: 101 }), 'invalid_percent');
  assert.equal(await edit({ couponPercent: 12.5 }), 'invalid_percent', 'keine Bruchteile');
  assert.equal(await edit({ couponValidDays: 0 }), 'invalid_validity');
  assert.equal(await edit({ couponValidDays: 99999 }), 'invalid_validity');

  // Gültige Werte kommen durch und landen in der Datenbank.
  const ok = await call('/giveaway/edit', {
    method: 'POST',
    body: { guildId, id, couponPercent: 25, couponPackages: [7, 7, 9], couponValidDays: 30 },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.giveaway.couponPercent, 25);
  assert.deepEqual(ok.json.giveaway.couponPackages, [7, 9], 'Duplikate fallen raus');

  // null schaltet den Coupon für dieses Giveaway wieder ab.
  const off = await call('/giveaway/edit', { method: 'POST', body: { guildId, id, couponPercent: null } });
  assert.equal(off.status, 200);
  assert.equal(off.json.giveaway.couponPercent, null);
});
