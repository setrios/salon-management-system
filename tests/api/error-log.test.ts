/**
 * SMS-75 — an unexpected error's log line carries the cause the database gave.
 *
 * Drizzle reports a failed statement as `Error('Failed query: <sql>')` and puts
 * the PostgreSQL error in `error.cause`. The terminal error handler wrote only
 * `error.stack`, so the developer's run of the README (2026-11-26, finding F12)
 * logged "Failed query: select … from masters …" with nothing to say why —
 * the missing table had to be guessed. Lab 5 step 1 requires a log that lets a
 * run be analysed; a line without its cause does not.
 *
 *   L1  the line carries the cause's message
 *   L2  a cause of a cause is carried too (the chain, in order)
 *   L3  the client's 500 Problem does not carry it: the cause stays in the log
 *
 * Source: lab 5 task step 1 (logging of every action); error-model.md §4 (500,
 *         no internal detail to the client); finding F12 of the developer's run.
 * Ticket: SMS-75 (Test)
 */

import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../../src/middleware/error-handler.js';

/** An app whose one route throws the given error, handled by the real handler. */
function appThrowing(error: Error): Express {
  const app = express();
  app.get('/boom', () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

/** What the handler wrote to stderr during `run`. */
async function captureStderr(run: () => Promise<unknown>): Promise<string> {
  const writes: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  });
  await run();
  return writes.join('');
}

describe('SMS-75 the unhandled-error log carries the cause', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('L1 writes the cause the database gave', async () => {
    const failed = new Error('Failed query: select "id" from "masters"', {
      cause: new Error('relation "masters" does not exist'),
    });
    const log = await captureStderr(() => request(appThrowing(failed)).get('/boom'));

    expect(log).toContain('unhandled error');
    expect(log).toContain('Failed query: select "id" from "masters"');
    expect(log).toContain('relation "masters" does not exist');
  });

  it('L2 writes a cause of a cause too, after it', async () => {
    const failed = new Error('Failed query: insert', {
      cause: new Error('connection terminated', {
        cause: new Error('ECONNREFUSED 127.0.0.1:5432'),
      }),
    });
    const log = await captureStderr(() => request(appThrowing(failed)).get('/boom'));

    const first = log.indexOf('connection terminated');
    const second = log.indexOf('ECONNREFUSED 127.0.0.1:5432');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
  });

  it('L3 keeps the cause out of the client answer', async () => {
    const failed = new Error('Failed query: select', {
      cause: new Error('password authentication failed for user "salon"'),
    });
    let response: request.Response | undefined;
    await captureStderr(async () => {
      response = await request(appThrowing(failed)).get('/boom');
    });

    expect(response?.status).toBe(500);
    expect(response?.body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response?.body)).not.toContain('password authentication failed');
    expect(JSON.stringify(response?.body)).not.toContain('Failed query');
  });
});
