import { defineConfig } from 'vitest/config';

// Tests run single-fork: every suite shares one PostgreSQL database
// (salon_test) and truncates tables before each file (decision D-7), so
// parallel workers would race on the same schema.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    pool: 'forks',
    fileParallelism: false,
    restoreMocks: true,
    clearMocks: true,
  },
});
