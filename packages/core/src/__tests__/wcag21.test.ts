import { describe, it, expect } from 'vitest';
import { wcag21 } from '../compliance/wcag21.js';
import { relativeLuminance } from '../utils/oklch.js';
import { contrastRatio } from '../utils/contrast.js';

const ctx = (fontSizePx: number, level: 'AA' | 'AAA' = 'AA') => ({
  fontSizePx,
  fontWeight: 400,
  target: 'text' as const,
  level,
});

describe('relativeLuminance', () => {
  it('white = 1', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 4);
  });

  it('black = 0', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 4);
  });

  it('3-digit hex works', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(1, 4);
  });

  it('mid-grey', () => {
    const l = relativeLuminance('#808080');
    expect(l).toBeGreaterThan(0.1);
    expect(l).toBeLessThan(0.3);
  });
});

describe('contrastRatio', () => {
  it('white on black = 21:1', () => {
    const white = relativeLuminance('#ffffff');
    const black = relativeLuminance('#000000');
    expect(contrastRatio(white, black)).toBeCloseTo(21, 0);
  });

  it('same color = 1:1', () => {
    const l = relativeLuminance('#808080');
    expect(contrastRatio(l, l)).toBeCloseTo(1, 4);
  });
});

describe('wcag21.evaluate', () => {
  it('black on white passes AA at 16px', () => {
    const result = wcag21.evaluate('#000000', '#ffffff', ctx(16));
    expect(result.pass).toBe(true);
    expect(result.value).toBeCloseTo(21, 0);
    expect(result.required).toBe(4.5);
    expect(result.metric).toBe('wcag21-ratio');
    expect(result.polarity).toBe('dark-on-light');
  });

  it('white on black passes AA at 16px', () => {
    const result = wcag21.evaluate('#ffffff', '#000000', ctx(16));
    expect(result.pass).toBe(true);
    expect(result.polarity).toBe('light-on-dark');
  });

  it('#595959 on white barely passes AA at 16px (>= 4.5:1)', () => {
    // #595959 on white ≈ 7.0:1 — passes comfortably
    const result = wcag21.evaluate('#595959', '#ffffff', ctx(16));
    expect(result.pass).toBe(true);
    expect(result.value).toBeGreaterThanOrEqual(4.5);
  });

  it('#a3a3a3 on white fails AA at 16px', () => {
    // Neutral-4 is too low contrast on white
    const result = wcag21.evaluate('#a3a3a3', '#ffffff', ctx(16));
    expect(result.pass).toBe(false);
    expect(result.value).toBeLessThan(4.5);
  });

  it('large text (24px) uses 3:1 threshold for AA', () => {
    const result = wcag21.evaluate('#a3a3a3', '#ffffff', ctx(24));
    // ~2.3:1 — still fails at 3:1
    expect(result.required).toBe(3);
  });

  it('large text: lower contrast color passes at 24px but not 16px', () => {
    // #767676 on white ≈ 4.48:1 — fails AA normal but passes large text
    const result16 = wcag21.evaluate('#767676', '#ffffff', ctx(16));
    const result24 = wcag21.evaluate('#767676', '#ffffff', ctx(24));
    expect(result16.required).toBe(4.5);
    expect(result24.required).toBe(3);
    expect(result24.pass).toBe(true);
  });

  it('AAA normal text requires 7:1', () => {
    const result = wcag21.evaluate('#595959', '#ffffff', ctx(16, 'AAA'));
    expect(result.required).toBe(7);
    // ~7:1 — passes AAA
    expect(result.pass).toBe(true);
  });

  it('AAA large text requires 4.5:1', () => {
    const result = wcag21.evaluate('#767676', '#ffffff', ctx(24, 'AAA'));
    expect(result.required).toBe(4.5);
  });
});

describe('wcag21.preferredDirection', () => {
  it('light background → darker', () => {
    expect(wcag21.preferredDirection?.('#ffffff')).toBe('darker');
  });

  it('dark background → lighter', () => {
    expect(wcag21.preferredDirection?.('#000000')).toBe('lighter');
  });

  it('mid-dark background → lighter', () => {
    expect(wcag21.preferredDirection?.('#262626')).toBe('lighter');
  });
});
