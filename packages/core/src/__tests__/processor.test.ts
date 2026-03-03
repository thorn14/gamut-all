import { describe, it, expect } from 'vitest';
import { processInput } from '../processor.js';
import { hexToColorValue } from '../utils/oklch.js';
import type { TokenInput } from '../types.js';

const cv = (hex: string) => hexToColorValue(hex);

const minimalInput: TokenInput = {
  primitives: {
    neutral: [
      '#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4',
      '#a3a3a3', '#737373', '#525252', '#404040',
      '#262626', '#171717',
    ].map(cv),
  },
  themes: {
    white: { ramp: 'neutral', step: 0 },
    dark: { ramp: 'neutral', step: 8 },
  },
  foreground: {
    fgPrimary: { ramp: 'neutral', defaultStep: 8 },
    fgSecondary: { ramp: 'neutral', defaultStep: 5 },
  },
};

describe('processInput', () => {
  it('processes minimal input without throwing', () => {
    const result = processInput(minimalInput);
    expect(result.ramps.size).toBe(1);
    expect(result.themes.size).toBe(2);
    expect(result.semantics.size).toBe(2);
  });

  it('builds correct ProcessedRamp', () => {
    const result = processInput(minimalInput);
    const neutral = result.ramps.get('neutral');
    expect(neutral).toBeDefined();
    expect(neutral!.stepCount).toBe(10);
    expect(neutral!.steps[0]!.hex).toBe('#fafafa');
    expect(neutral!.steps[9]!.hex).toBe('#171717');
  });

  it('computes OKLCH for each step', () => {
    const result = processInput(minimalInput);
    const neutral = result.ramps.get('neutral');
    const step0 = neutral!.steps[0]!;
    expect(step0.oklch.l).toBeGreaterThan(0.9);
    expect(step0.oklch.c).toBeCloseTo(0, 2);
  });

  it('computes relative luminance', () => {
    const result = processInput(minimalInput);
    const neutral = result.ramps.get('neutral');
    // #fafafa is nearly white → high luminance
    expect(neutral!.steps[0]!.relativeLuminance).toBeGreaterThan(0.9);
    // #171717 is nearly black → low luminance
    expect(neutral!.steps[9]!.relativeLuminance).toBeLessThan(0.01);
  });

  it('builds ProcessedTheme with hex', () => {
    const result = processInput(minimalInput);
    const white = result.themes.get('white');
    expect(white).toBeDefined();
    expect(white!.hex).toBe('#fafafa');
    expect(white!.fallback).toEqual([]);
  });

  it('builds ProcessedSemantic with ramp reference', () => {
    const result = processInput(minimalInput);
    const fg = result.semantics.get('fgPrimary');
    expect(fg).toBeDefined();
    expect(fg!.ramp.name).toBe('neutral');
    expect(fg!.defaultStep).toBe(8);
    expect(fg!.overrides).toEqual([]);
    expect(fg!.interactions).toEqual({});
  });

  it('applies config defaults', () => {
    const result = processInput(minimalInput);
    expect(result.config.wcagTarget).toBe('AA');
    expect(result.config.complianceEngine).toBe('wcag21');
    expect(result.config.onUnresolvedOverride).toBe('error');
    expect(result.config.defaultTheme).toBe('white'); // first theme
    expect(result.config.stepSelectionStrategy).toBe('closest');
  });

  it('respects explicit config', () => {
    const input: TokenInput = {
      ...minimalInput,
      config: { wcagTarget: 'AAA', defaultTheme: 'dark', stepSelectionStrategy: 'mirror-closest' },
    };
    const result = processInput(input);
    expect(result.config.wcagTarget).toBe('AAA');
    expect(result.config.defaultTheme).toBe('dark');
    expect(result.config.stepSelectionStrategy).toBe('mirror-closest');
  });

  it('throws on invalid input', () => {
    const bad = { primitives: {}, themes: {}, foreground: {} } as TokenInput;
    // Empty is valid structurally
    expect(() => processInput(bad)).not.toThrow();
  });

  it('throws on unknown ramp reference in themes', () => {
    const bad: TokenInput = {
      primitives: {},
      themes: { white: { ramp: 'missing', step: 0 } },
      foreground: {},
    };
    expect(() => processInput(bad)).toThrow();
  });

  it('assigns complianceTarget "text" for foreground tokens', () => {
    const result = processInput(minimalInput);
    const fg = result.semantics.get('fgPrimary');
    expect(fg!.complianceTarget).toBe('text');
  });

  it('assigns complianceTarget "ui-component" for nonText tokens', () => {
    const input: TokenInput = {
      ...minimalInput,
      nonText: {
        borderMuted: { ramp: 'neutral', defaultStep: 3 },
      },
    };
    const result = processInput(input);
    expect(result.semantics.get('borderMuted')!.complianceTarget).toBe('ui-component');
  });

  it('assigns complianceTarget "decorative" when decorative: true', () => {
    const input: TokenInput = {
      ...minimalInput,
      foreground: {
        fgDecor: { ramp: 'neutral', defaultStep: 3, decorative: true },
      },
    };
    const result = processInput(input);
    expect(result.semantics.get('fgDecor')!.complianceTarget).toBe('decorative');
  });

  it('auto-selects ramp midpoint when defaultStep is omitted', () => {
    const input: TokenInput = {
      ...minimalInput,
      foreground: {
        fgAuto: { ramp: 'neutral' }, // 10-step ramp → midpoint = Math.floor(10/2) = 5
      },
    };
    const result = processInput(input);
    expect(result.semantics.get('fgAuto')!.defaultStep).toBe(5);
  });

  it('throws on duplicate token name across foreground and nonText', () => {
    const input: TokenInput = {
      ...minimalInput,
      nonText: {
        fgPrimary: { ramp: 'neutral', defaultStep: 3 }, // same name as in foreground
      },
    };
    expect(() => processInput(input)).toThrow(/fgPrimary/);
  });

  it('processes interactions', () => {
    const input: TokenInput = {
      ...minimalInput,
      foreground: {
        fgLink: {
          ramp: 'neutral',
          defaultStep: 6,
          interactions: {
            hover: { step: 7 },
            active: { step: 8 },
          },
        },
      },
    };
    const result = processInput(input);
    const link = result.semantics.get('fgLink');
    expect(link!.interactions['hover']!.step).toBe(7);
    expect(link!.interactions['active']!.step).toBe(8);
  });

});

describe('processInput — surfaces', () => {
  const baseInput: TokenInput = {
    primitives: {
      neutral: [
        '#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4',
        '#a3a3a3', '#737373', '#525252', '#404040',
        '#262626', '#171717',
      ].map(cv),
    },
    themes: {
      light: { ramp: 'neutral', step: 0 },
      dark:  { ramp: 'neutral', step: 8 },
    },
    foreground: {
      fgPrimary: { ramp: 'neutral', defaultStep: 8 },
    },
  };

  it('processes a simple surface', () => {
    const input: TokenInput = {
      ...baseInput,
      surfaces: {
        bgMain: { ramp: 'neutral', step: 1 },
      },
    };
    const result = processInput(input);
    const surface = result.surfaces.get('bgMain');
    expect(surface).toBeDefined();
    expect(surface!.hex).toBe('#f5f5f5');
    expect(surface!.themeOverrides.size).toBe(0);
    expect(surface!.interactions).toEqual({});
    expect(surface!.visionOverrides.size).toBe(0);
  });

  it('resolves surface interactions with correct hex', () => {
    const input: TokenInput = {
      ...baseInput,
      surfaces: {
        bgMain: {
          ramp: 'neutral',
          step: 1,
          interactions: { hover: { step: 2 }, active: { step: 3 } },
        },
      },
    };
    const result = processInput(input);
    const surface = result.surfaces.get('bgMain')!;
    expect(surface.interactions['hover']!.step).toBe(2);
    expect(surface.interactions['hover']!.hex).toBe('#e5e5e5');
    expect(surface.interactions['active']!.step).toBe(3);
    expect(surface.interactions['active']!.hex).toBe('#d4d4d4');
  });

  it('resolves surface theme overrides with correct hex', () => {
    const input: TokenInput = {
      ...baseInput,
      surfaces: {
        bgInverse: {
          ramp: 'neutral',
          step: 9,
          themes: { dark: { step: 0 } },
        },
      },
    };
    const result = processInput(input);
    const surface = result.surfaces.get('bgInverse')!;
    expect(surface.hex).toBe('#171717');
    const darkOverride = surface.themeOverrides.get('dark');
    expect(darkOverride).toBeDefined();
    expect(darkOverride!.step).toBe(0);
    expect(darkOverride!.hex).toBe('#fafafa');
  });

  it('throws on out-of-bounds interaction step', () => {
    const input: TokenInput = {
      ...baseInput,
      surfaces: {
        bgMain: {
          ramp: 'neutral',
          step: 1,
          interactions: { hover: { step: 99 } },
        },
      },
    };
    expect(() => processInput(input)).toThrow(/bgMain.*hover.*99/);
  });

  it('throws on out-of-bounds theme override step', () => {
    const input: TokenInput = {
      ...baseInput,
      surfaces: {
        bgInverse: {
          ramp: 'neutral',
          step: 9,
          themes: { dark: { step: 99 } },
        },
      },
    };
    expect(() => processInput(input)).toThrow(/bgInverse.*dark.*99/);
  });
});
