// PrismaClient Singleton (ESM). Verhindert Mehrfach-Instanziierung
// bei Hot-Reload/Dev (`node --watch`).
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

export default prisma;
