/**
 * Builds the traceability matrix from the project's own artifacts, and audits
 * it (lab 6 steps 11–12, SMS-65).
 *
 *   node scripts/traceability.mjs          # writes spec/traceability-matrix.md
 *   node scripts/traceability.mjs --check  # the same, and exits 1 on an open finding
 *
 * Every cell is derived, so the matrix cannot drift from what it describes:
 *
 *   requirement, criterion, scenario, first ticket — the SRS v1.3 §8 matrix and addendum 001
 *   tickets      — that matrix, `docs/ticket-list.md` (coverage table), and the
 *                  `Ticket:` line of each test that cites the requirement
 *   tests        — test files whose header comment cites the requirement
 *   code         — the module registering each operation `resource-model.md` §5
 *                  traces to the requirement, and source files whose header cites it
 *   interface    — screens of `spec/ui/screens.md` whose Requirements cite it
 *   documentation — the user-guide section of each of those screens, the API
 *                  reference for each operation, and the explicit entries of `DOCS`
 *
 * The audit reports: a requirement with an empty cell and no recorded reason;
 * requirement ids cited anywhere that the SRS does not define; test files that
 * cite no requirement or scenario; tickets, scenarios, screens or user-guide
 * sections the matrix names that do not exist.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRS = 'spec/salon-management-system-srs-v1.3.tex';
const ADDENDA = 'spec/addenda';
const RESOURCE_MODEL = 'spec/api/resource-model.md';
const SCREENS = 'spec/ui/screens.md';
const GUIDE = 'docs/user-guide.md';
const TICKETS = 'docs/ticket-list.md';
const VALIDATION_CHECKLIST = 'logs/validation/checklist.md';
const OUT = 'spec/traceability-matrix.md';

/** The user-guide section that documents each screen. */
const GUIDE_SECTION = {
  C1: '2.1',
  C2: '2.2',
  C3: '2.3',
  S1: '3',
  M1: '4.1',
  M2: '4.2',
  M3: '4.3',
  N1: '4.4',
  N2: '4.4',
  A1: '5.2',
  A2: '5.2',
  A3: '5.3',
  A4: '5.4',
  A5: '5.4',
  A6: '5.4',
  A7: '5.5',
  A8: '5.5',
  A9: '5.6',
};

/**
 * Documentation for requirements no screen shows (`screens.md` §7) and for
 * constraints: where a reader finds them. Checked to exist like any other cell.
 */
const DOCS = {
  'REQ-F-005': ['user guide §2.1 (keep the page’s address), §6'],
  'REQ-F-009': ['user guide §5.3 (Notifications)'],
  'REQ-F-008': ['user guide §5.3 (Reminders)'],
  'REQ-F-010': ['user guide §5.3 (Reminders)'],
  'REQ-F-011': ['user guide §5.3 (Reminders)'],
  'REQ-F-029': ['user guide §5.3 (Reminders)'],
  'REQ-F-030': ['user guide §5.3 (Notifications)'],
  'REQ-F-034': ['user guide §5.3 (Reminders)'],
  'REQ-NF-001': ['user guide §2.1 (keep the page’s address)'],
  'REQ-NF-002': ['user guide §6', 'README “Limits”'],
  'REQ-NF-003': ['user guide (preamble)'],
  'REQ-NF-004': ['user guide (preamble)'],
  'REQ-NF-005': ['user guide §5 (preamble: never deleted)'],
  'REQ-NF-006': ['user guide §4.1'],
  'REQ-NF-007': ['user guide (preamble)', 'README “Limits”'],
  'REQ-NF-008': ['user guide §4.3'],
  'REQ-NF-009': ['user guide §6', 'README “Limits”'],
};

/**
 * Cells that are empty on purpose, with the reason. An empty cell not listed
 * here is an audit finding.
 */
const EMPTY_BY_DESIGN = {
  'REQ-NF-005': { interface: 'absence constraint: no delete control exists (screens.md §7)' },
  'REQ-NF-009': { interface: 'absence constraint: no payment gateway exists (screens.md §7)' },
};

/**
 * Test files that trace to no SRS requirement on purpose, with their source.
 * Any other test that cites no REQ or SCN is an audit finding.
 */
const TESTS_WITHOUT_REQUIREMENT = {
  'tests/api/structural.test.ts':
    'the error model and the HTTP plumbing: 404, 405, 415, malformed JSON, the Problem shape, trace ids, the log line (error-model.md §3; lab 5 task step 1, logging)',
  'tests/api/error-log.test.ts':
    'logging: the cause of an unexpected error in the log (lab 5 task step 1; finding F12, SMS-75)',
};

// ---------------------------------------------------------------------------

/** All files under `dir` with one of the extensions. */
function walk(dir, extensions) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(path, extensions);
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [path] : [];
  });
}

/** The first comment block of a file — where a module, a test or a stylesheet names its sources. */
function header(text) {
  const match = /\/\*[\s\S]*?\*\//.exec(text);
  return match === null ? '' : match[0];
}

/**
 * Requirement ids in a text, with the project's abbreviations expanded:
 * `REQ-F-010, 011` and `REQ-F-018…022` (or `–`) name every id they cover. A
 * bare number continues a list only when nothing but `,`, `;`, `and` or
 * whitespace separates it from the id or number before it — so "addendum 001"
 * or "a 200" after a requirement are not read as REQ-F-001 or REQ-F-200.
 */
function requirementIds(text) {
  const ids = new Set();
  let kind = null;
  let last = null;
  let listEnd = -1; // index just after the last token of an open list
  const pattern = /REQ-(F|NF)-(\d{3})|([…–])\s*(\d{3})|(?<![\w.-])(\d{3})(?![\w.:-])/g;
  for (const match of text.matchAll(pattern)) {
    const continues =
      listEnd >= 0 && /^(?:\s|,|;|\band\b)*$/.test(text.slice(listEnd, match.index));
    if (match[1] !== undefined) {
      kind = match[1];
      last = Number(match[2]);
      ids.add(`REQ-${kind}-${match[2]}`);
    } else if (
      match[4] !== undefined &&
      listEnd === match.index &&
      kind !== null &&
      last !== null
    ) {
      const end = Number(match[4]);
      for (let n = last + 1; n <= end && end - last < 40; n += 1) {
        ids.add(`REQ-${kind}-${String(n).padStart(3, '0')}`);
      }
      last = end;
    } else if (match[5] !== undefined && continues && kind !== null) {
      last = Number(match[5]);
      ids.add(`REQ-${kind}-${match[5]}`);
    } else {
      listEnd = -1;
      continue;
    }
    listEnd = match.index + match[0].length;
  }
  return ids;
}

const sorted = (values) => [...values].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

// --- 1. Requirements, criteria, scenarios, first tickets -------------------

const srs = readFileSync(SRS, 'utf8');
const matrixRows = srs
  .slice(srs.indexOf('\\section{Traceability Matrix}'))
  .split('\n')
  .filter((line) => /^REQ-(F|NF)-\d{3} &/.test(line));

const requirements = new Map();
for (const line of matrixRows) {
  const cells = line
    .replace(/\\\\\s*$/, '')
    .split('&')
    .map((cell) => cell.trim());
  const [id, criterion, scenario, ticket] = cells;
  requirements.set(id, {
    id,
    criterion: criterion.replace(/\$\\mp\$/g, '∓').replace(/\\/g, ''),
    scenarios: new Set(scenario.match(/SCN-\d{2}/g) ?? []),
    tickets: new Set(ticket.match(/SMS-\d+/g) ?? []),
    source: 'SRS v1.3',
  });
}

for (const file of walk(ADDENDA, ['.md'])) {
  const text = readFileSync(file, 'utf8');
  const id = /\| Requirement \| (REQ-(?:F|NF)-\d{3})/.exec(text)?.[1];
  if (id === undefined || requirements.has(id)) continue;
  const criterion = /\*AC:\*\s*([^\n]+(?:\n> [^\n]+)*)/.exec(text)?.[1] ?? '';
  requirements.set(id, {
    id,
    criterion: criterion.replace(/\n> /g, ' ').replace(/`/g, '').slice(0, 90),
    scenarios: new Set(),
    tickets: new Set(/Ticket[^|]*\|\s*(SMS-\d+)/.exec(text)?.slice(1) ?? []),
    source: file.replace('spec/addenda/', 'addendum '),
  });
}

for (const requirement of requirements.values()) {
  Object.assign(requirement, {
    tests: new Set(),
    code: new Set(),
    operations: new Set(),
    screens: new Set(),
    docs: new Set(DOCS[requirement.id] ?? []),
  });
}

// --- 2. Tickets from the coverage table ------------------------------------

const ticketList = readFileSync(TICKETS, 'utf8');
const knownTickets = new Set(
  ticketList.match(/^\| SMS-\d+ \|/gm)?.map((row) => row.slice(2, -2)) ?? [],
);
for (const row of ticketList.match(/^\| REQ-(?:F|NF)-\d{3}[^\n]*/gm) ?? []) {
  const id = /REQ-(?:F|NF)-\d{3}/.exec(row)[0];
  for (const ticket of row.match(/SMS-\d+/g) ?? []) requirements.get(id)?.tickets.add(ticket);
}

// --- 3. Tests ---------------------------------------------------------------

const testFiles = [...walk('tests', ['.test.ts', '.spec.ts'])].sort();
const testsWithoutSource = [];
for (const file of testFiles) {
  const head = header(readFileSync(file, 'utf8'));
  const ids = requirementIds(head);
  const ticket = /Ticket:\s*(SMS-\d+)/.exec(head)?.[1];
  if (ids.size === 0 && !/SCN-\d{2}/.test(head)) testsWithoutSource.push(file);
  for (const id of ids) {
    const requirement = requirements.get(id);
    if (requirement === undefined) continue;
    requirement.tests.add(file);
    if (ticket !== undefined) requirement.tickets.add(ticket);
  }
}

// --- 4. Operations and code -------------------------------------------------

const resourceModel = readFileSync(RESOURCE_MODEL, 'utf8');
const operations = [
  ...resourceModel.matchAll(
    /^\| ((?:P|A|M|R)\d+) \| (GET|POST|PUT|PATCH|DELETE) \| `([^`]+)` \| (\w+) \|.*\| ([^|]*) \|\s*$/gm,
  ),
].map((match) => ({
  id: match[1],
  method: match[2],
  path: match[3],
  name: match[4],
  reqs: requirementIds(match[5].replace(/\b(N?F)-(\d{3})/g, 'REQ-$1-$2')),
}));

const sourceFiles = walk('src', ['.ts']).filter((file) => !file.startsWith('src/web/'));
const sourceText = new Map(sourceFiles.map((file) => [file, readFileSync(file, 'utf8')]));

/** The module file that registers an operation's method and path. */
function moduleOf(operation) {
  const expressPath = operation.path.replace(/\{(\w+)\}/g, ':$1');
  const call = new RegExp(
    `\\.${operation.method.toLowerCase()}\\(\\s*'${expressPath.replace(/[/:]/g, (c) => `\\${c}`)}'`,
  );
  return sourceFiles.find((file) => call.test(sourceText.get(file) ?? ''));
}

const unregistered = [];
for (const operation of operations) {
  const module = moduleOf(operation);
  if (module === undefined) unregistered.push(operation.id);
  for (const id of operation.reqs) {
    const requirement = requirements.get(id);
    if (requirement === undefined) continue;
    requirement.operations.add(operation.id);
    if (module !== undefined) requirement.code.add(module);
  }
}
for (const file of [...sourceFiles, ...walk('src/web', ['.ts', '.css'])]) {
  for (const id of requirementIds(header(readFileSync(file, 'utf8')))) {
    requirements.get(id)?.code.add(file);
  }
}

// --- 5. Interface and documentation ----------------------------------------

const screensText = readFileSync(SCREENS, 'utf8');
const screenIds = new Set();
for (const match of screensText.matchAll(
  /^### \d\.\d (C\d) — [^\n]*\n\n\| \| \|\n\|---\|---\|\n\| Requirements \| ([^\n]+)/gm,
)) {
  screenIds.add(match[1]);
  for (const id of requirementIds(match[2])) requirements.get(id)?.screens.add(match[1]);
}
for (const match of screensText.matchAll(/^\| \*\*((?:S|M|N|A)\d) [^*]+\*\*[^|]*\| ([^|]+) \|/gm)) {
  screenIds.add(match[1]);
  for (const id of requirementIds(match[2])) requirements.get(id)?.screens.add(match[1]);
}
// §6: the cross-cutting rules hold on the client screens they name.
for (const match of screensText.matchAll(/^\| (REQ-NF-\d{3}) [a-z ]+\| ([^|]+) \|/gm)) {
  for (const screen of match[2].match(/\b[CSMNA]\d\b/g) ?? [])
    requirements.get(match[1])?.screens.add(screen);
}

const guide = readFileSync(GUIDE, 'utf8');
const guideSections = new Set(
  [...guide.matchAll(/^#{2,3} (\d+(?:\.\d+)?)\.? /gm)].map((m) => m[1]),
);
for (const requirement of requirements.values()) {
  for (const screen of requirement.screens) {
    const section = GUIDE_SECTION[screen];
    if (section !== undefined) requirement.docs.add(`user guide §${section}`);
  }
  if (requirement.operations.size > 0) requirement.docs.add('docs/api (operations)');
}

// --- 6. Audit ----------------------------------------------------------------

const findings = [];
const finding = (kind, text) => findings.push({ kind, text });

const columns = [
  ['criterion', (r) => r.criterion],
  ['scenario', (r) => r.scenarios.size],
  ['tickets', (r) => r.tickets.size],
  ['tests', (r) => r.tests.size],
  ['code', (r) => r.code.size],
  ['interface', (r) => r.screens.size],
  ['documentation', (r) => r.docs.size],
];
const scenarioOptional = (r) => r.source !== 'SRS v1.3' || r.criterion !== '';
for (const requirement of requirements.values()) {
  for (const [name, value] of columns) {
    if (value(requirement)) continue;
    if (name === 'scenario' && scenarioOptional(requirement)) continue; // SRS §8 gives a scenario only where one exists
    const reason = EMPTY_BY_DESIGN[requirement.id]?.[name];
    if (reason === undefined) finding('A1 empty cell', `${requirement.id}: no ${name}`);
  }
}

const defined = new Set(requirements.keys());
// This script names invented ids in its own comments as examples; it is not a source.
const citing = [
  ...walk('src', ['.ts']),
  ...walk('tests', ['.ts']),
  ...walk('scripts', ['.mjs']).filter((file) => !file.endsWith('traceability.mjs')),
];
const citingDocs = [
  'README.md',
  GUIDE,
  SCREENS,
  'docs/components.md',
  'spec/api/api-traceability.md',
  'spec/api/resource-model.md',
];
for (const file of [...citing, ...citingDocs]) {
  const text = readFileSync(file, 'utf8');
  for (const id of new Set(text.match(/REQ-(?:F|NF)-\d{3}/g) ?? [])) {
    if (!defined.has(id))
      finding('A2 unknown id', `${file}: ${id} is not defined by the SRS or an addendum`);
  }
}

for (const file of testsWithoutSource) {
  if (TESTS_WITHOUT_REQUIREMENT[file] === undefined) {
    finding('A3 test without a source', `${file} cites no REQ or SCN`);
  }
}

const scenarios = new Set([
  ...(srs.match(/SCN-\d{2}/g) ?? []),
  ...(existsSync(VALIDATION_CHECKLIST)
    ? (readFileSync(VALIDATION_CHECKLIST, 'utf8')
        .match(/^### (SCN-\d{2})/gm)
        ?.map((s) => s.slice(4)) ?? [])
    : []),
]);
for (const requirement of requirements.values()) {
  for (const ticket of requirement.tickets) {
    if (!knownTickets.has(ticket))
      finding('A4 unknown ticket', `${requirement.id}: ${ticket} is not in ${TICKETS}`);
  }
  for (const scenario of requirement.scenarios) {
    if (!scenarios.has(scenario)) finding('A5 unknown scenario', `${requirement.id}: ${scenario}`);
  }
  for (const screen of requirement.screens) {
    if (!screenIds.has(screen)) finding('A6 unknown screen', `${requirement.id}: ${screen}`);
  }
  for (const doc of requirement.docs) {
    const section = /§(\d+(?:\.\d+)?)/.exec(doc)?.[1];
    if (doc.startsWith('user guide §') && section !== undefined && !guideSections.has(section)) {
      finding('A6 unknown section', `${requirement.id}: ${doc}`);
    }
  }
}
for (const id of unregistered)
  finding('A7 operation without code', `${id} is registered by no module`);

// --- 7. Output ---------------------------------------------------------------

const cell = (values) => (values.size === 0 ? '—' : sorted(values).join('<br>'));
const shortPath = (path) => path.replace(/^tests\//, '').replace(/^src\//, '');
const lines = [
  '# Traceability matrix',
  '',
  '| | |',
  '|---|---|',
  '| Ticket | SMS-65 (lab 6, steps 11–12) |',
  '| Generated by | `node scripts/traceability.mjs` — do not edit by hand; regenerate after a change to any source below |',
  `| Requirements | ${requirements.size}: ${[...requirements.values()].filter((r) => r.source === 'SRS v1.3').length} of SRS v1.3, ${[...requirements.values()].filter((r) => r.source !== 'SRS v1.3').length} of the addenda |`,
  '| Sources | SRS v1.3 §8 and addenda (criterion, scenario, first ticket); `docs/ticket-list.md`; test headers; `spec/api/resource-model.md` §5 and the route registrations; module headers; `spec/ui/screens.md`; `docs/user-guide.md` |',
  '',
  'Tests and code paths are relative to `tests/` and `src/`. Interface ids are the',
  'screens of `spec/ui/screens.md` §3; operation ids are those of `resource-model.md` §5.',
  '',
  '## 1. The matrix',
  '',
  '| Requirement | Acceptance criterion (SRS §8) | Scenario | Tickets | Tests | Code | Interface | Documentation |',
  '|---|---|---|---|---|---|---|---|',
];
for (const r of sorted(requirements.keys()).map((id) => requirements.get(id))) {
  const code = new Set([...r.code].map(shortPath));
  const tests = new Set([...r.tests].map(shortPath));
  const ops = r.operations.size === 0 ? '' : `<br>ops: ${sorted(r.operations).join(', ')}`;
  const ui =
    r.screens.size === 0 ? `— ${EMPTY_BY_DESIGN[r.id]?.interface ?? ''}`.trim() : cell(r.screens);
  lines.push(
    `| **${r.id}**${r.source === 'SRS v1.3' ? '' : ` (${r.source})`} | ${r.criterion || '—'} | ${cell(r.scenarios)} | ${cell(r.tickets)} | ${cell(tests)} | ${cell(code)}${ops} | ${ui} | ${cell(r.docs)} |`,
  );
}
lines.push('', '## 2. Audit', '');
const counts = {
  requirements: requirements.size,
  tests: testFiles.length,
  operations: operations.length,
  'operations registered by a module': operations.length - unregistered.length,
};
lines.push('| Measure | Value |', '|---|---|');
for (const [name, value] of Object.entries(counts)) lines.push(`| ${name} | ${value} |`);
lines.push(`| findings | ${findings.length} |`, '');
if (findings.length === 0) {
  lines.push(
    'No finding: every requirement has every cell (or a recorded reason), every id cited is defined, every test cites a source, and every ticket, scenario, screen and section named exists.',
  );
} else {
  lines.push(
    '| Kind | Finding |',
    '|---|---|',
    ...findings.map((f) => `| ${f.kind} | ${f.text} |`),
  );
}
lines.push(
  '',
  '### Tests that trace to no requirement, by design',
  '',
  '| Test | Its source |',
  '|---|---|',
);
for (const [file, reason] of Object.entries(TESTS_WITHOUT_REQUIREMENT))
  lines.push(`| \`${file}\` | ${reason} |`);
lines.push('', '### Empty by design', '', '| Requirement | Cell | Reason |', '|---|---|---|');
for (const [id, cells] of Object.entries(EMPTY_BY_DESIGN)) {
  for (const [name, reason] of Object.entries(cells)) lines.push(`| ${id} | ${name} | ${reason} |`);
}
lines.push('');

writeFileSync(OUT, `${lines.join('\n')}\n`);
console.log(
  `traceability: ${requirements.size} requirements, ${testFiles.length} test files, ${findings.length} findings → ${OUT}`,
);
for (const f of findings) console.log(`  ${f.kind}: ${f.text}`);
if (process.argv.includes('--check') && findings.length > 0) process.exit(1);
