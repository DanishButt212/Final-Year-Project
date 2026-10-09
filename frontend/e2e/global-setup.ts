import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A fresh password for this run only: upper, lower and digits (matches the password policy). */
function runPassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghjkmnpqrstuvwxyz', '23456789'];
  let out = '';
  for (let i = 0; i < 15; i++) out += sets[i % 3][randomInt(sets[i % 3].length)];
  return out;
}

/** Empties the *_test database and loads the demo data (seed:demo) before the browser tests. */
export default function globalSetup(): void {
  process.env.E2E_PASSWORD = process.env.E2E_PASSWORD ?? runPassword();
  const backend = join(process.cwd(), '..', 'backend');
  const env = {
    ...process.env,
    DOTENV_CONFIG_PATH: '.env.test',
    DEMO_PASSWORD: process.env.E2E_PASSWORD,
    SEED_DEMO_FORCE: 'true',
    UPLOAD_DIR: join(tmpdir(), 'digitaladaalat-ui-uploads'),
    TZ: 'Asia/Karachi',
  };
  const reset = spawnSync('node', ['scripts/reset-test-db.mjs'], { cwd: backend, env, stdio: 'inherit' });
  if (reset.status !== 0) throw new Error('Could not empty the test database.');
  // Output is not shown: the seed lists account names only, but there is no need to print them here.
  const seed = spawnSync('npm', ['run', 'seed:demo'], { cwd: backend, env, shell: true, encoding: 'utf8' });
  if (seed.status !== 0) {
    throw new Error(`seed:demo failed: ${(seed.stderr || '').split('\n').slice(-5).join(' ')}`);
  }
}
