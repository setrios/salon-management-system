/**
 * Process entry point: the only module that owns a listening socket.
 *
 * The app is built first (it performs no I/O of its own), then the socket is
 * opened. Graceful shutdown on SIGINT/SIGTERM stops accepting connections and
 * exits once in-flight requests finish; a shutdown that outlives the timeout
 * exits non-zero rather than hanging.
 *
 * Environment: the process reads `process.env` only. `.env` is loaded by the
 * npm scripts (`node --env-file-if-exists=.env`), not by this module, so a
 * direct `node dist/src/index.js` run must carry the variables itself and fails
 * fast with `ConfigError` when it does not.
 *
 * Source: logs/2026-11-08-implementation-plan.md §5.
 */

import type { Server } from 'node:http';

import { createApp } from './app.js';
import { config } from './config.js';
import { createLogger } from './middleware/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const logger = createLogger(config.logDir);
const app = createApp();

const server: Server = app.listen(config.port, () => {
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : config.port;
  logger.record('info', 'server.started', { port, nodeEnv: config.nodeEnv });
});

function shutdown(signal: NodeJS.Signals): void {
  logger.record('info', 'server.stopping', { signal });

  const forcedExit = setTimeout(() => {
    logger.record('warn', 'server.shutdown-timeout', { signal, timeoutMs: SHUTDOWN_TIMEOUT_MS });
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forcedExit.unref();

  server.close((error) => {
    clearTimeout(forcedExit);

    if (error !== undefined) {
      logger.record('error', 'server.shutdown-error', { signal, message: error.message });
      process.exit(1);
    }

    logger.record('info', 'server.stopped', { signal });
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
