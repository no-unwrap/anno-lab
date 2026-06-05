import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, vi } from 'vitest';

beforeAll(() => {
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get: () => 1600
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
    configurable: true,
    get: () => 1200
  });
  Object.defineProperty(HTMLImageElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 800
  });
  Object.defineProperty(HTMLImageElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 600
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
