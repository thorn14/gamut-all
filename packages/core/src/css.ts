import type { TokenRegistry, VisionMode, StackClass } from './types.js';
import { resolveToken } from './resolver.js';
import { ALL_FONT_SIZES } from './types.js';

// ── Token name → CSS var name ────────────────────────────────────────────────

/**
 * Convert a camelCase token name (possibly with interaction suffix) to a CSS custom property.
 * - fgPrimary → --fg-primary
 * - fgLink-hover → --fg-link-hover
 */
export function tokenToCssVar(tokenName: string): string {
  // Handle interaction suffix (e.g. fgLink-hover)
  const dashIdx = tokenName.indexOf('-');
  if (dashIdx !== -1) {
    const base = tokenName.slice(0, dashIdx);
    const suffix = tokenName.slice(dashIdx); // includes the '-'
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

  // Determine defaultBg from registry
  // The registry doesn't store defaultBg directly, so infer from first background key
  const defaultBg = Array.from(registry.backgrounds.keys())[0] ?? '';

  // Use a representative fontSize for CSS generation (16px — font-size aware dims require JS)
  // CSS vars emit bg/stack/vision dimensions only; fontSize requires resolveToken in JS
  const repFontSize = '16px' as const;

  const lines: string[] = [];
  lines.push('/* NOTE: CSS vars cover bg/stack/vision dimensions only.');
  lines.push('   fontSize-aware resolution requires resolveToken() in JavaScript. */');
  lines.push('');

  // ── :root block ─────────────────────────────────────────────────────────────
  const rootVars: string[] = [];

  // Token vars for defaultBg
  for (const tokenName of tokenNames) {
    const hex = resolveToken(tokenName, {
      fontSize: repFontSize,
      bgClass: defaultBg,
      stackDepth: 'root',
      visionMode: 'default',
    }, registry);
    rootVars.push(`  ${tokenToCssVar(tokenName)}: ${hex};`);
  }

  rootVars.push('');

  // --bg-* vars
  for (const [bgName, bg] of registry.backgrounds) {
    rootVars.push(`  --bg-${bgName}: ${bg.hex};`);
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

  // ── [data-bg="X"] blocks ─────────────────────────────────────────────────────
  const rootTokenValues = new Map<string, string>();
  for (const tokenName of tokenNames) {
    rootTokenValues.set(tokenName, resolveToken(tokenName, {
      fontSize: repFontSize,
      bgClass: defaultBg,
      stackDepth: 'root',
      visionMode: 'default',
    }, registry));
  }

  for (const [bgName] of registry.backgrounds) {
    if (bgName === defaultBg) continue;

    const bgVars: string[] = [];
    for (const tokenName of tokenNames) {
      const hex = resolveToken(tokenName, {
        fontSize: repFontSize,
        bgClass: bgName,
        stackDepth: 'root',
        visionMode: 'default',
      }, registry);
      const rootHex = rootTokenValues.get(tokenName);
      if (hex !== rootHex) {
        bgVars.push(`  ${tokenToCssVar(tokenName)}: ${hex};`);
      }
    }

    if (bgVars.length > 0) {
      lines.push(`[data-bg="${bgName}"] {`);
      lines.push(...bgVars);
      lines.push('}');
      lines.push('');
    }
  }

  // ── [data-stack="X"][data-bg="Y"] blocks ─────────────────────────────────────
  // Collect all non-root stacks that have registry entries
  const stacks: StackClass[] = ['card', 'popover', 'tooltip', 'modal', 'overlay'];
  for (const stack of stacks) {
    for (const [bgName] of registry.backgrounds) {
      // Check if any token differs from [data-bg] value
      const stackVars: string[] = [];
      for (const tokenName of tokenNames) {
        const stackHex = resolveToken(tokenName, {
          fontSize: repFontSize,
          bgClass: bgName,
          stackDepth: stack,
          visionMode: 'default',
        }, registry);

        // Compare against [data-bg="bgName"] (or :root if defaultBg)
        const bgHex = resolveToken(tokenName, {
          fontSize: repFontSize,
          bgClass: bgName,
          stackDepth: 'root',
          visionMode: 'default',
        }, registry);

        if (stackHex !== bgHex) {
          stackVars.push(`  ${tokenToCssVar(tokenName)}: ${stackHex};`);
        }
      }

      if (stackVars.length > 0) {
        lines.push(`[data-stack="${stack}"][data-bg="${bgName}"] {`);
        lines.push(...stackVars);
        lines.push('}');
        lines.push('');
      }
    }
  }

  // ── Vision mode blocks ────────────────────────────────────────────────────────
  const visionModes: VisionMode[] = ['deuteranopia', 'protanopia', 'tritanopia', 'achromatopsia'];

  for (const visionMode of visionModes) {
    // Check if this vision mode has any entries in the registry
    const hasVision = Array.from(registry.variantMap.keys()).some(k => k.endsWith(`__${visionMode}`));
    if (!hasVision) continue;

    // [data-vision="X"] { ... } — overrides for defaultBg context
    const visionRootVars: string[] = [];
    for (const tokenName of tokenNames) {
      const visionHex = resolveToken(tokenName, {
        fontSize: repFontSize,
        bgClass: defaultBg,
        stackDepth: 'root',
        visionMode,
      }, registry);
      const defaultHex = rootTokenValues.get(tokenName);
      if (visionHex !== defaultHex) {
        visionRootVars.push(`  ${tokenToCssVar(tokenName)}: ${visionHex};`);
      }
    }
    if (visionRootVars.length > 0) {
      lines.push(`[data-vision="${visionMode}"] {`);
      lines.push(...visionRootVars);
      lines.push('}');
      lines.push('');
    }

    // [data-vision="X"] [data-bg="Y"] { ... } — DESCENDANT combinator
    for (const [bgName] of registry.backgrounds) {
      const visionBgVars: string[] = [];

      // Compare against default-vision same-bg values
      for (const tokenName of tokenNames) {
        const visionBgHex = resolveToken(tokenName, {
          fontSize: repFontSize,
          bgClass: bgName,
          stackDepth: 'root',
          visionMode,
        }, registry);

        // The reference value is what [data-bg="bgName"] shows (default vision)
        const defaultBgHex = resolveToken(tokenName, {
          fontSize: repFontSize,
          bgClass: bgName,
          stackDepth: 'root',
          visionMode: 'default',
        }, registry);

        if (visionBgHex !== defaultBgHex) {
          visionBgVars.push(`  ${tokenToCssVar(tokenName)}: ${visionBgHex};`);
        }
      }

      if (visionBgVars.length > 0) {
        // DESCENDANT combinator (space) — vision on ancestor, bg on child
        lines.push(`[data-vision="${visionMode}"] [data-bg="${bgName}"] {`);
        lines.push(...visionBgVars);
        lines.push('}');
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}
