/**
 * Teilnahmebedingungen und Bonus-Lose über den Steuer-Endpunkt.
 *
 * Der Punkt dieser Datei ist nicht, dass die Werte in der Datenbank landen —
 * das wäre schnell geprüft. Es geht um den Zeitpunkt: Blacklist, Whitelist und
 * Bonus-Lose stehen IM EMBED. Werden sie wie die Coupon-Felder erst nach dem
 * Posten nachgetragen, zeigt die erste Fassung der Nachricht sie nicht, und
 * niemand merkt es, weil nichts fehlschlägt.
 *
 * Übersprungen ohne TEST_DATABASE_URL — siehe tests/helpers/db.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openTestDb, skipDb, cleanup, testSnowflake } from './helpers/db.js';

process.env.CONTROL_SECRET = randomBytes(16).toString('hex');
process.env.CONTROL_PORT = '18789';

const prisma = await openTestDb();
const skip = skipDb;

const control = skip ? {} : await import('../src/services/controlServer.js');
const settingsService = skip ? {} : await import('../src/services/settingsService.js');
if (!skip) (await import('../src/utils/i18n.js')).loadLocales();

const BASE = 'http://127.0.0.1:18789';
const CHANNEL = '700000000000000001';
const ROLE_A = '500000000000000001';
const ROLE_B = '500000000000000002';

let guildId;
let sent;   // jede gepostete Nachricht
let edits;  // jede Bearbeitung einer bestehenden Nachricht

function fakeControlClient(id) {
  const guild = { id, ownerId: '400000000000000009', name: 'Test Guild' };
  const channel = {
    id: CHANNEL,
    guildId: id,
    isTextBased: () => true,
    async send(payload) {
      sent.push(payload);
      return { id: `msg-${sent.length}` };
    },
    messages: {
      async fetch() {
        return { async edit(payload) { edits.push(payload); } };
      },
    },
  };
  return {
    user: { id: '999999999999999999' },
    guilds: {
      cache: { has: (g) => g === id, get: (g) => (g === id ? guild : null) },
      fetch: async (g) => (g === id ? guild : null),
    },
    channels: { fetch: async (c) => (c === CHANNEL ? channel : null) },
    users: { fetch: async () => null },
  };
}

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'X-Control-Secret': process.env.CONTROL_SECRET,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

function embedData(payload) {
  const embed = payload?.embeds?.[0];
  return embed?.data ?? embed ?? null;
}

/** Feld eines Embeds aus dem aufgezeichneten Payload. */
function field(payload, name) {
  return embedData(payload)?.fields?.find((f) => f.name === name) ?? null;
}

/**
 * Die Bearbeitung, die zu DIESEM Giveaway gehört (die ID steht im Footer).
 *
 * Nicht einfach die letzte nehmen: das Auffrischen fasst alle laufenden
 * Giveaways an, und welches davon zuletzt drankommt, ist nicht festgelegt.
 */
function editFor(id) {
  return edits.filter((payload) => embedData(payload)?.footer?.text?.includes(id)).at(-1) ?? null;
}

async function createGiveaway(body = {}) {
  return call('/giveaway/create', {
    method: 'POST',
    body: {
      guildId, channelId: CHANNEL, title: 'Titel', description: 'Text',
      winnersCount: 1, duration: '1h', prizes: ['Preis'], ...body,
    },
  });
}

test.before(async () => {
  if (skip) return;
  guildId = testSnowflake();
  await prisma.guildSettings.create({ data: { guildId } });
  settingsService.evict(guildId);
  control.startControlServer(fakeControlClient(guildId));
});

test.beforeEach(() => { sent = []; edits = []; });

test.after(async () => {
  control.stopControlServer?.();
  await cleanup(prisma);
  await prisma?.$disconnect();
});

test('ein neues Giveaway trägt seine Bedingungen schon in der ersten Nachricht', { skip }, async () => {
  const { status, json } = await createGiveaway({
    blacklistRoles: [ROLE_B],
    whitelistRoles: [ROLE_A],
    bonusRoles: { [ROLE_A]: 3 },
  });
  assert.equal(status, 200);

  const row = await prisma.giveaway.findUnique({ where: { id: json.id } });
  assert.deepEqual(JSON.parse(row.blacklistRoles), [ROLE_B]);
  assert.deepEqual(JSON.parse(row.whitelistRoles), [ROLE_A]);
  assert.deepEqual(JSON.parse(row.bonusRoles), { [ROLE_A]: 3 });

  assert.equal(sent.length, 1, 'genau eine Nachricht');
  const bonus = field(sent[0], 'Bonus entries');
  assert.ok(bonus, 'die Bonus-Lose stehen sofort drin, nicht erst nach der nächsten Bearbeitung');
  assert.match(bonus.value, new RegExp(`<@&${ROLE_A}> \\+3`));
  assert.ok(field(sent[0], 'Requirements'), 'und die Bedingungen ebenso');
});

test('die Bedingungen stehen in der Form im JSON, die das Dashboard erwartet', { skip }, async () => {
  // Das Dashboard füllt seine Formulare aus genau diesen Feldern. Fehlt eines,
  // meldet das kein Test und keine Typprüfung — es bliebe im Browser leer.
  const { json } = await createGiveaway({ blacklistRoles: [ROLE_B], bonusRoles: { [ROLE_A]: 2 } });

  const detail = await call(`/giveaway?guildId=${guildId}&id=${json.id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.json.giveaway.blacklistRoles, [ROLE_B], 'Array, nicht JSON-Text');
  assert.equal(detail.json.giveaway.whitelistRoles, null, 'nichts gesetzt -> null, nicht leere Liste');
  assert.deepEqual(detail.json.giveaway.bonusRoles, { [ROLE_A]: 2 }, 'Objekt, nicht JSON-Text');

  const list = await call(`/giveaways?guildId=${guildId}`);
  const inList = list.json.giveaways.find((g) => g.id === json.id);
  assert.deepEqual(inList.bonusRoles, { [ROLE_A]: 2 }, 'auch in der Liste, nicht nur im Detail');
});

test('ohne Angabe erbt das Giveaway die serverweiten Bedingungen', { skip }, async () => {
  // NULL statt leerer Liste: eine leere Liste wäre ein eigener Wert und würde
  // die serverweite Einstellung für dieses Giveaway abschalten.
  const { json } = await createGiveaway();
  const row = await prisma.giveaway.findUnique({ where: { id: json.id } });
  assert.equal(row.bonusRoles, null);
  assert.equal(row.blacklistRoles, null);
  assert.equal(row.whitelistRoles, null);
  assert.equal(field(sent[0], 'Bonus entries'), null);
});

test('eine leere Liste hebt die serverweite Bedingung für dieses Giveaway auf', { skip }, async () => {
  await settingsService.updateSettings(guildId, { blacklist: [ROLE_B] });
  settingsService.evict(guildId);
  try {
    const geerbt = await createGiveaway();
    const mitEigener = await createGiveaway({ blacklistRoles: [] });

    const geerbtRow = await prisma.giveaway.findUnique({ where: { id: geerbt.json.id } });
    assert.equal(geerbtRow.blacklistRoles, null, 'erbt weiter');

    const eigeneRow = await prisma.giveaway.findUnique({ where: { id: mitEigener.json.id } });
    assert.equal(eigeneRow.blacklistRoles, '[]', 'die leere Liste steht wirklich in der Spalte');

    const detail = await call(`/giveaway?guildId=${guildId}&id=${mitEigener.json.id}`);
    assert.deepEqual(detail.json.giveaway.blacklistRoles, [], 'und kommt als leere Liste zurück, nicht als null');
  } finally {
    await settingsService.updateSettings(guildId, { blacklist: [] });
    settingsService.evict(guildId);
  }
});

test('null setzt ein Giveaway zurück auf die serverweite Einstellung', { skip }, async () => {
  const { json } = await createGiveaway({ blacklistRoles: [ROLE_B] });

  const res = await call('/giveaway/edit', {
    method: 'POST',
    body: { guildId, id: json.id, blacklistRoles: null },
  });
  assert.equal(res.status, 200);

  const row = await prisma.giveaway.findUnique({ where: { id: json.id } });
  assert.equal(row.blacklistRoles, null, 'zurück auf erben, nicht auf leere Liste');
});

test('eine unbrauchbare Eingabe wird abgelehnt, statt ein halbes Giveaway anzulegen', { skip }, async () => {
  const before = await prisma.giveaway.count({ where: { guildId } });

  assert.equal((await createGiveaway({ bonusRoles: { [ROLE_A]: 0 } })).json.error, 'invalid_bonus_amount');
  assert.equal((await createGiveaway({ bonusRoles: { [ROLE_A]: 999 } })).json.error, 'invalid_bonus_amount');
  assert.equal((await createGiveaway({ bonusRoles: [ROLE_A] })).json.error, 'invalid_bonus');
  assert.equal((await createGiveaway({ blacklistRoles: ['keine-id'] })).json.error, 'invalid_roles');

  assert.equal(await prisma.giveaway.count({ where: { guildId } }), before, 'nichts angelegt');
  assert.equal(sent.length, 0, 'und nichts gepostet');
});

test('das Bearbeiten setzt die Bedingungen neu und baut die Nachricht um', { skip }, async () => {
  const { json } = await createGiveaway({ bonusRoles: { [ROLE_A]: 2 } });
  sent = []; edits = [];

  const res = await call('/giveaway/edit', {
    method: 'POST',
    body: { guildId, id: json.id, bonusRoles: { [ROLE_B]: 7 }, whitelistRoles: [ROLE_B] },
  });
  assert.equal(res.status, 200);

  const row = await prisma.giveaway.findUnique({ where: { id: json.id } });
  assert.deepEqual(JSON.parse(row.bonusRoles), { [ROLE_B]: 7 }, 'ersetzt, nicht ergänzt');
  assert.deepEqual(JSON.parse(row.whitelistRoles), [ROLE_B]);

  const own = editFor(json.id);
  assert.ok(own, 'die Nachricht wurde neu gebaut');
  const bonus = field(own, 'Bonus entries');
  assert.match(bonus.value, new RegExp(`<@&${ROLE_B}> \\+7`));
  assert.ok(!bonus.value.includes(ROLE_A), 'der alte Bonus ist weg');
});

test('serverweite Bonus-Lose werden geprüft, bevor sie in die Spalte gehen', { skip }, async () => {
  assert.equal((await call('/settings', { method: 'POST', body: { guildId, bonusRoles: { bad: 1 } } })).json.error, 'invalid_bonus');
  assert.equal((await call('/settings', { method: 'POST', body: { guildId, blacklist: ['x'] } })).json.error, 'invalid_roles');

  const ok = await call('/settings', { method: 'POST', body: { guildId, bonusRoles: { [ROLE_A]: 4 } } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.settings.bonusRoles, { [ROLE_A]: 4 });
});

test('eine unbekannte Sprache wird abgelehnt statt gespeichert', { skip }, async () => {
  // Sie würde beim Rendern still auf Englisch zurückfallen: im Dashboard stünde
  // sie als gespeichert, im Discord käme sie nie an.
  const bad = await call('/settings', { method: 'POST', body: { guildId, lang: 'kl' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'invalid_lang');

  const ok = await call('/settings', { method: 'POST', body: { guildId, lang: 'hu' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.settings.lang, 'hu');

  await call('/settings', { method: 'POST', body: { guildId, lang: 'en' } });
});

test('eine serverweite Änderung zieht die laufenden Giveaways nach', { skip }, async () => {
  await call('/settings', { method: 'POST', body: { guildId, bonusRoles: {} } });
  const { json } = await createGiveaway();
  assert.equal(field(sent[0], 'Bonus entries'), null, 'anfangs kein Bonus');

  edits = [];
  await call('/settings', { method: 'POST', body: { guildId, bonusRoles: { [ROLE_B]: 6 } } });

  // Ohne diesen Nachlauf stünde im laufenden Giveaway weiter nichts von den
  // Extra-Losen, und der Unterschied fiele erst beim Ziehen auf.
  const own = editFor(json.id);
  assert.ok(own, 'die Nachricht wurde aufgefrischt');
  const bonus = field(own, 'Bonus entries');
  assert.ok(bonus, 'jetzt steht der Bonus drin');
  assert.match(bonus.value, new RegExp(`<@&${ROLE_B}> \\+6`));

  await prisma.giveaway.deleteMany({ where: { id: json.id } });
});

test('eine unsichtbare Einstellung fasst die Nachrichten nicht an', { skip }, async () => {
  await createGiveaway();
  edits = [];

  // Der Log-Channel steht in keinem Embed. Ihn zu setzen darf nicht jedes
  // laufende Giveaway durch die Discord-API schicken.
  await call('/settings', { method: 'POST', body: { guildId, logChannel: null } });
  assert.equal(edits.length, 0);
});
