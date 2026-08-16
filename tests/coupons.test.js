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
import { MessageFlags } from 'discord.js';
import { openTestDb, skipDb, cleanup, createTestGiveaway, addEntries, testGuildId } from './helpers/db.js';
import { fakeClient, fakeGuild } from './helpers/discord.js';

process.env.TEBEX_SECRET_KEY = randomBytes(32).toString('hex');

const prisma = await openTestDb();
const skip = skipDb;

const tebex = skip ? {} : await import('../src/services/tebexService.js');
const box = skip ? {} : await import('../src/utils/secretBox.js');
const service = skip ? {} : await import('../src/services/giveawayService.js');
const settingsService = skip ? {} : await import('../src/services/settingsService.js');
const i18n = skip ? {} : await import('../src/utils/i18n.js');
if (!skip) i18n.loadLocales();

const PLUGIN_SECRET = 'tebex-plugin-secret-abcdef123456';
const STORE_URL = 'https://store.example.com';

// Freitext des Veranstalters, so wie er im Dashboard eingetragen wird: samt URL,
// denn genau dafür ist das Feld da.
const MANUAL_NOTE = 'Einzulösen im Shop des Partners: https://partner.example.com';

/**
 * Steht der Hinweis unverändert als EIGENE Zeile in der DM?
 *
 * Bewusst ein Vergleich auf die ganze Zeile und kein `content.includes(...)`.
 * Ein Teilstring-Vergleich auf etwas, das eine URL enthält, ist wertlos: davor
 * und dahinter dürfte ein beliebiger Host stehen und der Test bliebe grün.
 */
const noteLine = (dm) => String(dm.payload.content).split('\n').includes(MANUAL_NOTE);

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

/**
 * Gewinner in der Reihenfolge der Preis-Slots. `issueCoupons` erwartet
 * { userId, prizeIndex }, weil der Slot über die Paketauswahl entscheidet.
 */
const winners = (...userIds) => userIds.map((userId, prizeIndex) => ({ userId, prizeIndex }));

test('jeder Gewinner bekommt einen eigenen Code', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw = await createTestGiveaway(prisma, guildId, { couponPercent: 25, winnersCount: 3 });

  const issued = await tebex.issueCoupons(settings, gw, winners('u1', 'u2', 'u3'));

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

test('jeder Preis-Slot kann eigene Pakete haben', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw = await createTestGiveaway(prisma, guildId, {
    couponPercent: 40,
    prizes: JSON.stringify(['Script A', 'Script B']),
    prizeMode: 'INDIVIDUAL',
    winnersCount: 2,
    couponPackagesPerPrize: JSON.stringify([[101], [202]]),
  });

  await tebex.issueCoupons(settings, gw, winners('u1', 'u2'));

  const posts = couponPosts();
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[0].body.packages, [101], 'Gewinner 1 bekommt den Rabatt auf Script A');
  assert.deepEqual(posts[1].body.packages, [202], 'Gewinner 2 auf Script B');
  for (const post of posts) assert.equal(post.body.effective_on, 'package');
});

test('ein leerer Slot fällt auf die gemeinsame Auswahl zurück', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw = await createTestGiveaway(prisma, guildId, {
    couponPercent: 40,
    prizes: JSON.stringify(['Script A', 'Freie Wahl']),
    prizeMode: 'INDIVIDUAL',
    winnersCount: 2,
    couponPackages: JSON.stringify([999]),
    couponPackagesPerPrize: JSON.stringify([[101], []]),
  });

  await tebex.issueCoupons(settings, gw, winners('u1', 'u2'));

  const posts = couponPosts();
  assert.deepEqual(posts[0].body.packages, [101]);
  assert.deepEqual(posts[1].body.packages, [999], 'ohne eigene Auswahl gilt die gemeinsame');
});

test('ohne Preis-Slots gilt die Auswahl je Slot nicht', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  // prizeMode ALL: es gibt keinen "Gewinner N", die Ziehungsreihenfolge ist
  // willkürlich. Eine Zuordnung je Slot wäre dort eine stille Lüge.
  const gw = await createTestGiveaway(prisma, guildId, {
    couponPercent: 40,
    prizes: JSON.stringify(['Script A', 'Script B']),
    prizeMode: 'ALL',
    winnersCount: 2,
    couponPackages: JSON.stringify([999]),
    couponPackagesPerPrize: JSON.stringify([[101], [202]]),
  });

  await tebex.issueCoupons(settings, gw, winners('u1', 'u2'));

  for (const post of couponPosts()) assert.deepEqual(post.body.packages, [999]);
});

test('ohne jede Auswahl gilt der Rabatt auf den ganzen Warenkorb', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw = await createTestGiveaway(prisma, guildId, {
    couponPercent: 40,
    prizes: JSON.stringify(['Script A']),
    prizeMode: 'INDIVIDUAL',
    winnersCount: 1,
  });

  await tebex.issueCoupons(settings, gw, winners('u1'));

  const [post] = couponPosts();
  assert.equal(post.body.effective_on, 'cart');
  assert.deepEqual(post.body.packages, []);
});

test('der Ersatz nach einem Reroll erbt die Pakete seines Slots', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw = await createTestGiveaway(prisma, guildId, {
    couponPercent: 40,
    prizes: JSON.stringify(['Script A', 'Script B']),
    prizeMode: 'INDIVIDUAL',
    winnersCount: 2,
    couponPackagesPerPrize: JSON.stringify([[101], [202]]),
  });

  await tebex.issueCoupons(settings, gw, winners('u1', 'u2'));
  calls.length = 0;

  // Gewinner 1 wird ersetzt: der Neue steht auf Slot 0, also wieder Script A.
  await tebex.issueCoupons(settings, gw, [{ userId: 'u3', prizeIndex: 0 }]);

  const [post] = couponPosts();
  assert.deepEqual(post.body.packages, [101]);
});

// ── Manuell eingetragene Codes (fremder Shop) ────────────────────────────────

test('ein manuell eingetragener Code wird zugestellt, ohne Tebex zu fragen', { skip }, async () => {
  installStub();
  const guildId = testGuildId(); // absichtlich OHNE Store-Secret
  const gw = await createTestGiveaway(prisma, guildId, {
    couponManualCode: 'PARTNER-2026',
    couponManualNote: MANUAL_NOTE,
  });
  const users = await addEntries(prisma, gw.id, 1);
  const client = fakeClient({ guild: fakeGuild(users) });

  const winnerIds = await service.endGiveaway(gw, client);
  assert.equal(winnerIds.length, 1);

  assert.equal(couponPosts().length, 0, 'für einen fremden Shop wird nichts erzeugt');
  const dm = client.dms.find((d) => d.userId === winnerIds[0]);
  assert.ok(dm.payload.content.includes('PARTNER-2026'), 'der Code steht in der DM');
  // Der Hinweis ist Freitext und wird unverändert übernommen, also wird die
  // ganze Zeile verglichen. Ein Teilstring-Vergleich wäre schwächer: er bliebe
  // grün, wenn davor oder dahinter etwas stünde.
  assert.ok(noteLine(dm), 'der Hinweis steht unverändert darunter');
  assert.equal(dm.payload.flags, MessageFlags.SuppressEmbeds, 'ohne Link-Vorschau');

  // Der Code gehört in die DM und nirgendwo sonst.
  for (const sent of client.sent) assert.ok(!String(sent.content).includes('PARTNER-2026'));
});

test('ein eingetragener Code verdrängt den selbst erzeugten nicht', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw = await createTestGiveaway(prisma, guildId, {
    couponPercent: 30,
    prizes: JSON.stringify(['Eigenes Script', 'Script vom Partner']),
    prizeMode: 'INDIVIDUAL',
    winnersCount: 2,
    couponManualCodesPerPrize: JSON.stringify(['', 'PARTNER-XY']),
  });

  const issued = await tebex.issueCoupons(settings, gw, winners('u1', 'u2'));

  // Beide Slots bekommen einen Coupon aus dem eigenen Store. Slot 1 hat
  // zusätzlich den festen Code des Partners — die beiden Shops haben
  // miteinander nichts zu tun, einer davon darf nicht den anderen abschalten.
  assert.equal(issued.size, 2, 'auch der Slot mit festem Code bekommt seinen eigenen Coupon');
  assert.ok(issued.has('u1'));
  assert.ok(issued.has('u2'));
  assert.equal(couponPosts().length, 2);
});

test('sind beide Coupons konfiguriert, stehen beide in der DM', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const gw = await createTestGiveaway(prisma, guildId, {
    couponPercent: 100,
    couponValidDays: 1,
    couponManualCode: 'PARTNER-2026',
    couponManualNote: MANUAL_NOTE,
  });
  const users = await addEntries(prisma, gw.id, 1);
  const client = fakeClient({ guild: fakeGuild(users) });

  const winnerIds = await service.endGiveaway(gw, client);
  assert.equal(winnerIds.length, 1);

  const row = await prisma.giveawayCoupon.findFirst({ where: { giveawayId: gw.id } });
  assert.ok(row, 'der eigene Coupon wird trotz festem Code erzeugt');

  const dm = client.dms.find((d) => d.userId === winnerIds[0]);
  const content = dm.payload.content;
  assert.ok(content.includes(row.code), 'der Code aus dem eigenen Store steht in der DM');
  assert.ok(content.includes('PARTNER-2026'), 'der feste Code auch');
  assert.ok(noteLine(dm), 'samt Hinweis');
  // Der Einlöse-Link des eigenen Stores steht ebenfalls drin, exakt verglichen.
  assert.ok(
    content.split('\n').includes(i18n.t(guildId, 'dm.coupon_store', { url: STORE_URL })),
    'und der Link zum eigenen Store',
  );

  // Keiner der beiden gehört in den öffentlichen Teil.
  for (const message of client.sent) {
    const text = String(message.content ?? '');
    assert.ok(!text.includes(row.code) && !text.includes('PARTNER-2026'));
  }
  settingsService.evict(guildId);
});

test('ohne Slot-Code gilt der gemeinsame, und ALL kennt keine Slots', { skip }, async () => {
  const individual = {
    prizeMode: 'INDIVIDUAL',
    couponManualCode: 'ALLGEMEIN',
    couponManualCodesPerPrize: JSON.stringify(['NUR-SLOT-0']),
  };
  assert.equal(tebex.manualCodeForWinner(individual, 0), 'NUR-SLOT-0');
  assert.equal(tebex.manualCodeForWinner(individual, 1), 'ALLGEMEIN', 'leerer Slot fällt zurück');

  const all = { ...individual, prizeMode: 'ALL' };
  assert.equal(tebex.manualCodeForWinner(all, 0), 'ALLGEMEIN', 'ohne Slots zählt nur der gemeinsame');
  assert.equal(tebex.manualCodeForWinner({}, 0), '');
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

  await tebex.issueCoupons(settings, gw, winners('u1'));

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

  await tebex.issueCoupons(settings, gw, winners('u1'));

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
  assert.equal((await tebex.issueCoupons(bareSettings, gw1, winners('u1'))).size, 0);

  // Guild mit Secret, aber Giveaway ohne Coupon
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw2 = await createTestGiveaway(prisma, guildId, { couponPercent: null });
  assert.equal((await tebex.issueCoupons(settings, gw2, winners('u1'))).size, 0);

  assert.equal(couponPosts().length, 0, 'kein einziger Aufruf an Tebex');
});

test('ein Fehlschlag reißt die anderen Gewinner nicht mit', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw = await createTestGiveaway(prisma, guildId, { couponPercent: 15, winnersCount: 3 });

  failNext = 1; // der erste Coupon scheitert
  const issued = await tebex.issueCoupons(settings, gw, winners('u1', 'u2', 'u3'));

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

  assert.equal((await tebex.issueCoupons(settings, gw, winners('u1'))).size, 0);
  assert.equal(couponPosts().length, 0);
});

test('der Reroll widerruft den alten Code und stellt einen neuen aus', { skip }, async () => {
  installStub();
  const guildId = await guildWithStore();
  const settings = await settingsService.getSettings(guildId);
  const gw = await createTestGiveaway(prisma, guildId, { couponPercent: 40 });

  const first = await tebex.issueCoupons(settings, gw, winners('u1'));
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
  const second = await tebex.issueCoupons(settings, gw, winners('u2'));
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
  // Die erwartete Zeile wird mit derselben Übersetzung gebaut und exakt
  // verglichen. Ein Teilstring-Vergleich auf die URL wäre hier wertlos: davor
  // oder dahinter dürfte ein beliebiger Host stehen und der Test wäre trotzdem
  // grün.
  const lines = dm.payload.content.split('\n');
  assert.ok(
    lines.includes(i18n.t(guildId, 'dm.coupon_store', { url: STORE_URL })),
    'und dem Einlöse-Link',
  );

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
