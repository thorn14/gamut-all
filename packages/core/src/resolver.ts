import type { TokenRegistry, DesignContext, StackClass } from './types.js';

const STACK_FALLBACK: Record<StackClass, StackClass[]> = {
  overlay: ['modal', 'tooltip', 'popover', 'card', 'root'],
  modal: ['tooltip', 'popover', 'card', 'root'],
  tooltip: ['popover', 'card', 'root'],
  popover: ['card', 'root'],
  card: ['root'],
  root: [],
};

export function resolveToken(
  token: string,
  context: DesignContext,
  registry: TokenRegistry,
): string {
  const { fontSize, bgClass, stackDepth, visionMode } = context;

  // 1. Exact match
  const exactKey = `${token}__${fontSize}__${bgClass}__${stackDepth}__${visionMode}`;
  const exact = registry.variantMap.get(exactKey as Parameters<typeof registry.variantMap.get>[0]);
  if (exact) return exact.hex;

  // 2. Fall back to default vision
  if (visionMode !== 'default') {
    const vKey = `${token}__${fontSize}__${bgClass}__${stackDepth}__default`;
    const vFallback = registry.variantMap.get(vKey as Parameters<typeof registry.variantMap.get>[0]);
    if (vFallback) return vFallback.hex;
  }

  // 3. Relax stack toward 'root' — try current visionMode first, then 'default'
  for (const stack of STACK_FALLBACK[stackDepth] ?? []) {
    const sKey = `${token}__${fontSize}__${bgClass}__${stack}__${visionMode}`;
    const sFallback = registry.variantMap.get(sKey as Parameters<typeof registry.variantMap.get>[0]);
    if (sFallback) return sFallback.hex;

    if (visionMode !== 'default') {
      const svKey = `${token}__${fontSize}__${bgClass}__${stack}__default`;
      const svFallback = registry.variantMap.get(svKey as Parameters<typeof registry.variantMap.get>[0]);
      if (svFallback) return svFallback.hex;
    }
  }

  // 4. Relax background using declared fallback chain — try current visionMode then 'default'
  for (const bg of registry.backgroundFallbacks[bgClass] ?? []) {
    const bKey = `${token}__${fontSize}__${bg}__root__${visionMode}`;
    const bFallback = registry.variantMap.get(bKey as Parameters<typeof registry.variantMap.get>[0]);
    if (bFallback) return bFallback.hex;

    if (visionMode !== 'default') {
      const bvKey = `${token}__${fontSize}__${bg}__root__default`;
      const bvFallback = registry.variantMap.get(bvKey as Parameters<typeof registry.variantMap.get>[0]);
      if (bvFallback) return bvFallback.hex;
    }
  }

  // 5. Default
  return registry.defaults[token] ?? '';
}

export function resolveAllTokens(
  context: DesignContext,
  registry: TokenRegistry,
): Record<string, string> {
  // Collect all distinct token names from the variantMap keys
  const tokenNames = new Set<string>();
  for (const key of registry.variantMap.keys()) {
    // Key format: ${token}__${fontSize}__${bg}__${stack}__${vision}
    const parts = key.split('__');
    if (parts[0]) tokenNames.add(parts[0]);
  }

  const result: Record<string, string> = {};
  for (const tokenName of tokenNames) {
    result[tokenName] = resolveToken(tokenName, context, registry);
  }
  return result;
}
