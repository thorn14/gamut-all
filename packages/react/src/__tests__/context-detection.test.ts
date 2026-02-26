import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectContext, shallowEqual } from '../context-detection.js';
import type { DesignContext } from '@gamut-all/core';

afterEach(() => {
  vi.restoreAllMocks();
});

// ── detectContext ─────────────────────────────────────────────────────────────

describe('detectContext', () => {
  it('returns bgClass from data-bg attribute', () => {
    const el = document.createElement('div');
    el.setAttribute('data-bg', 'dark');
    const ctx = detectContext(el, 'white', 'default');
    expect(ctx.bgClass).toBe('dark');
  });

  it('walks up to parent for data-bg', () => {
    const parent = document.createElement('div');
    parent.setAttribute('data-bg', 'inverse');
    const child = document.createElement('span');
    parent.appendChild(child);
    const ctx = detectContext(child, 'white', 'default');
    expect(ctx.bgClass).toBe('inverse');
  });

  it('falls back to defaultBg when no data-bg found', () => {
    const el = document.createElement('div');
    const ctx = detectContext(el, 'card', 'default');
    expect(ctx.bgClass).toBe('card');
  });

  it('emits console.warn in devMode when no data-bg found', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    detectContext(el, 'white', 'default', true);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toContain('[gamut-all]');
    expect(warnSpy.mock.calls[0]![0]).toContain('defaultBg="white"');
  });

  it('does NOT warn in devMode when data-bg IS present', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    el.setAttribute('data-bg', 'white');
    detectContext(el, 'white', 'default', true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does NOT warn when devMode is false (default)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    detectContext(el, 'white', 'default'); // devMode defaults to false
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('passes visionMode through to context', () => {
    const el = document.createElement('div');
    el.setAttribute('data-bg', 'white');
    const ctx = detectContext(el, 'white', 'deuteranopia');
    expect(ctx.visionMode).toBe('deuteranopia');
  });

  it('reads stack from data-stack attribute', () => {
    const el = document.createElement('div');
    el.setAttribute('data-bg', 'white');
    el.setAttribute('data-stack', 'modal');
    const ctx = detectContext(el, 'white', 'default');
    expect(ctx.stackDepth).toBe('modal');
  });

  it('defaults stackDepth to root when no data-stack present', () => {
    const el = document.createElement('div');
    el.setAttribute('data-bg', 'white');
    const ctx = detectContext(el, 'white', 'default');
    expect(ctx.stackDepth).toBe('root');
  });

  it('returns a fontSize FontSizeClass string', () => {
    const el = document.createElement('div');
    el.setAttribute('data-bg', 'white');
    const ctx = detectContext(el, 'white', 'default');
    expect(ctx.fontSize).toMatch(/^\d+px$/);
  });
});

// ── shallowEqual ──────────────────────────────────────────────────────────────

const baseCtx: DesignContext = {
  fontSize: '16px',
  bgClass: 'white',
  stackDepth: 'root',
  visionMode: 'default',
};

describe('shallowEqual', () => {
  it('equal contexts return true', () => {
    expect(shallowEqual(baseCtx, { ...baseCtx })).toBe(true);
  });

  it('same reference returns true', () => {
    expect(shallowEqual(baseCtx, baseCtx)).toBe(true);
  });

  it('differing fontSize returns false', () => {
    expect(shallowEqual(baseCtx, { ...baseCtx, fontSize: '24px' })).toBe(false);
  });

  it('differing bgClass returns false', () => {
    expect(shallowEqual(baseCtx, { ...baseCtx, bgClass: 'dark' })).toBe(false);
  });

  it('differing stackDepth returns false', () => {
    expect(shallowEqual(baseCtx, { ...baseCtx, stackDepth: 'modal' })).toBe(false);
  });

  it('differing visionMode returns false', () => {
    expect(shallowEqual(baseCtx, { ...baseCtx, visionMode: 'deuteranopia' })).toBe(false);
  });

  it('all fields match → true even with different object identity', () => {
    const a: DesignContext = { fontSize: '12px', bgClass: 'dark', stackDepth: 'card', visionMode: 'protanopia' };
    const b: DesignContext = { fontSize: '12px', bgClass: 'dark', stackDepth: 'card', visionMode: 'protanopia' };
    expect(shallowEqual(a, b)).toBe(true);
  });
});
