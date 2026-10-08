import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/loadEnv.ts'],
      reporter: ['text-summary', 'html'],
      // Floors just below current coverage — raise as tests are added, never lower.
      thresholds: { statements: 67, branches: 71, functions: 61, lines: 67 },
    },
  },
});
