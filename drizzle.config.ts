import { existsSync } from 'node:fs';

import { defineConfig } from 'drizzle-kit';

// `generate` writes the SQL to `src/db/migrations`; `migrate` applies it to the
// database named by DATABASE_URL. The test database (TEST_DATABASE_URL) is
// migrated from the same folder by `tests/setup.ts` before every run, so the
// same SQL produces the development and the test schema.
//
// drizzle-kit does not read `.env` the way `npm start` does
// (`--env-file-if-exists=.env`), and with no DATABASE_URL it applied nothing and
// said nothing (finding F11, SMS-74). So the configuration loads `./.env` itself
// when the environment has no DATABASE_URL — `process.loadEnvFile` never
// overrides a variable that is already set — and refuses to continue without
// one.
if (process.env.DATABASE_URL === undefined && existsSync('.env')) {
  process.loadEnvFile('.env');
}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === '') {
  throw new Error(
    'DATABASE_URL is not set: put it in .env (see .env.example) or in the environment.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
