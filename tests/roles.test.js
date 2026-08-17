/**
 * Rollen-Bedingungen: Prüfung der Eingaben und die Anzeige der Bonus-Lose.
 *
 * Zwei getrennte Anliegen in einer Datei, weil sie dieselbe Frage von zwei
 * Seiten stellen. `utils/roles.js` ist die strenge Eingabeseite (was aus dem
 * Dashboard kommt, wird geprüft), `utils/embeds.js` die Ausgabeseite (was ein
 * Teilnehmer davon zu sehen bekommt).
 *
 * Ohne Datenbank, läuft überall.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRoleArray,
  normalizeBonusRoles,
  parseRoleArray,
  parseBonusRoles,
  serializeBonusRoles,
  MAX_ROLES,
  MAX_BONUS_ROLES,
} from '../src/utils/roles.js';
import { buildGiveawayEmbed } from '../src/utils/embeds.js';
import { loadLocales } from '../src/utils/i18n.js';

loadLocales();

const ROLE_A = '500000000000000001';
const ROLE_B = '500000000000000002';
const ROLE_C = '500000000000000003';

function fieldNamed(embed, name) {
  return embed.data.fields?.find((f) => f.name === name) ?? null;
}

function giveawayWith(extra = {}) {
  return {
    id: 'ABCD12',
    guildId: '600000000000000001',
    hostId: '600000000000000002',
    title: 'Test',
    description: 'Beschreibung',
    prizes: JSON.stringify(['Preis']),
    prizeMode: 'ALL',
    winnersCount: 1,
    endAt: new Date(Date.now() + 3600_000),
    ...extra,
  };
}

// ── Eingabeprüfung ──────────────────────────────────────────────────────────

test('gültige Rollen-IDs kommen durch, Duplikate nur einmal', () => {
  const res = normalizeRoleArray([ROLE_A, ROLE_B, ROLE_A]);
  assert.equal(res.ok, true);
  assert.deepEqual(res.roles, [ROLE_A, ROLE_B]);
});

test('eine kaputte Rollen-ID wird gemeldet statt still weggeworfen', () => {
  // Still schlucken wäre hier das Schlimmste: die Bedingung stünde als
  // gespeichert da und würde nie greifen.
  assert.deepEqual(normalizeRoleArray([ROLE_A, 'keine-id']), { ok: false, error: 'invalid_roles' });
  assert.deepEqual(normalizeRoleArray('nicht mal ein array'), { ok: false, error: 'invalid_roles' });
  assert.deepEqual(normalizeRoleArray(Array(MAX_ROLES + 1).fill(ROLE_A)), { ok: false, error: 'too_many_roles' });
});

test('nichts mitgeschickt heißt leere Liste, nicht Fehler', () => {
  assert.deepEqual(normalizeRoleArray(null), { ok: true, roles: [] });
  assert.deepEqual(normalizeRoleArray([]), { ok: true, roles: [] });
});

test('Bonus-Lose sind ganze Zahlen von 1 bis 100, wie im Slash-Command', () => {
  assert.deepEqual(normalizeBonusRoles({ [ROLE_A]: 3 }), { ok: true, bonus: { [ROLE_A]: 3 } });
  assert.deepEqual(normalizeBonusRoles({ [ROLE_A]: 100 }), { ok: true, bonus: { [ROLE_A]: 100 } });

  for (const bad of [0, -1, 101, 2.5, 'viele', null]) {
    assert.equal(normalizeBonusRoles({ [ROLE_A]: bad }).error, 'invalid_bonus_amount', `${bad} muss abgelehnt werden`);
  }
  assert.equal(normalizeBonusRoles({ 'keine-id': 3 }).error, 'invalid_bonus');
  assert.equal(normalizeBonusRoles([ROLE_A]).error, 'invalid_bonus', 'ein Array ist kein Rolle-zu-Anzahl-Objekt');

  const tooMany = Object.fromEntries(Array.from({ length: MAX_BONUS_ROLES + 1 }, (_, i) => [`5000000000000000${10 + i}`, 1]));
  assert.equal(normalizeBonusRoles(tooMany).error, 'too_many_bonus_roles');
});

test('beim Lesen aus der Datenbank wird nicht geworfen, sondern gefiltert', () => {
  // Andere Richtung als oben: was schon in der Spalte steht, darf den Bot nicht
  // aufhalten, egal wie es dorthin kam.
  assert.deepEqual(parseRoleArray('kein json'), []);
  assert.deepEqual(parseRoleArray(JSON.stringify([ROLE_A, 'müll'])), [ROLE_A]);
  assert.deepEqual(parseBonusRoles('[1,2]'), {});
  assert.deepEqual(parseBonusRoles(JSON.stringify({ [ROLE_A]: 2, [ROLE_B]: 0, müll: 5 })), { [ROLE_A]: 2 });
  assert.equal(serializeBonusRoles({ [ROLE_A]: 2 }), JSON.stringify({ [ROLE_A]: 2 }));
});

// ── Anzeige ─────────────────────────────────────────────────────────────────

test('Bonus-Lose stehen als eigenes Feld im Giveaway-Embed', () => {
  const embed = buildGiveawayEmbed(giveawayWith(), { bonusRoles: { [ROLE_A]: 2 } }, { entryCount: 0 });
  const field = fieldNamed(embed, 'Bonus entries');
  assert.ok(field, 'das Feld muss da sein, sonst weiß niemand von den Extra-Losen');
  assert.match(field.value, new RegExp(`<@&${ROLE_A}> \\+2`));
  assert.match(field.value, /extra entries/, 'mit einem Satz, der erklärt was das bedeutet');
});

test('ohne Bonus-Rollen gibt es das Feld gar nicht', () => {
  const embed = buildGiveawayEmbed(giveawayWith(), { bonusRoles: {} }, { entryCount: 0 });
  assert.equal(fieldNamed(embed, 'Bonus entries'), null);
});

test('eigene Bonus-Lose ersetzen die serverweiten im Embed', () => {
  const embed = buildGiveawayEmbed(
    giveawayWith({ bonusRoles: JSON.stringify({ [ROLE_A]: 3, [ROLE_C]: 1 }) }),
    { bonusRoles: { [ROLE_A]: 2, [ROLE_B]: 5 } },
    { entryCount: 0 },
  );
  const value = fieldNamed(embed, 'Bonus entries').value;

  assert.match(value, new RegExp(`<@&${ROLE_A}> \\+3`), 'die 3 dieses Giveaways, nicht 2+3');
  assert.match(value, new RegExp(`<@&${ROLE_C}> \\+1`));
  assert.doesNotMatch(value, new RegExp(`<@&${ROLE_B}>`), 'die serverweite Rolle gilt hier nicht');

  // Der größte Bonus zuerst, sonst entscheidet die Einfügereihenfolge.
  assert.ok(value.indexOf(ROLE_C) > value.indexOf(ROLE_A), 'nach Anzahl sortiert');
});

test('ohne eigene Bonus-Lose stehen die serverweiten im Embed', () => {
  const embed = buildGiveawayEmbed(
    giveawayWith({ bonusRoles: null }),
    { bonusRoles: { [ROLE_B]: 5 } },
    { entryCount: 0 },
  );
  assert.match(fieldNamed(embed, 'Bonus entries').value, new RegExp(`<@&${ROLE_B}> \\+5`));
});

test('eine leere eigene Liste blendet die serverweite Bedingung aus', () => {
  // Der Fall, für den es die Unterscheidung überhaupt gibt: dieses eine
  // Giveaway soll ohne die serverweite Blacklist laufen.
  const embed = buildGiveawayEmbed(
    giveawayWith({ blacklistRoles: '[]' }),
    { blacklist: [ROLE_B] },
    { entryCount: 0 },
  );
  assert.equal(fieldNamed(embed, 'Requirements'), null, 'keine Bedingung im Embed');
});

test('die Bedingungen bleiben ein eigenes Feld neben den Bonus-Losen', () => {
  // Ein Bonus verbietet nichts. Stünde er unter "Requirements", läse er sich
  // wie eine Hürde statt wie ein Vorteil.
  const embed = buildGiveawayEmbed(
    giveawayWith(),
    { bonusRoles: { [ROLE_A]: 2 }, whitelist: [ROLE_B], blacklist: [] },
    { entryCount: 0 },
  );
  const req = fieldNamed(embed, 'Requirements');
  const bonus = fieldNamed(embed, 'Bonus entries');
  assert.ok(req && bonus, 'beide Felder');
  assert.ok(!req.value.includes(ROLE_A), 'der Bonus taucht nicht bei den Bedingungen auf');
  assert.ok(!bonus.value.includes(ROLE_B), 'und die Whitelist nicht bei den Bonus-Losen');
});
