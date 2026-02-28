import { describe, it, expect } from 'vitest';
import { auditCoverage, formatCoverageText, formatCoverageJSON } from '../coverage.js';
import { processInput, buildRegistry, wcag21, apca } from '@gamut-all/core';
import type { TokenInput } from '@gamut-all/core';

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
  themes: {
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
  config: { stacks: { root: 0 } },
};

const processed = processInput(input);
const registry = buildRegistry(processed, wcag21);

describe('auditCoverage', () => {
  it('returns a report with tokens', () => {
    const report = auditCoverage(registry, wcag21);
    expect(report.tokens.length).toBeGreaterThan(0);
  });

  it('tokens are sorted alphabetically', () => {
    const report = auditCoverage(registry, wcag21);
    const names = report.tokens.map(t => t.token);
    expect(names).toEqual([...names].sort());
  });

  it('meta has correct engine, level and fontSize', () => {
    const report = auditCoverage(registry, wcag21, 'AA', { fontSizePx: 16 });
    expect(report.meta.engine).toBe('wcag21');
    expect(report.meta.level).toBe('AA');
    expect(report.meta.fontSize).toBe('16px');
  });

  it('each token has the correct rampName', () => {
    const report = auditCoverage(registry, wcag21);
    const fgPrimary = report.tokens.find(t => t.token === 'fgPrimary');
    expect(fgPrimary?.rampName).toBe('neutral');
    const fgLink = report.tokens.find(t => t.token === 'fgLink');
    expect(fgLink?.rampName).toBe('blue');
  });

  it('rampStepCount matches the ramp length', () => {
    const report = auditCoverage(registry, wcag21);
    for (const token of report.tokens) {
      expect(token.rampStepCount).toBe(10);
    }
  });

  it('surfaces are populated for each bg × stack', () => {
    const report = auditCoverage(registry, wcag21);
    const fgPrimary = report.tokens.find(t => t.token === 'fgPrimary')!;
    const bgNames = new Set(fgPrimary.surfaces.map(s => s.bg));
    expect(bgNames.has('white')).toBe(true);
    expect(bgNames.has('dark')).toBe(true);
  });

  it('passingSteps is non-empty for light surface with dark token', () => {
    const report = auditCoverage(registry, wcag21);
    const fgPrimary = report.tokens.find(t => t.token === 'fgPrimary')!;
    const whiteSurface = fgPrimary.surfaces.find(s => s.bg === 'white' && s.stack === 'root')!;
    expect(whiteSurface.passingSteps.length).toBeGreaterThan(0);
  });

  it('passingSteps is empty or small for dark surface with dark token', () => {
    const report = auditCoverage(registry, wcag21);
    const fgPrimary = report.tokens.find(t => t.token === 'fgPrimary')!;
    const darkSurface = fgPrimary.surfaces.find(s => s.bg === 'dark' && s.stack === 'root')!;
    // Dark-on-dark = low contrast. Neutral ramp step 8 on neutral step 8 should fail.
    // Light steps (0-3) on dark (#262626) pass. Verify passing steps are the light end.
    const allPass = darkSurface.passingSteps.every(i => i < 5);
    expect(allPass).toBe(true);
  });

  it('configuredStep is populated from the registry', () => {
    const report = auditCoverage(registry, wcag21);
    const fgPrimary = report.tokens.find(t => t.token === 'fgPrimary')!;
    const whiteSurface = fgPrimary.surfaces.find(s => s.bg === 'white' && s.stack === 'root')!;
    // fgPrimary defaultStep 8, on white = auto-adjusted to step that passes
    expect(whiteSurface.configuredStep).not.toBeNull();
  });

  it('configuredStepPasses is true for auto-adjusted registry entries', () => {
    const report = auditCoverage(registry, wcag21);
    for (const token of report.tokens) {
      for (const s of token.surfaces) {
        if (s.configuredStep !== null) {
          // Registry auto-adjusts non-compliant steps — configured step should pass
          expect(s.configuredStepPasses).toBe(true);
        }
      }
    }
  });

  it('steps array length matches rampStepCount', () => {
    const report = auditCoverage(registry, wcag21);
    for (const token of report.tokens) {
      for (const s of token.surfaces) {
        expect(s.steps.length).toBe(token.rampStepCount);
      }
    }
  });

  it('passingRanges is "—" when no steps pass', () => {
    // Build a registry where a mid-tone surface exists
    const midInput: TokenInput = {
      ...input,
      themes: {
        mid: { ramp: 'neutral', step: 4 }, // #a3a3a3 mid-tone
      },
      config: { stacks: { root: 0 } },
    };
    const midRegistry = buildRegistry(processInput(midInput), wcag21);
    const report = auditCoverage(midRegistry, wcag21);
    // On a mid-tone surface some tokens may have no passing steps
    const anyEmpty = report.tokens.some(t =>
      t.surfaces.some(s => s.passingSteps.length === 0),
    );
    // May or may not have empty — just verify format is correct in that case
    for (const token of report.tokens) {
      for (const s of token.surfaces) {
        if (s.passingSteps.length === 0) {
          expect(s.passingRanges).toBe('—');
        } else {
          expect(s.passingRanges).not.toBe('—');
        }
      }
    }
    // suppress unused warning
    void anyEmpty;
  });

  it('AAA level is stricter — fewer passing steps than AA', () => {
    const aaReport  = auditCoverage(registry, wcag21, 'AA');
    const aaaReport = auditCoverage(registry, wcag21, 'AAA');
    const aaTotal  = aaReport.tokens.reduce((n, t) => n + t.surfaces.reduce((m, s) => m + s.passingSteps.length, 0), 0);
    const aaaTotal = aaaReport.tokens.reduce((n, t) => n + t.surfaces.reduce((m, s) => m + s.passingSteps.length, 0), 0);
    expect(aaaTotal).toBeLessThanOrEqual(aaTotal);
  });

  it('works with apca engine', () => {
    const apcaRegistry = buildRegistry(processed, apca);
    const report = auditCoverage(apcaRegistry, apca);
    expect(report.meta.engine).toBe('apca');
    expect(report.tokens.length).toBeGreaterThan(0);
  });

  it('fontSizePx option changes fontSize in meta', () => {
    const report = auditCoverage(registry, wcag21, 'AA', { fontSizePx: 12 });
    expect(report.meta.fontSize).toBe('12px');
  });
});

describe('formatCoverageText', () => {
  const report = auditCoverage(registry, wcag21);

  it('output contains the report header', () => {
    const text = formatCoverageText(report);
    expect(text).toContain('=== Coverage Report ===');
    expect(text).toContain('Engine: wcag21');
    expect(text).toContain('Level: AA');
  });

  it('output contains each token name', () => {
    const text = formatCoverageText(report);
    for (const token of report.tokens) {
      expect(text).toContain(`TOKEN  ${token.token}`);
    }
  });

  it('output contains ramp name in token header', () => {
    const text = formatCoverageText(report);
    expect(text).toContain('ramp: neutral');
    expect(text).toContain('ramp: blue');
  });

  it('configured passing step shows ✓', () => {
    const text = formatCoverageText(report);
    expect(text).toContain('✓');
  });

  it('no-passing-steps surfaces show warning', () => {
    const midInput: TokenInput = {
      ...input,
      themes: { mid: { ramp: 'neutral', step: 4 } },
      config: { stacks: { root: 0 } },
    };
    const midRegistry = buildRegistry(processInput(midInput), wcag21);
    const midReport = auditCoverage(midRegistry, wcag21);
    const text = formatCoverageText(midReport);
    // If any surface has 0 passing steps it should say NO PASSING STEPS
    const hasEmpty = midReport.tokens.some(t => t.surfaces.some(s => s.passingSteps.length === 0));
    if (hasEmpty) {
      expect(text).toContain('NO PASSING STEPS');
    }
  });
});

describe('formatCoverageJSON', () => {
  it('produces valid JSON', () => {
    const report = auditCoverage(registry, wcag21);
    const json = formatCoverageJSON(report);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('JSON contains tokens array', () => {
    const report = auditCoverage(registry, wcag21);
    const parsed = JSON.parse(formatCoverageJSON(report));
    expect(Array.isArray(parsed.tokens)).toBe(true);
    expect(parsed.tokens.length).toBeGreaterThan(0);
  });
});
