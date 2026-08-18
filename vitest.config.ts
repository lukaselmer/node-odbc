import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The suite talks to a real database over ODBC, so it cannot run in
    // parallel against one table, and a connection costs about a second.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['test/setup.ts'],
    globalSetup: ['test/globalSetup.ts'],
  },
})
