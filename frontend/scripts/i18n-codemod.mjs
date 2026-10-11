#!/usr/bin/env node
/**
 * One-off codemod for the UX upgrade (Phase B): wraps user-facing English in JSX with t().
 *   node scripts/i18n-codemod.mjs [--dry] <file or dir>...
 *
 * - JSX text "Save changes"            -> {t('Save changes')}
 * - Text mixed with {expressions}       -> one key with interpolation: {t('Step {{n}} of {{total}}', { n, total })}
 * - label="..." / title / placeholder / aria-label / description / hint / alt ... -> attr={t('...')}
 * - toast.success('...') and friends    -> toast.success(t('...'))
 * Adds `const { t } = useTranslation();` to the enclosing component and the import. Anything it cannot do safely
 * (text interleaved with elements, JSX outside a component) is listed for manual work. Edits are applied as text
 * splices, so formatting is kept; run Prettier on the changed files afterwards.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const targets = args.filter((a) => !a.startsWith('--'));

const ATTRS = new Set([
  'label',
  'title',
  'description',
  'placeholder',
  'aria-label',
  'hint',
  'alt',
  'emptyTitle',
  'emptyDescription',
  'confirmLabel',
  'cancelLabel',
  'subtitle',
  'heading',
  'message',
  'caption',
  'actionLabel',
  'loadingLabel',
  'emptyText',
  'empty',
  'note',
]);
const TOAST = /^(success|error|info|warning|message)$/;
const hasWords = (s) => /[A-Za-z]{2,}/.test(s);
/** Brand and code-like text that must stay as is. */
const KEEP = (s) =>
  /^(DigitalAdaalat|PKR|UCN|CNIC|PDF|OK|GPS|ID|URL|HMAC|SHA-256|JaaS|Jitsi|Excel|A[−+-]?)$/.test(
    s,
  ) ||
  /^[A-Z0-9_-]+$/.test(s) ||
  /^https?:/.test(s);

function files(p, out = []) {
  if (statSync(p).isDirectory()) {
    for (const n of readdirSync(p)) files(join(p, n), out);
  } else if (/\.tsx$/.test(p) && !/\.test\.tsx$/.test(p)) out.push(p);
  return out;
}

const isComponentName = (n) => /^[A-Z]/.test(n);

/** Nearest enclosing function that is a React component (PascalCase name, or forwardRef/memo callback). */
function componentOf(node) {
  let cur = node.parent;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) && cur.name && isComponentName(cur.name.text)) return cur;
    if (
      ts.isFunctionDeclaration(cur) &&
      !cur.name &&
      cur.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
    )
      return cur;
    if ((ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) && cur.parent) {
      const p = cur.parent;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && isComponentName(p.name.text))
        return cur;
      if (ts.isCallExpression(p)) {
        const callee = p.expression.getText();
        if (/forwardRef|memo$/.test(callee)) return cur;
        // const X = lazy(...) etc. are not components
      }
    }
    cur = cur.parent;
  }
  return null;
}

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function varName(expr, used) {
  let base = 'value';
  if (ts.isIdentifier(expr)) base = expr.text;
  else if (ts.isPropertyAccessExpression(expr)) base = expr.name.text;
  else if (ts.isCallExpression(expr)) {
    const c = expr.expression;
    base = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : 'value';
    if (/^format/.test(base))
      base = base.replace(/^format/, '').replace(/^./, (x) => x.toLowerCase()) || 'value';
  } else if (ts.isElementAccessExpression(expr)) base = 'item';
  base = base.replace(/[^A-Za-z0-9_]/g, '') || 'value';
  let name = base;
  let i = 2;
  while (used.has(name)) name = `${base}${i++}`;
  used.add(name);
  return name;
}

const report = [];
let changedFiles = 0;

for (const file of targets.flatMap((t) => files(t))) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = []; // {start, end, text}
  const needT = new Set(); // component function nodes
  const handledChildren = new Set();

  /** First non-whitespace position of a child (JsxText positions are computed from the raw source). */
  const textStart = (n) => {
    if (!ts.isJsxText(n)) return n.getStart(sf);
    const raw = src.slice(n.pos, n.end);
    return n.pos + (raw.length - raw.trimStart().length);
  };
  const textEnd = (n) => {
    if (!ts.isJsxText(n)) return n.getEnd();
    const raw = src.slice(n.pos, n.end);
    return n.end - (raw.length - raw.trimEnd().length);
  };

  const addEdit = (node, start, end, text) => {
    const comp = componentOf(node);
    if (!comp) {
      report.push(
        `${file}:${sf.getLineAndCharacterOfPosition(start).line + 1} outside a component: ${src.slice(start, end).trim().slice(0, 60)}`,
      );
      return;
    }
    needT.add(comp);
    edits.push({ start, end, text });
  };

  function visit(node) {
    // Mixed children: text plus {expr} (no elements) -> one interpolated key.
    if (ts.isJsxElement(node)) {
      const meaningful = (c) => !(ts.isJsxText(c) && !c.text.trim());
      const isElem = (c) =>
        ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxFragment(c);
      /** Decorative icon: a self-closing element (lucide icons and the like). */
      const isIcon = (c) => ts.isJsxSelfClosingElement(c);
      const kids = node.children.filter(meaningful);
      // The run of text and {expr} children between leading and trailing icons.
      let a = 0;
      let b = kids.length - 1;
      while (a <= b && isIcon(kids[a])) a++;
      while (b >= a && isIcon(kids[b])) b--;
      const run = kids.slice(a, b + 1);
      const texts = run.filter((c) => ts.isJsxText(c));
      const exprs = run.filter((c) => ts.isJsxExpression(c) && c.expression);
      const elems = run.filter(isElem);
      const textHasWords = texts.some((c) => hasWords(c.text));
      const hasJsxInside = exprs.some((e) => {
        let found = false;
        const walk = (n) => {
          if (isElem(n)) found = true;
          ts.forEachChild(n, walk);
        };
        walk(e.expression);
        return found;
      });
      const alreadyT = exprs.some((e) => /\bt\(/.test(e.expression.getText(sf)));
      if (textHasWords && exprs.length && !elems.length && !hasJsxInside && !alreadyT) {
        const used = new Set();
        const params = [];
        let key = '';
        for (const c of run) {
          if (ts.isJsxText(c)) key += c.text.replace(/\s+/g, ' ');
          else if (ts.isJsxExpression(c) && c.expression) {
            if (ts.isStringLiteral(c.expression)) {
              key += c.expression.text;
              continue;
            }
            const exprText = c.expression.getText(sf);
            const name = varName(c.expression, used);
            params.push(name === exprText ? name : `${name}: ${exprText}`);
            key += `{{${name}}}`;
          }
        }
        key = key.replace(/\s+/g, ' ').trim();
        const first = run[0];
        const last = run[run.length - 1];
        addEdit(node, textStart(first), textEnd(last), `{t(${q(key)}, { ${params.join(', ')} })}`);
        run.forEach((c) => handledChildren.add(c));
        ts.forEachChild(node.openingElement, visit);
        kids
          .slice(0, a)
          .concat(kids.slice(b + 1))
          .forEach((c) => visit(c));
        return;
      }
      const wordTexts = texts.filter((c) => hasWords(c.text));
      if (
        (wordTexts.length >= 2 && elems.length) ||
        (wordTexts.length && elems.length && exprs.length)
      ) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        report.push(
          `${file}:${line} text mixed with elements (manual / <Trans>): ${node.getText(sf).replace(/\s+/g, ' ').slice(0, 110)}`,
        );
      }
    }

    if (ts.isJsxText(node) && !handledChildren.has(node)) {
      const raw = node.text;
      const trimmed = raw.replace(/\s+/g, ' ').trim();
      if (trimmed && hasWords(trimmed) && !KEEP(trimmed)) {
        addEdit(node, textStart(node), textEnd(node), `{t(${q(trimmed)})}`);
      }
    }

    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sf);
      const value = node.initializer.text;
      if (ATTRS.has(name) && hasWords(value) && !KEEP(value) && !/^[a-z0-9-]+$/.test(value)) {
        addEdit(node, node.initializer.getStart(sf), node.initializer.getEnd(), `{t(${q(value)})}`);
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(sf) === 'toast' &&
      TOAST.test(node.expression.name.text) &&
      node.arguments[0] &&
      (ts.isStringLiteral(node.arguments[0]) ||
        ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
    ) {
      const arg = node.arguments[0];
      if (hasWords(arg.text)) addEdit(node, arg.getStart(sf), arg.getEnd(), `t(${q(arg.text)})`);
    }

    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (!edits.length) continue;

  // Insert `const { t } = useTranslation();` into each component that lacks a t in scope.
  for (const comp of needT) {
    const body = comp.body;
    const bodyText = body.getText(sf);
    if (/const \{[^}]*\bt\b[^}]*\} = useTranslation\(/.test(bodyText)) continue;
    if (ts.isBlock(body)) {
      const at = body.getStart(sf) + 1;
      edits.push({ start: at, end: at, text: `\n  const { t } = useTranslation();` });
    } else {
      // Expression body: (props) => (<jsx/>)  ->  (props) => { const { t } = ...; return (<jsx/>); }
      edits.push({
        start: body.getStart(sf),
        end: body.getStart(sf),
        text: '{\n  const { t } = useTranslation();\n  return ',
      });
      edits.push({ start: body.getEnd(), end: body.getEnd(), text: ';\n}' });
    }
  }

  let out = src;
  const sorted = edits.sort((a, b) => b.start - a.start || b.end - a.end);
  // Drop overlapping edits (keep the outermost, which comes first for equal starts).
  let lastStart = Infinity;
  for (const e of sorted) {
    if (e.end > lastStart && e.start !== e.end) continue;
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    if (e.start !== e.end) lastStart = e.start;
  }
  if (!/from 'react-i18next'/.test(out)) {
    const imports = [...out.matchAll(/^import .*?;\s*$/gms)];
    const lastImport = imports.at(-1);
    const pos = lastImport ? lastImport.index + lastImport[0].length : 0;
    out = `${out.slice(0, pos)}import { useTranslation } from 'react-i18next';\n${out.slice(pos)}`;
  } else if (
    !/useTranslation/.test(out.match(/import \{([^}]*)\} from 'react-i18next'/)?.[1] ?? '')
  ) {
    out = out.replace(
      /import \{([^}]*)\} from 'react-i18next'/,
      (_m, names) => `import {${names.trimEnd()}, useTranslation } from 'react-i18next'`,
    );
  }
  changedFiles++;
  if (!dry) writeFileSync(file, out);
}

console.log(`${dry ? '[dry] ' : ''}${changedFiles} files changed`);
if (report.length) console.log(`\nManual follow-up (${report.length}):\n${report.join('\n')}`);
