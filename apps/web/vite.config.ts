import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Repo-root `.env` — web uses `VITE_*` only; server loads the same file via `loadEnv.ts`. */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Dev proxy target for `/api` and `/ws`; Playwright points this at its own server port. */
const apiProxyTarget = process.env.JADE_API_PROXY_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  envDir: repoRoot,
  /** Only `VITE_*` from `.env` are exposed to `import.meta.env` (server secrets stay unprefixed). */
  envPrefix: 'VITE_',
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Jade Court',
        short_name: 'Jade Court',
        description: 'Learn and play Xiangqi',
        theme_color: '#1F9E81',
        background_color: '#FBF3E1',
        display: 'standalone',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiProxyTarget, changeOrigin: true },
      '/ws': { target: apiProxyTarget.replace(/^http/, 'ws'), ws: true },
    },
  },
});
