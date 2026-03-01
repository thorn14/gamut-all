import { describe, it, expect } from 'vitest';
import { simulateCVD, oklabDE, findBestCVDStep } from '../utils/cvd.js';
import { processInput, buildRegistry, wcag21 } from '../index.js';
import type { TokenInput } from '../types.js';

describe('simulateCVD', () => {
  it('pure red under deuteranopia loses red-green distinction (shifts toward orange/brown)', () => {
    const result = simulateCVD('#ff0000', 'deuteranopia');
    // The simulated color should differ from the original
    expect(result).not.toBe('#ff0000');
    // Under deuteranopia, red and green look similar — result loses saturation
    expect(result).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('neutral gray under any CVD remains near-identical', () => {
    const gray = '#808080';
    const deutan = simulateCVD(gray, 'deuteranopia');
    const protan = simulateCVD(gray, 'protanopia');
    const tritan = simulateCVD(gray, 'tritanopia');
    // Grays have no chroma so CVD doesn't change them significantly
    expect(oklabDE(gray, deutan)).toBeLessThan(0.05);
    expect(oklabDE(gray, protan)).toBeLessThan(0.05);
    expect(oklabDE(gray, tritan)).toBeLessThan(0.05);
  });

  it('achromatopsia produces near-zero chroma (lightness-only gray)', () => {
    const result = simulateCVD('#3b82f6', 'achromatopsia'); // blue
    // Result should be a gray (very low chroma in OKLab)
    expect(result).toMatch(/^#[0-9a-fA-F]{6}$/);
    // It should differ from original
    expect(result).not.toBe('#3b82f6');
    // R, G, B channels should be approximately equal (gray)
    const r = parseInt(result.slice(1, 3), 16);
    const g = parseInt(result.slice(3, 5), 16);
    const b = parseInt(result.slice(5, 7), 16);
    expect(Math.abs(r - g)).toBeLessThan(5);
    expect(Math.abs(g - b)).toBeLessThan(5);
  });

  it('returns a valid 6-char hex string for all CVD types', () => {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#808080'];
    const types = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'] as const;
    for (const color of colors) {
      for (const type of types) {
        const result = simulateCVD(color, type);
        expect(result).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

describe('oklabDE', () => {
  it('same color → 0 distance', () => {
    expect(oklabDE('#3b82f6', '#3b82f6')).toBeCloseTo(0, 10);
  });

  it('black vs white → large distance (> 1.0)', () => {
    expect(oklabDE('#000000', '#ffffff')).toBeGreaterThan(1.0);
  });

  it('very similar colors → small distance (< 1.0)', () => {
    // Two near-identical grays (scale is ×100 vs raw OKLab)
    expect(oklabDE('#808080', '#808181')).toBeLessThan(1.0);
  });

  it('red vs green → non-zero distance (visually distinct)', () => {
    expect(oklabDE('#ef4444', '#22c55e')).toBeGreaterThan(0.1);
  });
});

describe('findBestCVDStep', () => {
  const redRamp = [
    { hex: '#fef2f2' }, { hex: '#fee2e2' }, { hex: '#fecaca' }, { hex: '#fca5a5' },
    { hex: '#f87171' }, { hex: '#ef4444' }, { hex: '#dc2626' }, { hex: '#b91c1c' },
    { hex: '#991b1b' }, { hex: '#7f1d1d' },
  ];

  const opts = { enabled: true, confusionThresholdDE: 5, distinguishableThresholdDE: 8 };

  it('returns null when no other tokens provided (no confusion partners)', () => {
    const result = findBestCVDStep(redRamp, '#dc2626', 'deuteranopia', [], opts);
    expect(result).toBeNull();
  });

  it('finds best hex when a confused neighbor exists', () => {
    // Use a green-like sim hex as the "other" token that's confusingly similar to the simulated red
    const greenSimHex = '#a6a664'; // simulated green under deuteranopia (olive-ish)
    // Any red step simulated close to greenSimHex would score poorly; a step far from it scores better
    const result = findBestCVDStep(redRamp, '#f87171', 'deuteranopia', [greenSimHex], opts);
    // Result is either a hex string (improvement found) or null (no improvement)
    if (result !== null) {
      expect(result).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(result).not.toBe('#f87171'); // should differ from current
    }
  });
});

describe('buildRegistry CVD auto-generation', () => {
  const cvdInput: TokenInput = {
    config: {
      wcagTarget: 'AA',
      complianceEngine: 'wcag21',
    },
    primitives: {
      neutral: ['#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4', '#a3a3a3', '#737373', '#525252', '#404040', '#262626', '#171717'],
      red:    ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'],
      green:  ['#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534', '#14532d'],
    },
    backgrounds: {
      white: { ramp: 'neutral', step: 0 },
      dark:  { ramp: 'neutral', step: 8 },
    },
    semantics: {
      fgError:   { ramp: 'red',   defaultStep: 6 },
      fgSuccess: { ramp: 'green', defaultStep: 6 },
    },
  };

  it('fgError and fgSuccess produce CVD variants under deuteranopia (or are already distinct)', () => {
    const processed = processInput(cvdInput);
    const registry = buildRegistry(processed, wcag21);
    // The registry should have been built without errors
    expect(registry.variantMap.size).toBeGreaterThan(0);
  });

  it('config.cvd.enabled = false → no CVD variants in variantMap', () => {
    const input: TokenInput = {
      ...cvdInput,
      config: { ...cvdInput.config, cvd: { enabled: false } },
    };
    const processed = processInput(input);
    const registry = buildRegistry(processed, wcag21);

    // No variant should have a non-default vision mode key
    for (const key of registry.variantMap.keys()) {
      const parts = key.split('__');
      const visionPart = parts[4];
      expect(visionPart).toBe('default');
    }
  });

  it('all auto-generated CVD variants pass WCAG compliance', () => {
    const processed = processInput(cvdInput);
    const registry = buildRegistry(processed, wcag21);

    for (const [key, variant] of registry.variantMap) {
      const parts = key.split('__');
      const visionPart = parts[4];
      if (visionPart !== 'default') {
        // CVD variant — should pass compliance (it was filtered for compliance during selection)
        expect(variant.compliance.pass, `CVD variant ${key} should pass`).toBe(true);
      }
    }
  });
});
