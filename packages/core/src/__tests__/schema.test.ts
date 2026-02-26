import { describe, it, expect } from 'vitest';
import { validateSchema } from '../schema.js';

const validPrimitives = {
  neutral: ['#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4', '#a3a3a3', '#737373', '#525252', '#404040', '#262626', '#171717'],
  blue:    ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a'],
};

const validBackgrounds = {
  white: { ramp: 'neutral', step: 0 },
  dark:  { ramp: 'neutral', step: 8 },
};

const validSemantics = {
  fgPrimary: { ramp: 'neutral', defaultStep: 8 },
};

const base = { primitives: validPrimitives, backgrounds: validBackgrounds, semantics: validSemantics };

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
    const result = validateSchema({ backgrounds: validBackgrounds, semantics: validSemantics });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('primitives'))).toBe(true);
  });

  it('rejects primitives as array', () => {
    const result = validateSchema({ primitives: [], backgrounds: validBackgrounds, semantics: validSemantics });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('primitives'))).toBe(true);
  });

  it('rejects missing backgrounds', () => {
    const result = validateSchema({ primitives: validPrimitives, semantics: validSemantics });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('backgrounds'))).toBe(true);
  });

  it('rejects missing semantics', () => {
    const result = validateSchema({ primitives: validPrimitives, backgrounds: validBackgrounds });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('semantics'))).toBe(true);
  });
});

describe('validateSchema — primitives', () => {
  it('rejects ramp that is not an array', () => {
    const result = validateSchema({
      primitives: { neutral: 'not-an-array' },
      backgrounds: validBackgrounds,
      semantics: validSemantics,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('primitives.neutral') && e.includes('array'))).toBe(true);
  });

  it('rejects invalid hex in ramp', () => {
    const result = validateSchema({
      primitives: { neutral: ['#fafafa', 'notahex', '#262626'] },
      backgrounds: { white: { ramp: 'neutral', step: 0 } },
      semantics: { fgPrimary: { ramp: 'neutral', defaultStep: 2 } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('primitives.neutral[1]'))).toBe(true);
  });

  it('accepts 3-digit hex colors', () => {
    const result = validateSchema({
      primitives: { neutral: ['#fff', '#000'] },
      backgrounds: { white: { ramp: 'neutral', step: 0 } },
      semantics: { fg: { ramp: 'neutral', defaultStep: 1 } },
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateSchema — backgrounds', () => {
  it('rejects background with unknown ramp', () => {
    const result = validateSchema({
      primitives: validPrimitives,
      backgrounds: { white: { ramp: 'missing', step: 0 } },
      semantics: validSemantics,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('unknown ramp') && e.includes('missing'))).toBe(true);
  });

  it('rejects background with out-of-bounds step', () => {
    const result = validateSchema({
      primitives: { neutral: ['#fafafa', '#262626'] },
      backgrounds: { white: { ramp: 'neutral', step: 5 } },
      semantics: { fg: { ramp: 'neutral', defaultStep: 0 } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('out of bounds'))).toBe(true);
  });

  it('rejects background as array', () => {
    const result = validateSchema({
      primitives: validPrimitives,
      backgrounds: { white: [] },
      semantics: validSemantics,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('backgrounds.white'))).toBe(true);
  });

  it('rejects background with non-string ramp', () => {
    const result = validateSchema({
      primitives: validPrimitives,
      backgrounds: { white: { ramp: 42, step: 0 } },
      semantics: validSemantics,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('ramp must be a string'))).toBe(true);
  });
});

describe('validateSchema — semantics', () => {
  it('rejects semantic with unknown ramp', () => {
    const result = validateSchema({
      ...base,
      semantics: { fgPrimary: { ramp: 'missing', defaultStep: 0 } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('unknown ramp'))).toBe(true);
  });

  it('rejects semantic with out-of-bounds defaultStep', () => {
    const result = validateSchema({
      primitives: { neutral: ['#fafafa', '#262626'] },
      backgrounds: validBackgrounds,
      semantics: { fg: { ramp: 'neutral', defaultStep: 9 } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('defaultStep'))).toBe(true);
  });

  it('rejects overrides as non-array', () => {
    const result = validateSchema({
      ...base,
      semantics: { fgPrimary: { ramp: 'neutral', defaultStep: 8, overrides: 'bad' } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('overrides must be an array'))).toBe(true);
  });

  it('rejects override with out-of-bounds step', () => {
    const result = validateSchema({
      ...base,
      semantics: {
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

  it('rejects override referencing unknown background', () => {
    const result = validateSchema({
      ...base,
      semantics: {
        fgPrimary: {
          ramp: 'neutral',
          defaultStep: 8,
          overrides: [{ bg: 'nosuchbg', step: 5 }],
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('unknown background') && e.includes('nosuchbg'))).toBe(true);
  });

  it('rejects interactions as array', () => {
    const result = validateSchema({
      ...base,
      semantics: { fgPrimary: { ramp: 'neutral', defaultStep: 8, interactions: [] } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('interactions must be an object'))).toBe(true);
  });

  it('rejects interaction state with out-of-bounds step', () => {
    const result = validateSchema({
      ...base,
      semantics: {
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
      semantics: { fgPrimary: { ramp: 'neutral', defaultStep: 8, vision: [] } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('vision must be an object'))).toBe(true);
  });

  it('rejects vision mode with unknown ramp', () => {
    const result = validateSchema({
      ...base,
      semantics: {
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
      semantics: {
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
      semantics: {
        fgError: {
          ramp: 'neutral',
          defaultStep: 6,
          vision: { deuteranopia: { ramp: 'blue', defaultStep: 6 } },
        },
      },
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateSchema — config', () => {
  it('rejects config as array', () => {
    const result = validateSchema({ ...base, config: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('config must be an object'))).toBe(true);
  });

  it('rejects defaultBg that is not in backgrounds', () => {
    const result = validateSchema({
      ...base,
      config: { defaultBg: 'nonexistent' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('config.defaultBg') && e.includes('nonexistent'))).toBe(true);
  });

  it('accepts valid defaultBg', () => {
    const result = validateSchema({ ...base, config: { defaultBg: 'white' } });
    expect(result.valid).toBe(true);
  });

  it('rejects defaultBg as non-string', () => {
    const result = validateSchema({ ...base, config: { defaultBg: 42 } });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('defaultBg must be a string'))).toBe(true);
  });
});
