import { config } from 'dotenv';

// Tests always run against the *_test database (backend/.env.test), never the dev database.
process.env.NODE_ENV = 'test';
config({ path: '.env.test', override: true, quiet: true });

if (!/_test(\?|$)/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error(
    'Refusing to run tests: DATABASE_URL in .env.test must point to a *_test database.',
  );
}
