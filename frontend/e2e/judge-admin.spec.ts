/** Part 3.5 and 3.6: judge and admin journeys through the browser. */
import { expect, test } from '@playwright/test';
import { heading, login, watchConsole } from './support';

test.describe.configure({ mode: 'serial' });

test.describe('judge', () => {
  test('dashboard panels, schedule, cause lists and allocated cases', async ({ page }) => {
    const errors = watchConsole(page);
    await login(page, 'JUDGE');
    await expect(page.getByText("Today's cause list")).toBeVisible();
    await expect(page.getByText('Recent orders')).toBeVisible();
    await page.goto('/judge/schedule');
    expect(await heading(page)).toBe('My Schedule');
    await page.getByRole('button', { name: 'Next week' }).click();
    await page.getByRole('button', { name: 'This week' }).click();
    await page.goto('/judge/cause-lists');
    expect(await heading(page)).toBe('Daily Cause Lists');
    await page.goto('/judge/cases');
    expect(await heading(page)).toBe('My Allocated Cases');
    expect(errors).toEqual([]);
  });

  test('records an outcome and decides a case', async ({ page }) => {
    await login(page, 'JUDGE');
    await page.goto('/judge/cases');
    await page.getByRole('searchbox').fill('Muhammad Ali');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.locator('a.case-number').first().click();
    await heading(page);
    const record = page.getByRole('button', { name: /record outcome/i }).first();
    if (await record.isVisible().catch(() => false)) {
      await record.click();
      await page.getByLabel('Outcome').selectOption({ index: 1 });
      await page.getByLabel('Order notes').fill('Arguments heard; matter proceeds to final order.');
      await page.getByRole('button', { name: 'Save outcome' }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
    }
    await page.getByRole('button', { name: /decide case/i }).click();
    await page.getByLabel('Decision type').selectOption({ index: 1 });
    await page.getByLabel('Order', { exact: true }).fill('Bail granted subject to surety bonds of PKR 100,000.');
    await page.getByRole('button', { name: 'Review decision' }).click();
    await page.getByRole('button', { name: /record final decision/i }).click();
    await expect(page.getByText(/decision/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /decide case/i })).toHaveCount(0);
  });

  test('Orders page searches and filters', async ({ page }) => {
    await login(page, 'JUDGE');
    await page.goto('/judge/orders');
    expect(await heading(page)).toBe('Orders');
    await expect(page.getByRole('table', { name: 'Recorded orders and decisions' })).toBeVisible();
    await page.getByLabel('Outcome').selectOption('JUDGMENT');
    await page.waitForTimeout(500);
    const badges = page.getByRole('table').getByText(/Hearing completed|Adjourned/);
    expect(await badges.count()).toBe(0);
    await page.getByLabel('Outcome').selectOption('');
    await page.getByRole('searchbox').fill('zzzz-no-such-case');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('No orders match your filters')).toBeVisible();
  });
});

test.describe('admin', () => {
  test('dashboard, provisioning and lawyer verification', async ({ page }) => {
    const errors = watchConsole(page);
    await login(page, 'ADMIN');
    await heading(page);
    await page.goto('/admin/accounts');
    await page.getByRole('button', { name: /add staff account/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Role').selectOption('ADMIN').catch(() => undefined);
    await dialog.getByLabel('First name').fill('Sara');
    await dialog.getByLabel('Last name').fill('Registrar');
    await dialog.getByLabel('CNIC').fill(`36302-${String(Date.now()).slice(-7)}-5`);
    await dialog.getByLabel(/phone|mobile/i).fill('+92 301 2345678');
    await dialog.getByLabel(/email/i).fill(`sara.${Date.now()}@example.test`);
    await dialog.getByRole('button', { name: /create account/i }).click();
    await expect(dialog.getByText(/reset-password\?token=/).or(dialog.getByText(/link/i)).first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click().catch(() => undefined);

    await page.goto('/admin/lawyer-verification');
    await heading(page);
    const row = page.getByText('Faisal Kharal').first();
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      await page.getByRole('button', { name: /verify and approve account/i }).click();
      await page.getByRole('button', { name: /confirm|verify/i }).last().click().catch(() => undefined);
      await expect(page.getByText('Lawyer verification process complete. Credentials locked.').first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('policies, audit integrity, security, reports and the virtual courtroom page', async ({ page }) => {
    await login(page, 'ADMIN');
    await page.goto('/admin/policies');
    await heading(page);
    await page.getByRole('button', { name: /apply policy changes system-wide/i }).click();
    await expect(page.locator('[role="status"]').filter({ hasText: /updated|saved|applied|revised/i }).first()).toBeVisible();

    await page.goto('/admin/audit-logs');
    await heading(page);
    await page.getByRole('button', { name: /verify integrity/i }).click();
    await expect(page.getByText(/valid/i).first()).toBeVisible();

    await page.goto('/admin/security');
    await heading(page);

    await page.goto('/admin/reports');
    await heading(page);
    await page.getByRole('button', { name: /compile report profile data layout/i }).click();
    await expect(page.getByText(/filed/i).first()).toBeVisible();

    await page.goto('/admin/summons');
    await heading(page);
    await page.goto('/admin/virtual-courtroom');
    expect(await heading(page)).toBe('Virtual Courtroom Control');
    await expect(page.getByText(/Running on public Jitsi/)).toBeVisible();

    await page.goto('/admin/hearings');
    await heading(page);
    await page.goto('/admin/courts');
    await heading(page);
    await page.goto('/admin/cases');
    await heading(page);
    await page.goto('/admin/feedback');
    await heading(page);
  });
});
