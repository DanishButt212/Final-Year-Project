import type { Browser, Page } from '../../frontend/node_modules/playwright';
import { PASSWORD } from './fixtures';
import type { TestContext } from './helpers';

export async function openTestPortals(ctx: TestContext, web: string) {
  await ctx.app.listen(0, '127.0.0.1');
  const api = await ctx.app.getUrl();
  const { chromium } = await import('../../frontend/node_modules/playwright/index.js');
  const browser: Browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });

  async function signIn(email: string): Promise<Page> {
    const page = await browser.newPage({ timezoneId: 'Asia/Karachi' });
    page.setDefaultTimeout(12_000);
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: `${api}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    });
    await page.addInitScript(() => sessionStorage.setItem('da_tour_skip', '1'));
    await page.goto(`${web}/login`);
    await page.getByLabel('Email or username').fill(email);
    await page.getByLabel(/^Password/).first().fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.waitForURL((url) => url.pathname !== '/login');
    return page;
  }

  return { browser, signIn };
}
