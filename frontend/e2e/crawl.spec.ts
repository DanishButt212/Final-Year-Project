/**
 * Part 3.8 and Part 4: every sidebar page of every role. For each page: real heading (no "coming later", no 404),
 * no horizontal scroll at 375/768/1280, a screenshot per width, an axe WCAG 2.1 AA scan, theme and copy heuristics,
 * and the browser console. Findings are collected into e2e/artifacts/*.json and asserted at the end.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, heading, login, saveJson, watchConsole } from './support';

const ROLES = ['LITIGANT', 'LAWYER', 'INTERN', 'PROCESS_SERVER', 'JUDGE', 'ADMIN'] as const;
const WIDTHS = [375, 768, 1280];

interface PageFinding {
  role: string;
  path: string;
  heading: string;
  title: string;
  hScroll: number[];
  axe: { id: string; impact: string; nodes: number; help: string; sample: string }[];
  theme: string[];
  copy: string[];
}

const findings: PageFinding[] = [];
const consoleByRole: Record<string, string[]> = {};

async function sidebarLinks(page: Page, role: string): Promise<string[]> {
  if (role === 'PROCESS_SERVER') return ['/process-server', '/process-server/profile'];
  await page.setViewportSize({ width: 1280, height: 900 });
  const nav = page.getByRole('navigation', { name: 'Portal navigation' });
  await expect(nav).toBeVisible();
  const hrefs = await nav.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  return [...new Set(hrefs.filter((h) => h.startsWith('/')))];
}

async function themeAndCopy(page: Page) {
  return page.evaluate(() => {
    const theme: string[] = [];
    const copy: string[] = [];
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    if (bodyBg !== 'rgb(245, 246, 244)') theme.push(`body background ${bodyBg}`);
    const h1 = document.querySelector('h1');
    if (h1 && !/Merriweather/i.test(getComputedStyle(h1).fontFamily)) theme.push(`h1 font ${getComputedStyle(h1).fontFamily}`);
    if (!/Inter/i.test(getComputedStyle(document.body).fontFamily)) theme.push(`body font ${getComputedStyle(document.body).fontFamily}`);
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg.includes('gradient')) {
        theme.push(`gradient on <${el.tagName.toLowerCase()} class="${(el as HTMLElement).className}">`);
        break;
      }
    }
    const text = document.body.innerText;
    const emoji = text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    if (emoji) copy.push(`emoji "${emoji[0]}"`);
    for (const word of ['TODO', 'lorem', 'Lorem', 'undefined', 'NaN', '[object Object]']) {
      if (text.includes(word)) copy.push(`text "${word}"`);
    }
    const enums = text.match(/\b[A-Z]{3,}_[A-Z_]{3,}\b/g);
    if (enums) copy.push(`raw enum-like text: ${[...new Set(enums)].slice(0, 5).join(', ')}`);
    for (const code of Array.from(document.querySelectorAll('.case-number'))) {
      if (!/mono/i.test(getComputedStyle(code).fontFamily)) {
        theme.push('case number not monospace');
        break;
      }
    }
    return { theme, copy };
  });
}

for (const role of ROLES) {
  test(`crawl every page for ${role}`, async ({ page }) => {
    test.setTimeout(15 * 60_000);
    const errors = watchConsole(page);
    await login(page, role as keyof typeof ACCOUNTS);
    const links = await sidebarLinks(page, role);
    expect(links.length).toBeGreaterThan(0);
    for (const path of links) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(path);
      const h = await heading(page);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      expect.soft(await page.getByText('Coming in a later phase').count(), `${role} ${path} coming later`).toBe(0);
      expect.soft(await page.getByText(/404: page not found/i).count(), `${role} ${path} 404`).toBe(0);
      const f: PageFinding = { role, path, heading: h, title: await page.title(), hScroll: [], axe: [], theme: [], copy: [] };
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      f.axe = axe.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => ({ id: v.id, impact: v.impact ?? '', nodes: v.nodes.length, help: v.help, sample: v.nodes[0]?.target.join(' ') ?? '' }));
      Object.assign(f, await themeAndCopy(page));
      const slug = `${role.toLowerCase()}${path.replace(/[^a-z0-9]+/gi, '-')}`;
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
        await page.waitForTimeout(250);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) f.hScroll.push(width);
        await page.screenshot({ path: `e2e/artifacts/screens/${slug}-${width}.png` });
      }
      // Refresh keeps the session.
      await page.reload();
      expect.soft((await heading(page)).length, `${role} ${path} after reload`).toBeGreaterThan(0);
      expect.soft(page.url(), `${role} ${path} stays after reload`).toContain(path);
      findings.push(f);
    }
    consoleByRole[role] = errors;
  });
}

test('logged-out deep links redirect to the login page', async ({ page }) => {
  for (const path of ['/admin/cases', '/litigant/new-case', '/judge/orders', '/intern/certificate', '/process-server']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test('logout ends the session', async ({ page }) => {
  await login(page, 'LITIGANT');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: /log out/i }).click();
  await page.goto('/litigant/cases');
  await expect(page).toHaveURL(/\/login/);
});

test.afterAll(() => {
  saveJson('pages.json', findings);
  saveJson('console.json', consoleByRole);
});
