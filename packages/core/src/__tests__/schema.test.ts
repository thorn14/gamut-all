import { describe, it, expect } from 'vitest';
import { validateSchema } from '../schema.js';
import { hexToColorValue } from '../utils/oklch.js';

const cv = (hex: string) => hexToColorValue(hex);

const validPrimitives = {
  neutral: ['#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4', '#a3a3a3', '#737373', '#525252', '#404040', '#262626', '#171717'].map(cv),
  blue:    ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a'].map(cv),
};

const validThemes = {
  white: { ramp: 'neutral', step: 0 },
  dark:  { ramp: 'neutral', step: 8 },
};

const validForeground = {
  fgPrimary: { ramp: 'neutral', defaultStep: 8 },
};

const base = { primitives: validPrimitives, themes: validThemes, foreground: validForeground };

describe('validateSchema — top-level', () => {
  it('accepts valid minimal input', () => {
    const result = validateSchema(base);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects null', () => {
    const result = validateSchema(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/must be an object/);
  });

  it('rejects a string', () => {
    expect(validateSchema('hello').valid).toBe(false);
  });

  it('rejects missing primitives', () => {
    const result = validateSchema({ themes: validThemes, foreground: validForeground });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('primitives'))).toBe(true);
  });

  it('rejects primitives as array', () => {
    const result = validateSchema({ primitives: [], themes: validThemes, foreground: validForeground });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('primitives'))).toBe(true);
  });

  it('rejects missing themes', () => {
    const result = validateSchema({ primitives: validPrimitives, foreground: validForeground });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('themes'))).toBe(true);
  });

  it('rejects missing foreground', () => {
    const result = validateSchema({ primitives: validPrimitives, themes: validThemes });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('foreground'))).toBe(true);
  });

  it('rejects old semantics key with clear error', () => {
    const result = validateSchema({ primitives: validPrimitives, themes: validThemes, semantics: validForeground, foreground: validForeground });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('"semantics" is not valid'))).toBe(true);
  });
});

describe('validateSchema — primitives', () => {
  it('rejects ramp that is not an array', () => {
    const result = validateSchema({
      primitives: { neutral: 'not-an-array' },
      themes: validThemes,
      foreground: validForeground,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('primitives.neutral') && e.includes('array'))).toBe(true);
  });

  it('rejects invalid ColorValue in ramp', () => {
    const result = validateSchema({
      primitives: { neutral: [cv('#fafafa'), { colorSpace: 'invalid', components: [0] }, cv('#262626')] },
      themes: { white: { ramp: 'neutral', step: 0 } },
      foreground: { fgPrimary: { ramp: 'neutral', defaultStep: 2 } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('primitives.neutral[1]'))).toBe(true);
  });

  it('accepts 3-digit hex colors', () => {
    const result = validateSchema({
      primitives: { neutral: ['#fff', '#000'].map(cv) },
      themes: { white: { ramp: 'neutral', step: 0 } },
      foreground: { fg: { ramp: 'neutral', defaultStep: 1 } },
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateSchema — themes', () => {
  it('rejects theme with unknown ramp', () => {
    const result = validateSchema({
      primitives: validPrimitives,
      themes: { white: { ramp: 'missing', step: 0 } },
      foreground: validForeground,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('unknown ramp') && e.includes('missing'))).toBe(true);
  });

  it('rejects theme with out-of-bounds step', () => {
    const result = validateSchema({
      primitives: { neutral: ['#fafafa', '#262626'].map(cv) },
      themes: { white: { ramp: 'neutral', step: 5 } },
      foreground: { fg: { ramp: 'neutral', defaultStep: 0 } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('out of bounds'))).toBe(true);
  });

  it('rejects theme as array', () => {
    const result = validateSchema({
      primitives: validPrimitives,
      themes: { white: [] },
      foreground: validForeground,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('themes.white'))).toBe(true);
  });

  it('rejects theme with non-string ramp', () => {
    const result = validateSchema({
      primitives: validPrimitives,
      themes: { white: { ramp: 42, step: 0 } },
      foreground: validForeground,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('ramp must be a string'))).toBe(true);
  });

  it('accepts theme tone override with ramp swap', () => {
    const result = validateSchema({
      ...base,
      themes: {
        white: { ramp: 'neutral', step: 0, tone: { warm: { ramp: 'blue', step: 0 } } },
        dark:  { ramp: 'neutral', step: 8 },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects theme tone override with unknown ramp', () => {
    const result = validateSchema({
      ...base,
      themes: {
        white: { ramp: 'neutral', step: 0, tone: { warm: { ramp: 'missing', step: 0 } } },
        dark:  { ramp: 'neutral', step: 8 },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('themes.white.tone.warm.ramp'))).toBe(true);
  });
});

describe('validateSchema — foreground / nonText', () => {
  it('rejects semantic with unknown ramp', () => {
    const result = validateSchema({
      ...base,
      foreground: { fgPrimary: { ramp: 'missing', defaultStep: 0 } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('unknown ramp'))).toBe(true);
  });

  it('rejects semantic with out-of-bounds defaultStep', () => {
    const result = validateSchema({
      primitives: { neutral: ['#fafafa', '#262626'].map(cv) },
      themes: validThemes,
      foreground: { fg: { ramp: 'neutral', defaultStep: 9 } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('defaultStep'))).toBe(true);
  });

  it('accepts token with no defaultStep (auto-selected)', () => {
    const result = validateSchema({
      ...base,
      foreground: { fgAuto: { ramp: 'neutral' } },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects overrides as non-array', () => {
    const result = validateSchema({
      ...base,
      foreground: { fgPrimary: { ramp: 'neutral', defaultStep: 8, overrides: 'bad' } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('overrides must be an array'))).toBe(true);
  });

  it('rejects override with out-of-bounds step', () => {
    const result = validateSchema({
      ...base,
      foreground: {
        fgPrimary: {
          ramp: 'neutral',
          defaultStep: 8,
          overrides: [{ bg: 'white', step: 99 }],
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('overrides[0].step'))).toBe(true);
  });

  it('rejects override referencing unknown theme', () => {
    const result = validateSchema({
      ...base,
      foreground: {
        fgPrimary: {
          ramp: 'neutral',
          defaultStep: 8,
          overrides: [{ bg: 'nosuchbg', step: 5 }],
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('unknown theme') && e.includes('nosuchbg'))).toBe(true);
  });

  it('rejects interactions as array', () => {
    const result = validateSchema({
      ...base,
      foreground: { fgPrimary: { ramp: 'neutral', defaultStep: 8, interactions: [] } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('interactions must be an object'))).toBe(true);
  });

  it('rejects interaction state with out-of-bounds step', () => {
    const result = validateSchema({
      ...base,
      foreground: {
        fgLink: {
          ramp: 'neutral',
          defaultStep: 6,
          interactions: { hover: { step: 99 } },
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('interactions.hover.step'))).toBe(true);
  });

  it('rejects vision as array', () => {
    const result = validateSchema({
      ...base,
      foreground: { fgPrimary: { ramp: 'neutral', defaultStep: 8, vision: [] } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('vision must be an object'))).toBe(true);
  });

  it('rejects vision mode with unknown ramp', () => {
    const result = validateSchema({
      ...base,
      foreground: {
        fgError: {
          ramp: 'neutral',
          defaultStep: 6,
          vision: { deuteranopia: { ramp: 'missing', defaultStep: 0 } },
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('vision.deuteranopia'))).toBe(true);
  });

  it('rejects vision mode with out-of-bounds defaultStep', () => {
    const result = validateSchema({
      ...base,
      foreground: {
        fgError: {
          ramp: 'neutral',
          defaultStep: 6,
          vision: { deuteranopia: { defaultStep: 99 } },
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('vision.deuteranopia.defaultStep'))).toBe(true);
  });

  it('accepts valid vision override with ramp swap', () => {
    const result = validateSchema({
      ...base,
      foreground: {
        fgError: {
          ramp: 'neutral',
          defaultStep: 6,
          vision: { deuteranopia: { ramp: 'blue', defaultStep: 6 } },
        },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts valid tone override with ramp swap', () => {
    const result = validateSchema({
      ...base,
      foreground: {
        fgPrimary: {
          ramp: 'neutral',
          defaultStep: 8,
          tone: { warm: { ramp: 'blue', defaultStep: 6 } },
        },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects tone mode with unknown ramp', () => {
    const result = validateSchema({
      ...base,
      foreground: {
        fgPrimary: {
          ramp: 'neutral',
          defaultStep: 8,
          tone: { warm: { ramp: 'missing', defaultStep: 6 } },
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('tone.warm.ramp'))).toBe(true);
  });

  it('accepts valid nonText token', () => {
    const result = validateSchema({
      ...base,
      nonText: { borderMain: { ramp: 'neutral', defaultStep: 5 } },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts nonText token without defaultStep', () => {
    const result = validateSchema({
      ...base,
      nonText: { borderAuto: { ramp: 'neutral' } },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects nonText as array', () => {
    const result = validateSchema({ ...base, nonText: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('nonText must be an object'))).toBe(true);
  });

  it('accepts decorative: true on a nonText token', () => {
    const result = validateSchema({
      ...base,
      nonText: { borderMuted: { ramp: 'neutral', defaultStep: 3, decorative: true } },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts decorative: false on a nonText token', () => {
    const result = validateSchema({
      ...base,
      nonText: { borderMuted: { ramp: 'neutral', defaultStep: 3, decorative: false } },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects decorative as non-boolean', () => {
    const result = validateSchema({
      ...base,
      nonText: { borderMuted: { ramp: 'neutral', defaultStep: 3, decorative: 'yes' } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('decorative') && e.includes('boolean'))).toBe(true);
  });
});

describe('validateSchema — config', () => {
  it('rejects config as array', () => {
    const result = validateSchema({ ...base, config: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('config must be an object'))).toBe(true);
  });

  it('rejects defaultTheme that is not in themes', () => {
    const result = validateSchema({
      ...base,
      config: { defaultTheme: 'nonexistent' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('config.defaultTheme') && e.includes('nonexistent'))).toBe(true);
  });

  it('accepts valid defaultTheme', () => {
    const result = validateSchema({ ...base, config: { defaultTheme: 'white' } });
    expect(result.valid).toBe(true);
  });

  it('rejects defaultTheme as non-string', () => {
    const result = validateSchema({ ...base, config: { defaultTheme: 42 } });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('defaultTheme must be a string'))).toBe(true);
  });

  it('accepts valid stepSelectionStrategy', () => {
    const result = validateSchema({ ...base, config: { stepSelectionStrategy: 'mirror-closest' } });
    expect(result.valid).toBe(true);
  });

  it('rejects invalid stepSelectionStrategy', () => {
    const result = validateSchema({ ...base, config: { stepSelectionStrategy: 'something-else' } });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('config.stepSelectionStrategy'))).toBe(true);
  });
});
