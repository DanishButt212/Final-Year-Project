#!/usr/bin/env node
/**
 * Lists the user-facing English messages the API can send (exception messages, validation messages,
 * response messages, case-event and notification templates), so the frontend's central map
 * (src/lib/server-messages.ts) can register them for translation.
 *   node scripts/server-messages.mjs            prints static messages missing from server-messages.ts
 *   node scripts/server-messages.mjs --dynamic  prints template literals with ${...} (need a pattern)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const BACKEND = join(import.meta.dirname, '..', '..', 'backend', 'src');
const MAP = join(import.meta.dirname, '..', 'src', 'lib', 'server-messages.catalog.ts');
const dynamic = process.argv.includes('--dynamic');

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n === 'generated') continue;
      walk(p, out);
    } else if (n.endsWith('.ts') && !n.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

/** Context in which a literal is user-facing. */
function userFacing(node) {
  for (let p = node.parent, depth = 0; p && depth < 6; p = p.parent, depth++) {
    if (ts.isPropertyAssignment(p)) {
      const name = p.name.getText();
      if (/^(message|messages|title|body|description|reason|detail|label)$/.test(name)) return true;
      if (/^(metadata|where|select|data|include|orderBy)$/.test(name)) return false;
    }
    if (ts.isVariableDeclaration(p) && /MESSAGE|_TEXT|_BODY|NOTE|LABEL/.test(p.name.getText()))
      return true;
    if (ts.isNewExpression(p) && /Exception$/.test(p.expression.getText())) return true;
    if (ts.isCallExpression(p)) {
      const callee = p.expression.getText();
      if (/^(bad|conflict|notFound|forbidden|badRequest|fail|unprocessable)$/.test(callee))
        return true;
      if (/logger|Logger|console|log$|warn$|error$|debug$/.test(callee)) return false;
      if (/notice$/.test(callee)) return true;
    }
    if (ts.isDecorator(p)) return true; // class-validator { message }
    if (
      ts.isArrayLiteralExpression(p) &&
      ts.isPropertyAssignment(p.parent) &&
      p.parent.name.getText() === 'messages'
    )
      return true;
  }
  return false;
}

/** API strings that never reach the web UI (developer docs, PDF-only titles, internal errors). */
const NOT_UI = /^(JSON:|Send "mobile"|GCM authentication|Audit Trail$|Judicial Performance Report$)/;
const statics = new Set();
const dyn = new Set();
for (const f of walk(BACKEND)) {
  const src = readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      /^[A-Z{]/.test(node.text) &&
      /\s/.test(node.text)
    ) {
      if (userFacing(node) && node.text.length >= 6 && !NOT_UI.test(node.text)) statics.add(node.text);
    } else if (ts.isTemplateExpression(node) && userFacing(node)) {
      dyn.add(`${f.slice(BACKEND.length + 1)}: ${node.getText(sf).slice(0, 160)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (dynamic) {
  console.log([...dyn].sort().join('\n'));
} else {
  let known = '';
  try {
    known = readFileSync(MAP, 'utf8');
  } catch {
    // map not written yet
  }
  const missing = [...statics].filter(
    (s) => !known.includes(JSON.stringify(s).slice(1, -1)) && !known.includes(s),
  );
  console.log(
    missing
      .sort()
      .map((s) => JSON.stringify(s))
      .join('\n'),
  );
  console.error(`${statics.size} static messages, ${missing.length} not in server-messages.ts`);
}
