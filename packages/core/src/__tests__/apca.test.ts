import { describe, it, expect } from 'vitest';
import { apca, softClamp } from '../compliance/apca.js';

const ctx = (fontSizePx: number, level: 'AA' | 'AAA' = 'AA') => ({
  fontSizePx,
  fontWeight: 400,
  target: 'text' as const,
  level,
});

describe('softClamp', () => {
  it('black (0) → ≈ 0.00452', () => {
    // softClamp(0) = 0 + (0.022 - 0)^1.414
    expect(softClamp(0)).toBeCloseTo(0.00452, 4);
  });

  it('white (1) → 1 unchanged', () => {
    expect(softClamp(1)).toBeCloseTo(1, 6);
  });

  it('mid-gray (0.5) → unchanged (above Ythr)', () => {
    expect(softClamp(0.5)).toBeCloseTo(0.5, 6);
  });

  it('value at Ythr threshold (0.022) → unchanged', () => {
    expect(softClamp(0.022)).toBeCloseTo(0.022, 6);
  });
});

describe('apca.evaluate', () => {
  it('black on white → Lc > 100, passes AA at 12px', () => {
    const result = apca.evaluate('#000000', '#ffffff', ctx(12));
    expect(result.value).toBeGreaterThan(100);
    expect(result.pass).toBe(true);
    expect(result.metric).toBe('apca-lc');
  });

  it('white on black → Lc > 100, passes AA at 12px', () => {
    const result = apca.evaluate('#ffffff', '#000000', ctx(12));
    expect(result.value).toBeGreaterThan(100);
    expect(result.pass).toBe(true);
    expect(result.metric).toBe('apca-lc');
  });

  it('black on white → polarity is dark-on-light', () => {
    const result = apca.evaluate('#000000', '#ffffff', ctx(16));
    expect(result.polarity).toBe('dark-on-light');
  });

  it('white on black → polarity is light-on-dark', () => {
    const result = apca.evaluate('#ffffff', '#000000', ctx(16));
    expect(result.polarity).toBe('light-on-dark');
  });

  it('low-contrast gray (#a3a3a3) on white fails AA at 12px (Lc < 75)', () => {
    const result = apca.evaluate('#a3a3a3', '#ffffff', ctx(12));
    expect(result.value).toBeLessThan(75);
    expect(result.pass).toBe(false);
    expect(result.required).toBe(75);
  });

  it('low-contrast gray (#a3a3a3) on white passes AA at 24px (Lc >= 45)', () => {
    const result = apca.evaluate('#a3a3a3', '#ffffff', ctx(24));
    expect(result.value).toBeGreaterThanOrEqual(45);
    expect(result.pass).toBe(true);
    expect(result.required).toBe(45);
  });

  it('AAA threshold is higher than AA at same font size', () => {
    const aa = apca.evaluate('#a3a3a3', '#ffffff', ctx(16, 'AA'));
    const aaa = apca.evaluate('#a3a3a3', '#ffffff', ctx(16, 'AAA'));
    expect(aaa.required).toBeGreaterThan(aa.required!);
  });

  it('12px AA required = 75', () => {
    const result = apca.evaluate('#000000', '#ffffff', ctx(12, 'AA'));
    expect(result.required).toBe(75);
  });

  it('16px AA required = 60', () => {
    const result = apca.evaluate('#000000', '#ffffff', ctx(16, 'AA'));
    expect(result.required).toBe(60);
  });

  it('24px AA required = 45', () => {
    const result = apca.evaluate('#000000', '#ffffff', ctx(24, 'AA'));
    expect(result.required).toBe(45);
  });

  it('12px AAA required = 90', () => {
    const result = apca.evaluate('#000000', '#ffffff', ctx(12, 'AAA'));
    expect(result.required).toBe(90);
  });

  it('16px AAA required = 75', () => {
    const result = apca.evaluate('#000000', '#ffffff', ctx(16, 'AAA'));
    expect(result.required).toBe(75);
  });

  it('24px AAA required = 60', () => {
    const result = apca.evaluate('#000000', '#ffffff', ctx(24, 'AAA'));
    expect(result.required).toBe(60);
  });
});

describe('apca.preferredDirection', () => {
  it('white → darker', () => {
    expect(apca.preferredDirection?.('#ffffff')).toBe('darker');
  });

  it('black → lighter', () => {
    expect(apca.preferredDirection?.('#000000')).toBe('lighter');
  });

  it('#262626 (dark neutral) → lighter', () => {
    expect(apca.preferredDirection?.('#262626')).toBe('lighter');
  });
});
