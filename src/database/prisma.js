// PrismaClient singleton (ESM). Prevents multiple instances during
// hot reload in development (`node --watch`).
//
// Since Prisma 7 the client talks to the database through a driver adapter
// (the mariadb driver here) instead of the Rust query engine. The generated
// client is TypeScript under src/generated/prisma; Node loads it directly via
// type stripping, so this adds no build step.
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.ts';

const globalForPrisma = globalThis;

function createClient() {
  // A connection string is only parsed when the first query connects. Passing
  // '' instead of undefined keeps it that way without DATABASE_URL, so pure
  // unit tests and the smoke test can import modules that pull in the client.
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL ?? '');
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.__prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

export default prisma;
