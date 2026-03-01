import { describe, it, expect } from 'vitest';
import { findClosestPassingStep, autoGenerateRules, expandOverride, patchWithOverrides } from '../rule-generator.js';
import { processInput } from '../processor.js';
import { wcag21 } from '../compliance/wcag21.js';
import { hexToColorValue } from '../utils/oklch.js';
import type { TokenInput, ProcessedRamp } from '../types.js';
import { ALL_FONT_SIZES, ALL_STACKS } from '../types.js';

const cv = (hex: string) => hexToColorValue(hex);

const neutralHexes = [
  '#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4',
  '#a3a3a3', '#737373', '#525252', '#404040',
  '#262626', '#171717',
].map(cv);

const baseInput: TokenInput = {
  primitives: { neutral: neutralHexes },
  config: {
    stacks: { root: 0, card: 1, modal: 2 },
  },
  themes: {
    white: { ramp: 'neutral', step: 0 },
    dark: { ramp: 'neutral', step: 8 },
    inverse: { ramp: 'neutral', step: 9 },
  },
  foreground: {
    fgSecondary: { ramp: 'neutral', defaultStep: 5 },
  },
};

function getProcessed() {
  return processInput(baseInput);
}

describe('findClosestPassingStep', () => {
  const processed = getProcessed();
  const neutral = processed.ramps.get('neutral')!;
  const whiteTheme = processed.themes.get('white')!;

  it('returns preferredStep if it passes', () => {
    // Step 8 (#262626) easily passes AA on white
    const result = findClosestPassingStep(
      neutral, 8,
      (hex) => wcag21.evaluate(hex, whiteTheme.hex, { fontSizePx: 16, fontWeight: 400, target: 'text', level: 'AA' }).pass,
      'darker',
    );
    expect(result).toBe(8);
  });

  it('searches darker when direction=darker', () => {
    // Step 4 (#a3a3a3) fails AA on white — should find closer passing step going dark
    const result = findClosestPassingStep(
      neutral, 4,
      (hex) => wcag21.evaluate(hex, whiteTheme.hex, { fontSizePx: 16, fontWeight: 400, target: 'text', level: 'AA' }).pass,
      'darker',
    );
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(4);
  });

  it('searches lighter when direction=lighter', () => {
    // On dark bg (#262626), step 5 (#737373) fails AA (~2.7:1).
    // Searching lighter (toward index 0) should find step 4 (#a3a3a3) which passes (~5.2:1).
    const darkTheme = processed.themes.get('dark')!;
    const result = findClosestPassingStep(
      neutral, 5,
      (hex) => wcag21.evaluate(hex, darkTheme.hex, { fontSizePx: 16, fontWeight: 400, target: 'text', level: 'AA' }).pass,
      'lighter',
    );
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(5);
  });

  it('returns null if no step passes in direction', () => {
    // Create a tiny ramp where nothing passes
    const tinyRamp: ProcessedRamp = {
      name: 'tiny',
      steps: [{ index: 0, hex: '#808080', oklch: { l: 0.5, c: 0, h: 0 }, relativeLuminance: 0.2 }],
      stepCount: 1,
    };
    const result = findClosestPassingStep(tinyRamp, 0, () => false, 'darker');
    expect(result).toBeNull();
  });

  it('either direction returns closer passing step', () => {
    const result = findClosestPassingStep(
      neutral, 5,
      (hex) => wcag21.evaluate(hex, whiteTheme.hex, { fontSizePx: 16, fontWeight: 400, target: 'text', level: 'AA' }).pass,
      'either',
    );
    // Should find a passing step
    expect(result).not.toBeNull();
  });
});

describe('autoGenerateRules', () => {
  it('generates rules for failing contexts', () => {
    const processed = getProcessed();
    const neutral = processed.ramps.get('neutral')!;
    const rules = autoGenerateRules(neutral, 5, processed.themes, wcag21, 'AA', ALL_FONT_SIZES, ALL_STACKS);
    // fgSecondary step 5 (#737373) may fail on some themes
    expect(Array.isArray(rules)).toBe(true);
  });

  it('generates rules across all stack levels', () => {
    const processed = getProcessed();
    const neutral = processed.ramps.get('neutral')!;
    const rules = autoGenerateRules(neutral, 5, processed.themes, wcag21, 'AA', ALL_FONT_SIZES, ALL_STACKS);
    // Rules now span all stacks — each rule has a valid stack name
    const stacksInRules = new Set(rules.map(r => r.stack));
    expect(stacksInRules.size).toBeGreaterThan(1); // multiple stacks are represented
    for (const rule of rules) {
      expect(typeof rule.stack).toBe('string');
      expect(rule.stack.length).toBeGreaterThan(0);
    }
  });

  it('does not emit rules when defaultStep passes', () => {
    // Step 8 (#262626) on white has 21:1 contrast — no rules needed
    const processed = getProcessed();
    const neutral = processed.ramps.get('neutral')!;
    // Use only white theme
    const onlyWhite = new Map([['white', processed.themes.get('white')!]]);
    const rules = autoGenerateRules(neutral, 8, onlyWhite, wcag21, 'AA', ALL_FONT_SIZES, ALL_STACKS);
    expect(rules).toHaveLength(0);
  });

  it('emits rules for failing contexts (dark bg, light step)', () => {
    // Step 5 (#737373) on dark bg (#262626): low contrast → need lighter step
    const processed = getProcessed();
    const neutral = processed.ramps.get('neutral')!;
    const onlyDark = new Map([['dark', processed.themes.get('dark')!]]);
    const rules = autoGenerateRules(neutral, 5, onlyDark, wcag21, 'AA', ALL_FONT_SIZES, ALL_STACKS);
    // Should generate rules
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.step).not.toBe(5);
    }
  });

  it('deduplicates rules with same bg+fontSize+stack', () => {
    const processed = getProcessed();
    const neutral = processed.ramps.get('neutral')!;
    const rules = autoGenerateRules(neutral, 5, processed.themes, wcag21, 'AA', ALL_FONT_SIZES, ALL_STACKS);
    const keys = rules.map(r => `${r.bg}__${r.fontSize}__${r.stack}`);
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });

  it('mirror-closest strategy prefers mirrored step for root stack', () => {
    const processed = getProcessed();
    const neutral = processed.ramps.get('neutral')!;
    const onlyDark = new Map([['dark', processed.themes.get('dark')!]]);

    const rules = autoGenerateRules(
      neutral,
      8,
      onlyDark,
      wcag21,
      'AA',
      ALL_FONT_SIZES,
      // Only test root stack to isolate the mirror-closest behaviour
      ['root'],
      'mirror-closest',
    );

    // Step 8 (#262626) on dark surface (step 8 = #262626 for root): fails AA.
    // Mirror of step 8 in a 10-step ramp (0-9) = 9 - 8 = 1 (#f5f5f5), which passes.
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.step).toBe(1);
    }
  });

  it('uses AAA target when requested', () => {
    const processed = getProcessed();
    const neutral = processed.ramps.get('neutral')!;
    const onlyWhite = new Map([['white', processed.themes.get('white')!]]);
    const rules = autoGenerateRules(neutral, 5, onlyWhite, wcag21, 'AAA', ALL_FONT_SIZES, ALL_STACKS);

    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.step).toBeGreaterThan(5);
    }
  });
});

describe('autoGenerateRules — decorative', () => {
  const processed = getProcessed();
  const neutral = processed.ramps.get('neutral')!;
  const themes = processed.themes;

  it('returns no rules for decorative with closest strategy', () => {
    const rules = autoGenerateRules(
      neutral, 3, themes, wcag21, 'AA', ALL_FONT_SIZES, ALL_STACKS, 'closest', 'decorative',
    );
    expect(rules).toHaveLength(0);
  });

  it('returns no rules for decorative with mirror-closest on a symmetric step', () => {
    // Step 4 on a 10-step ramp: mirror = 9-4 = 5 — not same, should produce rules
    // Step 4 on a 9-step ramp (length 9): mirror = 8-4 = 4 — same step, no rules
    // Use step that mirrors to itself: with 10 steps, no step mirrors to itself (9-step odd)
    // Use a 2-step ramp where step 0 mirrors to step 1 and vice-versa
    // Actually: with 10 steps, step 4 mirrors to 5 (different) — will always produce rules for dark bgs
    // So test a theme set that's only light bgs:
    const lightOnlyInput: TokenInput = {
      ...baseInput,
      themes: { white: { ramp: 'neutral', step: 0 } },
    };
    const lightProcessed = processInput(lightOnlyInput);
    const rules = autoGenerateRules(
      neutral, 3, lightProcessed.themes, wcag21, 'AA', ALL_FONT_SIZES, ALL_STACKS, 'mirror-closest', 'decorative',
    );
    // white is a light bg (elevationDirection darker) — no mirror needed
    expect(rules).toHaveLength(0);
  });

  it('mirrors step on dark bg with mirror-closest strategy', () => {
    // dark theme has elevationDirection 'lighter' — should mirror
    // step 3 on 10-step ramp mirrors to step 6
    const rules = autoGenerateRules(
      neutral, 3, themes, wcag21, 'AA', ALL_FONT_SIZES, ALL_STACKS, 'mirror-closest', 'decorative',
    );
    const darkRules = rules.filter(r => r.bg === 'dark');
    expect(darkRules.length).toBeGreaterThan(0);
    expect(darkRules.every(r => r.step === 6)).toBe(true);
  });

  it('does not mirror step on light bg with mirror-closest strategy', () => {
    const rules = autoGenerateRules(
      neutral, 3, themes, wcag21, 'AA', ALL_FONT_SIZES, ALL_STACKS, 'mirror-closest', 'decorative',
    );
    const whiteRules = rules.filter(r => r.bg === 'white');
    expect(whiteRules).toHaveLength(0);
  });

  it('wcag-exempt metric returned when target is decorative', () => {
    const result = wcag21.evaluate('#d4d4d4', '#fafafa', {
      fontSizePx: 16, fontWeight: 400, target: 'decorative', level: 'AA',
    });
    expect(result.pass).toBe(true);
    expect(result.metric).toBe('wcag-exempt');
  });
});

describe('expandOverride', () => {
  const allBgs = ['white', 'dark', 'inverse'];
  const allFontSizes = ALL_FONT_SIZES;
  const allStacks = ALL_STACKS;

  it('expands absent dimensions to all values', () => {
    const rules = expandOverride({ step: 3 }, allBgs, allFontSizes, allStacks);
    expect(rules).toHaveLength(allBgs.length * allFontSizes.length * allStacks.length);
  });

  it('respects specific bg', () => {
    const rules = expandOverride({ bg: 'dark', step: 2 }, allBgs, allFontSizes, allStacks);
    expect(rules.every(r => r.bg === 'dark')).toBe(true);
    expect(rules).toHaveLength(allFontSizes.length * allStacks.length);
  });

  it('respects array bg', () => {
    const rules = expandOverride({ bg: ['dark', 'inverse'], step: 1 }, allBgs, allFontSizes, allStacks);
    expect(rules.every(r => r.bg === 'dark' || r.bg === 'inverse')).toBe(true);
  });

  it('respects specific fontSize and bg', () => {
    const rules = expandOverride({ bg: 'dark', fontSize: '16px', step: 3 }, allBgs, allFontSizes, allStacks);
    expect(rules.every(r => r.bg === 'dark' && r.fontSize === '16px')).toBe(true);
    expect(rules).toHaveLength(allStacks.length);
  });
});

describe('patchWithOverrides', () => {
  const allBgs = ['white', 'dark', 'inverse'];

  it('seeds from auto rules', () => {
    const autoRules = [{ bg: 'dark', fontSize: '16px' as const, stack: 'root' as const, step: 2 }];
    const map = patchWithOverrides(autoRules, [], allBgs, ALL_FONT_SIZES, ALL_STACKS);
    expect(map.get('dark__16px__root')).toBe(2);
  });

  it('higher specificity override wins over lower', () => {
    const autoRules = [{ bg: 'dark', fontSize: '16px' as const, stack: 'root' as const, step: 2 }];
    const overrides = [
      { bg: 'dark', step: 1 },               // specificity 1
      { bg: 'dark', fontSize: '16px', step: 3 }, // specificity 2
    ];
    const map = patchWithOverrides(autoRules, overrides, allBgs, ALL_FONT_SIZES, ALL_STACKS);
    // Higher specificity (2) wins
    expect(map.get('dark__16px__root')).toBe(3);
  });

  it('later declaration wins on equal specificity', () => {
    const overrides = [
      { bg: 'dark', step: 1 }, // declared first
      { bg: 'dark', step: 5 }, // declared later — same specificity
    ];
    const map = patchWithOverrides([], overrides, allBgs, ALL_FONT_SIZES, ALL_STACKS);
    // Later wins
    expect(map.get('dark__16px__root')).toBe(5);
  });
});
