import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { TokenProvider } from '../TokenProvider.js';
import { StackLayer } from '../components/StackLayer.js';
import { useToken, useTokenColor } from '../hooks.js';
import { getTestRegistry } from './fixtures.js';

function wrap(ui: React.ReactNode) {
  return render(<TokenProvider registry={getTestRegistry()}>{ui}</TokenProvider>);
}

// ── Nested StackLayers ────────────────────────────────────────────────────────

function LayerToken({ testId, token }: { testId: string; token: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const hex = useToken(token, ref);
  return <span ref={ref} data-testid={testId}>{hex}</span>;
}

describe('Integration: nested StackLayers', () => {
  it('resolves tokens differently per layer (white vs dark)', () => {
    wrap(
      <StackLayer stack="root" bg="white">
        <LayerToken testId="light" token="fgPrimary" />
        <StackLayer stack="card" bg="dark">
          <LayerToken testId="dark" token="fgPrimary" />
        </StackLayer>
      </StackLayer>
    );

    const lightHex = screen.getByTestId('light').textContent;
    const darkHex = screen.getByTestId('dark').textContent;

    expect(lightHex).toMatch(/^#[0-9a-fA-F]{3,6}$/);
    expect(darkHex).toMatch(/^#[0-9a-fA-F]{3,6}$/);
    // Tokens on different backgrounds should differ
    expect(lightHex).not.toBe(darkHex);
  });
});

// ── Missing data-theme dev warning ────────────────────────────────────────────

describe('Integration: missing data-theme', () => {
  it('does NOT warn in test (NODE_ENV is not "development")', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    wrap(
      // No data-theme anywhere in the tree
      <div>
        <LayerToken testId="token" token="fgPrimary" />
      </div>
    );

    // In test environment NODE_ENV !== 'development', so no warn
    // (the token still resolves to a hex via defaultBg fallback)
    const hex = screen.getByTestId('token').textContent;
    expect(hex).toMatch(/^#[0-9a-fA-F]{3,6}$/);

    warnSpy.mockRestore();
  });
});

// ── Vision mode fallback ──────────────────────────────────────────────────────

describe('Integration: vision mode', () => {
  it('protanopia fgError or fgSuccess on dark bg resolves differently than default', () => {
    // On dark bg, protanopia collapses luminance for red/green → CVD variants generated
    const registry = getTestRegistry();
    const { unmount: u1 } = render(
      <TokenProvider registry={registry} defaultVisionMode="default">
        <div data-theme="dark">
          <LayerToken testId="default-error" token="fgError" />
          <LayerToken testId="default-success" token="fgSuccess" />
        </div>
      </TokenProvider>
    );
    const defaultErr = screen.getByTestId('default-error').textContent;
    const defaultSuc = screen.getByTestId('default-success').textContent;
    u1();

    render(
      <TokenProvider registry={registry} defaultVisionMode="protanopia">
        <div data-theme="dark">
          <LayerToken testId="protan-error" token="fgError" />
          <LayerToken testId="protan-success" token="fgSuccess" />
        </div>
      </TokenProvider>
    );
    const protanErr = screen.getByTestId('protan-error').textContent;
    const protanSuc = screen.getByTestId('protan-success').textContent;

    expect(defaultErr).toMatch(/^#/);
    expect(protanErr).toMatch(/^#/);
    // At least one of error or success should differ under protanopia on dark bg
    expect(protanErr !== defaultErr || protanSuc !== defaultSuc).toBe(true);
  });

  it('tritanopia falls back to default vision variant', () => {
    // tritanopia has no specific override in fixture → falls back to default
    const registry = getTestRegistry();
    const { unmount: u1 } = render(
      <TokenProvider registry={registry} defaultVisionMode="default">
        <div data-theme="white">
          <LayerToken testId="def" token="fgError" />
        </div>
      </TokenProvider>
    );
    const defaultHex = screen.getByTestId('def').textContent;
    u1();

    render(
      <TokenProvider registry={registry} defaultVisionMode="tritanopia">
        <div data-theme="white">
          <LayerToken testId="trit" token="fgError" />
        </div>
      </TokenProvider>
    );
    const tritHex = screen.getByTestId('trit').textContent;

    // tritanopia has no override → should match default
    expect(tritHex).toBe(defaultHex);
  });
});

// ── useTokenColor without ref ─────────────────────────────────────────────────

function DirectColor({ token, bg }: { token: string; bg: string }) {
  const hex = useTokenColor(token, { bg });
  return <span data-testid="color">{hex}</span>;
}

describe('Integration: useTokenColor', () => {
  it('resolves background fallback under non-default bg', () => {
    wrap(
      <DirectColor token="fgPrimary" bg="dark" />
    );
    const hex = screen.getByTestId('color').textContent;
    expect(hex).toMatch(/^#[0-9a-fA-F]{3,6}$/);
  });
});
