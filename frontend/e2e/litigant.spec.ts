/** Part 3.1: litigant journey through the browser. */
import { expect, test } from '@playwright/test';
import { heading, login, pdf, watchConsole } from './support';

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

test('a lawyer files for the litigant, who can view the case and pay its fee', async ({ page, browser }) => {
  const errors = watchConsole(page);
  await login(page, 'LITIGANT');
  await page.goto('/litigant/new-case');
  await expect(page).toHaveURL(/\/forbidden$/);
  const { user: me } = await (await page.request.get('/api/auth/me')).json();
  const lawyer = await browser.newPage({ baseURL: test.info().project.use.baseURL });
  await login(lawyer, 'LAWYER');
  await lawyer.goto('/lawyer/new-case');
  await lawyer.getByLabel('Case type').selectOption('CIVIL_SUIT');
  const filingTitle = `Sale agreement recovery ${Date.now()}`;
  await lawyer.getByLabel(/case title/i).fill(filingTitle);
  await lawyer.getByLabel('Relief sought').fill('Recovery of PKR 500,000 under the sale agreement dated 01-01-2026.');
  await lawyer.getByRole('button', { name: /^next/i }).click();
  const names = lawyer.getByLabel('Full name');
  await names.first().fill(`${me.firstName} ${me.lastName}`);
  await lawyer.getByLabel('Represented litigant CNIC').fill(me.cnic);
  await names.nth(1).fill('Bilal Ahmed');
  await lawyer.getByRole('button', { name: /^next/i }).click();
  await lawyer.getByTestId('pdf-input').setInputFiles({ name: 'petition.pdf', mimeType: 'application/pdf', buffer: pdf('ui-petition') });
  await expect(lawyer.getByText('petition.pdf')).toBeVisible();
  await lawyer.getByRole('button', { name: /^next/i }).click();
  let submissions = 0;
  await lawyer.route('**/api/cases', async (route) => {
    if (route.request().method() === 'POST') submissions += 1;
    await route.continue();
  });
  await lawyer.getByRole('button', { name: /submit case/i }).dblclick();
  const ucn = lawyer.getByTestId('ucn');
  await expect(ucn).toHaveText(/^DA-\d{4}-CIV-\d{6}$/, { timeout: 20_000 });
  await expect(lawyer.getByText('Unpaid challan', { exact: true })).toBeVisible();
  await expect(lawyer.getByText('Due date', { exact: true })).toBeVisible();
  const view = await lawyer.getByRole('link', { name: 'View case' }).getAttribute('href');
  const caseNumber = await ucn.innerText();
  const filed = await lawyer.request.get(`/api/cases?search=${encodeURIComponent(filingTitle)}`);
  expect(filed.ok()).toBe(true);
  const filingResults = (await filed.json()).data;
  expect(filingResults.map((item: { ucn: string }) => item.ucn)).toEqual([caseNumber]);
  expect(submissions).toBe(1);
  const outsider = await browser.newPage({ baseURL: test.info().project.use.baseURL });
  try {
    await login(outsider, 'LITIGANT2');
    const caseId = view!.split('/').pop();
    const detail = await lawyer.request.get(`/api/cases/${caseId}`);
    expect(detail.ok()).toBe(true);
    const { documents } = await detail.json();
    expect((await outsider.request.get(`/api/cases/${caseId}`)).status()).toBe(404);
    expect((await outsider.request.get(`/api/cases/${caseId}/documents/${documents[0].id}/download`)).status()).toBe(404);
  } finally {
    await outsider.close();
  }
  await lawyer.close();
  const reader = await browser.newPage({ baseURL: test.info().project.use.baseURL });
  await login(reader, 'ADMIN');
  await reader.goto('/admin/cases');
  const feeRow = reader.getByRole('row').filter({ hasText: caseNumber });
  await expect(feeRow.getByText('Unpaid', { exact: true })).toBeVisible();
  await page.goto(view!.replace('/lawyer/', '/litigant/'));
  await page.getByRole('tab', { name: 'Fees & Payment' }).click();
  await expect(page.getByText('Unpaid', { exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Cost ledger' })).toBeVisible();
  await expect(page.getByText(/PKR 2,500/).first()).toBeVisible();
  await page.getByRole('button', { name: /pay fee online/i }).click();
  await expect(page.getByLabel('Payment method').locator('option')).toHaveText([
    'Stripe card demo', 'JazzCash', 'Easypaisa', 'Bank transfer',
  ]);

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
  await page.getByRole('button', { name: /download receipt/i }).click();
  expect((await download).suggestedFilename()).toMatch(/RCPT-\d{4}-\d{6}/);
  await reader.reload();
  await expect(feeRow.getByText('Paid', { exact: true })).toBeVisible();
  await reader.close();
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
  const listed = await page.request.get('/api/cases?status=HEARING_FIXED');
  expect(listed.ok()).toBe(true);
  const { data } = await listed.json();
  expect(data.length).toBeGreaterThan(0);
  await page.goto(`/litigant/cases/${data[0].id}`);
  await page.getByRole('tab', { name: 'Evidence Vault' }).click();
  const chooser = page.getByLabel('Choose exhibit files');
  await page.getByLabel('File category').selectOption('SCANNED_DOCUMENT');
  await chooser.setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: pdf('ui-exhibit') });
  await page.getByLabel('Descriptive summary').fill('A scanned statement filed for browser verification.');
  const uploaded = page.waitForResponse((res) =>
    res.url().endsWith('/evidence') && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'Submit Exhibit Entry to Vault' }).click();
  expect((await uploaded).status()).toBe(201);
  await page.reload();
  await page.getByRole('tab', { name: 'Evidence Vault' }).click();
  await expect(page.getByText('scan.pdf', { exact: true })).toBeVisible();
  await page.goto('/litigant/feedback');
  await page.getByLabel('Category').selectOption({ index: 1 });
  await page.getByLabel('Narrative notes').fill('The hearing schedule page is clear and easy to read.');
  await page.getByRole('button', { name: /transmit feedback data log/i }).click();
  await expect(page.locator('[role="status"], [role="alert"]').filter({ hasText: /feedback/i }).first()).toBeVisible();
});

test('the current build has no courtroom link in the hearing schedule', async ({ page }) => {
  await login(page, 'LITIGANT');
  await page.goto('/litigant/hearings');
  await expect(page.getByRole('heading', { name: 'Hearing Schedule' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join Remote Hearing Video Room' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Join Remote Hearing Video Room' })).toHaveCount(0);
});
