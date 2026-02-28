import { describe, it, expect } from 'vitest';
import { processInput } from '../processor.js';
import type { TokenInput } from '../types.js';

describe('processInput — edge cases', () => {
  it('throws on invalid hex in primitives', () => {
    const bad: TokenInput = {
      primitives: { neutral: ['notahex'] },
      themes: { white: { ramp: 'neutral', step: 0 } },
      semantics: { fg: { ramp: 'neutral', defaultStep: 0 } },
    };
    expect(() => processInput(bad)).toThrow();
  });

  it('throws on semantic referencing unknown ramp', () => {
    const bad: TokenInput = {
      primitives: { neutral: ['#fafafa'] },
      themes: { white: { ramp: 'neutral', step: 0 } },
      semantics: { fg: { ramp: 'ghost', defaultStep: 0 } },
    };
    expect(() => processInput(bad)).toThrow(/unknown ramp/i);
  });

  it('throws on vision mode referencing unknown ramp', () => {
    const bad: TokenInput = {
      primitives: { neutral: ['#fafafa', '#262626'] },
      themes: { white: { ramp: 'neutral', step: 0 } },
      semantics: {
        fgError: {
          ramp: 'neutral',
          defaultStep: 1,
          vision: { deuteranopia: { ramp: 'ghost' } },
        },
      },
    };
    expect(() => processInput(bad)).toThrow(/unknown ramp/i);
  });

  it('uses defaultStep from base token when vision defaultStep not provided', () => {
    const input: TokenInput = {
      primitives: {
        neutral: ['#fafafa', '#f5f5f5', '#e5e5e5', '#262626'],
        blue:    ['#eff6ff', '#3b82f6', '#2563eb', '#1e3a8a'],
      },
      themes: { white: { ramp: 'neutral', step: 0 } },
      semantics: {
        fgError: {
          ramp: 'neutral',
          defaultStep: 3,
          vision: { deuteranopia: { ramp: 'blue' } }, // no defaultStep
        },
      },
    };
    const result = processInput(input);
    const error = result.semantics.get('fgError');
    // Should inherit defaultStep=3 from base
    expect(error!.vision['deuteranopia']!.defaultStep).toBe(3);
    expect(error!.vision['deuteranopia']!.ramp.name).toBe('blue');
  });

  it('processes interaction overrides', () => {
    const input: TokenInput = {
      primitives: {
        neutral: ['#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4', '#a3a3a3', '#737373', '#525252', '#404040', '#262626', '#171717'],
      },
      themes: { white: { ramp: 'neutral', step: 0 } },
      semantics: {
        fgLink: {
          ramp: 'neutral',
          defaultStep: 6,
          interactions: {
            hover: {
              step: 7,
              overrides: [{ bg: 'white', step: 8 }],
            },
          },
        },
      },
    };
    const result = processInput(input);
    const link = result.semantics.get('fgLink');
    expect(link!.interactions['hover']!.step).toBe(7);
    expect(link!.interactions['hover']!.overrides).toHaveLength(1);
    expect(link!.interactions['hover']!.overrides[0]!.step).toBe(8);
  });

  it('includes fallback and aliases from themes', () => {
    const input: TokenInput = {
      primitives: { neutral: ['#fafafa', '#262626'] },
      themes: {
        white: { ramp: 'neutral', step: 0, fallback: ['dark'], aliases: ['surface-0', 'bg-white'] },
        dark:  { ramp: 'neutral', step: 1 },
      },
      semantics: { fg: { ramp: 'neutral', defaultStep: 1 } },
    };
    const result = processInput(input);
    const white = result.themes.get('white');
    expect(white!.fallback).toEqual(['dark']);
    expect(white!.aliases).toEqual(['surface-0', 'bg-white']);
  });

  it('warns about non-monotonic luminance but does not throw', () => {
    // Put a brighter step in the middle of an otherwise dark-to-light ramp
    const input: TokenInput = {
      primitives: {
        // step 2 is brighter than step 1, breaking monotonicity
        weird: ['#262626', '#737373', '#fafafa', '#404040', '#171717'],
      },
      themes: { dark: { ramp: 'weird', step: 0 } },
      semantics: { fg: { ramp: 'weird', defaultStep: 4 } },
    };
    // Should not throw — just warns internally
    expect(() => processInput(input)).not.toThrow();
  });

  it('config defaults: complianceEngine defaults to wcag21', () => {
    const input: TokenInput = {
      primitives: { neutral: ['#fafafa', '#262626'] },
      themes: { white: { ramp: 'neutral', step: 0 } },
      semantics: { fg: { ramp: 'neutral', defaultStep: 1 } },
    };
    const result = processInput(input);
    expect(result.config.complianceEngine).toBe('wcag21');
  });

  it('config defaults: onUnresolvedOverride defaults to error', () => {
    const input: TokenInput = {
      primitives: { neutral: ['#fafafa', '#262626'] },
      themes: { white: { ramp: 'neutral', step: 0 } },
      semantics: { fg: { ramp: 'neutral', defaultStep: 1 } },
    };
    const result = processInput(input);
    expect(result.config.onUnresolvedOverride).toBe('error');
  });

  it('config: accepts complianceEngine apca', () => {
    const input: TokenInput = {
      primitives: { neutral: ['#fafafa', '#262626'] },
      themes: { white: { ramp: 'neutral', step: 0 } },
      semantics: { fg: { ramp: 'neutral', defaultStep: 1 } },
      config: { complianceEngine: 'apca' },
    };
    const result = processInput(input);
    expect(result.config.complianceEngine).toBe('apca');
  });
});
