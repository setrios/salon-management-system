/**
 * The interface's only way to the server: `fetch` to the approved `/api/v1`
 * contract (constraint 2.3).
 *
 * A call answers either the parsed body or a `Problem` (RFC 9457), never a raw
 * status: screens show `title`/`detail` and map `errors[]` to fields
 * (constraint 2.4). Staff calls carry the bearer token kept in
 * `sessionStorage` (UI-GATE U-3); a 401 on a staff call ends the session and
 * returns to S1 with the message of `screens.md` §5.1.
 *
 * Source: spec/ui/screens.md §2, §5.1; UI-GATE U-3; error-model.md.
 */

/** One `errors[]` item of a 422 `Problem`. */
export interface FieldError {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

/** The contract's `Problem`. */
export interface Problem {
  readonly status: number;
  readonly title: string;
  readonly code?: string;
  readonly detail?: string;
  readonly errors?: readonly FieldError[];
}

/** The answer of a call: the body, or the problem. */
export type Result<T> =
  { readonly ok: true; readonly body: T } | { readonly ok: false; readonly problem: Problem };

/** One page of a list operation. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

const TOKEN_KEY = 'salon.staff.token';
const FLASH_KEY = 'salon.flash';

/** The message S1 shows after any 401 on a staff screen. */
export const SESSION_ENDED = 'Your session has ended. Please sign in again.';

/** The staff bearer token, or `null` when nobody is signed in. */
export function staffToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

/** Stores the token after sign-in (U-3: the tab's session only). */
export function storeStaffToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

/** Forgets the token: Sign out, or a session that ended. */
export function forgetStaffToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

/** Leaves a one-time message for the next page (a banner after a navigation). */
export function setFlash(message: string): void {
  sessionStorage.setItem(FLASH_KEY, message);
}

/** Takes the one-time message, if any. */
export function takeFlash(): string | null {
  const message = sessionStorage.getItem(FLASH_KEY);
  sessionStorage.removeItem(FLASH_KEY);
  return message;
}

/** Ends the staff session and opens S1 with the message (§5.1 "Session end"). */
export function endSession(): never {
  forgetStaffToken();
  setFlash(SESSION_ENDED);
  location.assign('/staff/login');
  throw new Error('session ended');
}

/** Options of one call. */
export interface CallOptions {
  readonly body?: unknown;
  /** `true` for a staff operation: sends the token and treats 401 as session end. */
  readonly staff?: boolean;
}

/** Calls one operation of the contract. */
export async function call<T>(
  method: string,
  path: string,
  options: CallOptions = {},
): Promise<Result<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = options.staff === true ? staffToken() : null;
  if (options.staff === true && token === null) endSession();
  if (token !== null) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    return {
      ok: false,
      problem: {
        status: 0,
        title: 'Network error',
        detail: 'The server could not be reached. Please try again.',
      },
    };
  }

  if (response.status === 401 && options.staff === true) endSession();

  const text = await response.text();
  const parsed: unknown = text === '' ? null : JSON.parse(text);
  if (response.ok) return { ok: true, body: parsed as T };
  return {
    ok: false,
    problem: (parsed as Problem | null) ?? { status: response.status, title: response.statusText },
  };
}

/** Like `call`, but a problem is thrown: for reads a screen cannot do without. */
export async function read<T>(path: string, options: CallOptions = {}): Promise<T> {
  const result = await call<T>('GET', path, options);
  if (!result.ok) throw new ProblemError(result.problem);
  return result.body;
}

/** Reads every page of a list operation (page size 100, the contract's maximum). */
export async function readAll<T>(path: string, options: CallOptions = {}): Promise<T[]> {
  const items: T[] = [];
  const separator = path.includes('?') ? '&' : '?';
  for (let page = 1; ; page += 1) {
    const body = await read<Page<T>>(`${path}${separator}page=${page}&pageSize=100`, options);
    items.push(...body.items);
    if (items.length >= body.total || body.items.length === 0) return items;
  }
}

/** A `Problem` carried as an exception. */
export class ProblemError extends Error {
  /** @param problem - the server's answer. */
  constructor(readonly problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ProblemError';
  }
}

/** The text a screen shows for a problem: its `detail`, else its `title`. */
export function problemText(problem: Problem): string {
  return problem.detail ?? problem.title;
}
