#!/usr/bin/env node
/* global document, window */
/**
 * Quick visual check against a running dev stack (vite on 5173 by default).
 *   node scripts/shots.mjs <name> <path> [--w=375] [--lang=ur] [--scale=1.25] [--wait=ms] [--full]
 *     [--frames=500,1200] [--login=email:password] [--intro]
 * Writes e2e/artifacts/shots/<name>[-<frame>].png (git-ignored). Never prints credentials.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [name, path = '/', ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(
  rest.map((a) => {
    const raw = a.replace(/^--/, '');
    const at = raw.indexOf('=');
    const [k, v] = at < 0 ? [raw, 'true'] : [raw.slice(0, at), raw.slice(at + 1)];
    return [k, v];
  }),
);
const base = process.env.SHOTS_BASE ?? 'http://localhost:5173';
const width = Number(opt.w ?? 1280);
const out = join(import.meta.dirname, '..', 'e2e', 'artifacts', 'shots');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const context = await browser.newContext({
  viewport: { width, height: Number(opt.h ?? (width < 500 ? 812 : 900)) },
  timezoneId: 'Asia/Karachi',
  reducedMotion: opt.reduced ? 'reduce' : 'no-preference',
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.addInitScript(
  ({ lang, scale, intro }) => {
    try {
      if (lang) localStorage.setItem('da_lang', lang);
      if (scale) localStorage.setItem('da_font_scale', scale);
      if (!intro) sessionStorage.setItem('da_intro_seen', '1');
      sessionStorage.setItem('da_tour_skip', '1');
    } catch {
      /* ignore */
    }
  },
  { lang: opt.lang, scale: opt.scale, intro: Boolean(opt.intro) },
);

/** Credentials for a role from the git-ignored docs/DEV_ACCOUNTS.md (read here, never printed). */
function devAccount(role) {
  const md = readFileSync(join(import.meta.dirname, '..', '..', 'docs', 'DEV_ACCOUNTS.md'), 'utf8');
  for (const line of md.split(/\r?\n/)) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells[1] !== role) continue;
    const email = cells[2].split(/\s+/).find((w) => w.includes('@'));
    const password = (cells[3].match(/`([^`]+)`/) ?? [])[1];
    if (email && password) return `${email}:${password}`;
  }
  throw new Error(`No dev account for role ${role}`);
}
if (opt.role) opt.login = devAccount(opt.role);

if (opt.login) {
  const [email, password] = opt.login.split(':');
  await page.goto(`${base}/login`);
  // Structural selectors: the form may already be in Urdu.
  await page.locator('input[name="identifier"]:visible').first().fill(email);
  await page.locator('input[type="password"]:visible').first().fill(password);
  await page.locator('form:visible button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
}

let t0 = Date.now();
await page.goto(`${base}${path}`);
if (opt.frames && opt.intro) {
  // Intro frames are timed from the moment the intro mounts.
  await page.waitForSelector('[data-testid="seal-intro"]', { timeout: 20000 });
  t0 = Date.now();
}
if (opt.frames) {
  for (const f of opt.frames.split(',').map(Number)) {
    const wait = f - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.screenshot({ path: join(out, `${name}-${f}.png`) });
    if (opt.debug)
      console.log(
        f,
        await page.evaluate(() =>
          document
            .getAnimations()
            .map((a) => `${a.animationName}:${Math.round(a.currentTime)}`)
            .join(' '),
        ),
      );
  }
} else {
  await page.waitForLoadState('networkidle').catch(() => {});
  if (opt.click) {
    // e.g. --click=a[href*="/cases/"] opens the first case of a list
    await page.locator(opt.click).first().click();
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  if (opt.press) {
    await page.keyboard.press(opt.press);
    await page.waitForTimeout(800);
  }
  if (opt.type) {
    await page.keyboard.type(opt.type, { delay: 40 });
    await page.waitForTimeout(1200);
  }
  if (opt.full) {
    // Scroll through once so on-scroll reveals have run, then back to the top.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
  }
  await page.waitForTimeout(Number(opt.wait ?? 900));
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 0) console.log(`HORIZONTAL OVERFLOW: ${overflow}px`);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: Boolean(opt.full) });
}
console.log(`saved ${name}`);
await browser.close();
