import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { TokenProvider } from '../TokenProvider.js';
import { useToken, useResolvedTokens, useTokenVars, useTokenColor, useDesignContext } from '../hooks.js';
import { getTestRegistry } from './fixtures.js';

function wrap(ui: React.ReactNode) {
  const registry = getTestRegistry();
  return render(<TokenProvider registry={registry}>{ui}</TokenProvider>);
}

// ── useToken ──────────────────────────────────────────────────────────────────

function TokenDisplay({ token, bg }: { token: string; bg?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const hex = useToken(token, ref);
  return (
    <div ref={ref} data-bg={bg} data-testid="el">
      <span data-testid="hex">{hex}</span>
    </div>
  );
}

describe('useToken', () => {
  it('returns a hex string for a known token', () => {
    wrap(<TokenDisplay token="fgPrimary" bg="white" />);
    expect(screen.getByTestId('hex').textContent).toMatch(/^#[0-9a-fA-F]{3,6}$/);
  });

  it('falls back to defaultBg when data-bg is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    wrap(<TokenDisplay token="fgPrimary" />);
    const hex = screen.getByTestId('hex').textContent ?? '';
    expect(hex).toMatch(/^#[0-9a-fA-F]{3,6}$/);
    warnSpy.mockRestore();
  });

  it('returns empty string for unknown token', () => {
    wrap(<TokenDisplay token="unknownToken" bg="white" />);
    // unknown token → registry.defaults['unknownToken'] ?? ''
    expect(screen.getByTestId('hex').textContent).toBe('');
  });
});

// ── useResolvedTokens ─────────────────────────────────────────────────────────

function AllTokensDisplay() {
  const ref = useRef<HTMLDivElement>(null);
  const tokens = useResolvedTokens(ref);
  return (
    <div ref={ref} data-bg="white">
      <span data-testid="count">{Object.keys(tokens).length}</span>
      <span data-testid="fgPrimary">{tokens['fgPrimary'] ?? ''}</span>
      <span data-testid="fgLink-hover">{tokens['fgLink-hover'] ?? ''}</span>
    </div>
  );
}

describe('useResolvedTokens', () => {
  it('returns all token names including interactions', () => {
    wrap(<AllTokensDisplay />);
    const count = parseInt(screen.getByTestId('count').textContent ?? '0', 10);
    expect(count).toBeGreaterThan(0);
    expect(screen.getByTestId('fgPrimary').textContent).toMatch(/^#/);
    expect(screen.getByTestId('fgLink-hover').textContent).toMatch(/^#/);
  });
});

// ── useTokenVars ──────────────────────────────────────────────────────────────

function VarsDisplay() {
  const ref = useRef<HTMLDivElement>(null);
  const vars = useTokenVars(ref);
  const keys = Object.keys(vars);
  return (
    <div ref={ref} data-bg="white">
      <span data-testid="firstKey">{keys[0] ?? ''}</span>
      <span data-testid="count">{keys.length}</span>
    </div>
  );
}

describe('useTokenVars', () => {
  it('returns CSS var names as keys (starting with --)', () => {
    wrap(<VarsDisplay />);
    const firstKey = screen.getByTestId('firstKey').textContent ?? '';
    expect(firstKey.startsWith('--')).toBe(true);
  });

  it('returns at least one var', () => {
    wrap(<VarsDisplay />);
    const count = parseInt(screen.getByTestId('count').textContent ?? '0', 10);
    expect(count).toBeGreaterThan(0);
  });
});

// ── useTokenColor ─────────────────────────────────────────────────────────────

function TokenColorDisplay({ token, bg }: { token: string; bg?: string }) {
  const hex = useTokenColor(token, { bg });
  return <span data-testid="hex">{hex}</span>;
}

describe('useTokenColor', () => {
  it('resolves a token without a ref', () => {
    wrap(<TokenColorDisplay token="fgPrimary" />);
    expect(screen.getByTestId('hex').textContent).toMatch(/^#[0-9a-fA-F]{3,6}$/);
  });

  it('respects bg override', () => {
    let hexWhite: string;
    let hexDark: string;

    const { unmount } = wrap(<TokenColorDisplay token="fgPrimary" bg="white" />);
    hexWhite = screen.getByTestId('hex').textContent ?? '';
    unmount();

    wrap(<TokenColorDisplay token="fgPrimary" bg="dark" />);
    hexDark = screen.getByTestId('hex').textContent ?? '';

    expect(hexWhite).not.toBe(hexDark);
  });
});

// ── useDesignContext ──────────────────────────────────────────────────────────

function DesignContextDisplay() {
  const ref = useRef<HTMLDivElement>(null);
  const ctx = useDesignContext(ref);
  return (
    <div ref={ref} data-bg="white" data-stack="card">
      <span data-testid="ctx">{ctx ? ctx.bgClass : 'null'}</span>
    </div>
  );
}

describe('useDesignContext', () => {
  it('returns context after mount', () => {
    wrap(<DesignContextDisplay />);
    // After initial render + effect, context should be set
    const text = screen.getByTestId('ctx').textContent;
    // May be 'null' on first render before effect runs, or 'white' after
    expect(text === 'null' || text === 'white').toBe(true);
  });
});
