#!/usr/bin/env node
/**
 * Lists user-facing English that is not translated (see scripts/i18n-ast.mjs for the rules).
 *   node scripts/i18n-lint.mjs [paths...]   (default: src)       exit 1 when anything is found
 */
import { relative } from 'node:path';
import { ROOT, scanFile, sourceFiles } from './i18n-ast.mjs';

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['src'];
const found = sourceFiles(targets).flatMap((f) => scanFile(f));
for (const x of found) {
  console.log(
    `${relative(ROOT, x.sf.fileName)}:${x.line}  ${x.text.replace(/\s+/g, ' ').slice(0, 100)}`,
  );
}
console.error(`${found.length} possibly untranslated strings`);
process.exit(found.length ? 1 : 0);
