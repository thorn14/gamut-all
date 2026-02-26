import { useEffect, useRef, useState } from 'react';
import type { RefObject, CSSProperties } from 'react';
import type { DesignContext, FontSizeClass, StackClass } from '@gamut-all/core';
import { resolveToken, resolveAllTokens } from '@gamut-all/core';
import { useTokenContextValue } from './context.js';
import { detectContext, shallowEqual } from './context-detection.js';

const isDev = typeof process !== 'undefined' && process.env['NODE_ENV'] === 'development';

export { useTokenContextValue as useTokenContext };

export function useDesignContext(ref: RefObject<Element | null>): DesignContext | null {
  const { defaultBg, visionMode } = useTokenContextValue();
  const [context, setContext] = useState<DesignContext | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const next = detectContext(el, defaultBg, visionMode, isDev);
      setContext(prev => (prev && shallowEqual(prev, next) ? prev : next));
    };

    update();

    const ro = new ResizeObserver(update);
    const mo = new MutationObserver(update);

    ro.observe(el);
    mo.observe(el, {
      attributes: true,
      attributeFilter: ['data-bg', 'data-stack'],
      subtree: false,
    });

    let ancestor = el.parentElement;
    while (ancestor) {
      mo.observe(ancestor, {
        attributes: true,
        attributeFilter: ['data-bg', 'data-stack'],
      });
      ancestor = ancestor.parentElement;
    }

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [ref, defaultBg, visionMode]);

  return context;
}

export function useToken(tokenName: string, ref: RefObject<Element | null>): string {
  const { registry } = useTokenContextValue();
  const ctx = useDesignContext(ref);

  if (!ctx) return registry.defaults[tokenName] ?? '';
  return resolveToken(tokenName, ctx, registry);
}

export function useResolvedTokens(ref: RefObject<Element | null>): Record<string, string> {
  const { registry } = useTokenContextValue();
  const ctx = useDesignContext(ref);

  if (!ctx) return { ...registry.defaults };
  return resolveAllTokens(ctx, registry);
}

function tokenNameToCssVar(name: string): string {
  // camelCase → kebab-case: 'fgPrimary' → '--fg-primary'
  const kebab = name.replace(/([A-Z])/g, '-$1').toLowerCase();
  return `--${kebab}`;
}

export function useTokenVars(ref: RefObject<Element | null>): CSSProperties {
  const tokens = useResolvedTokens(ref);
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(tokens)) {
    vars[tokenNameToCssVar(name)] = value;
  }
  return vars as CSSProperties;
}

export function useTokenColor(
  tokenName: string,
  opts?: { bg?: string; stack?: StackClass; fontSize?: FontSizeClass },
): string {
  const { registry, defaultBg, visionMode } = useTokenContextValue();

  const ctx: DesignContext = {
    bgClass: opts?.bg ?? defaultBg,
    stackDepth: opts?.stack ?? 'root',
    fontSize: opts?.fontSize ?? '16px',
    visionMode,
  };

  return resolveToken(tokenName, ctx, registry);
}

export function useTokenContextRef(): RefObject<Element | null> {
  return useRef<Element | null>(null);
}
