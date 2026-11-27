/**
 * Creates GitHub issues SMS-<from> … SMS-<to> from `docs/issue-import.csv`.
 *
 *   node scripts/create-issues.mjs 77 77
 *
 * The tracker's rule is "issue #N = SMS-N" (`docs/ticket-list.md`), so the
 * issues are created in order and the script stops at the first one whose
 * number differs from its SMS number. Labels follow the CSV: the type, the
 * role, and the status unless the row is Done. Needs `gh`, signed in.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TYPE = {
  Specification: 'type: specification',
  Addendum: 'type: addendum',
  Test: 'type: test',
  Feature: 'type: feature',
  Refactoring: 'type: feature',
  Verification: 'type: verification',
  Validation: 'type: validation',
  Documentation: 'type: documentation',
  Gate: 'type: gate',
};
const ROLE = { 'Coding Agent': 'role: coding agent', Human: 'role: human', Joint: 'role: joint' };
const STATUS = { Backlog: 'status: backlog', 'In progress': 'status: in progress' };

/** Parses the CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) rows.push([...row, field]);
  return rows;
}

const [from, to] = process.argv.slice(2).map(Number);
if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) {
  process.stderr.write('Usage: node scripts/create-issues.mjs <from> <to>\n');
  process.exit(2);
}

const rows = parseCsv(readFileSync('docs/issue-import.csv', 'utf8'))
  .slice(1)
  .filter((row) => row[0]);
for (let n = from; n <= to; n += 1) {
  const row = rows.find((candidate) => candidate[0] === `SMS-${n}`);
  if (row === undefined) throw new Error(`SMS-${n} is not in docs/issue-import.csv`);
  const [id, summary, type, state, role, source, deps, description] = row;
  const blocked = deps
    .split(/\s+/)
    .filter(Boolean)
    .map((dep) => `#${dep.replace('SMS-', '')}`);
  const body = [
    description,
    '',
    `Source: ${source}`,
    blocked.length > 0 ? `Blocked by ${blocked.join(', ')}.` : 'Blocked by: none.',
  ].join('\n');
  const labels = [TYPE[type], ROLE[role], state === 'Done' ? null : STATUS[state]].filter(
    (label) => label !== null,
  );
  if (labels.some((label) => label === undefined))
    throw new Error(`${id}: unknown type, role or state`);
  const args = ['issue', 'create', '--title', `${id}: ${summary}`, '--body', body];
  for (const label of labels) args.push('--label', label);
  const url = execFileSync('gh', args, { encoding: 'utf8' }).trim();
  const number = Number(url.split('/').pop());
  if (number !== n) throw new Error(`STOP: ${id} became issue #${number} (${url})`);
  console.log(`${id} -> #${number} [${labels.join(', ')}]`);
}
