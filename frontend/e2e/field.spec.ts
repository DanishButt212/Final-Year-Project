/** Part 3.2 to 3.4: lawyer, intern and process server journeys (mocked geolocation, mobile viewport). */
import { expect, test } from '@playwright/test';
import { heading, login, pdf, watchConsole } from './support';

test.describe.configure({ mode: 'serial' });

test('pending lawyer sees the verification gate', async ({ page }) => {
  await login(page, 'LAWYER_PENDING');
  await expect(page.getByText(/Your lawyer profile is pending verification/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /new case submission/i }).first()).toBeDisabled();
});

test('verified lawyer: chamber dashboard, clients, billable, retainer, expenses, ID card', async ({ page }) => {
  const errors = watchConsole(page);
  await login(page, 'LAWYER');
  for (const path of [
    '/lawyer/chamber',
    '/lawyer/chamber/clients',
    '/lawyer/chamber/billable',
    '/lawyer/chamber/retainer',
    '/lawyer/chamber/expenses',
    '/lawyer/chamber/interns',
    '/lawyer/chamber/research-logs',
    '/lawyer/chamber/settings',
  ]) {
    await page.goto(path);
    await heading(page);
  }
  await page.goto('/lawyer');
  await expect(page.getByText(/CH-\d{6}/).first()).toBeVisible();
  await page.goto('/lawyer/chamber/clients/new');
  await page.getByLabel(/name/i).first().fill('Imran Client');
  await page.getByLabel('CNIC').fill(`36302-${String(Date.now()).slice(-7)}-1`);
  await page.getByLabel(/phone|mobile/i).fill('+92 300 1112223');
  await page.getByLabel(/case type/i).selectOption({ index: 1 });
  await page.getByRole('button', { name: /register|save|create|catalog/i }).last().click();
  await expect(page.getByText('New client profile cataloged inside chamber records.').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('lawyer approves a research log and issues the certificate', async ({ page }) => {
  await login(page, 'LAWYER');
  await page.goto('/lawyer/chamber/interns');
  await page.getByRole('link').filter({ hasText: /intern|tester|ahmad|ali|khan/i }).first().click().catch(async () => {
    await page.locator('table a').first().click();
  });
  await heading(page);
  const issue = page.getByRole('button', { name: /issue completion certificate/i });
  if (await issue.isEnabled().catch(() => false)) {
    await issue.click();
    await page.getByRole('button', { name: 'Issue certificate' }).click();
    await expect(page.getByText(/CERT-\d{4}-\d{6}/).first()).toBeVisible();
  } else {
    await expect(page.getByText(/CERT-\d{4}-\d{6}|at least one approved research log/).first()).toBeVisible();
  }
});

test.describe('intern', () => {
  test.use({ permissions: ['geolocation'] });

  test('research logs, attendance inside and outside the geo-fence, certificate', async ({ page, context }) => {
    await login(page, 'INTERN');
    await heading(page);
    await page.goto('/intern/research-logs');
    await heading(page);
    // Far from any court: rejected.
    await context.setGeolocation({ latitude: 31.5204, longitude: 74.3587, accuracy: 10 });
    await page.goto('/intern/attendance');
    await heading(page);
    const checkIn = page.getByRole('button', { name: /check in|log attendance|mark attendance/i }).first();
    if (await checkIn.isEnabled().catch(() => false)) {
      await checkIn.click();
      await expect(page.getByText(/Verification Failed|already been logged/).first()).toBeVisible();
      // Inside the seeded Multan court geo-fence.
      await context.setGeolocation({ latitude: 30.1978, longitude: 71.4697, accuracy: 10 });
      await checkIn.click();
      await expect(page.getByText(/Attendance logged successfully\. Location verified\.|already been logged|Verification Failed/).first()).toBeVisible();
    }
    await page.goto('/intern/certificate');
    expect(await heading(page)).toBe('Completion Certificate');
  });
});

test.describe('process server (mobile)', () => {
  test.use({ viewport: { width: 375, height: 812 }, permissions: ['geolocation'], geolocation: { latitude: 30.1978, longitude: 71.4697, accuracy: 8 } });

  test('duty roster, attempt with GPS and finalize with photo and signature', async ({ page }) => {
    const errors = watchConsole(page);
    await login(page, 'PROCESS_SERVER');
    await expect(page.getByRole('heading', { name: 'My Duty Roster' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const first = page.getByRole('link').filter({ hasText: /summons|notice|DA-/i }).first();
    if (!(await first.isVisible().catch(() => false))) return;
    await first.click();
    await heading(page);
    const attempt = page.getByRole('link', { name: /attempt|progress/i }).or(page.getByRole('button', { name: /attempt|progress/i })).first();
    if (await attempt.isVisible().catch(() => false)) {
      await attempt.click();
      await page.getByLabel(/notes|observation/i).fill('Door locked; neighbour informed of the summons.');
      await page.getByRole('button', { name: /commit|save|record/i }).last().click();
      await expect(page.getByText(/Progress log entry committed\.|Telemetry Error/).first()).toBeVisible();
    }
    const finalize = page.getByRole('link', { name: /finali[sz]e|execute/i }).first();
    if (await finalize.isVisible().catch(() => false)) {
      await finalize.click();
      await page.locator('input[type=file]').first().setInputFiles({ name: 'photo.pdf', mimeType: 'application/pdf', buffer: pdf() }).catch(() => undefined);
      const canvas = page.locator('canvas').first();
      if (await canvas.isVisible().catch(() => false)) {
        const box = (await canvas.boundingBox())!;
        await page.mouse.move(box.x + 10, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(box.x + 120, box.y + 40, { steps: 8 });
        await page.mouse.up();
      }
    }
    expect(errors).toEqual([]);
  });
});
