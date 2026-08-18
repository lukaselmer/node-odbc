import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The suite shares one table in one database, so files cannot overlap.
    fileParallelism: false,
    globalSetup: ['test/setup/globalSetup.ts'],
    setupFiles: ['test/setup/testEnv.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
