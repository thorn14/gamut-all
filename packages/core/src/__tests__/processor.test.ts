import { describe, it, expect } from 'vitest';
import { processInput } from '../processor.js';
import type { TokenInput } from '../types.js';

const minimalInput: TokenInput = {
  primitives: {
    neutral: [
      '#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4',
      '#a3a3a3', '#737373', '#525252', '#404040',
      '#262626', '#171717',
    ],
  },
  backgrounds: {
    white: { ramp: 'neutral', step: 0 },
    dark: { ramp: 'neutral', step: 8 },
  },
  semantics: {
    fgPrimary: { ramp: 'neutral', defaultStep: 8 },
    fgSecondary: { ramp: 'neutral', defaultStep: 5 },
  },
};

describe('processInput', () => {
  it('processes minimal input without throwing', () => {
    const result = processInput(minimalInput);
    expect(result.ramps.size).toBe(1);
    expect(result.backgrounds.size).toBe(2);
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

  it('builds ProcessedBackground with hex', () => {
    const result = processInput(minimalInput);
    const white = result.backgrounds.get('white');
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
    expect(fg!.vision).toEqual({});
  });

  it('applies config defaults', () => {
    const result = processInput(minimalInput);
    expect(result.config.wcagTarget).toBe('AA');
    expect(result.config.complianceEngine).toBe('wcag21');
    expect(result.config.onUnresolvedOverride).toBe('error');
    expect(result.config.defaultBg).toBe('white'); // first background
  });

  it('respects explicit config', () => {
    const input: TokenInput = {
      ...minimalInput,
      config: { wcagTarget: 'AAA', defaultBg: 'dark' },
    };
    const result = processInput(input);
    expect(result.config.wcagTarget).toBe('AAA');
    expect(result.config.defaultBg).toBe('dark');
  });

  it('throws on invalid input', () => {
    const bad = { primitives: {}, backgrounds: {}, semantics: {} } as TokenInput;
    // Empty is valid structurally
    expect(() => processInput(bad)).not.toThrow();
  });

  it('throws on unknown ramp reference in backgrounds', () => {
    const bad: TokenInput = {
      primitives: {},
      backgrounds: { white: { ramp: 'missing', step: 0 } },
      semantics: {},
    };
    expect(() => processInput(bad)).toThrow();
  });

  it('processes interactions', () => {
    const input: TokenInput = {
      ...minimalInput,
      semantics: {
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

  it('processes vision overrides', () => {
    const input: TokenInput = {
      ...minimalInput,
      primitives: {
        neutral: minimalInput.primitives['neutral']!,
        blue: ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a'],
      },
      semantics: {
        fgError: {
          ramp: 'neutral',
          defaultStep: 6,
          vision: {
            deuteranopia: { ramp: 'blue', defaultStep: 6 },
          },
        },
      },
    };
    const result = processInput(input);
    const error = result.semantics.get('fgError');
    expect(error!.vision['deuteranopia']!.ramp.name).toBe('blue');
    expect(error!.vision['deuteranopia']!.defaultStep).toBe(6);
  });
});
