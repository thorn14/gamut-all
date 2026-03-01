import { describe, it, expect, vi, afterEach } from 'vitest';
import { warnMissingDataTheme, checkDataThemeCoverage } from '../audit-helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

// ── warnMissingDataTheme ──────────────────────────────────────────────────────

describe('warnMissingDataTheme', () => {
  it('does not warn when element has data-theme', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    el.setAttribute('data-theme', 'white');
    warnMissingDataTheme(el);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when an ancestor has data-theme', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parent = document.createElement('div');
    parent.setAttribute('data-theme', 'dark');
    const child = document.createElement('span');
    parent.appendChild(child);
    warnMissingDataTheme(child);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when no data-theme in ancestor chain', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    warnMissingDataTheme(el);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toContain('[gamut-all]');
  });

  it('warns with element as second arg', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    warnMissingDataTheme(el);
    expect(warnSpy.mock.calls[0]![1]).toBe(el);
  });

  it('does not warn for deeply nested child under data-theme root', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = document.createElement('div');
    root.setAttribute('data-theme', 'white');
    const a = document.createElement('div');
    const b = document.createElement('div');
    const c = document.createElement('span');
    root.appendChild(a);
    a.appendChild(b);
    b.appendChild(c);
    warnMissingDataTheme(c);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ── checkDataThemeCoverage ────────────────────────────────────────────────────

describe('checkDataThemeCoverage', () => {
  it('returns empty arrays for empty root', () => {
    const root = document.createElement('div');
    const result = checkDataThemeCoverage(root);
    expect(result.missing).toHaveLength(0);
    expect(result.present).toHaveLength(0);
  });

  it('classifies element with data-theme as present', () => {
    const root = document.createElement('div');
    const child = document.createElement('div');
    child.setAttribute('data-theme', 'white');
    root.appendChild(child);
    const result = checkDataThemeCoverage(root);
    expect(result.present).toContain(child);
    expect(result.missing).toHaveLength(0);
  });

  it('classifies element with no data-theme and no ancestor as missing', () => {
    const root = document.createElement('div');
    const child = document.createElement('div');
    root.appendChild(child);
    const result = checkDataThemeCoverage(root);
    expect(result.missing).toContain(child);
    expect(result.present).toHaveLength(0);
  });

  it('element with ancestor data-theme is NOT missing', () => {
    const root = document.createElement('div');
    const parent = document.createElement('div');
    parent.setAttribute('data-theme', 'dark');
    const child = document.createElement('span');
    root.appendChild(parent);
    parent.appendChild(child);
    const result = checkDataThemeCoverage(root);
    // parent is present, child has an ancestor with data-theme → not missing
    expect(result.present).toContain(parent);
    expect(result.missing).not.toContain(child);
  });

  it('handles mixed tree correctly', () => {
    const root = document.createElement('div');

    const coveredParent = document.createElement('div');
    coveredParent.setAttribute('data-theme', 'white');
    const coveredChild = document.createElement('span');
    coveredParent.appendChild(coveredChild);

    const uncoveredEl = document.createElement('section');

    root.appendChild(coveredParent);
    root.appendChild(uncoveredEl);

    const result = checkDataThemeCoverage(root);
    expect(result.present).toContain(coveredParent);
    expect(result.missing).toContain(uncoveredEl);
    expect(result.missing).not.toContain(coveredChild);
  });

  it('root element itself is not checked (only querySelectorAll descendants)', () => {
    const root = document.createElement('div');
    // Root itself has no data-theme but that is not checked
    const result = checkDataThemeCoverage(root);
    // Root has no children → both empty
    expect(result.missing).toHaveLength(0);
    expect(result.present).toHaveLength(0);
  });
});
