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
  },
  backgrounds: {
    white: { ramp: 'neutral', step: 0, fallback: ['dark'] },
    dark:  { ramp: 'neutral', step: 8, fallback: ['white'] },
  },
  semantics: {
    fgPrimary: { ramp: 'neutral', defaultStep: 8 },
    fgLink: {
      ramp: 'blue',
      defaultStep: 6,
      interactions: { hover: { step: 8 } },
    },
  },
};

const processed = processInput(input);
const registry = buildRegistry(processed, wcag21);

// ── auditRegistry ─────────────────────────────────────────────────────────────

describe('auditRegistry', () => {
  it('returns zero issues for a compliant registry', () => {
    const result = auditRegistry(registry, wcag21);
    expect(result.issues).toHaveLength(0);
    expect(result.failCount).toBe(0);
    expect(result.passCount).toBeGreaterThan(0);
  });

  it('variantsChecked equals registry variantMap size', () => {
    const result = auditRegistry(registry, wcag21);
    expect(result.variantsChecked).toBe(registry.variantMap.size);
  });

  it('elementsChecked is 0 for registry audit', () => {
    const result = auditRegistry(registry, wcag21);
    expect(result.elementsChecked).toBe(0);
  });

  it('detects non-compliant manually-overridden variants', () => {
    // Build a registry with a deliberately bad override
    const badInput: TokenInput = {
      ...input,
      semantics: {
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
      semantics: {
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
    const apcaRegistry = buildRegistry(processed, apca);
    const result = auditRegistry(apcaRegistry, apca);
    expect(result.issues).toHaveLength(0);
    expect(result.variantsChecked).toBe(apcaRegistry.variantMap.size);
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

  it('no issues for element with valid data-bg', () => {
    const root = document.createElement('div');
    const child = document.createElement('div');
    child.setAttribute('data-bg', 'white');
    root.appendChild(child);
    const result = auditDOM(root, registry);
    const bgErrors = result.issues.filter(i => i.type === 'unknown-background');
    expect(bgErrors).toHaveLength(0);
  });

  it('flags unknown data-bg value', () => {
    const root = document.createElement('div');
    const child = document.createElement('div');
    child.setAttribute('data-bg', 'neon-purple');
    root.appendChild(child);
    const result = auditDOM(root, registry);
    expect(result.issues.some(i => i.type === 'unknown-background')).toBe(true);
    const issue = result.issues.find(i => i.type === 'unknown-background');
    expect(issue!.message).toContain('neon-purple');
    expect(issue!.severity).toBe('error');
  });

  it('flags inline style CSS var without data-bg ancestor', () => {
    const root = document.createElement('div');
    const child = document.createElement('p');
    child.setAttribute('style', 'color: var(--fg-primary)');
    root.appendChild(child);
    const result = auditDOM(root, registry);
    expect(result.issues.some(i => i.type === 'missing-data-bg')).toBe(true);
  });

  it('does NOT flag CSS var when ancestor has data-bg', () => {
    const root = document.createElement('div');
    const parent = document.createElement('div');
    parent.setAttribute('data-bg', 'white');
    const child = document.createElement('p');
    child.setAttribute('style', 'color: var(--fg-primary)');
    parent.appendChild(child);
    root.appendChild(parent);
    const result = auditDOM(root, registry);
    expect(result.issues.filter(i => i.type === 'missing-data-bg')).toHaveLength(0);
  });

  it('flags unknown token CSS var', () => {
    const root = document.createElement('div');
    const parent = document.createElement('div');
    parent.setAttribute('data-bg', 'white');
    const child = document.createElement('p');
    child.setAttribute('style', 'color: var(--fg-nonexistent-token)');
    parent.appendChild(child);
    root.appendChild(parent);
    const result = auditDOM(root, registry);
    expect(result.issues.some(i => i.type === 'unknown-token-var')).toBe(true);
  });

  it('does not flag non-token CSS vars', () => {
    const root = document.createElement('div');
    const parent = document.createElement('div');
    parent.setAttribute('data-bg', 'white');
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

    const badBg = document.createElement('div');
    badBg.setAttribute('data-bg', 'ghost-bg');

    const noBg = document.createElement('p');
    noBg.setAttribute('style', 'color: var(--fg-primary)');

    root.appendChild(badBg);
    root.appendChild(noBg);

    const result = auditDOM(root, registry);
    const types = result.issues.map(i => i.type);
    expect(types).toContain('unknown-background');
    expect(types).toContain('missing-data-bg');
  });
});
