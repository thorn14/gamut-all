import type { TokenRegistry } from '@gamut-all/core';

export interface GenerateTailwindConfigOptions {
  /**
   * Theme to use when resolving interaction token names.
   * Defaults to the first theme in the registry.
   */
  theme?: string;
  /**
   * Compliance level. Informational only — the returned CSS vars are
   * runtime-resolved, so the actual colors depend on the loaded stylesheet.
   * Defaults to 'AA'.
   */
  level?: 'AA' | 'AAA';
}

/**
 * Generates a Tailwind CSS theme extension object from a token registry.
 *
 * Each token maps to `var(--token-name)` so Tailwind utilities like
 * `text-fg-primary` or `bg-bg-main` resolve at runtime via CSS custom
 * properties — they automatically follow theme/stack/contrast changes.
 *
 * Usage in tailwind.config.ts:
 * ```ts
 * import { generateTailwindConfig } from '@gamut-all/tailwind';
 * import { registry } from './src/generated/tokens';
 *
 * export default {
 *   theme: {
 *     extend: {
 *       colors: generateTailwindConfig(registry),
 *     },
 *   },
 * };
 * ```
 *
 * Returns an object like:
 * ```ts
 * {
 *   'fg-primary': 'var(--fg-primary)',
 *   'fg-primary-hover': 'var(--fg-primary-hover)',
 *   'bg-main': 'var(--bg-main)',
 *   ...
 * }
 * ```
 */
export function generateTailwindConfig(
  registry: TokenRegistry,
  _options?: GenerateTailwindConfigOptions,
): Record<string, string> {
  const result: Record<string, string> = {};

  // Base tokens from registry defaults
  for (const tokenName of Object.keys(registry.defaults)) {
    const cssVar = tokenToCssVar(tokenName);
    result[camelToKebab(tokenName)] = `var(${cssVar})`;
  }

  // Interaction state tokens (e.g. fgPrimary-hover)
  for (const key of registry.variantMap.keys()) {
    const parts = key.split('__');
    const tokenName = parts[0];
    if (!tokenName || !tokenName.includes('-')) continue; // Only interaction tokens have a '-'
    const cssVar = tokenToCssVar(tokenName);
    const kebabName = tokenToCssVar(tokenName).replace(/^--/, '');
    result[kebabName] = `var(${cssVar})`;
  }

  // Surface tokens from registry surfaces
  for (const [surfaceName] of registry.surfaces) {
    const cssVar = tokenToCssVar(surfaceName);
    result[camelToKebab(surfaceName)] = `var(${cssVar})`;
  }

  // bg-* vars for themes
  for (const [themeName] of registry.themes) {
    result[`bg-${themeName}`] = `var(--bg-${themeName})`;
  }

  return result;
}

function camelToKebab(str: string): string {
  const dashIdx = str.indexOf('-');
  if (dashIdx !== -1) {
    const base = str.slice(0, dashIdx);
    const suffix = str.slice(dashIdx);
    return `${camelToKebabSimple(base)}${suffix}`;
  }
  return camelToKebabSimple(str);
}

function camelToKebabSimple(str: string): string {
  return str.replace(/([A-Z])/g, (char) => `-${char.toLowerCase()}`);
}

function tokenToCssVar(tokenName: string): string {
  const dashIdx = tokenName.indexOf('-');
  if (dashIdx !== -1) {
    const base = tokenName.slice(0, dashIdx);
    const suffix = tokenName.slice(dashIdx);
    return `--${camelToKebabSimple(base)}${suffix}`;
  }
  return `--${camelToKebabSimple(tokenName)}`;
}
