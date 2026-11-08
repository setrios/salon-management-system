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
    // `vitest run` exits 1 when no test file matches. Before S1.0 the suite is
    // deliberately empty, and a non-zero exit there would be indistinguishable
    // from a failing test.
    //
    // REMOVE IN SMS-44: the commit that adds `tests/api/structural.test.ts`
    // deletes this option, so that a missing or mistyped test path fails the run
    // again instead of passing silently.
    passWithNoTests: true,
  },
});
