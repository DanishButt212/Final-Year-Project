// Applies all Prisma migrations to the test database (the URL comes from .env.test).
import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';

config({ path: '.env.test', override: true });

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('_test')) {
  console.error('Refusing to run: DATABASE_URL in .env.test must point to a *_test database.');
  process.exit(1);
}

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
process.exit(result.status ?? 1);
