import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';

// Clear localStorage between tests so TokenProvider persistence doesn't bleed across
beforeEach(() => {
  localStorage.clear();
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock MutationObserver
global.MutationObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
