/**
 * Automatische Tebex-Coupons für Gewinner.
 *
 * Jede Guild hat ihren eigenen Store, das Plugin-Secret liegt verschlüsselt in
 * den Settings. Geprüft wird hier vor allem, dass jeder Gewinner einen EIGENEN
 * Code bekommt, dass ein Fehlschlag weder das Beenden noch die übrigen Gewinner
 * mitreißt, und dass der Code nur in der DM landet und nirgends öffentlich.
 *
 * Tebex selbst wird über einen fetch-Stub ersetzt: der Testlauf darf keine
 * echten Coupons in einem echten Shop anlegen.
 *
 * Übersprungen ohne TEST_DATABASE_URL — siehe tests/helpers/db.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openTestDb, skipDb, cleanup, createTestGiveaway, addEntries, testGuildId } from './helpers/db.js';
import { fakeClient, fakeGuild } from './helpers/discord.js';

process.env.TEBEX_SECRET_KEY = randomBytes(32).toString('hex');

const prisma = await openTestDb();
const skip = skipDb;

const tebex = skip ? {} : await import('../src/services/tebexService.js');
const box = skip ? {} : await import('../src/utils/secretBox.js');
const service = skip ? {} : await import('../src/services/giveawayService.js');
const settingsService = skip ? {} : await import('../src/services/settingsService.js');
if (!skip) (await import('../src/utils/i18n.js')).loadLocales();

const PLUGIN_SECRET = 'tebex-plugin-secret-abcdef123456';
const STORE_URL = 'https://store.example.com';

// ── fetch-Stub ───────────────────────────────────────────────────────────────
const realFetch = globalThis.fetch;
let calls = [];
let failNext = 0; // wie viele der nächsten Coupon-Anlagen fehlschlagen sollen
let couponSeq = 0;

function installStub() {
  calls = [];
  failNext = 0;
  couponSeq = 0;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: href, method: init.method ?? 'GET', body, headers: init.headers ?? {} });

    if (href.endsWith('/coupons') && init.method === 'POST') {
      if (failNext > 0) {
        failNext--;
        return new Response('rate limited', { status: 429 });
      }
      return Response.json({ id: ++couponSeq + 1000, code: body.code });
    }
    if (/\/coupons\/\d+$/.test(href) && init.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    if (href.endsWith('/information')) {
      return Response.json({ account: { name: 'Test Store' } });
    }
    return new Response('not stubbed', { status: 404 });
  };
}

test.before(() => installStub());
test.after(async () => {
  globalThis.fetch = realFetch;
  await cleanup(prisma);
  await prisma?.$disconnect();
});

/** Guild mit hinterlegtem (verschlüsseltem) Store-Secret. */
async function guildWithStore(overrides = {}) {
  const guildId = testGuildId();
  await prisma.guildSettings.create({
    data: {
      guildId,
      tebexSecret: box.encryptSecret(PLUGIN_SECRET),
      tebexSecretHint: box.secretHint(PLUGIN_SECRET),
      tebexSecretSetAt: new Date(),
      tebexStoreUrl: STORE_URL,
      ...overrides,
    },
  });
  settingsService.evict(guildId);
  return guildId;
}

const couponPosts = () => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/coupons'));

test('jeder Gewinner bekommt einen eigenen Code', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw = await createTestGiveaway(prisma, guildId, { couponPercent: 25, winnersCount: 3 });

  const issued = await tebex.issueCoupons(settings, gw, ['u1', 'u2', 'u3']);

  assert.equal(issued.size, 3);
  const codes = [...issued.values()].map((c) => c.code);
  assert.equal(new Set(codes).size, 3, 'drei verschiedene Codes, kein geteilter');
  for (const code of codes) assert.match(code, /^GW-[A-Z2-9]{10}$/);

  const rows = await prisma.giveawayCoupon.findMany({ where: { giveawayId: gw.id } });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.percent), [25, 25, 25]);

  // Das Secret geht als Header raus, niemals in der URL.
  for (const call of couponPosts()) {
    assert.equal(call.headers['X-Tebex-Secret'], PLUGIN_SECRET);
    assert.ok(!call.url.includes(PLUGIN_SECRET));
  }
});

test('Prozentsatz, Pakete und Gültigkeit landen so bei Tebex', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw = await createTestGiveaway(prisma, guildId, {
    couponPercent: 50,
    couponPackages: JSON.stringify([101, 202]),
    couponValidDays: 30,
  });

  await tebex.issueCoupons(settings, gw, ['u1']);

  const [post] = couponPosts();
  assert.equal(post.body.discount_type, 'percentage');
  assert.equal(post.body.discount_percentage, 50);
  assert.equal(post.body.effective_on, 'package');
  assert.deepEqual(post.body.packages, [101, 202]);
  assert.equal(post.body.expire_never, false);
  assert.match(post.body.expire_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(post.body.redeem_unlimited, false, 'ein Gewinner, eine Einlösung');
  assert.equal(post.body.expire_limit, 1);
});

test('ohne Paketauswahl gilt der Rabatt auf den ganzen Warenkorb', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw = await createTestGiveaway(prisma, guildId, { couponPercent: 10 });

  await tebex.issueCoupons(settings, gw, ['u1']);

  const [post] = couponPosts();
  assert.equal(post.body.effective_on, 'cart');
  assert.deepEqual(post.body.packages, []);
  assert.equal(post.body.expire_never, true, 'ohne Gültigkeitsdauer läuft er nie ab');
});

test('ohne Store-Secret oder ohne Prozentsatz passiert gar nichts', { skip }, async () => {
  installStub();

  // Guild ohne Secret
  const bare = testGuildId();
  const bareSettings = await settingsService.getSettings(bare);
  const gw1 = await createTestGiveaway(prisma, bare, { couponPercent: 20 });
  assert.equal((await tebex.issueCoupons(bareSettings, gw1, ['u1'])).size, 0);

  // Guild mit Secret, aber Giveaway ohne Coupon
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw2 = await createTestGiveaway(prisma, guildId, { couponPercent: null });
  assert.equal((await tebex.issueCoupons(settings, gw2, ['u1'])).size, 0);

  assert.equal(couponPosts().length, 0, 'kein einziger Aufruf an Tebex');
});

test('ein Fehlschlag reißt die anderen Gewinner nicht mit', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw = await createTestGiveaway(prisma, guildId, { couponPercent: 15, winnersCount: 3 });

  failNext = 1; // der erste Coupon scheitert
  const issued = await tebex.issueCoupons(settings, gw, ['u1', 'u2', 'u3']);

  assert.equal(issued.size, 2, 'zwei von drei — besser als keiner');
  assert.ok(!issued.has('u1'));
  assert.ok(issued.has('u2') && issued.has('u3'));
});

test('ein unlesbares Secret führt nicht zu einem Aufruf mit Müll', { skip }, async () => {
  installStub();
  const guildId = testGuildId();
  await prisma.guildSettings.create({
    data: { guildId, tebexSecret: 'v1:aabb:ccdd:eeff', tebexSecretHint: 'xxxx' },
  });
  settingsService.evict(guildId);
  const settings = await settingsService.getSettings(guildId);
  const gw = await createTestGiveaway(prisma, guildId, { couponPercent: 20 });

  assert.equal((await tebex.issueCoupons(settings, gw, ['u1'])).size, 0);
  assert.equal(couponPosts().length, 0);
});

test('der Reroll widerruft den alten Code und stellt einen neuen aus', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw = await createTestGiveaway(prisma, guildId, { couponPercent: 40 });

  const first = await tebex.issueCoupons(settings, gw, ['u1']);
  const oldCode = first.get('u1').code;

  await tebex.revokeCoupons(settings, gw, ['u1']);

  const deletes = calls.filter((c) => c.method === 'DELETE');
  assert.equal(deletes.length, 1, 'der alte Coupon wird im Store gelöscht');

  const row = await prisma.giveawayCoupon.findUnique({
    where: { giveawayId_userId: { giveawayId: gw.id, userId: 'u1' } },
  });
  assert.ok(row.revokedAt, 'bleibt als Datensatz stehen, damit nachvollziehbar ist was ausgestellt war');
  assert.equal(row.code, oldCode);

  const active = await tebex.getActiveCoupons(gw.id);
  assert.equal(active.size, 0);

  // Der neue Gewinner bekommt einen eigenen Code.
  const second = await tebex.issueCoupons(settings, gw, ['u2']);
  assert.notEqual(second.get('u2').code, oldCode);
});

test('beim Beenden bekommt der Gewinner den Code per DM, nicht im Channel', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const gw = await createTestGiveaway(prisma, guildId, { couponPercent: 30, couponValidDays: 14 });
  const users = await addEntries(prisma, gw.id, 1);
  const client = fakeClient({ guild: fakeGuild(users) });

  const winners = await service.endGiveaway(gw, client);
  assert.equal(winners.length, 1);

  const row = await prisma.giveawayCoupon.findFirst({ where: { giveawayId: gw.id } });
  assert.ok(row, 'Coupon wurde gespeichert');

  const dm = client.dms.find((d) => d.userId === winners[0]);
  assert.ok(dm, 'der Gewinner bekommt eine DM');
  assert.ok(dm.payload.content.includes(row.code), 'mit seinem Code');
  // Zeilenweise und auf das Ende geprüft: der Link steht am Zeilenende, ein
  // Teilstring-Vergleich würde auch auf store.example.com.fremd.tld passen.
  const lines = dm.payload.content.split('\n');
  assert.ok(lines.some((line) => line.endsWith(STORE_URL)), 'und dem Einlöse-Link');

  // Der öffentliche Teil darf den Code nicht enthalten.
  for (const message of client.sent) {
    assert.ok(!String(message.content ?? '').includes(row.code), 'kein Code in der Ergebnis-Nachricht');
  }
  settingsService.evict(guildId);
});

test('ein Secret wird vor dem Speichern gegen Tebex geprüft', { skip }, async () => {
  installStub();
  const result = await tebex.verifySecret(PLUGIN_SECRET);
  assert.deepEqual(result, { ok: true, store: 'Test Store' });

  const info = calls.find((c) => c.url.endsWith('/information'));
  assert.equal(info.headers['X-Tebex-Secret'], PLUGIN_SECRET);
});
