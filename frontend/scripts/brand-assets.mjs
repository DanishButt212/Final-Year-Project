#!/usr/bin/env node
/* global document */
/**
 * Writes public/favicon.svg and renders public/apple-touch-icon.png (180 x 180) from the seal.
 * Geometry mirrors src/components/brand/SealLogo.tsx and ArchScalesIcon.tsx.
 *   node scripts/brand-assets.mjs        (needs Google Chrome for the PNG, like the Playwright tests)
 * The favicon leaves out the ring text, which is unreadable at 16 to 32 px; the touch icon keeps it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = join(import.meta.dirname, '..');
const P = '#01411C';
const G = '#B8962E';

const glyph = `
  <g fill="none" stroke="${P}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 108 V56 C22 34 40 21 60 12 C80 21 98 34 98 56 V108" stroke-width="5"/>
    <path d="M12 108 H108" stroke-width="5"/>
    <path d="M60 42 V98" stroke-width="5"/>
    <path d="M48 98 H72" stroke-width="5"/>
    <path d="M38 44 H82" stroke-width="4.5"/>
    <path d="M38 44 L31 68 M38 44 L45 68 M82 44 L75 68 M82 44 L89 68" stroke-width="2"/>
    <path d="M29 68 H47 A9 6.5 0 0 1 29 68 Z" fill="${P}" stroke="none"/>
    <path d="M73 68 H91 A9 6.5 0 0 1 73 68 Z" fill="${P}" stroke="none"/>
    <rect x="34.5" y="40.5" width="7" height="7" rx="1.2" fill="${G}" stroke="none"/>
    <rect x="78.5" y="40.5" width="7" height="7" rx="1.2" fill="${G}" stroke="none"/>
    <rect x="55" y="31" width="10" height="10" rx="1.6" fill="${G}" stroke="none" transform="rotate(45 60 36)"/>
  </g>`;

const diamonds = [
  [100, 34],
  [166, 100],
  [100, 166],
  [34, 100],
]
  .map(
    ([x, y]) =>
      `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" rx="1" fill="${G}" transform="rotate(45 ${x} ${y})"/>`,
  )
  .join('');

const seal = (withText) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="96" fill="#FFFFFF" stroke="${P}" stroke-width="${withText ? 3.5 : 7}"/>
  <circle cx="100" cy="100" r="${withText ? 89 : 84}" fill="none" stroke="${P}" stroke-width="${withText ? 1 : 3}"/>
  ${withText ? `<circle cx="100" cy="100" r="66" fill="none" stroke="${P}" stroke-width="1.6"/>` : ''}
  ${
    withText
      ? `<defs><path id="ring" d="M24 100 A76 76 0 0 1 176 100"/></defs>
  <text fill="${P}" font-family="Inter, sans-serif" font-weight="700" font-size="9.8" letter-spacing="1"><textPath href="#ring" textLength="225" lengthAdjust="spacing">DIGITAL ADAALAT · JUDICIAL ERP · PAKISTAN</textPath></text>
  ${diamonds}`
      : ''
  }
  <g transform="${withText ? 'translate(43 40) scale(0.95)' : 'translate(25 22) scale(1.25)'}">${glyph}</g>
</svg>
`;

writeFileSync(join(ROOT, 'public', 'favicon.svg'), seal(false));
console.log('public/favicon.svg written');

const inter = readFileSync(
  join(
    ROOT,
    'node_modules',
    '@fontsource-variable',
    'inter',
    'files',
    'inter-latin-wght-normal.woff2',
  ),
).toString('base64');

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><head><style>
  @font-face { font-family: Inter; src: url(data:font/woff2;base64,${inter}) format('woff2'); font-weight: 100 900; }
  html, body { margin: 0; background: #FFFFFF; }
  svg { display: block; width: 168px; height: 168px; margin: 6px; }
</style></head><body>${seal(true)}</body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(ROOT, 'public', 'apple-touch-icon.png') });
await browser.close();
console.log('public/apple-touch-icon.png written (180 x 180)');
