/**
 * Typed environment configuration.
 *
 * Reads process.env once at import time and exposes a frozen object. Nothing
 * else in the codebase reads process.env directly — that keeps every default
 * and every required variable visible in one place, and lets tests replace the
 * whole configuration instead of mutating the environment.
 *
 * Source: logs/2026-11-08-implementation-plan.md §5; .env.example.
 */

/** The three run modes `NODE_ENV` may name; anything else is a configuration error. */
export type NodeEnv = 'development' | 'test' | 'production';

/**
 * The process configuration, read once from the environment by `loadConfig`.
 * Frozen: code that needs another value builds another config, it never edits
 * this one.
 */
export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly databaseUrl: string;
  /** HS256 key for bearerAuth. Never logged. */
  readonly jwtSecret: string;
  /** Access-token lifetime in seconds; mirrored in LoginResponse.expiresIn. */
  readonly jwtExpiresIn: number;
  /** Directory for the JSONL application log. */
  readonly logDir: string;
  /**
   * Origin of the pages a client opens, without a trailing slash — the host of
   * `Appointment.confirmationUrl` (REQ-F-005, UI-GATE U-1). Defaults to this
   * process on localhost.
   */
  readonly publicBaseUrl: string;
}

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function readString(env: NodeJS.ProcessEnv, name: string, fallback?: string): string {
  const raw = env[name];
  if (raw !== undefined && raw !== '') return raw;
  if (fallback !== undefined) return fallback;
  throw new ConfigError(`Missing required environment variable: ${name}`);
}

function readInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`${name} must be a positive integer, got: ${raw}`);
  }
  return parsed;
}

/**
 * Reads an absolute `http(s)` origin and drops a trailing slash, so that
 * `${origin}/path` never has a doubled slash.
 *
 * @throws ConfigError when the value is not an absolute http or https URL.
 */
function readOrigin(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`${name} must be an absolute http(s) URL, got: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`${name} must be an absolute http(s) URL, got: ${raw}`);
  }
  return raw.replace(/\/+$/, '');
}

function readNodeEnv(env: NodeJS.ProcessEnv): NodeEnv {
  const raw = env.NODE_ENV ?? 'development';
  if (raw === 'development' || raw === 'test' || raw === 'production') return raw;
  throw new ConfigError(`NODE_ENV must be one of development, test, production; got: ${raw}`);
}

/**
 * Builds the configuration object.
 *
 * `DATABASE_URL` is only required outside `test`: the test suites use
 * `TEST_DATABASE_URL` and must be able to import the app without a development
 * database being configured.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = readNodeEnv(env);

  const databaseUrl =
    nodeEnv === 'test'
      ? (env.TEST_DATABASE_URL ?? env.DATABASE_URL ?? '')
      : readString(env, 'DATABASE_URL');

  const port = readInteger(env, 'PORT', 3000);

  return Object.freeze({
    nodeEnv,
    port,
    databaseUrl,
    jwtSecret: readString(env, 'JWT_SECRET', nodeEnv === 'production' ? undefined : 'change-me'),
    jwtExpiresIn: readInteger(env, 'JWT_EXPIRES_IN', 3600),
    logDir: readString(env, 'LOG_DIR', 'logs/runtime'),
    publicBaseUrl: readOrigin(env, 'PUBLIC_BASE_URL', `http://localhost:${port}`),
  });
}

/** The configuration of this process, read from `process.env` when the module loads. */
export const config: AppConfig = loadConfig();
