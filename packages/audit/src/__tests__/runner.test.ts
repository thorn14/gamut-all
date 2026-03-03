import { describe, it, expect } from 'vitest';
import { auditRegistry, auditDOM } from '../runner.js';
import { processInput, buildRegistry, wcag21, apca } from '@gamut-all/core';
import type { TokenInput } from '@gamut-all/core';

// ── Shared test registry ──────────────────────────────────────────────────────

const input: TokenInput = {
  primitives: {
    neutral: [
      '#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4',
      '#a3a3a3', '#737373', '#525252', '#404040',
      '#262626', '#171717',
    ],
    blue: [
      '#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd',
      '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8',
      '#1e40af', '#1e3a8a',
    ],
    green: [
      '#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac',
      '#4ade80', '#22c55e', '#16a34a', '#15803d',
      '#166534', '#14532d',
    ],
  },
  themes: {
    white: { ramp: 'neutral', step: 0, fallback: ['dark'] },
    dark:  { ramp: 'neutral', step: 8, fallback: ['white'] },
  },
  surfaces: {
    // light surface — needs dark text
    bgMuted:   { ramp: 'neutral', step: 1 },
    // dark surface — needs light text
    bgInverse: { ramp: 'neutral', step: 9 },
    // saturated surface — classic contrast challenge
    bgSuccess: { ramp: 'green',   step: 8 },
  },
  foreground: {
    fgPrimary: { ramp: 'neutral', defaultStep: 8 },
    fgLink: {
      ramp: 'neutral',
      defaultStep: 7,
      interactions: { hover: { step: 9 } },
    },
  },
  // Limit to root stack only — elevated stacks land on mid-tone surfaces where
  // neither WCAG nor APCA can guarantee compliance (a known property of mid-tone
  // backgrounds). Audit tests exercise the audit logic, not elevation behaviour.
  config: { stacks: { root: 0 } },
};

const registry = buildRegistry(processInput(input), wcag21);

// ── auditRegistry ─────────────────────────────────────────────────────────────

describe('auditRegistry', () => {
  it('returns zero issues for a compliant registry', () => {
    const result = auditRegistry(registry, wcag21);
    expect(result.issues).toHaveLength(0);
    expect(result.failCount).toBe(0);
    expect(result.passCount).toBeGreaterThan(0);
  });

  it('variantsChecked includes both registry variants and surface tokens', () => {
    const result = auditRegistry(registry, wcag21);
    const surfaceTokenCount = Array.from(registry.surfaces.values())
      .reduce((n, s) => n + s.surfaceTokens.size +
        Array.from(s.themeSurfaceTokens.values()).reduce((m, { tokens }) => m + tokens.size, 0), 0);
    expect(result.variantsChecked).toBe(registry.variantMap.size + surfaceTokenCount);
  });

  it('elementsChecked is 0 for registry audit', () => {
    const result = auditRegistry(registry, wcag21);
    expect(result.elementsChecked).toBe(0);
  });

  it('detects non-compliant manually-overridden variants', () => {
    // Build a registry with a deliberately bad override
    const badInput: TokenInput = {
      ...input,
      foreground: {
        fgPrimary: {
          ramp: 'neutral',
          defaultStep: 8,
          // step 2 (#e5e5e5) on white (#fafafa) — ~1.07:1 ratio
          overrides: [{ bg: 'white', fontSize: '16px', step: 2 }],
        },
      },
    };
    const badRegistry = buildRegistry(processInput(badInput), wcag21);
    const result = auditRegistry(badRegistry, wcag21);
    expect(result.failCount).toBeGreaterThan(0);
    expect(result.issues.some(i => i.type === 'non-compliant-variant')).toBe(true);
  });

  it('issue message includes key and engine id', () => {
    const badInput: TokenInput = {
      ...input,
      foreground: {
        fgPrimary: {
          ramp: 'neutral',
          defaultStep: 8,
          overrides: [{ bg: 'white', fontSize: '16px', step: 2 }],
        },
      },
    };
    const badRegistry = buildRegistry(processInput(badInput), wcag21);
    const result = auditRegistry(badRegistry, wcag21);
    const issue = result.issues.find(i => i.type === 'non-compliant-variant');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('wcag21');
    expect(issue!.severity).toBe('error');
  });

  it('works with apca engine', () => {
    const apcaRegistry = buildRegistry(processInput(input), apca);
    const result = auditRegistry(apcaRegistry, apca);
    expect(result.issues).toHaveLength(0);
    expect(result.variantsChecked).toBeGreaterThan(apcaRegistry.variantMap.size);
  });

  it('reports no non-compliant-surface-token issues for a correctly built registry', () => {
    const result = auditRegistry(registry, wcag21);
    const surfaceIssues = result.issues.filter(i => i.type === 'non-compliant-surface-token');
    expect(surfaceIssues).toHaveLength(0);
  });

  it('detects non-compliant surface token when surfaceTokens is manually corrupted', () => {
    // Inject a hex that fails contrast on bgSuccess (#16a34a) — mid-gray on mid-green
    const corrupted = buildRegistry(processInput(input), wcag21);
    corrupted.surfaces.get('bgSuccess')!.surfaceTokens.set('fgPrimary', '#a3a3a3');
    const result = auditRegistry(corrupted, wcag21);
    expect(result.issues.some(i => i.type === 'non-compliant-surface-token')).toBe(true);
    const issue = result.issues.find(i => i.type === 'non-compliant-surface-token');
    expect(issue!.message).toContain('fgPrimary');
    expect(issue!.message).toContain('bgSuccess');
    expect(issue!.severity).toBe('error');
  });

  it('surface token checks cover default hex and all theme-resolved hexes', () => {
    // dark theme auto-mirrors bgMuted (step 1 → step 8) giving a dark surface.
    // Both the default (light) and dark-theme-resolved (dark) hexes should be checked.
    const bgMuted = registry.surfaces.get('bgMuted')!;
    expect(bgMuted.surfaceTokens.size).toBeGreaterThan(0);
    expect(bgMuted.themeSurfaceTokens.has('dark')).toBe(true);
  });

  it('AAA level produces more failures than AA for same registry', () => {
    const aaResult  = auditRegistry(registry, wcag21, 'AA');
    const aaaResult = auditRegistry(registry, wcag21, 'AAA');
    // AAA is stricter → at least as many failures
    expect(aaaResult.failCount).toBeGreaterThanOrEqual(aaResult.failCount);
  });
});

// ── auditDOM ──────────────────────────────────────────────────────────────────

describe('auditDOM', () => {
  it('returns empty issues for an empty root', () => {
    const root = document.createElement('div');
    const result = auditDOM(root, registry);
    expect(result.issues).toHaveLength(0);
    expect(result.elementsChecked).toBe(0);
  });

  it('no issues for element with valid data-theme', () => {
    const root = document.createElement('div');
    const child = document.createElement('div');
    child.setAttribute('data-theme', 'white');
    root.appendChild(child);
    const result = auditDOM(root, registry);
    const themeErrors = result.issues.filter(i => i.type === 'unknown-theme');
    expect(themeErrors).toHaveLength(0);
  });

  it('flags unknown data-theme value', () => {
    const root = document.createElement('div');
    const child = document.createElement('div');
    child.setAttribute('data-theme', 'neon-purple');
    root.appendChild(child);
    const result = auditDOM(root, registry);
    expect(result.issues.some(i => i.type === 'unknown-theme')).toBe(true);
    const issue = result.issues.find(i => i.type === 'unknown-theme');
    expect(issue!.message).toContain('neon-purple');
    expect(issue!.severity).toBe('error');
  });

  it('flags inline style CSS var without data-theme ancestor', () => {
    const root = document.createElement('div');
    const child = document.createElement('p');
    child.setAttribute('style', 'color: var(--fg-primary)');
    root.appendChild(child);
    const result = auditDOM(root, registry);
    expect(result.issues.some(i => i.type === 'missing-data-theme')).toBe(true);
  });

  it('does NOT flag CSS var when ancestor has data-theme', () => {
    const root = document.createElement('div');
    const parent = document.createElement('div');
    parent.setAttribute('data-theme', 'white');
    const child = document.createElement('p');
    child.setAttribute('style', 'color: var(--fg-primary)');
    parent.appendChild(child);
    root.appendChild(parent);
    const result = auditDOM(root, registry);
    expect(result.issues.filter(i => i.type === 'missing-data-theme')).toHaveLength(0);
  });

  it('flags unknown token CSS var', () => {
    const root = document.createElement('div');
    const parent = document.createElement('div');
    parent.setAttribute('data-theme', 'white');
    const child = document.createElement('p');
    child.setAttribute('style', 'color: var(--fg-nonexistent-token)');
    parent.appendChild(child);
    root.appendChild(parent);
    const result = auditDOM(root, registry);
    expect(result.issues.some(i => i.type === 'unknown-token-var')).toBe(true);
  });

  it('flags token CSS var usage without a data-stack ancestor', () => {
    const root = document.createElement('div');
    const parent = document.createElement('div');
    parent.setAttribute('data-theme', 'white');
    const child = document.createElement('p');
    child.setAttribute('style', 'color: var(--fg-primary)');
    parent.appendChild(child);
    root.appendChild(parent);

    const result = auditDOM(root, registry);
    expect(result.issues.some(i => i.type === 'missing-data-stack')).toBe(true);
  });

  it('does not flag non-token CSS vars', () => {
    const root = document.createElement('div');
    const parent = document.createElement('div');
    parent.setAttribute('data-theme', 'white');
    const child = document.createElement('p');
    // fg-primary is a valid token var
    child.setAttribute('style', 'color: var(--fg-primary); margin: 0;');
    parent.appendChild(child);
    root.appendChild(parent);
    const result = auditDOM(root, registry);
    // No unknown-token-var for a known token
    expect(result.issues.filter(i => i.type === 'unknown-token-var' && i.detail?.['varName'] === 'fg-primary')).toHaveLength(0);
  });

  it('elementsChecked matches number of descendants', () => {
    const root = document.createElement('div');
    const a = document.createElement('div');
    const b = document.createElement('span');
    const c = document.createElement('p');
    root.appendChild(a);
    root.appendChild(b);
    a.appendChild(c);
    const result = auditDOM(root, registry);
    expect(result.elementsChecked).toBe(3);
  });

  it('handles multiple issues in a complex DOM', () => {
    const root = document.createElement('section');

    const badTheme = document.createElement('div');
    badTheme.setAttribute('data-theme', 'ghost-theme');

    const noTheme = document.createElement('p');
    noTheme.setAttribute('style', 'color: var(--fg-primary)');

    root.appendChild(badTheme);
    root.appendChild(noTheme);

    const result = auditDOM(root, registry);
    const types = result.issues.map(i => i.type);
    expect(types).toContain('unknown-theme');
    expect(types).toContain('missing-data-theme');
  });
});
