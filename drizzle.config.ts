import { defineConfig } from 'drizzle-kit';

// Migrations target the development database. The test database
// (TEST_DATABASE_URL) is migrated by the same generated SQL in tests/setup.ts.
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
