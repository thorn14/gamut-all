import { describe, it, expect } from 'vitest';
import { processInput, buildRegistry, validateRegistry, resolveToken, resolveAllTokens,
         generateCSS, serializeRegistry, deserializeRegistry, wcag21 } from '../index.js';
import type { TokenInput, DesignContext } from '../types.js';

// Load fixture
import tokensJson from './fixtures/tokens.json' with { type: 'json' };

const input = tokensJson as TokenInput;
const processed = processInput(input);
const registry = buildRegistry(processed, wcag21);

const ctx = (overrides: Partial<DesignContext> = {}): DesignContext => ({
  fontSize: '16px',
  bgClass: 'white',
  stackDepth: 'root',
  visionMode: 'default',
  ...overrides,
});

const backgrounds = ['white', 'light', 'card', 'dark', 'inverse'] as const;
const tokens9 = ['fgPrimary', 'fgSecondary', 'fgTertiary', 'fgAccent', 'fgDisabled', 'fgInverse', 'fgLink', 'fgError', 'fgSuccess'];

describe('Integration: full pipeline', () => {
  it('processes the fixture without errors', () => {
    expect(processed.ramps.size).toBe(5);
    expect(processed.backgrounds.size).toBe(5);
    expect(processed.semantics.size).toBe(9);
  });

  it('all 9 tokens resolve on all 5 backgrounds', () => {
    for (const token of tokens9) {
      for (const bg of backgrounds) {
        const hex = resolveToken(token, ctx({ bgClass: bg }), registry);
        expect(hex, `${token} on ${bg}`).toMatch(/^#[0-9a-fA-F]{3,6}$/);
      }
    }
  });

  it('interaction tokens resolve correctly', () => {
    const hover = resolveToken('fgLink-hover', ctx(), registry);
    const active = resolveToken('fgLink-active', ctx(), registry);
    const focus = resolveToken('fgLink-focus', ctx(), registry);
    expect(hover).toMatch(/^#/);
    expect(active).toMatch(/^#/);
    expect(focus).toMatch(/^#/);
    // All should differ from base fgLink
    const base = resolveToken('fgLink', ctx(), registry);
    expect(hover).not.toBe(base);
  });

  it('resolveAllTokens includes base and interaction tokens', () => {
    const all = resolveAllTokens(ctx(), registry);
    for (const token of tokens9) {
      expect(token in all, `${token} in resolveAllTokens`).toBe(true);
    }
    expect('fgLink-hover' in all).toBe(true);
    expect('fgLink-active' in all).toBe(true);
    expect('fgLink-focus' in all).toBe(true);
  });

  it('validateRegistry returns no critical errors', () => {
    const result = validateRegistry(registry);
    expect(result.errors).toHaveLength(0);
    // Warnings are expected for some low-contrast tokens like fgDisabled
  });

  it('dark bg uses lighter step for fgPrimary', () => {
    const lightHex = resolveToken('fgPrimary', ctx({ bgClass: 'white' }), registry);
    const darkHex = resolveToken('fgPrimary', ctx({ bgClass: 'dark' }), registry);
    // fgPrimary on dark should be a light color
    expect(darkHex).not.toBe(lightHex);
  });

  it('vision mode fgError uses orange ramp for deuteranopia', () => {
    const defaultHex = resolveToken('fgError', ctx({ visionMode: 'default' }), registry);
    const deuterHex = resolveToken('fgError', ctx({ visionMode: 'deuteranopia' }), registry);
    expect(deuterHex).not.toBe(defaultHex);
  });

  it('unknown vision mode falls back to default', () => {
    const defaultHex = resolveToken('fgPrimary', ctx({ visionMode: 'default' }), registry);
    const tritanHex = resolveToken('fgPrimary', ctx({ visionMode: 'tritanopia' }), registry);
    expect(tritanHex).toBe(defaultHex);
  });

  it('serialize + deserialize round-trip produces identical results', () => {
    const serialized = serializeRegistry(registry);
    const restored = deserializeRegistry(serialized);

    for (const token of tokens9) {
      for (const bg of backgrounds) {
        const original = resolveToken(token, ctx({ bgClass: bg }), registry);
        const fromRestored = resolveToken(token, ctx({ bgClass: bg }), restored);
        expect(fromRestored, `${token} on ${bg}`).toBe(original);
      }
    }
  });

  it('generateCSS contains correct selectors', () => {
    const css = generateCSS(registry);
    expect(css).toContain(':root {');
    expect(css).toContain('[data-bg="dark"]');
    // Vision mode — descendant combinator
    expect(css).toContain('[data-vision="deuteranopia"]');
    // Descendant (space) not compound (no space)
    const visionBgIdx = css.indexOf('[data-vision="deuteranopia"] [data-bg=');
    const visionBgCompIdx = css.indexOf('[data-vision="deuteranopia"][data-bg=');
    if (visionBgIdx !== -1 || visionBgCompIdx !== -1) {
      expect(visionBgIdx).toBeGreaterThan(-1);
      expect(visionBgCompIdx).toBe(-1);
    }
  });

  it('resolveToken with unknown bgClass returns defaults[token]', () => {
    const hex = resolveToken('fgPrimary', ctx({ bgClass: 'nonexistent' }), registry);
    expect(hex).toBe(registry.defaults['fgPrimary']);
  });

  it('performance: resolveToken < 10μs average over 10k iterations', () => {
    const context = ctx({ bgClass: 'dark', visionMode: 'deuteranopia' });
    const iterations = 10_000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      resolveToken('fgError', context, registry);
    }
    const elapsed = performance.now() - start;
    const avgUs = (elapsed / iterations) * 1000;
    expect(avgUs).toBeLessThan(10);
  });
});
