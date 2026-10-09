// Empties every table of the *_test database (TRUNCATE, so the audit-log trigger is not fired).
// Used by the browser tests before they seed demo data. Refuses to touch any other database.
import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env.test', override: true, quiet: true });
const raw = process.env.DATABASE_URL ?? '';
if (!/_test(\?|$)/.test(raw)) {
  console.error('Refusing to run: DATABASE_URL in .env.test must point to a *_test database.');
  process.exit(1);
}
const url = new URL(raw);
const schema = url.searchParams.get('schema') ?? 'public';
url.searchParams.delete('schema');
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
const { rows } = await client.query(
  `SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename <> '_prisma_migrations'`,
  [schema],
);
if (rows.length > 0) {
  await client.query(
    `TRUNCATE TABLE ${rows.map((r) => `"${schema}"."${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}
await client.end();
console.log(`Test database emptied (${rows.length} tables).`);
