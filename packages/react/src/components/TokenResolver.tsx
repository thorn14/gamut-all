import { useRef } from 'react';
import type { ReactNode } from 'react';
import type { DesignContext } from '@gamut-all/core';
import { useResolvedTokens, useDesignContext } from '../hooks.js';
import { useTokenContextValue } from '../context.js';

interface TokenResolverProps {
  children: (tokens: Record<string, string>, context: DesignContext) => ReactNode;
}

const DEFAULT_CONTEXT: DesignContext = {
  fontSize: '16px',
  bgClass: '',
  stackDepth: 'root',
  visionMode: 'default',
};

export function TokenResolver({ children }: TokenResolverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const tokens = useResolvedTokens(ref);
  const ctx = useDesignContext(ref);
  const { defaultBg, visionMode } = useTokenContextValue();

  const resolvedCtx: DesignContext = ctx ?? { ...DEFAULT_CONTEXT, bgClass: defaultBg, visionMode };

  return (
    <div ref={ref} style={{ display: 'contents' }}>
      {children(tokens, resolvedCtx)}
    </div>
  );
}
