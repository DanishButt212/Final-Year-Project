import { spawnSync } from 'node:child_process';

/** Applies all Prisma migrations (including the audit trigger) to the test database before e2e tests. */
export default function globalSetup(): void {
  const result = spawnSync('node', ['scripts/migrate-test-db.mjs'], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error('Could not apply migrations to the test database (see output above).');
  }
}
