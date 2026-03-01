import { describe, it, expect } from 'vitest';
import { buildRegistry, validateRegistry } from '../registry.js';
import { processInput } from '../processor.js';
import { wcag21 } from '../compliance/wcag21.js';
import { hexToColorValue } from '../utils/oklch.js';
import type { TokenInput } from '../types.js';

const cv = (hex: string) => hexToColorValue(hex);

const baseInput: TokenInput = {
  config: {
    stacks: { root: 0, card: 1, popover: 2, tooltip: 2, modal: 2, overlay: 3 },
  },
  primitives: {
    neutral: [
      '#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4',
      '#a3a3a3', '#737373', '#525252', '#404040',
      '#262626', '#171717',
    ].map(cv),
    blue: [
      '#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd',
      '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8',
      '#1e40af', '#1e3a8a',
    ].map(cv),
  },
  themes: {
    white: { ramp: 'neutral', step: 0, fallback: ['light'] },
    light: { ramp: 'neutral', step: 1 },
    dark: { ramp: 'neutral', step: 8, fallback: ['inverse'] },
    inverse: { ramp: 'neutral', step: 9 },
  },
  foreground: {
    fgPrimary: { ramp: 'neutral', defaultStep: 8 },
    fgLink: {
      ramp: 'blue',
      defaultStep: 6,
      interactions: {
        hover: { step: 8 },
        active: { step: 9 },
      },
    },
  },
};

describe('buildRegistry', () => {
  const processed = processInput(baseInput);
  const registry = buildRegistry(processed, wcag21);

  it('creates a TokenRegistry', () => {
    expect(registry).toBeDefined();
    expect(registry.variantMap).toBeInstanceOf(Map);
    expect(registry.defaults).toBeDefined();
  });

  it('populates defaults for each token', () => {
    expect(registry.defaults['fgPrimary']).toBe('#262626');
    expect(registry.defaults['fgLink']).toBe('#2563eb');
    expect(registry.defaults['fgLink-hover']).toBe('#1e40af');
    expect(registry.defaults['fgLink-active']).toBe('#1e3a8a');
  });

  it('populates themeFallbacks', () => {
    expect(registry.themeFallbacks['white']).toEqual(['light']);
    expect(registry.themeFallbacks['dark']).toEqual(['inverse']);
  });

  it('has meta with expected fields', () => {
    expect(registry.meta.complianceEngine).toBe('wcag21');
    expect(registry.meta.wcagTarget).toBe('AA');
    expect(registry.meta.totalVariants).toBeGreaterThan(0);
    expect(registry.meta.tokenCount).toBeGreaterThan(0);
    expect(typeof registry.meta.generatedAt).toBe('string');
    expect(typeof registry.meta.inputHash).toBe('string');
  });

  it('generates variant entries for each token × bg × fontSize × stack', () => {
    // fgPrimary × 4 bgs × 6 fontSizes × 6 stacks × 1 vision (default)
    let count = 0;
    for (const key of registry.variantMap.keys()) {
      if (key.startsWith('fgPrimary__') && key.endsWith('__default')) count++;
    }
    expect(count).toBe(4 * 6 * 6); // 4 themes × 6 font sizes × 6 stacks
  });

  it('generates interaction token variants', () => {
    let hoverCount = 0;
    for (const key of registry.variantMap.keys()) {
      if (key.startsWith('fgLink-hover__')) hoverCount++;
    }
    expect(hoverCount).toBeGreaterThan(0);
  });

  it('resolves correct hex on dark background for fgPrimary', () => {
    // fgPrimary step 8 (#262626) on dark (#262626) — should auto-adjust
    const key = 'fgPrimary__16px__dark__root__default';
    const variant = registry.variantMap.get(key as Parameters<typeof registry.variantMap.get>[0]);
    expect(variant).toBeDefined();
    // Should not be the same as the dark background itself
    expect(variant!.hex).not.toBe('#262626');
  });
});

describe('validateRegistry', () => {
  it('returns empty errors array', () => {
    const processed = processInput(baseInput);
    const registry = buildRegistry(processed, wcag21);
    const result = validateRegistry(registry);
    expect(result.errors).toHaveLength(0);
  });

  it('returns warnings for variants with explicitly overridden non-compliant step', () => {
    // Auto-rules fix failing steps automatically. To produce a warning, we need a manual
    // override that forces a step known to fail — simulating intentional designer deviation.
    const inputWithBadOverride: TokenInput = {
      ...baseInput,
      foreground: {
        fgPrimary: {
          ramp: 'neutral',
          defaultStep: 8,
          // Force step 2 (#e5e5e5) on white+16px — very low contrast (~1.07:1)
          overrides: [{ bg: 'white', fontSize: '16px' as const, step: 2 }],
        },
      },
    };
    const processed = processInput(inputWithBadOverride);
    const registry = buildRegistry(processed, wcag21);
    const result = validateRegistry(registry);
    // The override forces a non-compliant step → warning expected
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
