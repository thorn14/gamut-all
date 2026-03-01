import type { TokenRegistry, VisionMode } from './types.js';
import { resolveToken } from './resolver.js';

// ── Token name → CSS var name ────────────────────────────────────────────────

/**
 * Convert a camelCase token name (possibly with interaction suffix) to a CSS custom property.
 * - fgPrimary → --fg-primary
 * - fgLink-hover → --fg-link-hover
 */
export function tokenToCssVar(tokenName: string): string {
  const dashIdx = tokenName.indexOf('-');
  if (dashIdx !== -1) {
    const base = tokenName.slice(0, dashIdx);
    const suffix = tokenName.slice(dashIdx);
    return `--${camelToKebab(base)}${suffix}`;
  }
  return `--${camelToKebab(tokenName)}`;
}

function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, (char) => `-${char.toLowerCase()}`);
}

// ── generateCSS ──────────────────────────────────────────────────────────────

export function generateCSS(registry: TokenRegistry): string {
  // Collect all distinct token names
  const tokenNames = new Set<string>();
  for (const key of registry.variantMap.keys()) {
    const parts = key.split('__');
    if (parts[0]) tokenNames.add(parts[0]);
  }

  // Determine defaultTheme from registry
  const defaultTheme = Array.from(registry.themes.keys())[0] ?? '';

  // Collect all stack names present in the registry (from theme surfaces)
  const stackNames = new Set<string>();
  for (const theme of registry.themes.values()) {
    for (const stack of theme.surfaces.keys()) {
      stackNames.add(stack);
    }
  }
  const nonRootStacks = Array.from(stackNames).filter(s => s !== 'root');

  // Use a representative fontSize for CSS generation
  const repFontSize = '16px' as const;

  const lines: string[] = [];
  lines.push('/* NOTE: CSS vars cover theme/stack/vision dimensions only.');
  lines.push('   fontSize-aware resolution requires resolveToken() in JavaScript. */');
  lines.push('');

  // ── Helper: resolve all tokens for a given context ────────────────────────
  function resolveAll(bgName: string, stack: string, vision: VisionMode): Map<string, string> {
    const out = new Map<string, string>();
    for (const tokenName of tokenNames) {
      out.set(tokenName, resolveToken(tokenName, {
        fontSize: repFontSize,
        bgClass: bgName,
        stackDepth: stack,
        visionMode: vision,
      }, registry));
    }
    return out;
  }

  // ── :root block ────────────────────────────────────────────────────────────
  const rootValues = resolveAll(defaultTheme, 'root', 'default');
  const rootVars: string[] = [];

  for (const [tokenName, hex] of rootValues) {
    rootVars.push(`  ${tokenToCssVar(tokenName)}: ${hex};`);
  }
  rootVars.push('');

  // --bg-surface for root stack of default theme
  const defaultThemeData = registry.themes.get(defaultTheme);
  const rootSurface = defaultThemeData?.surfaces.get('root');
  rootVars.push(`  --bg-surface: ${rootSurface ? `var(--${defaultThemeData!.ramp}-${rootSurface.step})` : `var(--bg-${defaultTheme})`};`);
  rootVars.push('');

  // --bg-* vars for themes
  for (const [themeName, theme] of registry.themes) {
    rootVars.push(`  --bg-${themeName}: ${theme.hex};`);
  }
  rootVars.push('');

  // --{ramp}-{step} vars
  for (const [rampName, ramp] of registry.ramps) {
    for (const step of ramp.steps) {
      rootVars.push(`  --${rampName}-${step.index}: ${step.hex};`);
    }
  }

  lines.push(':root {');
  lines.push(...rootVars);
  lines.push('}');
  lines.push('');

  // ── [data-theme="X"] blocks — non-default themes, root stack ──────────────
  for (const [themeName, theme] of registry.themes) {
    if (themeName === defaultTheme) continue;

    const bgValues = resolveAll(themeName, 'root', 'default');
    const bgVars: string[] = [];

    for (const [tokenName, hex] of bgValues) {
      if (hex !== rootValues.get(tokenName)) {
        bgVars.push(`  ${tokenToCssVar(tokenName)}: ${hex};`);
      }
    }

    // --bg-surface for this theme at root stack
    const themeRootSurface = theme.surfaces.get('root');
    bgVars.push(`  --bg-surface: ${themeRootSurface ? `var(--${theme.ramp}-${themeRootSurface.step})` : `var(--bg-${themeName})`};`);

    lines.push(`[data-theme="${themeName}"] {`);
    lines.push(...bgVars);
    lines.push('}');
    lines.push('');
  }

  // ── [data-theme="X"] [data-stack="Y"] blocks — DESCENDANT combinator ──────
  // Uses a space (descendant) so data-theme on an ancestor and data-stack on any child both match.
  for (const [themeName, theme] of registry.themes) {
    const rootStackValues = resolveAll(themeName, 'root', 'default');

    for (const stack of nonRootStacks) {
      const stackValues = resolveAll(themeName, stack, 'default');
      const stackVars: string[] = [];

      for (const [tokenName, hex] of stackValues) {
        if (hex !== rootStackValues.get(tokenName)) {
          stackVars.push(`  ${tokenToCssVar(tokenName)}: ${hex};`);
        }
      }

      // --bg-surface always emitted so components can use background: var(--bg-surface)
      const surface = theme.surfaces.get(stack);
      if (surface) {
        stackVars.push(`  --bg-surface: var(--${theme.ramp}-${surface.step});`);
      }

      if (stackVars.length > 0) {
        lines.push(`[data-theme="${themeName}"] [data-stack="${stack}"] {`);
        lines.push(...stackVars);
        lines.push('}');
        lines.push('');
      }
    }
  }

  // ── Vision mode blocks ─────────────────────────────────────────────────────
  const visionModes: VisionMode[] = ['deuteranopia', 'protanopia', 'tritanopia', 'achromatopsia'];

  for (const visionMode of visionModes) {
    const hasVision = Array.from(registry.variantMap.keys()).some(k => k.endsWith(`__${visionMode}`));
    if (!hasVision) continue;

    // [data-vision="X"] — overrides for defaultTheme, root stack
    const visionRootValues = resolveAll(defaultTheme, 'root', visionMode);
    const visionRootVars: string[] = [];
    for (const [tokenName, hex] of visionRootValues) {
      if (hex !== rootValues.get(tokenName)) {
        visionRootVars.push(`  ${tokenToCssVar(tokenName)}: ${hex};`);
      }
    }
    if (visionRootVars.length > 0) {
      lines.push(`[data-vision="${visionMode}"] {`);
      lines.push(...visionRootVars);
      lines.push('}');
      lines.push('');
    }

    // [data-vision="X"] [data-theme="Y"] — DESCENDANT combinator
    for (const [themeName] of registry.themes) {
      const visionBgValues = resolveAll(themeName, 'root', visionMode);
      const defaultBgValues = resolveAll(themeName, 'root', 'default');
      const visionBgVars: string[] = [];

      for (const [tokenName, hex] of visionBgValues) {
        if (hex !== defaultBgValues.get(tokenName)) {
          visionBgVars.push(`  ${tokenToCssVar(tokenName)}: ${hex};`);
        }
      }

      if (visionBgVars.length > 0) {
        lines.push(`[data-vision="${visionMode}"] [data-theme="${themeName}"] {`);
        lines.push(...visionBgVars);
        lines.push('}');
        lines.push('');
      }

      // [data-vision="X"] [data-theme="Y"] [data-stack="Z"] — vision overrides on elevated stack elements.
      // Required because [data-theme] [data-stack] sets vars directly on the data-stack element, which
      // shadows inherited vars from the data-theme element — vision overrides must target the same element.
      for (const stack of nonRootStacks) {
        const visionStackValues = resolveAll(themeName, stack, visionMode);
        const defaultStackValues = resolveAll(themeName, stack, 'default');
        const visionStackVars: string[] = [];

        for (const [tokenName, hex] of visionStackValues) {
          if (hex !== defaultStackValues.get(tokenName)) {
            visionStackVars.push(`  ${tokenToCssVar(tokenName)}: ${hex};`);
          }
        }

        if (visionStackVars.length > 0) {
          lines.push(`[data-vision="${visionMode}"] [data-theme="${themeName}"] [data-stack="${stack}"] {`);
          lines.push(...visionStackVars);
          lines.push('}');
          lines.push('');
        }
      }
    }
  }

  return lines.join('\n');
}
