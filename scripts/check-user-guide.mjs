/**
 * Checks the user guide against the interface's code (lab 6 step 10, SMS-64).
 *
 * `docs/user-guide.md` writes every on-screen label in **bold** and every
 * message the interface shows in *italics*. This script collects both and
 * looks for each, as written, among the string literals of `src/web/` — the
 * only place the interface's text comes from (REQ-NF-003). A label that is not
 * there is a guide that describes a screen that does not exist.
 *
 * Exceptions are explicit: words in bold that name a concept rather than a
 * label (`appointment`, `master`, …), the status values the interface renders
 * from the contract's enums, and quoted examples marked in `NOT_LABELS`.
 *
 * Usage: node scripts/check-user-guide.mjs [--verbose]
 * Exit codes: 0 every label found, 1 a label is missing.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const GUIDE = 'docs/user-guide.md';
const WEB = 'src/web';

/** Bold or italic text in the guide that is not an on-screen string, with the reason. */
const NOT_LABELS = new Map([
  ['Everywhere:', "the guide's own emphasis"],
  ['bold', "the guide's header explaining its convention"],
  ['appointment', 'a concept, defined in §1'],
  ['master', 'a concept, defined in §1'],
  ['administrator', 'a concept, defined in §1'],
  ["Keep the page's address.", "the guide's own advice"],
  ['No SMS is actually sent.', "the guide's own heading of a limit"],
  ['No online payment.', "the guide's own heading of a limit"],
  ['No client accounts and no password reset.', "the guide's own heading of a limit"],
  ['Date fields', "the guide's own heading of a limit"],
  ['The staff dashboard', "the guide's own heading of a limit"],
  ['Custom range', 'the option of the Period select, written in italics as a value'],
  ['Total:', 'the start of a rendered line `Total: … UAH`'],
  ['Payments:', 'the start of a rendered line `Payments: n`'],
  ['In stock: 15 ml', 'an example of the rendered line `In stock: <n> <unit>`'],
  ['failed', 'a reserved status the interface never shows (CL-13)'],
]);

/** Every string literal of the interface's TypeScript and HTML. */
function interfaceStrings() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|html)$/.test(entry.name)) files.push(path);
    }
  };
  walk(WEB);
  // Comments are removed first: a word in a comment is not on the screen.
  const text = files
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const literals = new Set();
  for (const match of text.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`|>([^<>{}\n]+)</g)) {
    const value = (match[1] ?? match[2] ?? match[3] ?? '').replace(/\\'/g, "'").trim();
    if (value !== '') literals.add(value);
  }
  return literals;
}

const guide = readFileSync(GUIDE, 'utf8');
const literals = [...interfaceStrings()];
const verbose = process.argv.includes('--verbose');

const items = [];
for (const match of guide.matchAll(/\*\*([^*]+)\*\*|(?<![*\w])\*([^*\n]+)\*(?![*\w])/g)) {
  const value = (match[1] ?? match[2]).trim();
  items.push({ value, kind: match[1] === undefined ? 'message' : 'label' });
}

let missing = 0;
const seen = new Set();
for (const { value, kind } of items) {
  if (seen.has(value)) continue;
  seen.add(value);
  if (NOT_LABELS.has(value)) {
    if (verbose) console.log(`  skip  ${value} — ${NOT_LABELS.get(value)}`);
    continue;
  }
  // A label is a literal of its own, or part of one (`Total duration: ${…}`).
  const found = literals.some((literal) => literal.includes(value));
  if (!found) missing += 1;
  if (!found || verbose) console.log(`  ${found ? 'ok   ' : 'MISSING'} ${kind}: ${value}`);
}

console.log(
  `check-user-guide: ${seen.size} distinct bold/italic items, ${missing} not found in ${WEB}/.`,
);
process.exit(missing === 0 ? 0 : 1);
