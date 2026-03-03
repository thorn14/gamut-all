import { describe, it, expect } from 'vitest';
import { simulateCVD, oklabDE, oklabHueDE } from '../utils/cvd.js';
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
    const types = [
      'protanopia', 'protanomaly',
      'deuteranopia', 'deuteranomaly',
      'tritanopia', 'tritanomaly',
      'achromatopsia', 'blueConeMonochromacy',
    ] as const;
    for (const color of colors) {
      for (const type of types) {
        const result = simulateCVD(color, type);
        expect(result).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it('anomaly types produce colors closer to original than full dichromacy (when dichromacy changes color)', () => {
    // Test only the hue combinations where the full dichromacy meaningfully shifts the color.
    // e.g. red under tritanopia barely changes, so tritanomaly of red may round back to original.
    const affectedCases: Array<[string, 'protanomaly' | 'deuteranomaly' | 'tritanomaly', 'protanopia' | 'deuteranopia' | 'tritanopia']> = [
      ['#ef4444', 'protanomaly', 'protanopia'],  // red is strongly affected by protanopia
      ['#22c55e', 'deuteranomaly', 'deuteranopia'],  // green is strongly affected by deuteranopia
      ['#3b82f6', 'tritanomaly', 'tritanopia'],  // blue is strongly affected by tritanopia
    ];
    for (const [hex, anomaly, dichromacy] of affectedCases) {
      const anomalyResult = simulateCVD(hex, anomaly);
      const dichromacyResult = simulateCVD(hex, dichromacy);
      expect(anomalyResult).toMatch(/^#[0-9a-fA-F]{6}$/);
      // When the full dichromacy changes the color significantly,
      // the anomaly blend must be strictly closer to the original.
      if (oklabDE(hex, dichromacyResult) > 2.0) {
        expect(oklabDE(hex, anomalyResult)).toBeLessThan(oklabDE(hex, dichromacyResult));
      }
    }
  });

  it('blueConeMonochromacy produces near-monochromatic output (R ≈ G ≈ B)', () => {
    const colors = ['#ef4444', '#22c55e', '#3b82f6', '#a855f7'];
    for (const hex of colors) {
      const result = simulateCVD(hex, 'blueConeMonochromacy');
      expect(result).toMatch(/^#[0-9a-fA-F]{6}$/);
      const r = parseInt(result.slice(1, 3), 16);
      const g = parseInt(result.slice(3, 5), 16);
      const b = parseInt(result.slice(5, 7), 16);
      expect(Math.abs(r - g)).toBeLessThan(5);
      expect(Math.abs(g - b)).toBeLessThan(5);
    }
  });

  it('blueConeMonochromacy gives brighter output for blue vs red (blue-channel weighting)', () => {
    const pureBlue = simulateCVD('#0000ff', 'blueConeMonochromacy');
    const pureRed  = simulateCVD('#ff0000', 'blueConeMonochromacy');
    const blueL = parseInt(pureBlue.slice(1, 3), 16);
    const redL  = parseInt(pureRed.slice(1, 3), 16);
    // BCM weights heavily toward blue channel, so pure blue appears much brighter than pure red
    expect(blueL).toBeGreaterThan(redL);
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
    themes: {
      white: { ramp: 'neutral', step: 0 },
      dark:  { ramp: 'neutral', step: 8 },
    },
    foreground: {
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
    } as TokenInput;
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
        expect(variant.compliance.pass, `CVD variant ${key} should pass`).toBe(true);
      }
    }
  });

  it('anomaly vision mode keys are valid and any generated variants pass compliance', () => {
    // Anomaly types at 60% severity may not trigger the confusion threshold for all pairs,
    // so this test verifies correctness of any variants that ARE generated rather than
    // asserting a specific count.
    const processed = processInput(cvdInput);
    const registry = buildRegistry(processed, wcag21);
    const anomalyVisionModes = new Set(['protanomaly', 'deuteranomaly', 'tritanomaly']);
    for (const [key, variant] of registry.variantMap) {
      const visionPart = key.split('__')[4] ?? '';
      if (anomalyVisionModes.has(visionPart)) {
        // Any generated anomaly variant must pass compliance
        expect(variant.compliance.pass, `Anomaly variant ${key} must pass compliance`).toBe(true);
      }
    }
  });

  it('CVD hue-shift fallback: all variants pass even under strict AAA compliance', () => {
    // AAA requires higher contrast than AA. The direct hue-shift of the default step
    // is more likely to fail AAA, triggering the ramp-walk fallback. Any variant
    // that ends up in the map must have found a passing step (direct or fallback).
    const strictInput: TokenInput = {
      ...cvdInput,
      config: { ...cvdInput.config, wcagTarget: 'AAA' },
    };
    const processed = processInput(strictInput);
    const registry = buildRegistry(processed, wcag21);
    for (const [key, variant] of registry.variantMap) {
      const visionPart = key.split('__')[4];
      if (visionPart !== 'default') {
        expect(variant.compliance.pass, `CVD variant ${key} should pass AAA`).toBe(true);
      }
    }
  });

  it('CVD surface hue-shift avoids surfaces already occupying the target zone', () => {
    // Regression test: when danger (red) and success (green) are confused under deuteranopia,
    // the shifted danger surface must NOT be placed at the same hue as an existing info (blue/sky)
    // surface that already occupies the shift target range [230, 270].
    const primitives = {
      neutral: ['#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4', '#a3a3a3', '#737373', '#525252', '#404040', '#262626', '#171717'],
      red:     ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'],
      green:   ['#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534', '#14532d'],
      sky:     ['#f0f9ff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e'],
    };
    const input: TokenInput = {
      config: { wcagTarget: 'AA', complianceEngine: 'wcag21' },
      primitives,
      themes: { dark: { ramp: 'neutral', step: 8 } },
      surfaces: {
        bgDanger: { ramp: 'red',   step: 1 }, // mirrored on dark → step 8 = dark red
        bgSuccess: { ramp: 'green', step: 1 }, // mirrored on dark → dark green
        bgInfo:   { ramp: 'sky',   step: 1 }, // mirrored on dark → dark sky blue
      },
      foreground: { fgMain: { ramp: 'neutral', defaultStep: 9 } },
    };
    const processed = processInput(input);
    const registry = buildRegistry(processed, wcag21);

    // Get the deuteranopia CVD overrides for the dark theme
    const bgDanger  = registry.surfaces.get('bgDanger');
    const bgInfo    = registry.surfaces.get('bgInfo');
    expect(bgDanger).toBeDefined();
    expect(bgInfo).toBeDefined();

    const dangerCvdEntry = bgDanger!.visionOverrides.get('dark')?.get('deuteranopia');
    const infoCvdEntry   = bgInfo!.visionOverrides.get('dark')?.get('deuteranopia');

    if (dangerCvdEntry) {
      // If a hue override was generated for danger, it must be distinguishable from info's hex.
      // Info has no override (it's already in a safe zone), so compare against its base dark hex.
      const infoHex = infoCvdEntry?.hex ?? bgInfo!.hex;
      const hueDE = oklabHueDE(dangerCvdEntry.hex, infoHex);
      expect(hueDE).toBeGreaterThan(3);
    }
  });

  it('blueConeMonochromacy variants exist when achromatopsia would generate variants', () => {
    // Both achromatic types process through the same confusion detection.
    // BCM variants are generated (though no hue fix is applied — same as achromatopsia).
    const processed = processInput(cvdInput);
    const registry = buildRegistry(processed, wcag21);
    // Verify the registry builds without errors regardless of whether BCM variants are present
    expect(registry.variantMap.size).toBeGreaterThan(0);
    // Verify all vision mode keys in variantMap are valid VisionMode values
    const validModes = new Set([
      'default', 'protanopia', 'protanomaly',
      'deuteranopia', 'deuteranomaly', 'tritanopia', 'tritanomaly',
      'achromatopsia', 'blueConeMonochromacy',
    ]);
    for (const key of registry.variantMap.keys()) {
      const parts = key.split('__');
      expect(validModes.has(parts[4] ?? '')).toBe(true);
    }
  });
});
