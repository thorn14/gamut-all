import { useRef } from 'react';
import type { ComponentType, FC } from 'react';
import { useResolvedTokens, useTokenVars } from '../hooks.js';

interface AutoContrastOptions {
  tokens: string[];
}

export function withAutoContrast<P extends object>(
  Component: ComponentType<P>,
  options: AutoContrastOptions,
): FC<P> {
  const WrappedComponent: FC<P> = (props: P) => {
    const ref = useRef<HTMLDivElement>(null);
    const resolved = useResolvedTokens(ref);
    const cssVars = useTokenVars(ref);

    const tokenProps: Record<string, string> = {};
    for (const token of options.tokens) {
      tokenProps[token] = resolved[token] ?? '';
    }

    const mergedStyle = cssVars;
    const propsWithTokens = { ...props, ...tokenProps, style: mergedStyle } as P;

    return (
      <div ref={ref} style={{ display: 'contents' }}>
        <Component {...propsWithTokens} />
      </div>
    );
  };

  WrappedComponent.displayName = `withAutoContrast(${Component.displayName ?? Component.name ?? 'Component'})`;
  return WrappedComponent;
}
