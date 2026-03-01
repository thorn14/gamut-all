import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenProvider } from '../TokenProvider.js';
import { StackLayer } from '../components/StackLayer.js';
import { getTestRegistry } from './fixtures.js';

function wrap(ui: React.ReactNode) {
  return render(<TokenProvider registry={getTestRegistry()}>{ui}</TokenProvider>);
}

describe('StackLayer', () => {
  it('renders with correct data-stack attribute', () => {
    wrap(
      <StackLayer stack="card" bg="white" data-testid="layer">
        content
      </StackLayer>
    );
    expect(screen.getByTestId('layer')).toHaveAttribute('data-stack', 'card');
  });

  it('renders with correct data-theme attribute', () => {
    wrap(
      <StackLayer stack="root" bg="dark" data-testid="layer">
        content
      </StackLayer>
    );
    expect(screen.getByTestId('layer')).toHaveAttribute('data-theme', 'dark');
  });

  it('renders as a div by default', () => {
    wrap(
      <StackLayer stack="root" bg="white" data-testid="layer">
        children
      </StackLayer>
    );
    expect(screen.getByTestId('layer').tagName).toBe('DIV');
  });

  it('renders as a custom element via "as" prop', () => {
    wrap(
      <StackLayer stack="root" bg="white" as="section" data-testid="layer">
        children
      </StackLayer>
    );
    expect(screen.getByTestId('layer').tagName).toBe('SECTION');
  });

  it('renders children', () => {
    wrap(
      <StackLayer stack="root" bg="white">
        <span data-testid="child">hello</span>
      </StackLayer>
    );
    expect(screen.getByTestId('child').textContent).toBe('hello');
  });

  it('omits data-theme when bg is not provided', () => {
    wrap(
      <StackLayer stack="card" data-testid="layer">
        content
      </StackLayer>
    );
    expect(screen.getByTestId('layer')).not.toHaveAttribute('data-theme');
  });
});
