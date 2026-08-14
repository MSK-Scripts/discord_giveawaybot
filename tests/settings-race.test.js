/**
 * The default-row insert in `settingsService`.
 *
 * The bug this guards against: `getSettings` read the row, found nothing and
 * created it. Two callers reaching a guild without settings at the same time
 * both inserted, and the loser threw a unique-constraint error out of a
 * function that gets called from everywhere — in one reproduction it killed a
 * giveaway in the middle of ending.
 *
 * `ensureRow` now re-reads after a failed write and only rethrows when the row
 * still does not exist. The retry ignores the error code on purpose: the same
 * collision arrives as P2002 for a plain create and as a code-less error
 * carrying MySQL 1020 when Prisma compiles the write as an upsert.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb, skipDb, cleanup, testGuildId } from './helpers/db.js';

const prisma = await openTestDb();
const skip = skipDb;

const settings = skip ? {} : await import('../src/services/settingsService.js');

test.after(async () => {
  await cleanup(prisma);
  await prisma?.$disconnect();
});

test('concurrent getSettings on a fresh guild all succeed and agree', { skip }, async () => {
  const guildId = testGuildId();

  // All ten start before the first one resolves, so all ten miss the cache and
  // all ten reach the insert.
  const results = await Promise.all(Array.from({ length: 10 }, () => settings.getSettings(guildId)));

  for (const s of results) {
    assert.equal(s.guildId, guildId);
    assert.equal(s.lang, settings.DEFAULTS.lang);
    assert.deepEqual(s.blacklist, [], 'JSON columns come back deserialised');
    assert.deepEqual(s.bonusRoles, {});
  }

  const rows = await prisma.guildSettings.count({ where: { guildId } });
  assert.equal(rows, 1, 'the losers take the winner\'s row instead of inserting a second one');
});

test('getSettings and createDefaults racing each other both survive', { skip }, async () => {
  const guildId = testGuildId();

  const results = await Promise.all([
    settings.createDefaults(guildId),
    settings.getSettings(guildId),
    settings.createDefaults(guildId),
    settings.getSettings(guildId),
  ]);

  // createDefaults swallows errors and returns undefined on failure — that is
  // exactly what must not happen here.
  for (const s of results) {
    assert.ok(s, 'no caller may come back empty');
    assert.equal(s.guildId, guildId);
  }
  assert.equal(await prisma.guildSettings.count({ where: { guildId } }), 1);
});

test('the cache stays consistent with the database after the race', { skip }, async () => {
  const guildId = testGuildId();
  await Promise.all(Array.from({ length: 5 }, () => settings.getSettings(guildId)));

  await settings.updateSettings(guildId, { lang: 'de', blacklist: ['role-1', 'role-2'], bonusRoles: { 'role-3': 2 } });

  assert.equal(settings.getLang(guildId), 'de', 'getLang is synchronous and reads the cache');
  assert.deepEqual(settings.getCached(guildId).blacklist, ['role-1', 'role-2']);

  const row = await prisma.guildSettings.findUnique({ where: { guildId } });
  assert.equal(row.lang, 'de');
  assert.equal(row.blacklist, '["role-1","role-2"]', 'arrays are stored as JSON strings');
  assert.equal(row.bonusRoles, '{"role-3":2}');

  // After an evict the next read has to come from the database and must match.
  settings.evict(guildId);
  assert.equal(settings.getCached(guildId), undefined);
  const reloaded = await settings.getSettings(guildId);
  assert.equal(reloaded.lang, 'de');
  assert.deepEqual(reloaded.blacklist, ['role-1', 'role-2']);
  assert.deepEqual(reloaded.bonusRoles, { 'role-3': 2 });
});

test('an unknown guild falls back to the default language without touching the database', { skip }, async () => {
  // t() runs synchronously off this, so it must never throw for a cold cache.
  assert.equal(settings.getLang('test-never-loaded'), settings.DEFAULTS.lang);
  assert.equal(settings.getCached('test-never-loaded'), undefined);
});
