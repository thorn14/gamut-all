import { describe, it, expect } from 'vitest';
import { applyToneMode } from '../tone.js';
import { hexToColorValue } from '../utils/oklch.js';
import type { TokenInput } from '../types.js';

const cv = (hex: string) => hexToColorValue(hex);

const baseInput: TokenInput = {
  primitives: {
    slate: ['#f8fafc', '#0f172a'].map(cv),
    stone: ['#fafaf9', '#1c1917'].map(cv),
  },
  themes: {
    light: { ramp: 'slate', step: 0, tone: { warm: { ramp: 'stone', step: 0 } } },
    dark: { ramp: 'slate', step: 1 },
  },
  foreground: {
    fgPrimary: {
      ramp: 'slate',
      defaultStep: 1,
      tone: {
        warm: { ramp: 'stone' },
      },
    },
    fgAccent: {
      ramp: 'slate',
      defaultStep: 1,
    },
  },
};

describe('applyToneMode', () => {
  it('returns a cloned input when tone mode is default', () => {
    const result = applyToneMode(baseInput, 'default');
    expect(result).not.toBe(baseInput);
    expect(result.foreground['fgPrimary']?.ramp).toBe('slate');
  });

  it('applies semantic tone ramp override when mode exists', () => {
    const result = applyToneMode(baseInput, 'warm');
    expect(result.foreground['fgPrimary']?.ramp).toBe('stone');
    expect(result.foreground['fgAccent']?.ramp).toBe('slate');
  });

  it('applies theme tone overrides when mode exists', () => {
    const result = applyToneMode(baseInput, 'warm');
    expect(result.themes['light']?.ramp).toBe('stone');
    expect(result.themes['light']?.step).toBe(0);
    expect(result.themes['dark']?.ramp).toBe('slate');
  });

  it('applies tone override to nonText tokens', () => {
    const inputWithNonText: TokenInput = {
      ...baseInput,
      nonText: {
        borderMain: {
          ramp: 'slate',
          defaultStep: 1,
          tone: { warm: { ramp: 'stone' } },
        },
      },
    };
    const result = applyToneMode(inputWithNonText, 'warm');
    expect(result.nonText?.['borderMain']?.ramp).toBe('stone');
  });
});
