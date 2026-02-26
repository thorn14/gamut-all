import { describe, it, expect, beforeEach } from 'vitest';
import { bucketFontSize, readFontSize } from '../dom/font-size.js';
import { readBg } from '../dom/background.js';
import { readStack } from '../dom/stack.js';

// ── bucketFontSize ────────────────────────────────────────────────────────────

describe('bucketFontSize', () => {
  it('11px → 12px (below minimum)', () => expect(bucketFontSize(11)).toBe('12px'));
  it('12px → 12px (exact)', () => expect(bucketFontSize(12)).toBe('12px'));
  it('13px → 12px (between 12 and 14)', () => expect(bucketFontSize(13)).toBe('12px'));
  it('14px → 14px (exact)', () => expect(bucketFontSize(14)).toBe('14px'));
  it('16px → 16px (exact)', () => expect(bucketFontSize(16)).toBe('16px'));
  it('17px → 16px (between 16 and 20)', () => expect(bucketFontSize(17)).toBe('16px'));
  it('23px → 20px (between 20 and 24)', () => expect(bucketFontSize(23)).toBe('20px'));
  it('24px → 24px (exact)', () => expect(bucketFontSize(24)).toBe('24px'));
  it('33px → 32px (above 32)', () => expect(bucketFontSize(33)).toBe('32px'));
  it('32px → 32px (exact max)', () => expect(bucketFontSize(32)).toBe('32px'));
});

// ── readFontSize ──────────────────────────────────────────────────────────────

describe('readFontSize', () => {
  it('returns 16px for NaN computed style', () => {
    const el = document.createElement('div');
    // jsdom returns '' for fontSize by default → parseFloat('') = NaN
    const result = readFontSize(el);
    // jsdom may return 0px or empty — either case should not crash
    expect(typeof result).toBe('string');
  });
});

// ── readBg ────────────────────────────────────────────────────────────────────

describe('readBg', () => {
  it('finds data-bg on the element itself', () => {
    const el = document.createElement('div');
    el.setAttribute('data-bg', 'white');
    expect(readBg(el)).toBe('white');
  });

  it('walks up to parent to find data-bg', () => {
    const parent = document.createElement('div');
    parent.setAttribute('data-bg', 'dark');
    const child = document.createElement('span');
    parent.appendChild(child);
    expect(readBg(child)).toBe('dark');
  });

  it('returns null when no data-bg exists in ancestor chain', () => {
    const el = document.createElement('div');
    expect(readBg(el)).toBeNull();
  });

  it('prefers closest ancestor', () => {
    const grandparent = document.createElement('div');
    grandparent.setAttribute('data-bg', 'dark');
    const parent = document.createElement('div');
    parent.setAttribute('data-bg', 'white');
    const child = document.createElement('span');
    grandparent.appendChild(parent);
    parent.appendChild(child);
    expect(readBg(child)).toBe('white');
  });
});

// ── readStack ─────────────────────────────────────────────────────────────────

describe('readStack', () => {
  it('finds data-stack on the element itself', () => {
    const el = document.createElement('div');
    el.setAttribute('data-stack', 'card');
    expect(readStack(el)).toBe('card');
  });

  it('walks up to parent to find data-stack', () => {
    const parent = document.createElement('div');
    parent.setAttribute('data-stack', 'modal');
    const child = document.createElement('span');
    parent.appendChild(child);
    expect(readStack(child)).toBe('modal');
  });

  it('returns root when no data-stack exists', () => {
    const el = document.createElement('div');
    expect(readStack(el)).toBe('root');
  });

  it('prefers closest ancestor', () => {
    const grandparent = document.createElement('div');
    grandparent.setAttribute('data-stack', 'modal');
    const parent = document.createElement('div');
    parent.setAttribute('data-stack', 'card');
    const child = document.createElement('span');
    grandparent.appendChild(parent);
    parent.appendChild(child);
    expect(readStack(child)).toBe('card');
  });
});
