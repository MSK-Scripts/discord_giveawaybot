#!/usr/bin/env node
/**
 * Applies the migrations to the test database (TEST_DATABASE_URL).
 *
 * `prisma migrate deploy` always reads DATABASE_URL, so this wrapper swaps the
 * variable for the child process. Doing it here rather than in an npm script
 * keeps it working in PowerShell, cmd and bash alike — inline `VAR=value cmd`
 * only exists in the last one.
 *
 * Usage: npm run test:db
 */
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error('TEST_DATABASE_URL is not set. See .env.example.');
  process.exit(1);
}

// A guard, not a formality: the tests end every due giveaway in the database
// they are pointed at, so a test URL must never be the one the bot runs on.
if (url === process.env.DATABASE_URL) {
  console.error('TEST_DATABASE_URL and DATABASE_URL are identical. Use a separate database for the tests.');
  process.exit(1);
}

console.log(`Applying migrations to ${url.replace(/\/\/[^@]*@/, '//***@')}`);

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: true, // npx is a shell script/cmd wrapper on Windows
  env: { ...process.env, DATABASE_URL: url },
});

process.exit(result.status ?? 1);
