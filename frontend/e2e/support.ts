import { expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Demo accounts loaded by global-setup (seed:demo); the password exists only for this run. */
export const ACCOUNTS = {
  ADMIN: 'admin',
  JUDGE: 'judge@digitaladaalat.test',
  LAWYER: 'lawyer@digitaladaalat.test',
  LAWYER_PENDING: 'lawyer.pending@digitaladaalat.test',
  INTERN: 'intern@digitaladaalat.test',
  PROCESS_SERVER: 'server@digitaladaalat.test',
  LITIGANT: 'litigant@digitaladaalat.test',
  LITIGANT2: 'litigant2@digitaladaalat.test',
} as const;

export const PORTAL: Record<string, string> = {
  ADMIN: '/admin',
  JUDGE: '/judge',
  LAWYER: '/lawyer',
  LAWYER_PENDING: '/lawyer',
  INTERN: '/intern',
  PROCESS_SERVER: '/process-server',
  LITIGANT: '/litigant',
  LITIGANT2: '/litigant',
};

export const password = () => {
  const p = process.env.E2E_PASSWORD;
  if (!p) throw new Error('E2E_PASSWORD is set by global-setup');
  return p;
};

export async function login(page: Page, who: keyof typeof ACCOUNTS) {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(ACCOUNTS[who]);
  await page.getByLabel('Password', { exact: true }).fill(password());
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL((u) => u.pathname.startsWith(PORTAL[who]), { timeout: 20_000 });
}

export async function logout(page: Page) {
  const menu = page.getByRole('button', { name: 'Account menu' });
  if (await menu.isVisible()) {
    await menu.click();
    await page.getByRole('menuitem', { name: /log out/i }).click();
  }
  await page.waitForURL(/\/login|\/$/);
}

/** Collects uncaught errors and console errors for the whole test. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Expected API refusals (401/403/404/409) are logged by the browser as failed resources.
    if (/Failed to load resource: the server responded with a status of (40[0-9]|409|422)/.test(t)) return;
    errors.push(`console: ${t.slice(0, 300)}`);
  });
  return errors;
}

export const ART = join(process.cwd(), 'e2e', 'artifacts');

export function saveJson(name: string, data: unknown) {
  const file = join(ART, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

export async function heading(page: Page) {
  const h1 = page.getByRole('heading', { level: 1 }).first();
  await expect(h1).toBeVisible({ timeout: 15_000 });
  return (await h1.textContent())?.trim() ?? '';
}

/** Minimal valid PDF bytes. */
export const pdf = (label = 'e2e') =>
  Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${label}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
