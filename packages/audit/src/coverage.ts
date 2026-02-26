import type { TokenRegistry, ComplianceEngine } from '@gamut-all/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StepResult {
  step: number;
  hex: string;
  passes: boolean;
  /** Raw contrast value (ratio or Lc) */
  value: number;
  /** Required threshold at this level */
  threshold: number;
}

export interface SurfaceCoverage {
  bg: string;
  stack: string;
  /** Actual hex of the surface at this elevation */
  surfaceHex: string;
  steps: StepResult[];
  /** Indices of all passing steps */
  passingSteps: number[];
  /** Human-readable contiguous range string, e.g. "5–9" or "0–2, 7–9" */
  passingRanges: string;
  /** Step the registry placed for this token × surface (post-auto-adjustment) */
  configuredStep: number | null;
  configuredStepPasses: boolean | null;
}

export interface TokenCoverage {
  token: string;
  rampName: string;
  rampStepCount: number;
  surfaces: SurfaceCoverage[];
}

export interface CoverageReport {
  tokens: TokenCoverage[];
  meta: {
    engine: string;
    level: 'AA' | 'AAA';
    fontSize: string;
    generatedAt: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toRangeString(steps: number[]): string {
  if (steps.length === 0) return '—';
  const ranges: string[] = [];
  let start = steps[0]!;
  let end = steps[0]!;
  for (let i = 1; i < steps.length; i++) {
    if (steps[i] === end + 1) {
      end = steps[i]!;
    } else {
      ranges.push(start === end ? `${start}` : `${start}–${end}`);
      start = steps[i]!;
      end = steps[i]!;
    }
  }
  ranges.push(start === end ? `${start}` : `${start}–${end}`);
  return ranges.join(', ');
}

function pad(s: string, n: number): string {
  return s.padEnd(n);
}

// ── auditCoverage ─────────────────────────────────────────────────────────────

/**
 * For each token × background × stack surface, evaluate every ramp step and
 * report the passing range. Helps designers understand:
 *   - what steps are available on a given surface
 *   - where the configured step sits relative to the allowed range
 *   - which surfaces have no passing steps (mid-tone traps)
 *
 * Uses the registry's own `ramps` and `backgrounds` — no re-parsing needed.
 */
export function auditCoverage(
  registry: TokenRegistry,
  compliance: ComplianceEngine,
  level: 'AA' | 'AAA' = 'AA',
  opts: { fontSizePx?: number } = {},
): CoverageReport {
  const fontSizePx = opts.fontSizePx ?? 16;
  const fontSizeKey = `${fontSizePx}px`;
  const ctx = { fontSizePx, fontWeight: 400, target: 'text' as const, level };

  // Build token → ramp name map from the variant entries at the chosen font size
  const tokenRamps = new Map<string, string>();
  for (const [key, variant] of registry.variantMap) {
    const parts = key.split('__');
    if (parts.length !== 5) continue;
    const [token, fontSize, , , vision] = parts as [string, string, string, string, string];
    if (fontSize === fontSizeKey && vision === 'default' && !tokenRamps.has(token)) {
      tokenRamps.set(token, variant.ramp);
    }
  }

  const tokens: TokenCoverage[] = [];

  for (const [token, rampName] of tokenRamps) {
    const ramp = registry.ramps.get(rampName);
    if (!ramp) continue;

    const surfaces: SurfaceCoverage[] = [];

    for (const [bgName, bg] of registry.backgrounds) {
      for (const [stack, surface] of bg.surfaces) {
        // Evaluate every step in the ramp against this surface
        const steps: StepResult[] = ramp.steps.map(s => {
          const result = compliance.evaluate(s.hex, surface.hex, ctx);
          return {
            step: s.index,
            hex: s.hex,
            passes: result.pass,
            value: result.value,
            threshold: result.required ?? 0,
          };
        });

        const passingSteps = steps.filter(s => s.passes).map(s => s.step);

        // Configured step = whatever the registry placed after auto-adjustment
        const variantKey = `${token}__${fontSizeKey}__${bgName}__${stack}__default`;
        const entry = registry.variantMap.get(
          variantKey as Parameters<typeof registry.variantMap.get>[0],
        );
        const configuredStep = entry?.step ?? null;
        const configuredStepPasses =
          configuredStep !== null ? (steps[configuredStep]?.passes ?? null) : null;

        surfaces.push({
          bg: bgName,
          stack,
          surfaceHex: surface.hex,
          steps,
          passingSteps,
          passingRanges: toRangeString(passingSteps),
          configuredStep,
          configuredStepPasses,
        });
      }
    }

    tokens.push({ token, rampName, rampStepCount: ramp.stepCount, surfaces });
  }

  tokens.sort((a, b) => a.token.localeCompare(b.token));

  return {
    tokens,
    meta: {
      engine: compliance.id,
      level,
      fontSize: fontSizeKey,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ── formatCoverageText ────────────────────────────────────────────────────────

export function formatCoverageText(report: CoverageReport): string {
  const lines: string[] = [
    '=== Coverage Report ===',
    `Engine: ${report.meta.engine}  Level: ${report.meta.level}  ` +
      `Font: ${report.meta.fontSize}  Generated: ${report.meta.generatedAt}`,
    '',
    'Columns: bg · stack · surface-hex · passing-step-ranges (n/total) · configured-step',
    '',
  ];

  for (const token of report.tokens) {
    lines.push(`TOKEN  ${token.token}  (ramp: ${token.rampName}, ${token.rampStepCount} steps)`);

    for (const s of token.surfaces) {
      const nPass = s.passingSteps.length;
      const nTotal = token.rampStepCount;

      let rangeCol: string;
      if (nPass === 0) {
        rangeCol = '⚠ NO PASSING STEPS';
      } else {
        const pct = Math.round((nPass / nTotal) * 100);
        rangeCol = `${s.passingRanges}  (${nPass}/${nTotal} = ${pct}%)`;
      }

      let configCol: string;
      if (s.configuredStep === null) {
        configCol = 'no entry';
      } else if (s.configuredStepPasses) {
        configCol = `step ${s.configuredStep} ✓`;
      } else {
        configCol = `step ${s.configuredStep} ✗ FAILING`;
      }

      const narrow = nPass > 0 && nPass <= 2 ? '  ⚠ narrow' : '';

      lines.push(
        `  ${pad(`bg=${s.bg}`, 16)}${pad(`stack=${s.stack}`, 16)}` +
          `${s.surfaceHex}  ` +
          `${pad(rangeCol, 36)} ${configCol}${narrow}`,
      );
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ── formatCoverageJSON ────────────────────────────────────────────────────────

export function formatCoverageJSON(report: CoverageReport): string {
  return JSON.stringify(report, null, 2);
}
