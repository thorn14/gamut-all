import type { TokenRegistry, VisionMode } from './types.js';
import { resolveToken } from './resolver.js';
import { tokenToCssVar } from './css.js';

/**
 * Generates a contrast-override stylesheet by diffing two registries (typically
 * AA vs. AAA). Only tokens that differ between the two registries are emitted.
 *
 * Output contains two equivalent selector forms so consumers can use either:
 *   1. `@media (prefers-contrast: more)` — standard CSS media query
 *   2. `[data-contrast="more"]` — attribute-based (controlled via TokenProvider)
 *
 * Example output:
 *   @media (prefers-contrast: more) {
 *     :root { --fg-primary: #000; }
 *     [data-theme="dark"] { --fg-primary: #fff; }
 *   }
 *   [data-contrast="more"] :root { --fg-primary: #000; }
 *   [data-contrast="more"] [data-theme="dark"] { --fg-primary: #fff; }
 */
export function buildContrastOverridesCSS(
  baseRegistry: TokenRegistry,
  contrastRegistry: TokenRegistry,
): string {
  // Collect all token names
  const tokenNames = new Set<string>();
  for (const key of contrastRegistry.variantMap.keys()) {
    const parts = key.split('__');
    if (parts[0]) tokenNames.add(parts[0]);
  }

  const defaultTheme = Array.from(contrastRegistry.themes.keys())[0] ?? '';
  const repFontSize = '14px' as const; // Use 14px to capture small-text threshold differences

  // Collect all stacks
  const stackNames = new Set<string>();
  for (const theme of contrastRegistry.themes.values()) {
    for (const stack of theme.surfaces.keys()) {
      stackNames.add(stack);
    }
  }

  type SelectorBlock = { selector: string; vars: string[] };
  const blocks: SelectorBlock[] = [];

  function buildSelector(themeName: string, stack: string): string {
    const isDefaultTheme = themeName === defaultTheme;
    const isRoot = stack === 'root';
    if (isDefaultTheme && isRoot) return ':root';
    const themePart = isDefaultTheme ? '' : `[data-theme="${themeName}"]`;
    const stackPart = isRoot ? '' : `[data-stack="${stack}"]`;
    return [themePart, stackPart].filter(Boolean).join(' ');
  }

  const visionMode: VisionMode = 'default';

  for (const [themeName] of contrastRegistry.themes) {
    for (const stack of stackNames) {
      const vars: string[] = [];

      for (const tokenName of tokenNames) {
        const ctx = { fontSize: repFontSize, bgClass: themeName, stackDepth: stack, visionMode };
        const baseHex = resolveToken(tokenName, ctx, baseRegistry);
        const newHex = resolveToken(tokenName, ctx, contrastRegistry);
        if (newHex !== baseHex && newHex !== '') {
          vars.push(`  ${tokenToCssVar(tokenName)}: ${newHex};`);
        }
      }

      if (vars.length > 0) {
        blocks.push({ selector: buildSelector(themeName, stack), vars });
      }
    }
  }

  if (blocks.length === 0) return '';

  const lines: string[] = [];

  // @media (prefers-contrast: more) block
  lines.push('@media (prefers-contrast: more) {');
  for (const { selector, vars } of blocks) {
    lines.push(`  ${selector} {`);
    for (const v of vars) lines.push(`  ${v}`);
    lines.push('  }');
  }
  lines.push('}');
  lines.push('');

  // [data-contrast="more"] attribute selector block
  for (const { selector, vars } of blocks) {
    lines.push(`[data-contrast="more"] ${selector} {`);
    for (const v of vars) lines.push(v);
    lines.push('}');
  }

  return lines.join('\n');
}
