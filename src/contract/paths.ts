/**
 * Contract path recognition — the route table behind 405.
 *
 * `error-model.md` §4 reserves 405 for "path exists, method does not" and
 * forbids it for an unknown path, so the terminal 404 handler has to know which
 * paths the contract defines. It cannot ask Express: at S1.0 no operation router
 * is mounted, and Express 5 exposes no public API for "is this path registered
 * with another method". The approved `openapi.yaml` is the authority for which
 * paths exist, so the set is read from the converted contract instead.
 *
 * At S1.0–S5.5 an operation may be defined by the contract but not yet
 * implemented: `GET /api/v1/services` still answers 404 while
 * `POST /api/v1/services` answers 405. That asymmetry is expected — 405 states
 * that the *path* exists, not that the operation is implemented — and it
 * disappears when every contract path has a mounted handler. It is recorded in
 * `logs/gates/2026-11-08-test-SMS-44.md` §1.
 */

import { API_PREFIX } from '../routes.js';
import { loadContract } from './validators.js';

/** One template segment: a literal path part, or `null` for a `{param}`. */
type Segment = string | null;

interface ContractPath {
  /** The template as the contract writes it, API prefix included. */
  readonly template: string;
  readonly segments: readonly Segment[];
  readonly methods: Set<string>;
}

/** What the terminal handler and the access log need from a matched path. */
export interface ContractPathMatch {
  /** `/api/v1/appointments/{token}/cancel` — safe to log, no concrete values. */
  readonly template: string;
  readonly methods: ReadonlySet<string>;
}

let paths: ContractPath[] | undefined;

/**
 * Splits a path into comparable segments.
 *
 * The comparison follows the app's routing defaults rather than inventing a
 * stricter rule (see `app.ts`): Express is case-insensitive and ignores one
 * trailing slash, and the contract defines no case or slash rule of its own.
 */
function segmentsOf(path: string): string[] {
  const trimmed = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return trimmed
    .split('/')
    .slice(1)
    .map((segment) => segment.toLowerCase());
}

function compile(path: string): ContractPath {
  const template = `${API_PREFIX}${path}`;
  const segments = segmentsOf(template).map((segment) =>
    segment.startsWith('{') && segment.endsWith('}') ? null : segment,
  );
  return { template, segments, methods: new Set<string>() };
}

/** Operations grouped by path, each path compiled once. */
function contractPaths(): ContractPath[] {
  if (paths !== undefined) return paths;

  const byPath = new Map<string, ContractPath>();
  for (const operation of loadContract().operations) {
    let entry = byPath.get(operation.path);
    if (entry === undefined) {
      entry = compile(operation.path);
      byPath.set(operation.path, entry);
    }
    entry.methods.add(operation.method);
  }

  paths = [...byPath.values()];
  return paths;
}

/**
 * `{param}` matches exactly one non-empty segment, so a longer path is not the
 * same path — `/admin/masters/{masterId}` must not swallow
 * `/admin/masters/<id>/appointments`.
 */
function matches(template: ContractPath, segments: readonly string[]): boolean {
  if (template.segments.length !== segments.length) return false;

  return template.segments.every((expected, index) => {
    const actual = segments[index] ?? '';
    return expected === null ? actual !== '' : expected === actual;
  });
}

/**
 * The contract path `pathname` names, or `undefined` when the contract does not
 * define it at all.
 *
 * The template is returned alongside the methods because the access log must
 * write the template, not the concrete path: a contract path can carry a client
 * access token (`/appointments/{token}/cancel`), and REQ-NF-001 forbids writing
 * it to the log. The terminal handler ignores the template and uses the methods.
 */
export function contractPathFor(pathname: string): ContractPathMatch | undefined {
  const segments = segmentsOf(pathname);
  const match = contractPaths().find((candidate) => matches(candidate, segments));
  return match === undefined ? undefined : { template: match.template, methods: match.methods };
}
