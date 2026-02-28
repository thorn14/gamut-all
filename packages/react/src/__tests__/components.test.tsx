import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { TokenProvider } from '../TokenProvider.js';
import { TokenizedText } from '../components/TokenizedText.js';
import { TokenizedContainer } from '../components/TokenizedContainer.js';
import { TokenResolver } from '../components/TokenResolver.js';
import { withAutoContrast } from '../components/withAutoContrast.js';
import { getTestRegistry } from './fixtures.js';

function wrap(ui: React.ReactNode) {
  return render(<TokenProvider registry={getTestRegistry()}>{ui}</TokenProvider>);
}

// ── TokenizedText ─────────────────────────────────────────────────────────────

describe('TokenizedText', () => {
  it('applies style.color with a hex value', () => {
    wrap(
      <div data-theme="white">
        <TokenizedText token="fgPrimary" data-testid="text">
          Hello
        </TokenizedText>
      </div>
    );
    const el = screen.getByTestId('text');
    // color is set via inline style — may be rgb() after browser parsing
    expect(el).toBeInTheDocument();
    // The color style should be set (non-empty)
    const color = (el as HTMLElement).style.color;
    expect(color).toBeTruthy();
  });

  it('renders children', () => {
    wrap(
      <div data-theme="white">
        <TokenizedText token="fgPrimary" data-testid="text">
          World
        </TokenizedText>
      </div>
    );
    expect(screen.getByTestId('text').textContent).toBe('World');
  });

  it('renders as a custom element via "as" prop', () => {
    wrap(
      <div data-theme="white">
        <TokenizedText token="fgPrimary" as="p" data-testid="text">
          text
        </TokenizedText>
      </div>
    );
    expect(screen.getByTestId('text').tagName).toBe('P');
  });
});

// ── TokenizedContainer ────────────────────────────────────────────────────────

describe('TokenizedContainer', () => {
  it('sets data-theme attribute', () => {
    wrap(
      <TokenizedContainer bg="dark" data-testid="container">
        content
      </TokenizedContainer>
    );
    expect(screen.getByTestId('container')).toHaveAttribute('data-theme', 'dark');
  });

  it('sets data-stack attribute (defaults to root)', () => {
    wrap(
      <TokenizedContainer bg="white" data-testid="container">
        content
      </TokenizedContainer>
    );
    expect(screen.getByTestId('container')).toHaveAttribute('data-stack', 'root');
  });

  it('sets data-stack to custom stack', () => {
    wrap(
      <TokenizedContainer bg="white" stack="card" data-testid="container">
        content
      </TokenizedContainer>
    );
    expect(screen.getByTestId('container')).toHaveAttribute('data-stack', 'card');
  });
});

// ── TokenResolver ─────────────────────────────────────────────────────────────

describe('TokenResolver', () => {
  it('calls children with resolved tokens and context', () => {
    const childFn = vi.fn().mockReturnValue(<span data-testid="inner">ok</span>);

    wrap(
      <div data-theme="white">
        <TokenResolver>{childFn}</TokenResolver>
      </div>
    );

    expect(screen.getByTestId('inner')).toBeInTheDocument();
    expect(childFn).toHaveBeenCalled();
    const [tokens, ctx] = childFn.mock.calls[0] as [Record<string, string>, unknown];
    expect(typeof tokens).toBe('object');
    expect(ctx).toBeDefined();
  });
});

// ── withAutoContrast ──────────────────────────────────────────────────────────

interface TextProps {
  fgPrimary?: string;
  children?: React.ReactNode;
}

function TextComponent({ fgPrimary, children }: TextProps) {
  return (
    <span data-testid="wrapped" style={{ color: fgPrimary }}>
      {children}
    </span>
  );
}

describe('withAutoContrast', () => {
  it('injects resolved hex values as props', () => {
    const Enhanced = withAutoContrast(TextComponent, { tokens: ['fgPrimary'] });

    wrap(
      <div data-theme="white">
        <Enhanced>text</Enhanced>
      </div>
    );

    const el = screen.getByTestId('wrapped');
    expect(el).toBeInTheDocument();
    // The color style will be set from the injected fgPrimary prop
    const color = (el as HTMLElement).style.color;
    expect(color).toBeTruthy();
  });

  it('sets correct displayName', () => {
    const Enhanced = withAutoContrast(TextComponent, { tokens: [] });
    expect(Enhanced.displayName).toBe('withAutoContrast(TextComponent)');
  });
});
