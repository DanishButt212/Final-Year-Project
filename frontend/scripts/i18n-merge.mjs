#!/usr/bin/env node
/**
 * Merges a batch of Urdu translations ({ "English key": "Urdu" }) into src/locales/ur/common.json, then run
 * `npm run i18n:sort` to file each entry under its namespace. Keys that are not in the English catalogue are
 * reported (usually a typo in the key) and skipped.
 *   node scripts/i18n-merge.mjs <batch.json>
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES = join(import.meta.dirname, '..', 'src', 'locales');
const batch = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const en = Object.assign(
  {},
  ...readdirSync(join(LOCALES, 'en')).map((f) =>
    JSON.parse(readFileSync(join(LOCALES, 'en', f), 'utf8')),
  ),
);
const target = join(LOCALES, 'ur', 'common.json');
const ur = JSON.parse(readFileSync(target, 'utf8'));
let added = 0;
const unknown = [];
for (const [k, v] of Object.entries(batch)) {
  if (!(k in en)) {
    unknown.push(k);
    continue;
  }
  if (typeof v !== 'string' || !v.trim()) continue;
  // Placeholders must survive translation unchanged.
  const need = (k.match(/\{\{\w+\}\}/g) ?? []).sort().join();
  const got = (v.match(/\{\{\w+\}\}/g) ?? []).sort().join();
  if (need !== got) {
    unknown.push(`${k}  (placeholders differ: ${need} vs ${got})`);
    continue;
  }
  ur[k] = v;
  added++;
}
writeFileSync(target, `${JSON.stringify(ur, null, 2)}\n`);
console.log(`${added} translations merged`);
if (unknown.length) console.log(`Skipped (${unknown.length}):\n  ${unknown.join('\n  ')}`);
