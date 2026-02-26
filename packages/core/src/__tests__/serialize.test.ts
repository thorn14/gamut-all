import { describe, it, expect } from 'vitest';
import { djb2Hash, serializeRegistry, deserializeRegistry } from '../serialize.js';
import { buildRegistry } from '../registry.js';
import { processInput } from '../processor.js';
import { wcag21 } from '../compliance/wcag21.js';
import type { TokenInput } from '../types.js';

const input: TokenInput = {
  primitives: {
    neutral: ['#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4', '#a3a3a3', '#737373', '#525252', '#404040', '#262626', '#171717'],
    blue:    ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a'],
  },
  backgrounds: {
    white: { ramp: 'neutral', step: 0, fallback: ['dark'], aliases: ['bg-white'] },
    dark:  { ramp: 'neutral', step: 8 },
  },
  semantics: {
    fgPrimary: { ramp: 'neutral', defaultStep: 8 },
    fgLink: {
      ramp: 'blue',
      defaultStep: 6,
      interactions: { hover: { step: 8 } },
    },
  },
};

describe('djb2Hash', () => {
  it('returns a hex string', () => {
    expect(djb2Hash('hello')).toMatch(/^[0-9a-f]+$/);
  });

  it('same input → same hash', () => {
    expect(djb2Hash('hello')).toBe(djb2Hash('hello'));
  });

  it('different inputs → different hashes', () => {
    expect(djb2Hash('hello')).not.toBe(djb2Hash('world'));
  });

  it('empty string does not throw', () => {
    expect(() => djb2Hash('')).not.toThrow();
    expect(typeof djb2Hash('')).toBe('string');
  });

  it('long string does not throw', () => {
    const long = 'a'.repeat(10_000);
    expect(() => djb2Hash(long)).not.toThrow();
  });

  it('result changes with each character difference', () => {
    expect(djb2Hash('abc')).not.toBe(djb2Hash('abd'));
  });
});

describe('serializeRegistry', () => {
  const processed = processInput(input);
  const registry = buildRegistry(processed, wcag21);
  const serialized = serializeRegistry(registry);

  it('version is 1', () => {
    expect(serialized.version).toBe(1);
  });

  it('meta is preserved', () => {
    expect(serialized.meta.complianceEngine).toBe('wcag21');
    expect(serialized.meta.wcagTarget).toBe('AA');
    expect(typeof serialized.meta.generatedAt).toBe('string');
    expect(typeof serialized.meta.inputHash).toBe('string');
    expect(serialized.meta.totalVariants).toBeGreaterThan(0);
    expect(serialized.meta.tokenCount).toBeGreaterThan(0);
  });

  it('ramps serialized as array of [key, ramp] pairs', () => {
    expect(Array.isArray(serialized.ramps)).toBe(true);
    const neutralEntry = serialized.ramps.find(([k]) => k === 'neutral');
    expect(neutralEntry).toBeDefined();
    expect(neutralEntry![1].name).toBe('neutral');
    expect(neutralEntry![1].steps).toHaveLength(10);
    expect(neutralEntry![1].stepCount).toBe(10);
  });

  it('backgrounds serialized with aliases and fallback', () => {
    const whiteEntry = serialized.backgrounds.find(([k]) => k === 'white');
    expect(whiteEntry).toBeDefined();
    expect(whiteEntry![1].aliases).toEqual(['bg-white']);
    expect(whiteEntry![1].fallback).toEqual(['dark']);
  });

  it('variantMap serialized as array of pairs', () => {
    expect(Array.isArray(serialized.variantMap)).toBe(true);
    expect(serialized.variantMap.length).toBeGreaterThan(0);
    const [key, variant] = serialized.variantMap[0]!;
    expect(typeof key).toBe('string');
    expect(typeof variant.hex).toBe('string');
    expect(typeof variant.compliance.pass).toBe('boolean');
    expect(typeof variant.compliance.metric).toBe('string');
  });

  it('backgroundFallbacks preserved', () => {
    expect(serialized.backgroundFallbacks['white']).toEqual(['dark']);
  });

  it('defaults preserved', () => {
    expect(typeof serialized.defaults['fgPrimary']).toBe('string');
  });

  it('is JSON-serializable', () => {
    expect(() => JSON.stringify(serialized)).not.toThrow();
  });
});

describe('deserializeRegistry', () => {
  const processed = processInput(input);
  const registry = buildRegistry(processed, wcag21);
  const serialized = serializeRegistry(registry);
  const restored = deserializeRegistry(serialized);

  it('ramps is a Map', () => {
    expect(restored.ramps).toBeInstanceOf(Map);
    expect(restored.ramps.has('neutral')).toBe(true);
    expect(restored.ramps.has('blue')).toBe(true);
  });

  it('ramp steps are preserved', () => {
    const neutral = restored.ramps.get('neutral');
    expect(neutral!.steps).toHaveLength(10);
    expect(neutral!.steps[0]!.hex).toBe('#fafafa');
    expect(neutral!.steps[9]!.hex).toBe('#171717');
  });

  it('backgrounds is a Map', () => {
    expect(restored.backgrounds).toBeInstanceOf(Map);
    expect(restored.backgrounds.has('white')).toBe(true);
    expect(restored.backgrounds.get('white')!.aliases).toEqual(['bg-white']);
  });

  it('variantMap is a Map', () => {
    expect(restored.variantMap).toBeInstanceOf(Map);
    expect(restored.variantMap.size).toBe(registry.variantMap.size);
  });

  it('round-trip preserves variant hex values', () => {
    for (const [key, variant] of registry.variantMap) {
      const restored_variant = restored.variantMap.get(key);
      expect(restored_variant).toBeDefined();
      expect(restored_variant!.hex).toBe(variant.hex);
    }
  });

  it('meta is preserved after round-trip', () => {
    expect(restored.meta.complianceEngine).toBe(registry.meta.complianceEngine);
    expect(restored.meta.totalVariants).toBe(registry.meta.totalVariants);
    expect(restored.meta.inputHash).toBe(registry.meta.inputHash);
  });

  it('defaults are preserved after round-trip', () => {
    expect(restored.defaults['fgPrimary']).toBe(registry.defaults['fgPrimary']);
    expect(restored.defaults['fgLink']).toBe(registry.defaults['fgLink']);
  });

  it('backgroundFallbacks are preserved after round-trip', () => {
    expect(restored.backgroundFallbacks['white']).toEqual(['dark']);
  });
});
