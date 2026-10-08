/** Vitest setup: jest-dom matchers and a clean DOM/localStorage between tests. */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Node 25+ ships an experimental global `localStorage` that shadows jsdom's and is unusable
// without `--localstorage-file`; point tests back at the jsdom window's storage.
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow && typeof globalThis.localStorage?.getItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: jsdomWindow.localStorage,
    configurable: true,
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
