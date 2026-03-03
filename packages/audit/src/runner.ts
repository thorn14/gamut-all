import type { TokenRegistry, ComplianceEngine } from '@gamut-all/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export type IssueType =
  | 'non-compliant-variant'       // registry variant fails compliance
  | 'non-compliant-surface-token' // .bg-{name} utility class token fails compliance on its surface
  | 'unknown-theme'               // data-theme value not in registry
  | 'missing-data-theme'          // element has no data-theme in ancestor chain
  | 'unknown-surface'             // data-bg value not in registry surfaces
  | 'missing-data-stack'          // token usage detected without data-stack (warning)
  | 'unknown-token-var';          // CSS var references a token not in registry

export type IssueSeverity = 'error' | 'warning';

export interface AuditIssue {
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  detail?: Record<string, string | number | boolean>;
}

export interface AuditResult {
  issues: AuditIssue[];
  /** Total registry variants checked (for auditRegistry) */
  variantsChecked: number;
  /** Elements checked (for auditDOM) */
  elementsChecked: number;
  passCount: number;
  failCount: number;
}

type ComplianceTarget = 'text' | 'ui-component' | 'decorative';

const EPSILON = 1e-6;

function parseVariantKey(key: string): {
  token: string;
  fontSizePx: number;
  bgName: string;
  stack: string;
  vision: string;
} | null {
  const parts = key.split('__');
  if (parts.length !== 5) return null;
  const [token, fontSize, bgName, stack, vision] = parts;
  if (!token || !fontSize || !bgName || !stack || !vision) return null;
  const fontSizePx = parseInt(fontSize, 10);
  if (!Number.isFinite(fontSizePx)) return null;
  return { token, fontSizePx, bgName, stack, vision };
}

function inferTokenTargets(
  registry: TokenRegistry,
  engine: ComplianceEngine,
): Map<string, ComplianceTarget> {
  const votes = new Map<string, { text: number; ui: number; decorative: number }>();
  const registryLevel = registry.meta.wcagTarget;

  for (const [key, variant] of registry.variantMap) {
    const parsed = parseVariantKey(key);
    if (!parsed || parsed.vision !== 'default') continue;
    const theme = registry.themes.get(parsed.bgName);
    const surface = theme?.surfaces.get(parsed.stack);
    if (!surface) continue;

    if (!votes.has(parsed.token)) {
      votes.set(parsed.token, { text: 0, ui: 0, decorative: 0 });
    }
    const vote = votes.get(parsed.token)!;

    if (variant.compliance.required === undefined) {
      vote.decorative++;
      continue;
    }

    const textEval = engine.evaluate(variant.hex, surface.hex, {
      fontSizePx: parsed.fontSizePx,
      fontWeight: 400,
      target: 'text',
      level: registryLevel,
    });
    const uiEval = engine.evaluate(variant.hex, surface.hex, {
      fontSizePx: parsed.fontSizePx,
      fontWeight: 400,
      target: 'ui-component',
      level: registryLevel,
    });

    const textMatches = textEval.required !== undefined &&
      Math.abs(textEval.required - variant.compliance.required) < EPSILON;
    const uiMatches = uiEval.required !== undefined &&
      Math.abs(uiEval.required - variant.compliance.required) < EPSILON;

    if (textMatches && !uiMatches) vote.text++;
    if (uiMatches && !textMatches) vote.ui++;
  }

  const targets = new Map<string, ComplianceTarget>();
  for (const token of Object.keys(registry.defaults)) {
    const vote = votes.get(token);
    if (!vote) {
      targets.set(token, /^border|outline|ring|stroke/i.test(token) ? 'ui-component' : 'text');
      continue;
    }
    if (vote.decorative > vote.text && vote.decorative > vote.ui) {
      targets.set(token, 'decorative');
      continue;
    }
    if (vote.ui > vote.text) {
      targets.set(token, 'ui-component');
      continue;
    }
    targets.set(token, 'text');
  }
  return targets;
}

// ── auditRegistry ─────────────────────────────────────────────────────────────

/**
 * Validates every variant in the registry passes the given compliance engine.
 * This catches manually-overridden non-compliant steps that slipped through
 * the build-time check.
 */
export function auditRegistry(
  registry: TokenRegistry,
  engine: ComplianceEngine,
  level: 'AA' | 'AAA' = 'AA',
): AuditResult {
  const issues: AuditIssue[] = [];
  let passCount = 0;
  let failCount = 0;
  const tokenTargets = inferTokenTargets(registry, engine);

  for (const [key, variant] of registry.variantMap) {
    const parsed = parseVariantKey(key);
    if (!parsed) continue;
    const theme = registry.themes.get(parsed.bgName);
    const surface = theme?.surfaces.get(parsed.stack);
    if (!surface) continue;
    const target = tokenTargets.get(parsed.token) ?? 'text';
    const evaluation = engine.evaluate(variant.hex, surface.hex, {
      fontSizePx: parsed.fontSizePx,
      fontWeight: 400,
      target,
      level,
    });

    if (evaluation.pass) {
      passCount++;
    } else {
      failCount++;
      issues.push({
        type: 'non-compliant-variant',
        severity: 'error',
        message: `Non-compliant: ${key} — ${engine.id} value ${evaluation.value.toFixed(2)} < required ${evaluation.required ?? '?'}`,
        detail: {
          key,
          hex: variant.hex,
          bgHex: surface.hex,
          value: evaluation.value,
          required: evaluation.required ?? 0,
          engine: engine.id,
        },
      });
    }
  }

  // ── Surface utility class token compliance ──────────────────────────────
  // For each surface, verify every resolved token in surfaceTokens (and
  // themeSurfaceTokens) actually passes compliance against its surface hex.
  // This catches regressions where findClosestPassingStep returned null or
  // landed on a step that doesn't meet the threshold at 12px.
  for (const [surfaceName, surface] of registry.surfaces) {
    const checks: Array<{ tokenName: string; hex: string; bgHex: string; context: string }> = [];

    for (const [tokenName, hex] of surface.surfaceTokens) {
      checks.push({ tokenName, hex, bgHex: surface.hex, context: surfaceName });
    }
    for (const [themeName, { bgHex, tokens }] of surface.themeSurfaceTokens) {
      for (const [tokenName, hex] of tokens) {
        checks.push({ tokenName, hex, bgHex, context: `${surfaceName}[${themeName}]` });
      }
    }

    for (const { tokenName, hex, bgHex, context } of checks) {
      const target = tokenTargets.get(tokenName) ?? 'text';
      const evaluation = engine.evaluate(hex, bgHex, {
        fontSizePx: 12,
        fontWeight: 400,
        target,
        level,
      });
      if (evaluation.pass) {
        passCount++;
      } else {
        failCount++;
        issues.push({
          type: 'non-compliant-surface-token',
          severity: 'error',
          message: `Non-compliant surface token: ${tokenName} on .bg-${context} — ${engine.id} value ${evaluation.value.toFixed(2)} < required ${evaluation.required ?? '?'}`,
          detail: {
            surfaceName,
            tokenName,
            hex,
            bgHex,
            value: evaluation.value,
            required: evaluation.required ?? 0,
            engine: engine.id,
          },
        });
      }
    }
  }

  return {
    issues,
    variantsChecked: registry.variantMap.size + Array.from(registry.surfaces.values())
      .reduce((n, s) => n + s.surfaceTokens.size +
        Array.from(s.themeSurfaceTokens.values()).reduce((m, { tokens }) => m + tokens.size, 0), 0),
    elementsChecked: 0,
    passCount,
    failCount,
  };
}

// ── auditDOM ──────────────────────────────────────────────────────────────────

const TOKEN_VAR_RE = /var\(--([a-z][a-z0-9-]*)\)/gi;

/**
 * Inspects a DOM subtree for context-tagging issues:
 * - Elements with unrecognised data-theme values
 * - Elements with unrecognised data-bg (surface) values
 * - Elements referencing token CSS vars without a data-theme ancestor
 * - Elements using CSS vars that don't exist in the registry
 */
export function auditDOM(
  root: Element,
  registry: TokenRegistry,
): AuditResult {
  const issues: AuditIssue[] = [];
  const allElements = Array.from(root.querySelectorAll('*'));
  let elementsChecked = 0;

  const knownThemes = new Set(registry.themes.keys());
  const knownSurfaces = new Set(registry.surfaces.keys());
  // Build set of all token names (including interaction variants like fgLink-hover)
  const knownTokenVars = new Set<string>();
  for (const tokenName of Object.keys(registry.defaults)) {
    // Convert camelCase to kebab-case for CSS var lookup
    const varName = tokenName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
    knownTokenVars.add(varName);
  }

  for (const el of allElements) {
    elementsChecked++;

    // ── data-theme validation ──────────────────────────────────────────────
    const dataTheme = el.getAttribute('data-theme');
    if (dataTheme !== null) {
      if (!knownThemes.has(dataTheme)) {
        issues.push({
          type: 'unknown-theme',
          severity: 'error',
          message: `Unknown data-theme="${dataTheme}" — not declared in registry themes`,
          detail: { dataTheme, tag: el.tagName.toLowerCase() },
        });
      }
    }

    // ── data-bg (surface) validation ───────────────────────────────────────
    const dataBg = el.getAttribute('data-bg');
    if (dataBg !== null && knownSurfaces.size > 0) {
      if (!knownSurfaces.has(dataBg)) {
        issues.push({
          type: 'unknown-surface',
          severity: 'error',
          message: `Unknown data-bg="${dataBg}" — not declared in registry surfaces`,
          detail: { dataBg, tag: el.tagName.toLowerCase() },
        });
      }
    }

    // ── inline style CSS var usage ─────────────────────────────────────────
    const style = el.getAttribute('style') ?? '';
    const matches = [...style.matchAll(TOKEN_VAR_RE)];
    if (matches.length === 0) continue;

    // Check ancestor chain for data-theme
    let hasThemeAncestor = !!dataTheme;
    if (!hasThemeAncestor) {
      let ancestor: Element | null = el.parentElement;
      while (ancestor) {
        if (ancestor.getAttribute('data-theme')) { hasThemeAncestor = true; break; }
        ancestor = ancestor.parentElement;
      }
    }

    for (const match of matches) {
      const varName = match[1] ?? '';
      const tokenKey = varName;

      if (!hasThemeAncestor) {
        issues.push({
          type: 'missing-data-theme',
          severity: 'warning',
          message: `Element uses var(--${varName}) but has no data-theme in ancestor chain`,
          detail: { varName, tag: el.tagName.toLowerCase() },
        });
      }

      if (!knownTokenVars.has(tokenKey)) {
        issues.push({
          type: 'unknown-token-var',
          severity: 'warning',
          message: `var(--${varName}) references a token not found in registry`,
          detail: { varName, tag: el.tagName.toLowerCase() },
        });
      }
    }

    // Check ancestor chain for data-stack only when token CSS vars are used.
    let hasStackAncestor = el.hasAttribute('data-stack');
    if (!hasStackAncestor) {
      let ancestor: Element | null = el.parentElement;
      while (ancestor) {
        if (ancestor.hasAttribute('data-stack')) { hasStackAncestor = true; break; }
        ancestor = ancestor.parentElement;
      }
    }
    if (!hasStackAncestor) {
      issues.push({
        type: 'missing-data-stack',
        severity: 'warning',
        message: 'Element uses token CSS vars but has no data-stack in ancestor chain (root assumed)',
        detail: { tag: el.tagName.toLowerCase() },
      });
    }
  }

  return {
    issues,
    variantsChecked: 0,
    elementsChecked,
    passCount: elementsChecked - issues.filter(i => i.severity === 'error').length,
    failCount: issues.filter(i => i.severity === 'error').length,
  };
}
