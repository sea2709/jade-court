import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text-summary', 'html'],
      // Floors just below current coverage — raise as tests are added, never lower.
      thresholds: { statements: 85, branches: 85, functions: 80, lines: 85 },
    },
  },
});
