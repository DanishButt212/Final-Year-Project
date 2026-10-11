#!/usr/bin/env node
/**
 * Translation catalogue tool.
 *
 *   node scripts/i18n.mjs extract   writes src/locales/en/<namespace>.json from the source (key = English text)
 *   node scripts/i18n.mjs check     extract, then report keys that have no Urdu translation (exit 1 if any)
 *   node scripts/i18n.mjs sort      extract, then move every Urdu entry into the namespace file of its key
 *
 * A key is any string literal passed to t(...), msg(...) or i18nKey="...". The namespace comes from the file
 * that uses it; a key used in several areas goes to "common".
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'src');
const NAMESPACES = [
  'common',
  'auth',
  'landing',
  'cases',
  'fees',
  'hearings',
  'summons',
  'chamber',
  'intern',
  'judge',
  'admin',
  'validation',
  'errors',
  'glossary',
];

/** First matching rule wins. Paths are relative to src with forward slashes. */
const RULES = [
  [/^lib\/schemas|^lib\/form-errors|^lib\/phone|^lib\/date-input/, 'validation'],
  [/^lib\/server-messages|^lib\/api\.ts|^lib\/login-messages/, 'errors'],
  [/^lib\/glossary|^pages\/GlossaryPage|^components\/glossary/, 'glossary'],
  [/^pages\/(Login|Register|ForgotPassword|ResetPassword)Page|^auth\//, 'auth'],
  [/^pages\/(LandingPage|PublicStatusPage)|^components\/(brand|landing|intro)\//, 'landing'],
  [/^pages\/admin\//, 'admin'],
  [/^pages\/cases\/|^lib\/case-status|^components\/case\//, 'cases'],
  [/^pages\/payments\//, 'fees'],
  [/^pages\/(scheduling|virtual)\/|^components\/hearing/, 'hearings'],
  [/^pages\/server\/|^lib\/summons/, 'summons'],
  [/^pages\/chamber\//, 'chamber'],
  [/^pages\/intern\//, 'intern'],
  [/^pages\/judge\//, 'judge'],
];

function nsFor(file) {
  for (const [re, ns] of RULES) if (re.test(file)) return ns;
  return 'common';
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'locales' || name === 'test' || name === 'generated') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** String literal (single, double or backtick without ${}) as the first argument of t / msg, or an i18nKey prop. */
const PATTERNS = [
  /(?<![\w.$])(?:t|msg|i18n\.t)\(\s*'((?:[^'\\\n]|\\.)*)'/g,
  /(?<![\w.$])(?:t|msg|i18n\.t)\(\s*"((?:[^"\\\n]|\\.)*)"/g,
  /(?<![\w.$])(?:t|msg|i18n\.t)\(\s*`((?:[^`\\$]|\\.)*)`/g,
  /i18nKey="((?:[^"\\]|\\.)*)"/g,
  /i18nKey=\{'((?:[^'\\]|\\.)*)'\}/g,
];

const unescape = (s) =>
  s.replace(
    /\\(.)/g,
    (_, c) => ({ n: '\n', t: '\t', "'": "'", '"': '"', '`': '`', '\\': '\\' })[c] ?? c,
  );

function extract() {
  const usage = new Map(); // key -> Set(ns)
  for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const ns = nsFor(rel);
    const src = readFileSync(file, 'utf8');
    for (const re of PATTERNS) {
      for (const m of src.matchAll(re)) {
        const key = unescape(m[1]);
        if (!key.trim()) continue;
        if (!usage.has(key)) usage.set(key, new Set());
        usage.get(key).add(ns);
      }
    }
  }
  const catalogue = Object.fromEntries(NAMESPACES.map((n) => [n, {}]));
  for (const [key, set] of usage) {
    const ns = set.size === 1 ? [...set][0] : 'common';
    catalogue[ns][key] = key;
  }
  for (const ns of NAMESPACES) {
    const sorted = Object.fromEntries(
      Object.entries(catalogue[ns]).sort(([a], [b]) => a.localeCompare(b, 'en')),
    );
    writeFileSync(
      join(ROOT, 'locales', 'en', `${ns}.json`),
      `${JSON.stringify(sorted, null, 2)}\n`,
    );
  }
  return catalogue;
}

function readUrdu() {
  const files = {};
  for (const ns of NAMESPACES) {
    files[ns] = JSON.parse(readFileSync(join(ROOT, 'locales', 'ur', `${ns}.json`), 'utf8'));
  }
  return files;
}

const cmd = process.argv[2] ?? 'check';
const catalogue = extract();
const total = NAMESPACES.reduce((n, ns) => n + Object.keys(catalogue[ns]).length, 0);
console.log(`English catalogue: ${total} keys written to src/locales/en/`);

if (cmd === 'check' || cmd === 'sort') {
  const ur = readUrdu();
  const urAll = Object.assign({}, ...NAMESPACES.map((ns) => ur[ns]));
  const enAll = Object.assign({}, ...NAMESPACES.map((ns) => catalogue[ns]));

  if (cmd === 'sort') {
    const next = Object.fromEntries(NAMESPACES.map((n) => [n, {}]));
    for (const ns of NAMESPACES) {
      for (const [key, value] of Object.entries(ur[ns])) {
        const target = NAMESPACES.find((n) => key in catalogue[n]) ?? ns;
        next[target][key] = value;
      }
    }
    for (const ns of NAMESPACES) {
      const sorted = Object.fromEntries(
        Object.entries(next[ns]).sort(([a], [b]) => a.localeCompare(b, 'en')),
      );
      writeFileSync(
        join(ROOT, 'locales', 'ur', `${ns}.json`),
        `${JSON.stringify(sorted, null, 2)}\n`,
      );
    }
    console.log('Urdu files re-sorted into the namespaces of their keys.');
  }

  const missing = Object.keys(enAll).filter((k) => !(k in urAll));
  const unused = Object.keys(urAll).filter((k) => !(k in enAll));
  if (unused.length)
    console.log(`Urdu keys not used in the source (${unused.length}):\n  ${unused.join('\n  ')}`);
  if (missing.length) {
    console.log(`Missing Urdu translations (${missing.length}):`);
    for (const k of missing) {
      const ns = NAMESPACES.find((n) => k in catalogue[n]);
      console.log(`  [${ns}] ${k}`);
    }
    process.exit(1);
  }
  console.log('Every key has an Urdu translation.');
}
