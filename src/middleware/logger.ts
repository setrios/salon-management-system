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
      stream?.write(`${JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields })}\n`);
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
 * parameter can hold a client access token (REQ-NF-001, REQ-NF-006):
 *
 *   - a matched Express route gives `${baseUrl}${route.path}`;
 *   - an unmatched request that names a contract path gets the contract
 *     template — at S1.0-S5.5 every `/api/v1/*` request is unmatched, so this
 *     is the branch that keeps the token out of the log;
 *   - anything else gets the request path, which no contract path claims and
 *     therefore cannot carry a token defined by the contract.
 */
export function requestLogger(logDir: string): RequestHandler {
  const logger = createLogger(logDir);

  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.once('finish', () => {
      const route = (req as unknown as { route?: { path?: unknown } }).route?.path;
      const path =
        typeof route === 'string'
          ? `${req.baseUrl}${route}`
          : (contractPathFor(req.path)?.template ?? req.originalUrl.split('?')[0]);
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
