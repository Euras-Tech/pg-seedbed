import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts', 'src/**/index.ts'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});
