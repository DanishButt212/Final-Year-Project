#!/usr/bin/env node
/**
 * One-off codemod for the UX upgrade (Phase B), second pass: wraps the string and template literals that
 * scripts/i18n-ast.mjs reports.
 *  - inside a component or hook body: 'Text' -> t('Text'); `Hi ${name}` -> t('Hi {{name}}', { name })
 *    (a JSX attribute label="Text" becomes label={t('Text')})
 *  - at module level, or in a default parameter: 'Text' -> msg('Text') (translated where it is shown)
 * Module-level template literals and remaining JSX text are listed for manual work.
 *   node scripts/i18n-literals.mjs [--dry] <paths...>
 */
import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import ts from 'typescript';
import { ROOT, scanFile, sourceFiles } from './i18n-ast.mjs';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const targets = args.filter((a) => !a.startsWith('--'));

const isComponentName = (n) => /^[A-Z]/.test(n) || /^use[A-Z]/.test(n);

function componentOf(node) {
  for (let cur = node.parent; cur; cur = cur.parent) {
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
      if (ts.isCallExpression(p) && /forwardRef|memo$/.test(p.expression.getText())) return cur;
    }
  }
  return null;
}

/** True when the node sits in the parameter list (default values) rather than the body. */
const inParameters = (node, fn) =>
  fn.parameters.some((prm) => node.pos >= prm.pos && node.end <= prm.end);

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

function varName(expr, used) {
  let base = 'value';
  if (ts.isIdentifier(expr)) base = expr.text;
  else if (ts.isPropertyAccessExpression(expr)) base = expr.name.text;
  else if (ts.isCallExpression(expr)) {
    const c = expr.expression;
    base = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : 'value';
    if (/^format/.test(base))
      base = base.replace(/^format/, '').replace(/^./, (x) => x.toLowerCase()) || 'value';
  }
  base = base.replace(/[^A-Za-z0-9_]/g, '') || 'value';
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base}${i}`;
  used.add(name);
  return name;
}

const manual = [];
let changed = 0;
for (const file of sourceFiles(targets)) {
  const found = scanFile(file);
  if (!found.length) continue;
  const { src, sf } = found[0];
  const edits = [];
  const needT = new Set();
  let needMsg = false;

  for (const f of found) {
    const { node } = f;
    if (f.kind === 'jsx') {
      manual.push(`${relative(ROOT, file)}:${f.line} JSX text: ${f.text.slice(0, 80)}`);
      continue;
    }
    const comp = componentOf(node);
    const useT = comp && !inParameters(node, comp);
    const parentAttr = ts.isJsxAttribute(node.parent) ? node.parent : null;
    if (f.kind === 'literal') {
      const call = useT ? `t(${q(node.text)})` : `msg(${q(node.text)})`;
      edits.push({
        start: node.getStart(sf),
        end: node.getEnd(),
        text: parentAttr ? `{${call}}` : call,
      });
      if (useT) needT.add(comp);
      else needMsg = true;
    } else if (f.kind === 'template') {
      if (!useT) {
        manual.push(
          `${relative(ROOT, file)}:${f.line} module-level template: ${f.text.slice(0, 80)}`,
        );
        continue;
      }
      const used = new Set();
      const params = [];
      let key = node.head.text;
      for (const span of node.templateSpans) {
        const exprText = span.expression.getText(sf);
        const name = varName(span.expression, used);
        params.push(name === exprText ? name : `${name}: ${exprText}`);
        key += `{{${name}}}${span.literal.text}`;
      }
      const call = `t(${q(key)}, { ${params.join(', ')} })`;
      edits.push({
        start: node.getStart(sf),
        end: node.getEnd(),
        text: parentAttr ? `{${call}}` : call,
      });
      needT.add(comp);
    }
  }

  for (const comp of needT) {
    const body = comp.body;
    if (/const \{[^}]*\bt\b[^}]*\} = useTranslation\(/.test(body.getText(sf))) continue;
    if (ts.isBlock(body)) {
      const at = body.getStart(sf) + 1;
      edits.push({ start: at, end: at, text: '\n  const { t } = useTranslation();' });
    } else {
      edits.push({
        start: body.getStart(sf),
        end: body.getStart(sf),
        text: '{\n  const { t } = useTranslation();\n  return ',
      });
      edits.push({ start: body.getEnd(), end: body.getEnd(), text: ';\n}' });
    }
  }
  if (!edits.length) continue;

  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  const addImport = (line) => {
    const imports = [...out.matchAll(/^import [\s\S]*?;\s*$/gm)];
    const last = imports.at(-1);
    const pos = last ? last.index + last[0].length : 0;
    out = `${out.slice(0, pos)}${pos ? '\n' : ''}${line}\n${out.slice(pos)}`.replace(
      /\n\n(import )/,
      '\n$1',
    );
  };
  if (needT.size && !/useTranslation[^;]*from 'react-i18next'/.test(out)) {
    if (/from 'react-i18next'/.test(out)) {
      out = out.replace(
        /import \{([^}]*)\} from 'react-i18next'/,
        (_m, n) => `import {${n.trimEnd()}, useTranslation } from 'react-i18next'`,
      );
    } else addImport(`import { useTranslation } from 'react-i18next';`);
  }
  if (needMsg && !/import \{[^}]*\bmsg\b[^}]*\} from '@\/i18n'/.test(out)) {
    if (/from '@\/i18n'/.test(out)) {
      out = out.replace(
        /import (\w+, )?\{([^}]*)\} from '@\/i18n'/,
        (_m, d, n) => `import ${d ?? ''}{${n.trimEnd()}, msg } from '@/i18n'`,
      );
    } else addImport(`import { msg } from '@/i18n';`);
  }
  changed++;
  if (!dry) writeFileSync(file, out);
}
console.log(`${dry ? '[dry] ' : ''}${changed} files changed`);
if (manual.length) console.log(`\nManual follow-up (${manual.length}):\n${manual.join('\n')}`);
