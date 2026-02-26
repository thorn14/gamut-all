import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { useDesignContext, useResolvedTokens } from '../hooks.js';

const overlayStyle: CSSProperties = {
  position: 'fixed',
  bottom: '16px',
  right: '16px',
  background: 'rgba(0,0,0,0.85)',
  color: '#fff',
  fontFamily: 'monospace',
  fontSize: '12px',
  padding: '12px',
  borderRadius: '8px',
  zIndex: 9999,
  maxHeight: '50vh',
  overflowY: 'auto',
  minWidth: '240px',
};

export function TokenInspector() {
  if (process.env['NODE_ENV'] !== 'development') return null;

  const ref = useRef<HTMLDivElement>(null);
  const ctx = useDesignContext(ref);
  const tokens = useResolvedTokens(ref);

  return (
    <div ref={ref} style={overlayStyle}>
      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>[gamut-all] Token Inspector</div>
      {ctx && (
        <div style={{ marginBottom: '8px', opacity: 0.7 }}>
          <div>bg: {ctx.bgClass}</div>
          <div>stack: {ctx.stackDepth}</div>
          <div>fontSize: {ctx.fontSize}</div>
          <div>vision: {ctx.visionMode}</div>
        </div>
      )}
      {Object.entries(tokens).map(([name, hex]) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span
            style={{
              display: 'inline-block',
              width: '14px',
              height: '14px',
              background: hex,
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '2px',
              flexShrink: 0,
            }}
          />
          <span>{name}: {hex}</span>
        </div>
      ))}
    </div>
  );
}
