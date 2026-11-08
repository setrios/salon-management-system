/**
 * Application factory.
 *
 * `createApp()` returns a fully configured Express application and does not
 * listen on a port. Tests mount it with supertest directly; `index.ts` is the
 * only place that owns a socket. Middleware order matters and is documented
 * here rather than in each module:
 *
 *   1. trace        — assigns the correlation id every later layer logs
 *   2. logger       — writes the request/response JSONL record
 *   3. json body    — parses `application/json` only; other media types reach
 *                     the handler untouched and are rejected with 415
 *   4. health       — `/health`, deliberately outside `/api/v1`
 *   5. api routes   — `/api/v1/*` from routes.ts, guarded by auth/validate
 *   6. not-found    — anything unmatched becomes 404 Problem
 *   7. error-handler— last; converts every throw into a Problem response
 *
 * `x-powered-by` is disabled: the contract exposes no such header and the
 * framework identity is not part of the API surface.
 */

import express, { type Express } from 'express';

import { config } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/logger.js';
import { notFound } from './middleware/not-found.js';
import { traceMiddleware } from './middleware/trace.js';
import { registerRoutes } from './routes.js';

export function createApp(): Express {
  const app = express();

  // Express defaults are kept otherwise, including case-insensitive matching:
  // the contract defines no case rule, so the scaffold does not invent one.
  app.disable('x-powered-by');

  app.use(traceMiddleware);
  app.use(requestLogger(config.logDir));

  // Only JSON bodies are parsed. Nothing else is registered on purpose: a request
  // with another media type keeps its raw stream, so `validateBody` can report
  // 415 instead of a parser quietly accepting a form body.
  app.use(express.json({ limit: '1mb', type: 'application/json' }));

  // Liveness probe. Not part of the API contract: it is infrastructure, so it
  // lives outside the /api/v1 surface that openapi.yaml describes.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  registerRoutes(app);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
