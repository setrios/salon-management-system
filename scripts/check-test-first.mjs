#!/usr/bin/env node
/**
 * Causal-independence check.
 *
 * Proves, from read-only git history, that each test file was written before
 * the implementation it exercises — the requirement in
 * `logs/2026-11-08-implementation-plan.md` §6.2. It is a gate, not a report:
 * any violation exits 1.
 *
 * For every entry in `tests/manifest.json`:
 *
 *   1. The test file must have been added by some commit:
 *        git log --diff-filter=A --format=%H -- <test>
 *      No commit means the test is untracked, and there is nothing to prove.
 *
 *   2. The test file must not exist at that commit's parent with the
 *      implementation already present. Concretely, at the commit that added the
 *      test, `git cat-file -e <commit>:<impl>` must FAIL for every implementation
 *      path — the code did not exist when the test was written.
 *
 *   3. The implementation's own first-addition commit, when it exists, must be
 *      strictly later than the test's. A file that is not committed yet is
 *      accepted: it is unambiguously later than a committed test.
 *
 *   4. The test file's header must cite at least one source id (`REQ-…` or
 *      `SCN-…`), which is what makes the expectations traceable to the SRS and
 *      the BDD scenarios rather than to the code.
 *
 * Exit codes: 0 pass, 1 violation or usage error.
 *
 * Usage: node scripts/check-test-first.mjs [--verbose]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = resolve(ROOT, 'tests/manifest.json');

const verbose = process.argv.includes('--verbose');

/** Runs git in the repository root and returns trimmed stdout. */
function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Runs git, returning null when it fails (a non-zero exit is a real answer here). */
function gitOrNull(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

/** Short commit subject, for readable output. */
function describeCommit(hash) {
  const subject = gitOrNull(['log', '-1', '--format=%s', hash]);
  return subject === null ? hash.slice(0, 12) : `${hash.slice(0, 12)} ${subject}`;
}

/** All commits that added `path`, newest first. */
function additionsOf(path) {
  const output = gitOrNull(['log', '--diff-filter=A', '--format=%H', '--', path]);
  if (output === null || output === '') return [];
  return output.split('\n').filter(Boolean);
}

/** True when `path` exists in the tree of `commit`. */
function existsAt(commit, path) {
  return gitOrNull(['cat-file', '-e', `${commit}:${path}`]) !== null;
}

/** True when `ancestor` is an ancestor of (or equal to) `descendant`. */
function isAncestorOrEqual(ancestor, descendant) {
  if (ancestor === descendant) return true;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const SOURCE_ID = /\b(REQ-(?:F|NF)-\d{3}|SCN-\d{2})\b/g;

function loadManifest() {
  let raw;
  try {
    raw = readFileSync(MANIFEST_PATH, 'utf8');
  } catch {
    throw new Error(`cannot read ${MANIFEST_PATH}`);
  }

  const parsed = JSON.parse(raw);

  // Both a bare array and an object with `entries` are accepted, so the file can
  // be rewritten in either shape without silently checking nothing.
  const entries = Array.isArray(parsed) ? parsed : parsed?.entries;
  if (!Array.isArray(entries)) {
    throw new Error('tests/manifest.json must be an array or an object with an "entries" array');
  }

  return entries;
}

function validateEntry(entry, index) {
  const where = `entry #${index + 1}`;
  const problems = [];

  if (typeof entry?.ticket !== 'string' || entry.ticket === '') {
    problems.push(`${where}: missing "ticket"`);
  }
  if (typeof entry?.test !== 'string' || entry.test === '') {
    problems.push(`${where}: missing "test" path`);
  }
  if (!Array.isArray(entry?.implementation) || entry.implementation.length === 0) {
    problems.push(`${where}: "implementation" must be a non-empty array of paths`);
  }
  if (!Array.isArray(entry?.sources) || entry.sources.length === 0) {
    problems.push(`${where}: "sources" must be a non-empty array of REQ/SCN ids`);
  }

  return problems;
}

function checkEntry(entry) {
  const failures = [];
  const notes = [];
  const { ticket, test } = entry;
  const implementation = entry.implementation ?? [];

  for (const source of entry.sources ?? []) {
    if (!/^(REQ-(F|NF)-\d{3}|SCN-\d{2})$/.test(String(source))) {
      failures.push(`sources: "${source}" is not a REQ-F-NNN, REQ-NF-NNN or SCN-NN id`);
    }
  }

  const testAdditions = additionsOf(test);
  if (testAdditions.length === 0) {
    failures.push(
      `${test}: no commit adds this file, so the ordering cannot be proven. Commit it with the ticket's \`test:\` commit first.`,
    );
    return { ticket, test, failures, notes };
  }

  const testCommit = testAdditions[testAdditions.length - 1];
  notes.push(`test added in ${describeCommit(testCommit)}`);

  let body;
  try {
    body = readFileSync(resolve(ROOT, test), 'utf8');
  } catch {
    failures.push(`${test}: listed in the manifest but not present in the working tree`);
    return { ticket, test, failures, notes };
  }

  const headerMatch = body.slice(0, 2000).match(SOURCE_ID);
  const uniqueIds = headerMatch === null ? [] : [...new Set(headerMatch)];
  if (uniqueIds.length === 0) {
    failures.push(
      `${test}: header cites no REQ/SCN id. Add a \`// Source: REQ-F-…, SCN-…\` line at the top.`,
    );
  } else {
    notes.push(`header cites ${uniqueIds.join(', ')}`);
  }

  for (const implPath of implementation) {
    if (existsAt(testCommit, implPath)) {
      failures.push(
        `${implPath}: already existed at the commit that added ${test} (${testCommit.slice(0, 12)}); the test cannot be independent of it`,
      );
      continue;
    }

    const implAdditions = additionsOf(implPath);
    if (implAdditions.length === 0) {
      notes.push(`${implPath}: not committed yet (unambiguously after the test)`);
      continue;
    }

    const implCommit = implAdditions[implAdditions.length - 1];
    if (isAncestorOrEqual(implCommit, testCommit)) {
      failures.push(
        `${implPath}: added in ${implCommit.slice(0, 12)}, which is not after the test commit ${testCommit.slice(0, 12)}`,
      );
      continue;
    }

    notes.push(`${implPath}: added later in ${describeCommit(implCommit)}`);
  }

  return { ticket, test, failures, notes };
}

function main() {
  const insideRepo = gitOrNull(['rev-parse', '--is-inside-work-tree']);
  if (insideRepo !== 'true') {
    process.stderr.write(`not a git working tree: ${ROOT}\n`);
    process.exit(1);
  }

  let entries;
  try {
    entries = loadManifest();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }

  if (entries.length === 0) {
    process.stdout.write(
      'check-test-first: manifest is empty — nothing to verify (exit 0). See tests/manifest.json.\n',
    );
    process.exit(0);
  }

  const structural = entries.flatMap(validateEntry);
  if (structural.length > 0) {
    process.stderr.write(`check-test-first: invalid manifest\n${structural.map((p) => `  - ${p}`).join('\n')}\n`);
    process.exit(1);
  }

  const results = entries.map(checkEntry);
  const failed = results.filter((result) => result.failures.length > 0);

  for (const result of results) {
    const status = result.failures.length === 0 ? 'PASS' : 'FAIL';
    process.stdout.write(`${status} ${result.ticket} ${result.test}\n`);

    if (verbose || result.failures.length > 0) {
      for (const note of result.notes) process.stdout.write(`     · ${note}\n`);
      for (const failure of result.failures) process.stdout.write(`     ✗ ${failure}\n`);
    }
  }

  process.stdout.write(
    `\ncheck-test-first: ${results.length - failed.length}/${results.length} entries pass.\n`,
  );

  process.exit(failed.length === 0 ? 0 : 1);
}

main();
