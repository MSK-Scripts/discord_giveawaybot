// Prisma CLI configuration (generate, migrate, validate).
// Prisma 7 no longer reads .env on its own, hence the dotenv import.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Read directly instead of through env(), which throws when the variable is
  // missing. generate and validate do not need a connection and keep working
  // without one; migrate still fails with Prisma's own message.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
