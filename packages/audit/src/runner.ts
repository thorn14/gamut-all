import type { TokenRegistry, ComplianceEngine } from '@gamut-all/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export type IssueType =
  | 'non-compliant-variant'   // registry variant fails compliance
  | 'unknown-theme'           // data-theme value not in registry
  | 'missing-data-theme'      // element has no data-theme in ancestor chain
  | 'unknown-surface'         // data-bg value not in registry surfaces
  | 'missing-data-stack'      // token usage detected without data-stack (warning)
  | 'unknown-token-var';      // CSS var references a token not in registry

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

  for (const [key, variant] of registry.variantMap) {
    const parts = key.split('__');
    const fontSizeStr = parts[1] ?? '16px';
    const bgName = parts[2] ?? '';
    const bg = registry.themes.get(bgName);

    if (!bg) continue;

    const fontSizePx = parseInt(fontSizeStr, 10);
    const context = { fontSizePx, fontWeight: 400, target: 'text' as const, level };
    const evaluation = engine.evaluate(variant.hex, bg.hex, context);

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
          bgHex: bg.hex,
          value: evaluation.value,
          required: evaluation.required ?? 0,
          engine: engine.id,
        },
      });
    }
  }

  return {
    issues,
    variantsChecked: registry.variantMap.size,
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
  }

  return {
    issues,
    variantsChecked: 0,
    elementsChecked,
    passCount: elementsChecked - issues.filter(i => i.severity === 'error').length,
    failCount: issues.filter(i => i.severity === 'error').length,
  };
}
