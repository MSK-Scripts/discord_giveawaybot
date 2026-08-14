/**
 * `addOrRemoveEntry`, the participate button.
 *
 * Same shape as the two races that were fixed on 2026-08-14: read, await,
 * write. A user who double-clicks the button (or clicks it on two devices)
 * produces two concurrent calls that both find no entry and both insert. The
 * unique constraint keeps the data correct, so what is at stake here is not
 * consistency but whether the loser gets an error message instead of a normal
 * reply.
 *
 * Skipped without TEST_DATABASE_URL — see tests/helpers/db.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openTestDb, skipDb, cleanup, createTestGiveaway, testGuildId } from './helpers/db.js';

const prisma = await openTestDb();
const skip = skipDb;

const service = skip ? {} : await import('../src/services/giveawayService.js');

const USER = '300000000000000001';

test.after(async () => {
  await cleanup(prisma);
  await prisma?.$disconnect();
});

test('a single click toggles the entry both ways', { skip }, async () => {
  const gw = await createTestGiveaway(prisma, testGuildId());

  assert.equal(await service.addOrRemoveEntry(gw.id, USER), 'added');
  assert.equal(await service.countEntries(gw.id), 1);

  assert.equal(await service.addOrRemoveEntry(gw.id, USER), 'removed');
  assert.equal(await service.countEntries(gw.id), 0);
});

test('a double click does not throw and leaves the user joined once', { skip }, async () => {
  const gw = await createTestGiveaway(prisma, testGuildId());

  const results = await Promise.all([
    service.addOrRemoveEntry(gw.id, USER),
    service.addOrRemoveEntry(gw.id, USER),
  ]);

  // Neither call may reject: the button would answer the user with an error.
  assert.deepEqual(results, ['added', 'added']);
  assert.equal(await service.countEntries(gw.id), 1, 'one entry, and the unique constraint holds');
});

test('a concurrent leave does not throw either', { skip }, async () => {
  const gw = await createTestGiveaway(prisma, testGuildId());
  await service.addOrRemoveEntry(gw.id, USER);

  const results = await Promise.all([
    service.addOrRemoveEntry(gw.id, USER),
    service.addOrRemoveEntry(gw.id, USER),
  ]);

  assert.deepEqual(results, ['removed', 'removed']);
  assert.equal(await service.countEntries(gw.id), 0);
});

test('entries of different users are independent', { skip }, async () => {
  const gw = await createTestGiveaway(prisma, testGuildId());
  const users = Array.from({ length: 20 }, (_, i) => `3000000000000000${String(i).padStart(2, '0')}`);

  await Promise.all(users.map((u) => service.addOrRemoveEntry(gw.id, u)));
  assert.equal(await service.countEntries(gw.id), 20);
});
