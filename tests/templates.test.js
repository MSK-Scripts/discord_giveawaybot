/**
 * Giveaway-Vorlagen über den Steuer-Endpunkt (Dashboard-CRUD).
 *
 * Der Punkt dieser Datei ist nicht das Anlegen an sich, sondern dass eine
 * Vorlage seit v1.7.0 die Preisliste trägt und sie beim Anlegen eines Giveaways
 * auch wirklich ankommt. Genau das ging vorher verloren: `/gtemplate use` legte
 * ein Giveaway ohne jeden Preis an, obwohl beim Speichern welche gemeint waren.
 *
 * Dazu die zwei Stellen, an denen sich Vorlagen von Giveaways unterscheiden:
 * der Name ist der Schlüssel (Umbenennen darf keine zweite erzeugen), und ein
 * Teil-Update darf die nicht mitgeschickten Felder nicht leeren.
 *
 * Übersprungen ohne TEST_DATABASE_URL — siehe tests/helpers/db.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openTestDb, skipDb, cleanup, testSnowflake } from './helpers/db.js';

process.env.CONTROL_SECRET = randomBytes(16).toString('hex');
process.env.CONTROL_PORT = '18788';

const prisma = await openTestDb();
const skip = skipDb;

const control = skip ? {} : await import('../src/services/controlServer.js');
const templates = skip ? {} : await import('../src/services/templateService.js');
const settingsService = skip ? {} : await import('../src/services/settingsService.js');
if (!skip) (await import('../src/utils/i18n.js')).loadLocales();

const BASE = 'http://127.0.0.1:18788';
let guildId;

function fakeControlClient(id) {
  const guild = { id, ownerId: '400000000000000001', name: 'Test Guild' };
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

const save = (body) => call('/template/save', { method: 'POST', body: { guildId, ...body } });
const list = async () => (await call(`/templates?guildId=${guildId}`)).json.templates;

const BASE_TEMPLATE = {
  name: 'weekly',
  title: 'Weekly Giveaway',
  description: 'Every friday',
  duration: '1d',
  winnersCount: 3,
};

test.before(async () => {
  if (skip) return;
  guildId = testSnowflake();
  await prisma.guildSettings.create({ data: { guildId } });
  settingsService.evict(guildId);
  control.startControlServer(fakeControlClient(guildId));
});

test.after(async () => {
  control.stopControlServer?.();
  await cleanup(prisma);
  await prisma?.$disconnect();
});

test.beforeEach(async () => {
  if (skip) return;
  await prisma.giveawayTemplate.deleteMany({ where: { guildId } });
});

test('eine Vorlage lässt sich anlegen, lesen, ändern und löschen', { skip }, async () => {
  const created = await save({ ...BASE_TEMPLATE, prizes: ['Script A', 'Script B'] });
  assert.equal(created.status, 200);
  assert.deepEqual(created.json.template.prizes, ['Script A', 'Script B']);

  const [row] = await list();
  assert.equal(row.name, 'weekly');
  assert.equal(row.winnersCount, 3, 'im Modus ALL bleibt die Gewinnerzahl frei');

  const edited = await save({ id: row.id, title: 'Renamed Giveaway' });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.template.title, 'Renamed Giveaway');

  assert.equal((await call('/template/delete', { method: 'POST', body: { guildId, id: row.id } })).status, 200);
  assert.equal((await list()).length, 0);
});

test('ein Teil-Update leert die nicht mitgeschickten Felder nicht', { skip }, async () => {
  // Ohne winnersCount: im INDIVIDUAL-Modus ergibt die Zahl sich aus der Liste.
  const { winnersCount, ...withoutWinners } = BASE_TEMPLATE;
  void winnersCount;
  const { json } = await save({ ...withoutWinners, prizes: ['Script A', 'Script B'], prizeMode: 'INDIVIDUAL' });
  const id = json.template.id;

  // Nur der Titel wird geändert. Ohne den bestehenden Datensatz als Grundlage
  // würde normalizeTemplateInput die Preise als "nicht gesetzt" lesen und die
  // Liste leeren — im INDIVIDUAL-Modus wäre die Vorlage danach kaputt.
  const edited = await save({ id, title: 'Nur der Titel' });
  assert.equal(edited.status, 200);
  assert.deepEqual(edited.json.template.prizes, ['Script A', 'Script B']);
  assert.equal(edited.json.template.prizeMode, 'INDIVIDUAL');
  assert.equal(edited.json.template.winnersCount, 2, 'folgt weiterhin der Preisliste');
});

test('im INDIVIDUAL-Modus folgt die Gewinnerzahl der Preisliste', { skip }, async () => {
  const { status, json } = await save({
    ...BASE_TEMPLATE, winnersCount: 1, prizes: ['A', 'B', 'C'], prizeMode: 'INDIVIDUAL',
  });
  // winnersCount: 1 widerspricht drei Preisen. Still überschreiben wäre die
  // schlechtere Antwort: dann stünde im Formular etwas anderes als gespeichert.
  assert.equal(status, 400);
  assert.equal(json.error, 'winners_locked');

  const ok = await save({ ...BASE_TEMPLATE, prizes: ['A', 'B', 'C'], prizeMode: 'INDIVIDUAL' });
  assert.equal(ok.json.template.winnersCount, 3);
});

test('INDIVIDUAL ohne Preise wird abgelehnt', { skip }, async () => {
  const { status, json } = await save({ ...BASE_TEMPLATE, prizes: [], prizeMode: 'INDIVIDUAL' });
  assert.equal(status, 400);
  assert.equal(json.error, 'individual_needs_prizes');
});

test('eine unbrauchbare Dauer fällt beim Speichern auf, nicht erst beim Anlegen', { skip }, async () => {
  const { status, json } = await save({ ...BASE_TEMPLATE, duration: 'irgendwann' });
  assert.equal(status, 400);
  assert.equal(json.error, 'invalid_duration');
});

test('zwei Vorlagen können nicht denselben Namen haben', { skip }, async () => {
  await save(BASE_TEMPLATE);
  const second = await save({ ...BASE_TEMPLATE, title: 'Anderer Titel' });
  assert.equal(second.status, 409, 'anlegen mit vergebenem Namen');
  assert.equal(second.json.error, 'name_taken');

  const other = await save({ ...BASE_TEMPLATE, name: 'monthly' });
  const renamed = await save({ id: other.json.template.id, name: 'weekly' });
  assert.equal(renamed.status, 409, 'umbenennen auf einen vergebenen Namen');
  assert.equal((await list()).length, 2, 'und es entsteht keine dritte');
});

test('eine fremde Guild kommt an die Vorlage nicht heran', { skip }, async () => {
  const { json } = await save(BASE_TEMPLATE);
  const foreign = testSnowflake();

  // Der Router lehnt eine Guild ab, in der der Bot nicht ist. Die id-basierten
  // Endpunkte prüfen zusätzlich selbst, dass die Vorlage zur Guild gehört —
  // eine Prüfung allein am Router wäre eine Prüfung an genau einer Stelle.
  assert.equal((await call('/template/delete', { method: 'POST', body: { guildId: foreign, id: json.template.id } })).status, 403);
  assert.equal(await templates.getTemplateById(foreign, json.template.id), null);
  assert.equal(await templates.deleteTemplateById(foreign, json.template.id), false);
  assert.equal((await list()).length, 1, 'die Vorlage steht noch');
});

test('unbekannte ids und Namen ergeben 404, keinen Absturz', { skip }, async () => {
  assert.equal((await save({ id: 999999, title: 'x' })).status, 404);
  assert.equal((await call('/template/delete', { method: 'POST', body: { guildId, id: 999999 } })).status, 404);
  assert.equal((await save({ ...BASE_TEMPLATE, name: '   ' })).status, 400);
});

test('normalizeTemplateInput kürzt und trimmt wie die Giveaway-Eingabe', { skip }, () => {
  const long = 'x'.repeat(400);
  const res = templates.normalizeTemplateInput({
    name: `  ${long}  `, title: `  Titel  `, description: 'Text', duration: '2h',
    prizes: 'A | B |  | C', prizeMode: 'individual',
  });
  assert.ok(res.ok);
  assert.equal(res.data.name.length, templates.MAX_TEMPLATE_NAME);
  assert.equal(res.data.title, 'Titel');
  assert.equal(res.data.prizeMode, 'INDIVIDUAL', 'Kleinschreibung wird normalisiert');
  assert.deepEqual(JSON.parse(res.data.prizes), ['A', 'B', 'C'], 'leere Einträge fallen raus');
  assert.equal(res.data.winnersCount, 3);
});

// ── Aus einem Giveaway ───────────────────────────────────────────────────────

const ROLE_A = '500000000000000001';
const ROLE_B = '500000000000000002';

/** Ein Giveaway direkt in der DB anlegen (ohne Discord). */
async function seedGiveaway(extra = {}) {
  const created = new Date(Date.now() - 3 * 60 * 60 * 1000); // vor 3 Stunden
  return prisma.giveaway.create({
    data: {
      id: `T${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      guildId,
      channelId: '700000000000000001',
      hostId: '400000000000000002',
      title: 'Sommer-Giveaway',
      description: 'Der Text von damals',
      prizes: JSON.stringify(['Script A', 'Script B']),
      prizeMode: 'INDIVIDUAL',
      winnersCount: 2,
      status: 'ENDED',
      createdAt: created,
      endAt: new Date(created.getTime() + 2 * 60 * 60 * 1000), // lief zwei Stunden
      ...extra,
    },
  });
}

const from = (body) => call('/template/from', { method: 'POST', body: { guildId, ...body } });

test('ein gelaufenes Giveaway wird zur Vorlage, samt Preisen und Dauer', { skip }, async () => {
  const giveaway = await seedGiveaway();

  const { status, json } = await from({ id: giveaway.id, name: 'sommer' });
  assert.equal(status, 200);
  assert.equal(json.overwritten, false);

  const tpl = json.template;
  assert.equal(tpl.title, 'Sommer-Giveaway');
  assert.equal(tpl.description, 'Der Text von damals');
  assert.deepEqual(tpl.prizes, ['Script A', 'Script B']);
  assert.equal(tpl.prizeMode, 'INDIVIDUAL');
  assert.equal(tpl.winnersCount, 2);
  // Die Dauer ist die Spanne zwischen Erstellung und Ende, nicht der Rest.
  assert.equal(tpl.duration, '2h');
});

test('ohne Namen trägt die Vorlage den Titel des Giveaways', { skip }, async () => {
  const giveaway = await seedGiveaway();
  const { json } = await from({ id: giveaway.id });
  assert.equal(json.template.name, 'Sommer-Giveaway');
});

test('die Bedingungen des Giveaways reisen mit, geerbte bleiben geerbt', { skip }, async () => {
  const eigene = await seedGiveaway({
    blacklistRoles: JSON.stringify([ROLE_B]),
    bonusRoles: JSON.stringify({ [ROLE_A]: 3 }),
  });
  const { json } = await from({ id: eigene.id, name: 'mit-bedingungen' });
  assert.deepEqual(json.template.blacklistRoles, [ROLE_B]);
  assert.deepEqual(json.template.bonusRoles, { [ROLE_A]: 3 });
  // Das Giveaway hatte keine eigene Whitelist, es galt die serverweite. Die
  // hier einzufrieren würde eine spätere Änderung daran aushebeln.
  assert.equal(json.template.whitelistRoles, null, 'geerbt bleibt geerbt');
});

test('ein vorhandener Name wird überschrieben statt abgelehnt', { skip }, async () => {
  await save({ ...BASE_TEMPLATE, name: 'sommer' });
  const giveaway = await seedGiveaway();

  const { status, json } = await from({ id: giveaway.id, name: 'sommer' });
  assert.equal(status, 200);
  assert.equal(json.overwritten, true);
  assert.equal(json.template.title, 'Sommer-Giveaway', 'der Inhalt kommt jetzt aus dem Giveaway');
  assert.equal((await list()).length, 1, 'und es ist keine zweite entstanden');
});

test('ein fremdes oder unbekanntes Giveaway ergibt keine Vorlage', { skip }, async () => {
  assert.equal((await from({ id: 'ZZZZZZ' })).status, 404);
  assert.equal((await from({ id: 'zu-kurz!' })).status, 400, 'unbrauchbare ID');

  const giveaway = await seedGiveaway();
  assert.equal((await call('/template/from', {
    method: 'POST', body: { guildId: testSnowflake(), id: giveaway.id },
  })).status, 403);
  assert.equal((await list()).length, 0);
});

test('eine Vorlage gibt ihre Bedingungen an das neue Giveaway weiter', { skip }, async () => {
  // templateEligibility ist das, was /gtemplate use und das Dashboard an
  // postGiveaway durchreichen. null muss null bleiben, sonst bekäme das neue
  // Giveaway eine leere Liste und damit gar keine Bedingung.
  const { json } = await save({
    ...BASE_TEMPLATE, blacklistRoles: [ROLE_B], bonusRoles: { [ROLE_A]: 2 },
  });
  const row = await templates.getTemplateById(guildId, json.template.id);

  assert.deepEqual(templates.templateEligibility(row), {
    blacklistRoles: [ROLE_B],
    whitelistRoles: null,
    bonusRoles: { [ROLE_A]: 2 },
  });
});
