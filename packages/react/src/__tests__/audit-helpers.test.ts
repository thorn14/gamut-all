import { describe, it, expect, vi, afterEach } from 'vitest';
import { warnMissingDataBg, checkDataBgCoverage } from '../audit-helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

// ── warnMissingDataBg ─────────────────────────────────────────────────────────

describe('warnMissingDataBg', () => {
  it('does not warn when element has data-bg', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    el.setAttribute('data-bg', 'white');
    warnMissingDataBg(el);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when an ancestor has data-bg', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parent = document.createElement('div');
    parent.setAttribute('data-bg', 'dark');
    const child = document.createElement('span');
    parent.appendChild(child);
    warnMissingDataBg(child);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when no data-bg in ancestor chain', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    warnMissingDataBg(el);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toContain('[gamut-all]');
  });

  it('warns with element as second arg', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    warnMissingDataBg(el);
    expect(warnSpy.mock.calls[0]![1]).toBe(el);
  });

  it('does not warn for deeply nested child under data-bg root', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = document.createElement('div');
    root.setAttribute('data-bg', 'white');
    const a = document.createElement('div');
    const b = document.createElement('div');
    const c = document.createElement('span');
    root.appendChild(a);
    a.appendChild(b);
    b.appendChild(c);
    warnMissingDataBg(c);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ── checkDataBgCoverage ───────────────────────────────────────────────────────

describe('checkDataBgCoverage', () => {
  it('returns empty arrays for empty root', () => {
    const root = document.createElement('div');
    const result = checkDataBgCoverage(root);
    expect(result.missing).toHaveLength(0);
    expect(result.present).toHaveLength(0);
  });

  it('classifies element with data-bg as present', () => {
    const root = document.createElement('div');
    const child = document.createElement('div');
    child.setAttribute('data-bg', 'white');
    root.appendChild(child);
    const result = checkDataBgCoverage(root);
    expect(result.present).toContain(child);
    expect(result.missing).toHaveLength(0);
  });

  it('classifies element with no data-bg and no ancestor as missing', () => {
    const root = document.createElement('div');
    const child = document.createElement('div');
    root.appendChild(child);
    const result = checkDataBgCoverage(root);
    expect(result.missing).toContain(child);
    expect(result.present).toHaveLength(0);
  });

  it('element with ancestor data-bg is NOT missing', () => {
    const root = document.createElement('div');
    const parent = document.createElement('div');
    parent.setAttribute('data-bg', 'dark');
    const child = document.createElement('span');
    root.appendChild(parent);
    parent.appendChild(child);
    const result = checkDataBgCoverage(root);
    // parent is present, child has an ancestor with data-bg → not missing
    expect(result.present).toContain(parent);
    expect(result.missing).not.toContain(child);
  });

  it('handles mixed tree correctly', () => {
    const root = document.createElement('div');

    const coveredParent = document.createElement('div');
    coveredParent.setAttribute('data-bg', 'white');
    const coveredChild = document.createElement('span');
    coveredParent.appendChild(coveredChild);

    const uncoveredEl = document.createElement('section');

    root.appendChild(coveredParent);
    root.appendChild(uncoveredEl);

    const result = checkDataBgCoverage(root);
    expect(result.present).toContain(coveredParent);
    expect(result.missing).toContain(uncoveredEl);
    expect(result.missing).not.toContain(coveredChild);
  });

  it('root element itself is not checked (only querySelectorAll descendants)', () => {
    const root = document.createElement('div');
    // Root itself has no data-bg but that is not checked
    const result = checkDataBgCoverage(root);
    // Root has no children → both empty
    expect(result.missing).toHaveLength(0);
    expect(result.present).toHaveLength(0);
  });
});
