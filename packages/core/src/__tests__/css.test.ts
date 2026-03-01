import { describe, it, expect } from 'vitest';
import { generateCSS, tokenToCssVar } from '../css.js';
import { buildRegistry } from '../registry.js';
import { processInput } from '../processor.js';
import { wcag21 } from '../compliance/wcag21.js';
import { hexToColorValue } from '../utils/oklch.js';
import type { TokenInput } from '../types.js';

const cv = (hex: string) => hexToColorValue(hex);

const input: TokenInput = {
  primitives: {
    neutral: [
      '#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4',
      '#a3a3a3', '#737373', '#525252', '#404040',
      '#262626', '#171717',
    ].map(cv),
    orange: [
      '#fff7ed', '#ffedd5', '#fed7aa', '#fdba74',
      '#fb923c', '#f97316', '#ea580c', '#c2410c',
      '#9a3412', '#7c2d12',
    ].map(cv),
  },
  themes: {
    white: { ramp: 'neutral', step: 0 },
    dark: { ramp: 'neutral', step: 8 },
  },
  foreground: {
    fgPrimary: { ramp: 'neutral', defaultStep: 8 },
    fgError: {
      ramp: 'neutral',
      defaultStep: 6,
      vision: {
        deuteranopia: { ramp: 'orange', defaultStep: 7 },
      },
    },
    fgLink: {
      ramp: 'neutral',
      defaultStep: 6,
      interactions: {
        hover: { step: 7 },
      },
    },
  },
};

const processed = processInput(input);
const registry = buildRegistry(processed, wcag21);
const css = generateCSS(registry);

describe('tokenToCssVar', () => {
  it('converts camelCase to kebab-case with -- prefix', () => {
    expect(tokenToCssVar('fgPrimary')).toBe('--fg-primary');
    expect(tokenToCssVar('fgSecondary')).toBe('--fg-secondary');
    expect(tokenToCssVar('fgLink')).toBe('--fg-link');
  });

  it('handles interaction suffix', () => {
    expect(tokenToCssVar('fgLink-hover')).toBe('--fg-link-hover');
    expect(tokenToCssVar('fgLink-active')).toBe('--fg-link-active');
  });
});

describe('generateCSS', () => {
  it('produces a non-empty string', () => {
    expect(typeof css).toBe('string');
    expect(css.length).toBeGreaterThan(0);
  });

  it('contains :root block', () => {
    expect(css).toContain(':root {');
  });

  it('contains token vars in :root', () => {
    expect(css).toContain('--fg-primary:');
    expect(css).toContain('--fg-error:');
    expect(css).toContain('--fg-link:');
  });

  it('contains interaction state vars', () => {
    expect(css).toContain('--fg-link-hover:');
  });

  it('contains --bg-* vars in :root', () => {
    expect(css).toContain('--bg-white:');
    expect(css).toContain('--bg-dark:');
  });

  it('contains ramp step vars in :root', () => {
    expect(css).toContain('--neutral-0:');
    expect(css).toContain('--neutral-9:');
  });

  it('contains [data-theme] overrides for non-default themes', () => {
    expect(css).toContain('[data-theme="dark"]');
  });

  it('vision mode block uses descendant combinator (space)', () => {
    // [data-vision="deuteranopia"] [data-theme="dark"] — SPACE between selectors
    const hasDescendant = css.includes('[data-vision="deuteranopia"] [data-theme=');
    const hasCompound = css.includes('[data-vision="deuteranopia"][data-theme=');
    // If vision+theme combo exists, it must use descendant combinator
    if (hasDescendant || hasCompound) {
      expect(hasDescendant).toBe(true);
      expect(hasCompound).toBe(false);
    }
  });

  it('contains vision mode block', () => {
    // deuteranopia is defined
    expect(css).toContain('[data-vision="deuteranopia"]');
  });

  it('does not emit empty blocks', () => {
    // Every { must be followed by at least one var before }
    const blocks = css.split('}');
    for (const block of blocks) {
      const openIdx = block.lastIndexOf('{');
      if (openIdx === -1) continue;
      const content = block.slice(openIdx + 1).trim();
      if (block.slice(0, openIdx).trim() === '') continue; // final empty after last }
      // Content should not be empty if block was opened
      // (only check blocks that have a selector)
      const selector = block.slice(0, openIdx).trim();
      if (selector.length > 0) {
        // Non-empty selector must have content
        // (some edge cases are okay — just ensure we don't have "selector {}"
        if (content.length === 0) {
          // This would be an empty block — fail
          expect(content.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('only emits standalone [data-theme] block if values differ from :root', () => {
    // white is the default theme — no standalone [data-theme="white"] { block should appear.
    // Vision descendant selectors like [data-vision="X"] [data-theme="white"] are fine.
    // A standalone block starts a new line with [data-theme="white"] at the very beginning.
    const standaloneBlock = /^\[data-theme="white"\]\s*\{/m.test(css);
    expect(standaloneBlock).toBe(false);
  });
});
