/**
 * Shared detection for the i18n linter and literal codemod: user-facing English (string literals, template
 * literals and JSX text with words) that is not inside t(), msg(), i18n.t() or a translate helper, and not in a
 * technical position (class names, routes, ids, query keys, codes...). Lines can opt out with `i18n-ignore`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const ROOT = join(import.meta.dirname, '..');

const SKIP_DIRS = new Set(['locales', 'test', 'generated']);
function files(p, out = []) {
  const full = join(ROOT, p);
  if (statSync(full).isDirectory()) {
    for (const n of readdirSync(full)) if (!SKIP_DIRS.has(n)) files(join(p, n), out);
  } else if (/\.(ts|tsx)$/.test(p) && !/\.test\.(ts|tsx)$/.test(p) && !/\.d\.ts$/.test(p))
    out.push(full);
  return out;
}

const TECH_ATTRS = new Set([
  'className',
  'to',
  'href',
  'id',
  'type',
  'key',
  'variant',
  'size',
  'role',
  'name',
  'autoComplete',
  'inputMode',
  'method',
  'rel',
  'target',
  'dir',
  'lang',
  'src',
  'accept',
  'htmlFor',
  'form',
  'aria-controls',
  'aria-describedby',
  'aria-labelledby',
  'aria-current',
  'aria-live',
  'aria-haspopup',
  'pattern',
  'data-testid',
  'data-tour',
  'side',
  'align',
  'enterKeyHint',
  'autoCapitalize',
  'headingId',
  'tone',
  'icon',
  'value',
  'defaultValue',
  'download',
  'feature',
  'portal',
  'path',
  'mode',
  'kind',
  'status',
  'as',
  'titleAs',
  'fill',
  'stroke',
  'd',
  'viewBox',
  'transform',
  'fontFamily',
  'textAnchor',
  'dataKey',
  'layout',
  'orientation',
  'stackId',
  'loading',
  'decoding',
  'hintId',
  'i18nKey',
  'defaults',
  'color',
]);
const TECH_KEYS =
  /^(queryKey|className|to|href|path|slug|key|id|variant|code|role|method|url|mimeType|accept|format|dataKey|tz|timeZone|locale|channel|pattern|icon|feature|cls|box|badge|bar)$/;
const TRANSLATE_CALLS = /^(t|msg|i18n\.t|translateServerMessage|translateNotice)$/;

const hasWords = (s) => /[A-Za-z]{2,}[^A-Za-z]+[A-Za-z]{2,}/.test(s) || /^[A-Z][a-z]{2,}/.test(s);
const looksTechnical = (s) =>
  (/^[a-z0-9_./:@?=&#%{}-]+$/i.test(s) && !/\s/.test(s) && !/^[A-Z][a-z]+$/.test(s)) ||
  /^(GET|POST|PATCH|PUT|DELETE)$/.test(s) ||
  /var\(--/.test(s) ||
  /^[A-Z0-9_]+$/.test(s) ||
  /^\/|^https?:|^mailto:|^data:|^#/.test(s) ||
  (/\b(px|rem|%)\b|^\d/.test(s) && !/\s[a-z]{3,}\s/.test(s)) ||
  /^(en|ur|ltr|rtl|en-GB|en-PK|ur-PK|Asia\/Karachi)$/.test(s) ||
  (/^[\w-]+(\s[\w:/[\]().%-]+)*$/.test(s) &&
    /(^|\s)(flex|grid|text-|bg-|border|rounded|px-|py-|p-|m-|w-|h-|size-|gap-|items-|justify-|font-|min-|max-|hidden|block|inline|sr-only|absolute|relative|space-|shadow|ring|outline|overflow|truncate|leading|tracking|sm:|md:|lg:|xl:|hover:|focus|rtl:|ltr:|aria-|disabled:)/.test(
      s,
    ));

function inTranslateCall(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const c = p.expression.getText();
      if (TRANSLATE_CALLS.test(c)) return true;
      if (
        /^(console\.|navigate|queryClient|api\.|new URL|URLSearchParams|setSearchParams|localStorage|sessionStorage|document\.|window\.|matchMedia|addEventListener|removeEventListener|setAttribute|querySelector|cn|clsx|cva|import|require|lazy|z\.|format|Intl\.|toLocaleString|fetch|useQuery|useMutation|invalidateQueries|setQueryData|getQueryData|createElement)/.test(
          c,
        )
      )
        return true;
    }
    if (ts.isJsxAttribute(p)) {
      const n = p.name.getText();
      if (TECH_ATTRS.has(n) || n.startsWith('data-')) return true;
      return false;
    }
    if (ts.isPropertyAssignment(p) && TECH_KEYS.test(p.name.getText())) return true;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
    if (
      ts.isTypeNode?.(p) ||
      ts.isLiteralTypeNode(p) ||
      ts.isTypeAliasDeclaration(p) ||
      ts.isInterfaceDeclaration(p)
    )
      return true;
    if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
    if (ts.isCaseClause(p) && p.expression === node) return true;
    if (ts.isBinaryExpression(p) && /^(===|!==|==|!=)$/.test(p.operatorToken.getText()))
      return true;
    if (ts.isPropertyAccessExpression(p)) return false;
  }
  return false;
}

/**
 * Untranslated user-facing strings in one file: { node, sf, src, kind: 'jsx' | 'literal' | 'template', text, line }.
 * Lines marked `i18n-ignore` (on the line or the line above) are skipped.
 */
export function scanFile(file) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split(String.fromCharCode(10));
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found = [];
  const report = (node, kind, text) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    if (/i18n-ignore/.test(lines[line]) || /i18n-ignore/.test(lines[line - 1] ?? '')) return;
    found.push({ node, sf, src, kind, text, line: line + 1 });
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const s = node.text.trim();
      if (s && hasWords(s)) report(node, 'jsx', s);
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const s = node.text;
      if (hasWords(s) && !looksTechnical(s) && !inTranslateCall(node)) report(node, 'literal', s);
    } else if (ts.isTemplateExpression(node)) {
      const s = [node.head.text, ...node.templateSpans.map((x) => x.literal.text)].join(' ');
      if (hasWords(s) && !looksTechnical(s.trim()) && !inTranslateCall(node))
        report(node, 'template', node.getText(sf));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

export function sourceFiles(targets) {
  return targets.flatMap((t) => files(t));
}

export { ROOT };
