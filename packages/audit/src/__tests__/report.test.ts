import { describe, it, expect } from 'vitest';
import { formatText, formatJSON } from '../report.js';
import type { AuditResult } from '../runner.js';

const cleanResult: AuditResult = {
  issues: [],
  variantsChecked: 100,
  elementsChecked: 0,
  passCount: 100,
  failCount: 0,
};

const resultWithIssues: AuditResult = {
  issues: [
    {
      type: 'non-compliant-variant',
      severity: 'error',
      message: 'Non-compliant: fgPrimary__16px__white__root__default',
      detail: { hex: '#a3a3a3', bgHex: '#fafafa', value: 2.32, required: 4.5, engine: 'wcag21' },
    },
    {
      type: 'missing-data-bg',
      severity: 'warning',
      message: 'Element uses var(--fg-primary) but has no data-bg in ancestor chain',
      detail: { varName: 'fg-primary', tag: 'p' },
    },
  ],
  variantsChecked: 50,
  elementsChecked: 30,
  passCount: 49,
  failCount: 1,
};

// ── formatText ────────────────────────────────────────────────────────────────

describe('formatText', () => {
  it('includes gamut-all header', () => {
    expect(formatText(cleanResult)).toContain('[gamut-all audit]');
  });

  it('shows no issues message for clean result', () => {
    const text = formatText(cleanResult);
    expect(text).toContain('No issues found');
  });

  it('shows variants checked count', () => {
    const text = formatText(cleanResult);
    expect(text).toContain('100');
  });

  it('shows pass/fail counts', () => {
    const text = formatText(cleanResult);
    expect(text).toContain('Passed: 100');
    expect(text).toContain('Failed: 0');
  });

  it('lists errors section when errors present', () => {
    const text = formatText(resultWithIssues);
    expect(text).toContain('Errors (1):');
    expect(text).toContain('[non-compliant-variant]');
  });

  it('lists warnings section when warnings present', () => {
    const text = formatText(resultWithIssues);
    expect(text).toContain('Warnings (1):');
    expect(text).toContain('[missing-data-bg]');
  });

  it('includes issue message in output', () => {
    const text = formatText(resultWithIssues);
    expect(text).toContain('fgPrimary__16px__white__root__default');
  });

  it('shows elements checked when > 0', () => {
    const text = formatText(resultWithIssues);
    expect(text).toContain('DOM elements checked: 30');
  });

  it('does not show elements checked line when 0', () => {
    const text = formatText(cleanResult);
    expect(text).not.toContain('DOM elements checked');
  });

  it('returns a string', () => {
    expect(typeof formatText(cleanResult)).toBe('string');
    expect(typeof formatText(resultWithIssues)).toBe('string');
  });
});

// ── formatJSON ────────────────────────────────────────────────────────────────

describe('formatJSON', () => {
  it('returns valid JSON', () => {
    expect(() => JSON.parse(formatJSON(cleanResult))).not.toThrow();
  });

  it('tool field is @gamut-all/audit', () => {
    const parsed = JSON.parse(formatJSON(cleanResult));
    expect(parsed.tool).toBe('@gamut-all/audit');
  });

  it('timestamp is an ISO string', () => {
    const parsed = JSON.parse(formatJSON(cleanResult));
    expect(() => new Date(parsed.timestamp)).not.toThrow();
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('summary contains expected fields', () => {
    const parsed = JSON.parse(formatJSON(cleanResult));
    expect(parsed.summary).toMatchObject({
      variantsChecked: 100,
      elementsChecked: 0,
      passCount: 100,
      failCount: 0,
      issueCount: 0,
      errorCount: 0,
      warningCount: 0,
    });
  });

  it('summary counts errors and warnings correctly', () => {
    const parsed = JSON.parse(formatJSON(resultWithIssues));
    expect(parsed.summary.errorCount).toBe(1);
    expect(parsed.summary.warningCount).toBe(1);
    expect(parsed.summary.issueCount).toBe(2);
  });

  it('issues array is preserved', () => {
    const parsed = JSON.parse(formatJSON(resultWithIssues));
    expect(parsed.issues).toHaveLength(2);
    expect(parsed.issues[0].type).toBe('non-compliant-variant');
    expect(parsed.issues[1].type).toBe('missing-data-bg');
  });

  it('empty issues produces empty array', () => {
    const parsed = JSON.parse(formatJSON(cleanResult));
    expect(parsed.issues).toEqual([]);
  });
});
