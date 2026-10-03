import { config } from 'dotenv';

// Tests always run against the *_test database (backend/.env.test), never the dev database.
process.env.NODE_ENV = 'test';
config({ path: '.env.test', override: true, quiet: true });

if (!/_test(\?|$)/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error(
    'Refusing to run tests: DATABASE_URL in .env.test must point to a *_test database.',
  );
}

// Uploads never touch the real uploads folder during tests.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export const TEST_UPLOAD_DIR = join(tmpdir(), 'digitaladaalat-test-uploads');
export const TEST_UPLOAD_TMP_DIR = join(tmpdir(), 'digitaladaalat-test-uploads-tmp');
process.env.UPLOAD_DIR = TEST_UPLOAD_DIR;
process.env.UPLOAD_TMP_DIR = TEST_UPLOAD_TMP_DIR;
