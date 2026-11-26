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

export type NodeEnv = 'development' | 'test' | 'production';

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

  return Object.freeze({
    nodeEnv,
    port: readInteger(env, 'PORT', 3000),
    databaseUrl,
    jwtSecret: readString(env, 'JWT_SECRET', nodeEnv === 'production' ? undefined : 'change-me'),
    jwtExpiresIn: readInteger(env, 'JWT_EXPIRES_IN', 3600),
    logDir: readString(env, 'LOG_DIR', 'logs/runtime'),
  });
}

export const config: AppConfig = loadConfig();
