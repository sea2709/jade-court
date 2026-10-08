import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Unit tests run in jsdom without the PWA/Tailwind plugins from `vite.config.ts`. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'html'],
      // Floors just below current coverage — raise as tests are added, never lower.
      thresholds: { statements: 33, branches: 74, functions: 70, lines: 33 },
    },
  },
});
