/**
 * JSONL application log: one record per line in `<logDir>/app-YYYY-MM-DD.jsonl`.
 * Own implementation, no logging dependency (D-6). The format is fixed so that
 * `logs/runs/runs-SN.md` can quote a control run's records verbatim:
 *
 *   ts, level ('info'|'warn'|'error'), event, traceId, …event fields
 *
 * The log is diagnostic, not the database: a failed write never fails a request.
 */

import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';

import type { RequestHandler } from 'express';

import { contractPathFor } from '../contract/paths.js';
import { getTraceId } from './trace.js';

export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  record(level: LogLevel, event: string, fields: Record<string, unknown>): void;
}

/** Opens the day's file. Returns `undefined` when the directory is unusable. */
function openStream(logDir: string): WriteStream | undefined {
  try {
    mkdirSync(logDir, { recursive: true });
    const file = join(logDir, `app-${new Date().toISOString().slice(0, 10)}.jsonl`);
    const stream = createWriteStream(file, { flags: 'a' });
    stream.on('error', () => undefined);
    return stream;
  } catch {
    return undefined;
  }
}

/** Creates a logger. The stream opens on the first write, never at import. */
export function createLogger(logDir: string): Logger {
  let stream: WriteStream | undefined;

  return {
    record(level, event, fields) {
      stream ??= openStream(logDir);
      stream?.write(
        `${JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields })}\n`,
      );
    },
  };
}

/** Maps an HTTP status to a log level. */
function levelFor(status: number): LogLevel {
  if (status >= 500) return 'error';
  return status >= 400 ? 'warn' : 'info';
}

/**
 * Per-request access log, written when the response finishes.
 *
 * `path` must never carry a concrete value for a contract path, because a path
 * parameter can hold a client access token (REQ-NF-001, REQ-NF-006), so the
 * path is resolved in this order:
 *
 *   1. the contract template (`/api/v1/auth/login`,
 *      `/api/v1/appointments/{token}/cancel`) — one spelling per operation,
 *      prefix included, no concrete value;
 *   2. `${baseUrl}${route.path}` for a route the contract does not define
 *      (`/health` is the only one today);
 *   3. the request path, which no contract path claims and therefore cannot
 *      carry a token defined by the contract.
 *
 * The contract template comes first because `req.baseUrl` is restored to `''`
 * when the router unwinds, and the response `finish` event lands on either
 * side of that: a response produced by a route handler is logged before the
 * restore, one produced by the error handler after it. Reading `baseUrl` first
 * therefore logged the same operation as `/api/v1/auth/login` and as
 * `/auth/login` in a single run (runs-02 §4, tdd-SMS-21 §11).
 */
export function requestLogger(logDir: string): RequestHandler {
  const logger = createLogger(logDir);

  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.once('finish', () => {
      // `originalUrl` is never rewritten by Express, unlike `req.path`, whose
      // `/api/v1` prefix the router strips and restores. Reading it keeps both
      // response paths (handler and error handler) on this one branch. The
      // types mark it optional; `req.url` is the same value when it is absent.
      const requestPath = (req.originalUrl ?? req.url).split('?')[0] ?? '';
      const contractTemplate = contractPathFor(requestPath)?.template;
      const route = (req as unknown as { route?: { path?: unknown } }).route?.path;
      const path =
        contractTemplate ?? (typeof route === 'string' ? `${req.baseUrl}${route}` : requestPath);
      logger.record(levelFor(res.statusCode), 'http.request', {
        // `traceMiddleware` always runs before this one, but the field is typed
        // optional; `null` keeps the record's key set stable across events.
        traceId: getTraceId(res) ?? null,
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      });
    });
    next();
  };
}
