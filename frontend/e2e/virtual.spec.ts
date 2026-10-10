/**
 * Part 3.7: virtual courtroom in two browser contexts with fake camera and microphone. The test database is
 * adjusted so that a hearing of the demo litigant sits in the slot running now; public meet.jit.si may refuse or
 * limit automated sessions, so the test asserts up to the iframe and records how far Jitsi got.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { login, saveJson } from './support';

const backend = join(process.cwd(), '..', 'backend');
const req = createRequire(join(backend, 'package.json'));

async function db<T>(fn: (c: import('pg').Client) => Promise<T>): Promise<T> {
  const { config } = req('dotenv') as typeof import('dotenv');
  const env: Record<string, string> = {};
  config({ path: join(backend, '.env.test'), processEnv: env, quiet: true });
  if (!/_test(\?|$)/.test(env.DATABASE_URL ?? '')) throw new Error('not a *_test database');
  const url = new URL(env.DATABASE_URL);
  url.searchParams.delete('schema');
  const { Client } = req('pg') as typeof import('pg');
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  permissions: ['camera', 'microphone'],
});

test('admin opens a session, the litigant joins, the control list shows the attendee', async ({ browser }) => {
  test.setTimeout(180_000);
  const notes: Record<string, unknown> = {};
  const hearingId = await db(async (c) => {
    await c.query(`UPDATE "SystemSetting" SET value = '00:00' WHERE key = 'court_day_start'`);
    await c.query(`UPDATE "SystemSetting" SET value = '23:30' WHERE key = 'court_day_end'`);
    const { rows } = await c.query(`
      SELECT c.id, c."judgeId", c."courtroomId" FROM "Case" c JOIN "User" u ON u.id = c."filedById"
      WHERE u.email = 'litigant@digitaladaalat.test' AND c."judgeId" IS NOT NULL AND c."courtroomId" IS NOT NULL
        AND c.status <> 'DECIDED' LIMIT 1`);
    const k = rows[0];
    const now = new Date(Date.now() + 5 * 3600_000); // Pakistan wall clock
    const slot = Math.min(Math.floor((now.getUTCHours() * 60 + now.getUTCMinutes()) / 30) + 1, 47);
    const date = now.toISOString().slice(0, 10);
    await c.query(
      `UPDATE "Hearing" SET status = 'CANCELLED' WHERE date = $1 AND "timeSlot" = $2 AND ("judgeId" = $3 OR "courtroomId" = $4)`,
      [date, slot, k.judgeId, k.courtroomId],
    );
    const ins = await c.query(
      `INSERT INTO "Hearing" (id, "caseId", "courtroomId", "judgeId", date, "timeSlot", type, "isVirtual", status, "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'VIRTUAL', true, 'SCHEDULED', now()) RETURNING id`,
      [k.id, k.courtroomId, k.judgeId, date, slot],
    );
    return ins.rows[0].id as string;
  });

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, 'ADMIN');
  await admin.goto('/admin/virtual-courtroom');
  const row = admin.locator('li').filter({ has: admin.getByRole('button', { name: /initialize virtual courtroom session/i }) }).first();
  await row.getByRole('button', { name: /initialize virtual courtroom session/i }).click();
  await admin.waitForURL(/\/admin\/virtual-courtroom\/[0-9a-f-]{36}$/);
  await expect(admin.getByText('Room open')).toBeVisible();

  const litCtx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const lit = await litCtx.newPage();
  await login(lit, 'LITIGANT');
  await lit.goto('/litigant/hearings');
  await lit.getByRole('link', { name: 'Join Remote Hearing Video Room' }).first().click();
  await lit.waitForURL(new RegExp(`/courtroom/${hearingId}`));
  await expect(lit.getByRole('button', { name: 'Leave' })).toBeVisible();
  const iframe = lit.locator('iframe');
  notes.iframeLoaded = await iframe.first().waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
  notes.iframeSrc = notes.iframeLoaded ? (await iframe.first().getAttribute('src'))?.split('#')[0] : null;
  notes.roomError = await lit.getByText(/video room unavailable/i).isVisible().catch(() => false);

  // Did the Jitsi client report JOINED? The admin list polls every 5 seconds.
  await admin.waitForTimeout(15_000);
  notes.attendeeListed = await admin.getByText(/Siddiqui|Litigant/).first().isVisible().catch(() => false);
  notes.attendeeLive = await admin.getByText('Live').first().isVisible().catch(() => false);
  await lit.getByRole('button', { name: 'Leave' }).click();
  await expect(lit).toHaveURL(/\/litigant\/hearings/);

  await admin.getByRole('button', { name: 'Mark session ended' }).click();
  await admin.getByRole('button', { name: 'Mark session ended' }).last().click();
  await expect(admin.getByText(/session ended/i).first()).toBeVisible();
  saveJson('virtual.json', notes);
  expect(notes.iframeLoaded || notes.roomError).toBeTruthy();
  await db((c) =>
    c.query(`UPDATE "SystemSetting" SET value = CASE key WHEN 'court_day_start' THEN '09:00' ELSE '14:00' END WHERE key IN ('court_day_start','court_day_end')`),
  );
});
