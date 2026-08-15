/**
 * Mehrere Preise pro Giveaway.
 *
 * Zwei Verteilmodi: ALL (jeder Gewinner bekommt alle Preise) und INDIVIDUAL
 * (Gewinner N bekommt Preis N). Interessant ist vor allem der zweite: dort darf
 * die Zuordnung nicht verrutschen, auch nicht wenn ein einzelner Gewinner
 * ersetzt wird. Deshalb trägt jede Gewinner-Zeile ihren Preis-Slot.
 *
 * Die reinen Funktionen unten laufen ohne Datenbank, der Rest wird ohne
 * TEST_DATABASE_URL übersprungen — siehe tests/helpers/db.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb, skipDb, cleanup, createTestGiveaway, addEntries, testGuildId } from './helpers/db.js';
import { fakeClient, fakeGuild } from './helpers/discord.js';
import {
  parsePrizes,
  splitPrizes,
  serializePrizes,
  normalizePrizeMode,
  normalizePrizeInput,
  resolveWinnersCount,
  prizesForWinner,
  assignPrizes,
  MAX_PRIZES,
} from '../src/utils/prizes.js';

const prisma = await openTestDb();
const skip = skipDb;

const service = skip ? {} : await import('../src/services/giveawayService.js');
const settingsService = skip ? {} : await import('../src/services/settingsService.js');
const i18n = skip ? {} : await import('../src/utils/i18n.js');
if (!skip) i18n.loadLocales();

const PRIZES = ['Preis A', 'Preis B', 'Preis C'];

test.after(async () => {
  await cleanup(prisma);
  await prisma?.$disconnect();
});

// ── Reine Funktionen ─────────────────────────────────────────────────────────

test('eine Zeile pro Preis, Leerzeilen fallen weg', () => {
  assert.deepEqual(splitPrizes('Preis A\n\n  Preis B  \n'), ['Preis A', 'Preis B']);
  // Slash-Optionen kennen keine Zeilenumbrüche, deshalb zusätzlich der Trenner |.
  assert.deepEqual(splitPrizes('Preis A | Preis B'), ['Preis A', 'Preis B']);
  assert.deepEqual(splitPrizes(''), []);
  assert.deepEqual(splitPrizes(null), []);
});

test('eine kaputte Preis-Spalte ergibt eine leere Liste statt eines Fehlers', () => {
  assert.deepEqual(parsePrizes('kein json'), []);
  assert.deepEqual(parsePrizes('{"a":1}'), []);
  assert.deepEqual(parsePrizes(null), []);
  assert.deepEqual(parsePrizes(serializePrizes(PRIZES)), PRIZES);
});

test('ein unbekannter Modus fällt auf ALL zurück', () => {
  assert.equal(normalizePrizeMode('individual'), 'INDIVIDUAL');
  assert.equal(normalizePrizeMode('quatsch'), 'ALL');
  assert.equal(normalizePrizeMode(undefined), 'ALL');
});

test('INDIVIDUAL koppelt die Gewinnerzahl an die Preisliste, ALL nicht', () => {
  assert.equal(resolveWinnersCount(PRIZES, 'INDIVIDUAL', 1), 3, 'die Eingabe wird von der Liste überstimmt');
  assert.equal(resolveWinnersCount(PRIZES, 'ALL', 1), 1, 'im ALL-Modus zählt die Eingabe');
  assert.equal(resolveWinnersCount([], 'INDIVIDUAL', 5), 5, 'ohne Preise bleibt nur die Eingabe');
});

test('INDIVIDUAL ohne Preis wird abgelehnt, zu viele Preise auch', () => {
  assert.equal(normalizePrizeInput({ prizes: [], mode: 'INDIVIDUAL' }).error, 'individual_needs_prizes');
  const tooMany = Array.from({ length: MAX_PRIZES + 1 }, (_, i) => `Preis ${i}`);
  assert.equal(normalizePrizeInput({ prizes: tooMany, mode: 'ALL' }).error, 'too_many_prizes');

  const ok = normalizePrizeInput({ prizes: 'Preis A\nPreis B', mode: 'INDIVIDUAL', winnersCount: 7 });
  assert.equal(ok.ok, true);
  assert.equal(ok.winnersCount, 2);
});

test('jeder Gewinner bekommt im ALL-Modus die ganze Liste, im INDIVIDUAL seinen Slot', () => {
  assert.deepEqual(prizesForWinner(PRIZES, 'ALL', null), PRIZES);
  assert.deepEqual(prizesForWinner(PRIZES, 'INDIVIDUAL', 1), ['Preis B']);
  // Mehr Gewinner als Preise kann nur entstehen, wenn die Liste nachträglich
  // schrumpft. Dann gibt es keinen Preis, aber auch keinen Absturz.
  assert.deepEqual(prizesForWinner(PRIZES, 'INDIVIDUAL', 9), []);
  assert.deepEqual(prizesForWinner([], 'ALL', null), []);
});

test('die Slots folgen der Ziehungsreihenfolge, im ALL-Modus gibt es keine', () => {
  assert.deepEqual(assignPrizes(['a', 'b'], 'INDIVIDUAL'), [
    { userId: 'a', prizeIndex: 0 },
    { userId: 'b', prizeIndex: 1 },
  ]);
  assert.deepEqual(assignPrizes(['a', 'b'], 'ALL'), [
    { userId: 'a', prizeIndex: null },
    { userId: 'b', prizeIndex: null },
  ]);
});

// ── Gegen die Datenbank ──────────────────────────────────────────────────────

/** Beendetes Giveaway mit `count` Teilnehmern. Gibt Giveaway, Client und User zurück. */
async function endWith(overrides, entrants = 3) {
  const guildId = testGuildId();
  const gw = await createTestGiveaway(prisma, guildId, overrides);
  const users = await addEntries(prisma, gw.id, entrants);
  const client = fakeClient({ guild: fakeGuild(users) });
  const winnerIds = await service.endGiveaway(gw, client);
  return { guildId, gw, client, users, winnerIds };
}

test('INDIVIDUAL: jeder Gewinner bekommt genau einen Preis, und zwar seinen', { skip }, async () => {
  const { gw, client, winnerIds } = await endWith({
    prizes: serializePrizes(PRIZES),
    prizeMode: 'INDIVIDUAL',
    winnersCount: 3,
  });
  assert.equal(winnerIds.length, 3);

  const rows = await prisma.winner.findMany({ where: { giveawayId: gw.id }, orderBy: { prizeIndex: 'asc' } });
  assert.deepEqual(rows.map((r) => r.prizeIndex), [0, 1, 2], 'jeder Gewinner hat einen eigenen Slot');

  for (const row of rows) {
    const dm = client.dms.find((d) => d.userId === row.userId);
    assert.ok(dm, 'jeder Gewinner bekommt eine DM');
    assert.ok(dm.payload.content.includes(PRIZES[row.prizeIndex]), 'mit seinem Preis');
    for (const other of PRIZES.filter((p) => p !== PRIZES[row.prizeIndex])) {
      assert.ok(!dm.payload.content.includes(other), 'und ohne die Preise der anderen');
    }
  }

  // Die öffentliche Ergebnis-Nachricht paart Gewinner und Preis, sonst wäre die
  // Zuordnung für alle außer dem Gewinner selbst unsichtbar.
  const result = client.sent.at(-1).content;
  for (const row of rows) {
    assert.ok(result.includes(`<@${row.userId}>`) && result.includes(PRIZES[row.prizeIndex]));
  }
});

test('ALL: jeder Gewinner bekommt die komplette Liste genannt', { skip }, async () => {
  const { gw, client, winnerIds } = await endWith({
    prizes: serializePrizes(['Preis A', 'Preis B']),
    prizeMode: 'ALL',
    winnersCount: 2,
  });
  assert.equal(winnerIds.length, 2);

  const rows = await prisma.winner.findMany({ where: { giveawayId: gw.id } });
  assert.deepEqual(rows.map((r) => r.prizeIndex), [null, null], 'ohne Slots, es gibt nichts aufzuteilen');

  for (const userId of winnerIds) {
    const dm = client.dms.find((d) => d.userId === userId);
    assert.ok(dm.payload.content.includes('Preis A') && dm.payload.content.includes('Preis B'));
  }
});

test('ein Giveaway ohne Preisangabe verhält sich wie bisher', { skip }, async () => {
  const { client, winnerIds } = await endWith({ winnersCount: 1 }, 2);
  assert.equal(winnerIds.length, 1);
  const dm = client.dms.find((d) => d.userId === winnerIds[0]);
  // Ohne Preis steht der Titel für den Preis — das war schon vor der Preisliste so.
  assert.ok(dm.payload.content.includes('Test Giveaway'));
});

test('der Reroll eines Gewinners lässt die Preise der anderen in Ruhe', { skip }, async () => {
  const { guildId, gw, client, winnerIds } = await endWith({
    prizes: serializePrizes(['Preis A', 'Preis B']),
    prizeMode: 'INDIVIDUAL',
    winnersCount: 2,
  }, 3);
  assert.equal(winnerIds.length, 2);

  const before = await prisma.winner.findMany({ where: { giveawayId: gw.id }, orderBy: { prizeIndex: 'asc' } });
  const replaced = before[0]; // der mit Preis A
  const kept = before[1];

  const ended = await prisma.giveaway.findUnique({ where: { id: gw.id } });
  const settings = await settingsService.getSettings(guildId);
  const res = await service.rerollSingle(client, ended, settings, replaced.userId, { actor: 'test' });
  assert.ok(res.newWinner, 'es gibt einen Ersatz');

  const after = await prisma.winner.findMany({ where: { giveawayId: gw.id, rerolled: false }, orderBy: { prizeIndex: 'asc' } });
  assert.equal(after.length, 2);
  assert.equal(after[0].userId, res.newWinner);
  assert.equal(after[0].prizeIndex, 0, 'der Ersatz erbt den Slot des Ersetzten');
  assert.equal(after[1].userId, kept.userId);
  assert.equal(after[1].prizeIndex, 1, 'der zweite Gewinner behält Preis B');

  const dm = client.dms.find((d) => d.userId === res.newWinner);
  assert.ok(dm.payload.content.includes('Preis A'), 'der Ersatz erfährt seinen Preis');
  assert.ok(!dm.payload.content.includes('Preis B'));
});

test('der Reroll aller Gewinner vergibt die Slots neu', { skip }, async () => {
  const { guildId, gw, client, winnerIds } = await endWith({
    prizes: serializePrizes(['Preis A', 'Preis B']),
    prizeMode: 'INDIVIDUAL',
    winnersCount: 2,
  }, 4);
  assert.equal(winnerIds.length, 2);

  const ended = await prisma.giveaway.findUnique({ where: { id: gw.id } });
  const settings = await settingsService.getSettings(guildId);
  const fresh = await service.rerollAll(client, ended, settings, { actor: 'test' });
  assert.equal(fresh.length, 2);

  const after = await prisma.winner.findMany({ where: { giveawayId: gw.id, rerolled: false }, orderBy: { prizeIndex: 'asc' } });
  assert.deepEqual(after.map((r) => r.prizeIndex), [0, 1]);
  assert.equal(new Set(after.map((r) => r.userId)).size, 2);
  for (const id of winnerIds) {
    assert.ok(!after.some((r) => r.userId === id), 'die alten Gewinner sind raus');
  }
});

test('postGiveaway leitet die Gewinnerzahl im INDIVIDUAL-Modus aus den Preisen ab', { skip }, async () => {
  const guildId = testGuildId();
  const settings = await settingsService.getSettings(guildId);
  const client = fakeClient({ guild: fakeGuild([]) });
  const channel = await client.channels.fetch();

  const id = await service.postGiveaway(client, channel, settings, {
    guildId,
    hostId: '100000000000000002',
    title: 'Drei Preise',
    description: 'Test',
    prizes: PRIZES,
    prizeMode: 'INDIVIDUAL',
    winnersCount: 1, // wird ignoriert, die Liste entscheidet
    endAt: new Date(Date.now() + 60_000),
  });

  const row = await prisma.giveaway.findUnique({ where: { id } });
  assert.equal(row.winnersCount, 3);
  assert.equal(row.prizeMode, 'INDIVIDUAL');
  assert.deepEqual(parsePrizes(row.prizes), PRIZES);
});
