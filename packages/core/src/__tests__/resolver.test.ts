import { describe, it, expect } from 'vitest';
import { resolveToken, resolveAllTokens } from '../resolver.js';
import { buildRegistry } from '../registry.js';
import { processInput } from '../processor.js';
import { wcag21 } from '../compliance/wcag21.js';
import type { TokenInput, DesignContext } from '../types.js';

const input: TokenInput = {
  primitives: {
    neutral: [
      '#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4',
      '#a3a3a3', '#737373', '#525252', '#404040',
      '#262626', '#171717',
    ],
    blue: [
      '#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd',
      '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8',
      '#1e40af', '#1e3a8a',
    ],
    orange: [
      '#fff7ed', '#ffedd5', '#fed7aa', '#fdba74',
      '#fb923c', '#f97316', '#ea580c', '#c2410c',
      '#9a3412', '#7c2d12',
    ],
  },
  themes: {
    white: { ramp: 'neutral', step: 0, fallback: ['light', 'card'] },
    light: { ramp: 'neutral', step: 1, fallback: ['white', 'card'] },
    card: { ramp: 'neutral', step: 2, fallback: ['light', 'white'] },
    dark: { ramp: 'neutral', step: 8, fallback: ['inverse'] },
    inverse: { ramp: 'neutral', step: 9, fallback: ['dark'] },
  },
  semantics: {
    fgPrimary: { ramp: 'neutral', defaultStep: 8 },
    fgLink: {
      ramp: 'blue',
      defaultStep: 6,
      interactions: {
        hover: { step: 8 },
        active: { step: 9 },
      },
    },
    fgError: {
      ramp: 'neutral',
      defaultStep: 6,
      vision: {
        deuteranopia: { ramp: 'orange', defaultStep: 7 },
      },
    },
  },
};

const processed = processInput(input);
const registry = buildRegistry(processed, wcag21);

const ctx = (overrides: Partial<DesignContext> = {}): DesignContext => ({
  fontSize: '16px',
  bgClass: 'white',
  stackDepth: 'root',
  visionMode: 'default',
  ...overrides,
});

describe('resolveToken', () => {
  it('resolves exact match', () => {
    const hex = resolveToken('fgPrimary', ctx(), registry);
    expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('returns a hex string', () => {
    const hex = resolveToken('fgPrimary', ctx({ bgClass: 'dark' }), registry);
    expect(hex).toMatch(/^#[0-9a-fA-F]{3,6}$/);
  });

  it('resolves interaction variant', () => {
    const hover = resolveToken('fgLink-hover', ctx(), registry);
    expect(hover).toMatch(/^#[0-9a-fA-F]{3,6}$/);
  });

  it('falls back to default vision when vision mode not found', () => {
    // tritanopia is not defined for fgError → should fall back to default
    const hex = resolveToken('fgError', ctx({ visionMode: 'tritanopia' }), registry);
    const defaultHex = resolveToken('fgError', ctx({ visionMode: 'default' }), registry);
    expect(hex).toBe(defaultHex);
  });

  it('uses vision-specific ramp when available', () => {
    const defaultHex = resolveToken('fgError', ctx({ visionMode: 'default' }), registry);
    const deuterHex = resolveToken('fgError', ctx({ visionMode: 'deuteranopia' }), registry);
    // Deuteranopia uses orange ramp, should differ from default
    expect(deuterHex).not.toBe(defaultHex);
  });

  it('falls back through stack toward root', () => {
    // modal stack — should resolve via root since registry only has root entries
    const rootHex = resolveToken('fgPrimary', ctx({ stackDepth: 'root' }), registry);
    const modalHex = resolveToken('fgPrimary', ctx({ stackDepth: 'modal' }), registry);
    expect(modalHex).toBe(rootHex);
  });

  it('falls back through bg fallback chain', () => {
    // Unknown bg with fallback chain
    const cardHex = resolveToken('fgPrimary', ctx({ bgClass: 'card' }), registry);
    expect(cardHex).toMatch(/^#[0-9a-fA-F]{3,6}$/);
  });

  it('returns defaults[token] for completely unknown bg', () => {
    const hex = resolveToken('fgPrimary', ctx({ bgClass: 'nonexistent' }), registry);
    // Should not throw, should return the default
    expect(hex).toBe(registry.defaults['fgPrimary']);
  });

  it('does not throw for unknown token', () => {
    expect(() => resolveToken('nonexistent', ctx(), registry)).not.toThrow();
  });

  it('resolves consistent results on repeated calls', () => {
    const context = ctx({ bgClass: 'dark', visionMode: 'deuteranopia' });
    const hex1 = resolveToken('fgPrimary', context, registry);
    const hex2 = resolveToken('fgPrimary', context, registry);
    expect(hex1).toBe(hex2);
  });
});

describe('resolveAllTokens', () => {
  it('returns all token names including interactions', () => {
    const tokens = resolveAllTokens(ctx(), registry);
    expect('fgPrimary' in tokens).toBe(true);
    expect('fgLink' in tokens).toBe(true);
    expect('fgLink-hover' in tokens).toBe(true);
    expect('fgLink-active' in tokens).toBe(true);
    expect('fgError' in tokens).toBe(true);
  });

  it('all values are hex strings', () => {
    const tokens = resolveAllTokens(ctx(), registry);
    for (const [, hex] of Object.entries(tokens)) {
      expect(hex).toMatch(/^#[0-9a-fA-F]{3,6}$/);
    }
  });

  it('performance: <10μs per resolveToken call on average', () => {
    const iterations = 10_000;
    const context = ctx({ bgClass: 'dark', visionMode: 'default' });
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      resolveToken('fgPrimary', context, registry);
    }
    const elapsed = performance.now() - start;
    const avgUs = (elapsed / iterations) * 1000;
    expect(avgUs).toBeLessThan(10); // <10μs per call
  });
});
