/**
 * Test database access.
 *
 * The concurrency tests need a real database: what they verify is that MariaDB
 * serialises a conditional UPDATE and rejects a duplicate INSERT. A mocked
 * Prisma client would only prove that the mock behaves the way the test author
 * imagined, which is exactly the assumption that let two races live in this
 * code for months.
 *
 * A dedicated `TEST_DATABASE_URL` is REQUIRED — the tests never fall back to
 * `DATABASE_URL`. `runSchedulerTick` ends every giveaway that is due across the
 * whole database, not just the rows a test created, so pointing the suite at a
 * live database would end real giveaways. One explicit variable is cheaper than
 * finding that out afterwards.
 *
 * Without the variable every database test skips, so `npm test` still runs the
 * pure unit tests (and CI without a database service stays green).
 */
import dotenv from 'dotenv';

dotenv.config();

// Route Prisma at the test database. This must happen before src/database/prisma.js
// is imported anywhere, which is why every test imports this helper first and
// pulls the modules under test in dynamically.
const TEST_URL = process.env.TEST_DATABASE_URL || '';
if (TEST_URL) process.env.DATABASE_URL = TEST_URL;

// No test may talk to the outside world: the result publisher would POST to the
// shop, the control server would open a port.
delete process.env.RESULT_PUBLISH_URL;
delete process.env.RESULT_PUBLISH_SECRET;
delete process.env.CONTROL_SECRET;

/** Reason string for `{ skip }`, or false when the database is usable. */
export let skipDb = false;

let prismaRef = null;

/**
 * Connects to the test database and returns the Prisma client, or null when
 * there is none. Sets `skipDb` to the reason in that case.
 */
export async function openTestDb() {
  if (prismaRef) return prismaRef;

  if (!TEST_URL) {
    skipDb = 'no TEST_DATABASE_URL set (see .env.example)';
    return null;
  }

  try {
    const { prisma } = await import('../../src/database/prisma.js');
    // Reachable and migrated? Both matter, and both fail differently.
    await prisma.$queryRaw`SELECT 1`;
    await prisma.guildSettings.count();
    prismaRef = prisma;
    return prisma;
  } catch (err) {
    skipDb = `test database not usable: ${err?.message ?? err}`;
    return null;
  }
}

// Every row a test creates carries this prefix. Discord guild IDs are numeric
// snowflakes, so nothing with this prefix can ever be real data — that is what
// makes the cleanup below safe to run with a plain deleteMany.
export const TEST_PREFIX = 'test-';

let counter = 0;

/** Unique guild ID for one test, namespaced by process so parallel runs do not collide. */
export function testGuildId() {
  return `${TEST_PREFIX}${process.pid}-${counter++}`;
}

/** Unique giveaway ID (the real ones are short nanoid strings). */
export function testGiveawayId() {
  return `${TEST_PREFIX}gw-${process.pid}-${counter++}`;
}

/** Removes everything the suite created. Entries and winners cascade from Giveaway. */
export async function cleanup(prisma) {
  if (!prisma) return;
  await prisma.giveaway.deleteMany({ where: { guildId: { startsWith: TEST_PREFIX } } });
  await prisma.giveawayTemplate.deleteMany({ where: { guildId: { startsWith: TEST_PREFIX } } });
  await prisma.guildSettings.deleteMany({ where: { guildId: { startsWith: TEST_PREFIX } } });
}

/** Inserts an ACTIVE giveaway. `endAt` defaults to the past, i.e. due to end. */
export async function createTestGiveaway(prisma, guildId, overrides = {}) {
  return prisma.giveaway.create({
    data: {
      id: testGiveawayId(),
      guildId,
      channelId: '100000000000000001',
      hostId: '100000000000000002',
      title: 'Test Giveaway',
      description: 'created by the test suite',
      winnersCount: 1,
      endAt: new Date(Date.now() - 1000),
      status: 'ACTIVE',
      ...overrides,
    },
  });
}

/** Adds N participants to a giveaway and returns their user IDs. */
export async function addEntries(prisma, giveawayId, count) {
  const userIds = Array.from({ length: count }, (_, i) => `2000000000000000${String(i).padStart(2, '0')}`);
  await prisma.entry.createMany({
    data: userIds.map((userId) => ({ giveawayId, userId })),
    skipDuplicates: true,
  });
  return userIds;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
