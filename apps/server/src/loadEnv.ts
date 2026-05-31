/**
 * Load repo-root `.env` into process.env (GEMINI_API_KEY, MONGODB_URI, etc.).
 * Web uses the same file via Vite (`envDir`); only `VITE_*` are exposed in the browser.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '../..');
const envPath = resolve(repoRoot, '.env');

if (existsSync(envPath)) {
  config({ path: envPath });
}
