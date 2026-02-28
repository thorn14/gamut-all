import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { TokenProvider } from '../TokenProvider.js';
import { useTokenContextValue } from '../context.js';
import { getTestRegistry } from './fixtures.js';

function ContextConsumer() {
  const ctx = useTokenContextValue();
  return (
    <div>
      <span data-testid="defaultBg">{ctx.defaultBg}</span>
      <span data-testid="visionMode">{ctx.visionMode}</span>
    </div>
  );
}

function ThrowingConsumer() {
  useTokenContextValue();
  return null;
}

describe('TokenProvider', () => {
  const registry = getTestRegistry();

  it('provides context without throwing', () => {
    expect(() =>
      render(
        <TokenProvider registry={registry}>
          <div>ok</div>
        </TokenProvider>
      )
    ).not.toThrow();
  });

  it('useTokenContextValue throws outside provider', () => {
    expect(() => render(<ThrowingConsumer />)).toThrow(
      'useTokenContextValue must be used within <TokenProvider>'
    );
  });

  it('defaultBg is first theme key from registry', () => {
    render(
      <TokenProvider registry={registry}>
        <ContextConsumer />
      </TokenProvider>
    );
    const firstKey = registry.themes.keys().next().value as string;
    expect(screen.getByTestId('defaultBg').textContent).toBe(firstKey);
  });

  it('visionMode defaults to "default"', () => {
    render(
      <TokenProvider registry={registry}>
        <ContextConsumer />
      </TokenProvider>
    );
    expect(screen.getByTestId('visionMode').textContent).toBe('default');
  });

  it('setVisionMode updates the context', async () => {
    function VisionChanger() {
      const ctx = useTokenContextValue();
      return (
        <div>
          <span data-testid="vision">{ctx.visionMode}</span>
          <button onClick={() => ctx.setVisionMode('deuteranopia')}>change</button>
        </div>
      );
    }

    render(
      <TokenProvider registry={registry}>
        <VisionChanger />
      </TokenProvider>
    );

    expect(screen.getByTestId('vision').textContent).toBe('default');

    await act(async () => {
      screen.getByRole('button').click();
    });

    expect(screen.getByTestId('vision').textContent).toBe('deuteranopia');
  });

  it('accepts defaultVisionMode prop', () => {
    render(
      <TokenProvider registry={registry} defaultVisionMode="protanopia">
        <ContextConsumer />
      </TokenProvider>
    );
    expect(screen.getByTestId('visionMode').textContent).toBe('protanopia');
  });

  it('renders data-vision attribute on wrapper div', () => {
    const { container } = render(
      <TokenProvider registry={registry} defaultVisionMode="deuteranopia">
        <div />
      </TokenProvider>
    );
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveAttribute('data-vision', 'deuteranopia');
  });

  it('data-vision updates when setVisionMode is called', async () => {
    function VisionSwitcher() {
      const ctx = useTokenContextValue();
      return (
        <button onClick={() => ctx.setVisionMode('protanopia')}>switch</button>
      );
    }

    const { container } = render(
      <TokenProvider registry={registry}>
        <VisionSwitcher />
      </TokenProvider>
    );

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveAttribute('data-vision', 'default');

    await act(async () => {
      screen.getByRole('button').click();
    });

    expect(wrapper).toHaveAttribute('data-vision', 'protanopia');
  });
});
