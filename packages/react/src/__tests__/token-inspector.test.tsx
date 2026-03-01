import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { TokenProvider } from '../TokenProvider.js';
import { TokenInspector } from '../components/TokenInspector.js';
import { getTestRegistry } from './fixtures.js';

const OVERLAY_STYLE = 'position: fixed';

function wrap(ui: React.ReactNode) {
  return render(
    <TokenProvider registry={getTestRegistry()}>
      {ui}
    </TokenProvider>
  );
}

afterEach(() => {
  process.env['NODE_ENV'] = 'test';
});

describe('TokenInspector', () => {
  it('renders nothing visible in non-development environments', () => {
    // NODE_ENV is 'test' — component returns null
    const { container } = wrap(<TokenInspector />);
    // The data-vision wrapper from TokenProvider is present but no overlay inside
    const overlay = container.querySelector(`[style*="${OVERLAY_STYLE}"]`);
    expect(overlay).toBeNull();
  });

  it('renders the fixed overlay in development mode', () => {
    process.env['NODE_ENV'] = 'development';
    const { container } = wrap(<TokenInspector />);
    const overlay = container.querySelector(`[style*="${OVERLAY_STYLE}"]`);
    expect(overlay).not.toBeNull();
  });

  it('shows the gamut-all header in dev mode', () => {
    process.env['NODE_ENV'] = 'development';
    const { getByText } = wrap(<TokenInspector />);
    expect(getByText('[gamut-all] Token Inspector')).toBeDefined();
  });

  it('renders token color swatches in dev mode', () => {
    process.env['NODE_ENV'] = 'development';
    const { container } = wrap(
      <div data-theme="white">
        <TokenInspector />
      </div>
    );
    const overlay = container.querySelector(`[style*="${OVERLAY_STYLE}"]`);
    expect(overlay).not.toBeNull();
    // Overlay contains header div + token entries
    expect(overlay!.children.length).toBeGreaterThan(1);
  });
});
