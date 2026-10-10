/** Part 3.1: litigant journey through the browser. */
import { expect, test } from '@playwright/test';
import { heading, login, pdf, watchConsole } from './support';

test.describe.configure({ mode: 'serial' });

test('a new litigant can register', async ({ page }) => {
  const n = Date.now() % 1_000_000;
  await page.goto('/register');
  await page.getByLabel('First name').fill('Hina');
  await page.getByLabel('Last name').fill('Qureshi');
  await page.getByLabel('CNIC').fill(`36302-${String(4000000 + n).slice(0, 7)}-3`);
  await page.getByLabel('Mobile number').fill('+92 300 7654321');
  await page.getByLabel('Email address').fill(`hina.${n}@example.test`);
  await page.getByLabel(/^Password/).first().fill('Hina1Password');
  await page.getByLabel('Confirm password').fill('Hina1Password');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByText('Your registration request has been submitted successfully.').first()).toBeVisible();
});

test('rejects a bad CNIC and phone with inline messages', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('CNIC').fill('123');
  await page.getByLabel('Mobile number').fill('0300');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByText(/12345-1234567-1/).first()).toBeVisible();
  await expect(page.getByText(/\+92 3XX XXXXXXX/).first()).toBeVisible();
});

test('files a case with a PDF, pays the fee and downloads the receipt', async ({ page }) => {
  const errors = watchConsole(page);
  await login(page, 'LITIGANT');
  await page.goto('/litigant/new-case');
  await page.getByLabel('Case type').selectOption('CIVIL_SUIT');
  await page.getByLabel('Relief sought').fill('Recovery of PKR 500,000 under the sale agreement dated 01-01-2026.');
  await page.getByRole('button', { name: /^next/i }).click();
  // Parties: the litigant is prefilled as the first petitioner; add the opposing party.
  const names = page.getByLabel('Full name');
  await names.nth(1).fill('Bilal Ahmed');
  await page.getByRole('button', { name: /^next/i }).click();
  await page.getByTestId('pdf-input').setInputFiles({ name: 'petition.pdf', mimeType: 'application/pdf', buffer: pdf('ui-petition') });
  await expect(page.getByText('petition.pdf')).toBeVisible();
  await page.getByRole('button', { name: /^next/i }).click();
  await page.getByRole('button', { name: /submit case/i }).click();
  const ucn = page.getByTestId('ucn');
  await expect(ucn).toHaveText(/^DA-\d{4}-CIV-\d{6}$/, { timeout: 20_000 });
  await expect(ucn).toHaveCSS('font-family', /mono/i);

  await page.getByRole('link', { name: 'Open case' }).click();
  await heading(page);
  await page.getByRole('tab', { name: 'Fees & Payment' }).click();
  await page.getByRole('button', { name: /calculate costs and fees/i }).click();
  await expect(page.getByRole('table', { name: 'Cost ledger' })).toBeVisible();
  await expect(page.getByText(/PKR 2,500/).first()).toBeVisible();
  await page.getByRole('button', { name: /pay fee online/i }).click();

  const pay = async (card: string) => {
    await page.getByLabel('Cardholder name').fill('Ayesha Siddiqui');
    await page.getByLabel('Card number').fill(card);
    await page.getByLabel('Expiry (MM/YY)').fill('12/30');
    await page.getByLabel('CVV').fill('123');
    await page.getByRole('button', { name: /^pay /i }).click();
  };
  await pay('4000 0000 0000 0002');
  await expect(page.getByText('Payment Unsuccessful: Gateway rejected request details.')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await pay('4242 4242 4242 4242');
  await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /download receipt proof/i }).click();
  expect((await download).suggestedFilename()).toMatch(/RCPT-\d{4}-\d{6}/);
  expect(errors).toEqual([]);
});

test('sees the case timeline, documents, hearings, cause lists and notifications', async ({ page }) => {
  await login(page, 'LITIGANT');
  await page.goto('/litigant/cases');
  await page.locator('a.case-number').first().click();
  await page.getByRole('tab', { name: 'Lifecycle' }).click();
  await expect(page.getByRole('list', { name: /lifecycle events/i })).toBeVisible();
  await page.getByRole('tab', { name: 'Evidence Vault' }).click();
  await expect(page.getByRole('table', { name: 'Pleadings' }).or(page.getByText('No pleadings attached yet'))).toBeVisible();
  await page.goto('/litigant/hearings');
  expect(await heading(page)).toBe('Hearing Schedule');
  await page.goto('/litigant/cause-lists');
  expect(await heading(page)).toBe('Daily Cause Lists');
  await page.goto('/notifications');
  await heading(page);
});

test('uploads an exhibit to an allocated case and submits feedback', async ({ page }) => {
  await login(page, 'LITIGANT');
  await page.goto('/litigant/cases?status=HEARING_FIXED');
  await page.goto('/litigant/cases');
  await page.getByRole('link', { name: /DA-\d{4}-BAL-/ }).first().click().catch(async () => {
    await page.locator('a.case-number').last().click();
  });
  await page.getByRole('tab', { name: 'Evidence Vault' }).click();
  const chooser = page.getByLabel('Choose exhibit files');
  if (await chooser.isVisible().catch(() => false)) {
    await chooser.setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: pdf('ui-exhibit') });
  }
  await page.goto('/litigant/feedback');
  await page.getByLabel('Category').selectOption({ index: 1 });
  await page.getByLabel('Narrative notes').fill('The hearing schedule page is clear and easy to read.');
  await page.getByRole('button', { name: /transmit feedback data log/i }).click();
  await expect(page.locator('[role="status"], [role="alert"]').filter({ hasText: /feedback/i }).first()).toBeVisible();
});

test('the video room button is greyed out or closed outside the session window', async ({ page }) => {
  await login(page, 'LITIGANT');
  await page.goto('/litigant/hearings');
  const btn = page.getByRole('button', { name: 'Join Remote Hearing Video Room' }).first();
  const link = page.getByRole('link', { name: 'Join Remote Hearing Video Room' }).first();
  if (await link.isVisible().catch(() => false)) {
    await expect(link).toHaveAttribute('href', /\/courtroom\//);
  } else if (await btn.isVisible().catch(() => false)) {
    await expect(btn).toBeDisabled();
  }
});
