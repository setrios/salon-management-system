import { defineConfig } from 'drizzle-kit';

// `generate` writes the SQL to `src/db/migrations`; `migrate` applies it to the
// database named by DATABASE_URL. The test database (TEST_DATABASE_URL) is
// migrated from the same folder by `tests/setup.ts` before every run, so the
// same SQL produces the development and the test schema.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
