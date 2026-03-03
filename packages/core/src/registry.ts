import { autoGenerateRules, patchWithOverrides, findClosestPassingStep } from './rule-generator.js';
import { djb2Hash } from './serialize.js';
import { simulateCVD, oklabHueDE, shiftHueToTarget } from './utils/cvd.js';
import { hexToOklch } from './utils/oklch.js';
import type { CVDType, CVDOptions } from './utils/cvd.js';
import type {
  ProcessedInput,
  ProcessedRamp,
  ProcessedTheme,
  ProcessedSemantic,
  ProcessedSurface,
  ComplianceEngine,
  TokenRegistry,
  ResolvedVariant,
  VariantKey,
  FontSizeClass,
  StackClass,
  VisionMode,
  ValidationResult,
} from './types.js';
import { ALL_FONT_SIZES } from './types.js';

function makeKey(
  token: string,
  fontSize: FontSizeClass,
  bg: string,
  stack: StackClass,
  vision: VisionMode,
): VariantKey {
  return `${token}__${fontSize}__${bg}__${stack}__${vision}` as VariantKey;
}

function buildVariantsForToken(
  tokenName: string,
  ramp: ProcessedRamp,
  defaultStep: number,
  fontWeight: number,
  overrides: ProcessedSemantic['overrides'],
  themes: Map<string, ProcessedTheme>,
  compliance: ComplianceEngine,
  wcagTarget: 'AA' | 'AAA',
  stepSelectionStrategy: ProcessedInput['config']['stepSelectionStrategy'],
  visionMode: VisionMode,
  variantMap: Map<VariantKey, ResolvedVariant>,
  stackNames: StackClass[],
  complianceTarget: 'text' | 'ui-component' | 'decorative' = 'text',
): void {
  const allBgs = Array.from(themes.keys());

  const autoRules = autoGenerateRules(
    ramp,
    defaultStep,
    fontWeight,
    themes,
    compliance,
    wcagTarget,
    ALL_FONT_SIZES,
    stackNames,
    stepSelectionStrategy,
    complianceTarget,
  );
  const patchedMap = patchWithOverrides(autoRules, overrides, allBgs, ALL_FONT_SIZES, stackNames);

  for (const [bgName, bg] of themes) {
    for (const stack of stackNames) {
      const surface = bg.surfaces.get(stack);
      if (!surface) continue;

      for (const fontSize of ALL_FONT_SIZES) {
        const mapKey = `${bgName}__${fontSize}__${stack}`;
        const step = patchedMap.has(mapKey) ? patchedMap.get(mapKey)! : defaultStep;
        const stepData = ramp.steps[step];
        if (!stepData) continue;

        const context = {
          fontSizePx: parseInt(fontSize, 10),
          fontWeight,
          target: complianceTarget,
          level: wcagTarget,
        };
        // Compliance checked against the stack's surface hex, not bg.hex
        const complianceResult = compliance.evaluate(stepData.hex, surface.hex, context);

        const varKey = makeKey(tokenName, fontSize, bgName, stack, visionMode);
        variantMap.set(varKey, {
          ramp: ramp.name,
          step,
          hex: stepData.hex,
          fontWeight,
          compliance: complianceResult,
        });
      }
    }
  }
}

// Minimum OKLab chroma for a ramp to be considered "chromatic" (not neutral/gray).
// Neutral ramps should not substitute for semantic color tokens under CVD correction.
const CHROMA_MIN = 0.05;

// Minimum angular gap (degrees) between two hue-spread targets in the same band.
// Below this gap the hues become perceptually indistinguishable for typical chroma values.
// Ramps that would need a smaller gap are "overflow" and get chroma reduction instead.
const MIN_HUE_GAP_DEG = 20;

type HueBand = { sourceRanges: Array<[number, number]>; targetRange: [number, number] };

/**
 * Find contiguous free sub-spans within [lo, hi] that are at least `gap` degrees
 * clear of every occupant hue on each side.
 */
function findFreeSpans(lo: number, hi: number, occupants: number[], gap: number): Array<[number, number]> {
  if (occupants.length === 0) return [[lo, hi]];
  const blocked: Array<[number, number]> = occupants
    .map(h => [Math.max(lo, h - gap), Math.min(hi, h + gap)] as [number, number])
    .filter(([a, b]) => a < hi && b > lo)
    .sort((a, b) => a[0] - b[0]);
  // Merge overlapping blocked ranges
  const merged: Array<[number, number]> = [];
  for (const [a, b] of blocked) {
    if (merged.length > 0 && a <= merged[merged.length - 1]![1]) {
      merged[merged.length - 1]![1] = Math.max(merged[merged.length - 1]![1], b);
    } else {
      merged.push([a, b]);
    }
  }
  const spans: Array<[number, number]> = [];
  let cursor = lo;
  for (const [blo, bhi] of merged) {
    if (blo > cursor) spans.push([cursor, blo]);
    cursor = Math.max(cursor, bhi);
  }
  if (cursor < hi) spans.push([cursor, hi]);
  return spans.filter(([a, b]) => b > a);
}

/**
 * Spread `ramps` into target range [lo, hi], avoiding `occupantHues` by MIN_HUE_GAP_DEG.
 * Occupants are non-shifted chromatic ramps that already occupy hues in/near the range.
 * When free space exists, ramps are placed evenly within the free sub-spans.
 * When the range is fully occupied, the least-blocked position is used with chroma reduction.
 */
function spreadRamps(
  ramps: string[],
  lo: number,
  hi: number,
  rampMedianHues: Map<string, number>,
  occupantHues: number[],
): Map<string, { targetHue: number; chromaScale: number }> {
  const result = new Map<string, { targetHue: number; chromaScale: number }>();
  if (ramps.length === 0) return result;

  const sorted = [...ramps].sort((a, b) => (rampMedianHues.get(a) ?? 0) - (rampMedianHues.get(b) ?? 0));
  const freeSpans = findFreeSpans(lo, hi, occupantHues, MIN_HUE_GAP_DEG);
  const totalSlots = freeSpans.reduce((s, [a, b]) => s + Math.floor((b - a) / MIN_HUE_GAP_DEG) + 1, 0);
  const hueCount = Math.min(sorted.length, totalSlots);

  if (hueCount === 0) {
    // No free space — find the least-blocked position and use chroma reduction
    let bestH = (lo + hi) / 2;
    let bestDist = 0;
    const step = Math.max(0.5, (hi - lo) / 80);
    for (let h = lo; h <= hi; h += step) {
      const d = occupantHues.length > 0 ? Math.min(...occupantHues.map(o => Math.abs(h - o))) : Infinity;
      if (d > bestDist) { bestDist = d; bestH = h; }
    }
    for (let i = 0; i < sorted.length; i++) {
      result.set(sorted[i]!, { targetHue: bestH, chromaScale: Math.max(0.25, 1.0 - (i + 1) * 0.25) });
    }
    return result;
  }

  // Distribute hueCount ramps proportionally across free spans
  let rampIdx = 0;
  for (const [slo, shi] of freeSpans) {
    if (rampIdx >= hueCount) break;
    const spanSlots = Math.floor((shi - slo) / MIN_HUE_GAP_DEG) + 1;
    const share = Math.round((spanSlots / totalSlots) * hueCount);
    const rampsHere = Math.min(Math.max(share, 1), hueCount - rampIdx);
    for (let k = 0; k < rampsHere; k++, rampIdx++) {
      const frac = rampsHere === 1 ? 0.5 : k / (rampsHere - 1);
      result.set(sorted[rampIdx]!, { targetHue: slo + frac * (shi - slo), chromaScale: 1.0 });
    }
  }

  // Overflow ramps (beyond slot capacity)
  for (let i = hueCount; i < sorted.length; i++) {
    const overflowRank = i - hueCount + 1;
    const lastPlaced = result.get(sorted[hueCount - 1]!);
    result.set(sorted[i]!, { targetHue: lastPlaced?.targetHue ?? (lo + hi) / 2, chromaScale: 1.0 - overflowRank * 0.25 });
  }
  return result;
}

// Per CVD type: which source hue bands are confused, and which safe target range to shift into.
// Hue angles are OKLCH (degrees, 0–360). Ranges are [min, max) and may wrap around 360°.
// When multiple ramps fall into the same band, their target hues are spread proportionally
// across targetRange (sorted by original median hue) so they remain distinguishable.
const CVD_HUE_POLICY: Partial<Record<CVDType, { bandA: HueBand; bandB: HueBand }>> = {
  protanopia: {
    bandA: { sourceRanges: [[330, 360], [0, 90]],  targetRange: [230, 270] },  // red/warm  → blue zone
    bandB: { sourceRanges: [[90, 200]],             targetRange: [295, 335] },  // green/teal → violet zone
  },
  protanomaly: {
    bandA: { sourceRanges: [[330, 360], [0, 90]],  targetRange: [230, 270] },
    bandB: { sourceRanges: [[90, 200]],             targetRange: [295, 335] },
  },
  deuteranopia: {
    bandA: { sourceRanges: [[330, 360], [0, 90]],  targetRange: [230, 270] },
    bandB: { sourceRanges: [[90, 200]],            targetRange: [295, 335] },
  },
  deuteranomaly: {
    bandA: { sourceRanges: [[330, 360], [0, 90]],  targetRange: [230, 270] },
    bandB: { sourceRanges: [[90, 200]],            targetRange: [295, 335] },
  },
  tritanopia: {
    bandA: { sourceRanges: [[60, 110]],   targetRange: [15,  45]  },  // yellow/amber → orange/red zone
    bandB: { sourceRanges: [[190, 270]],  targetRange: [280, 320] },  // blue/cyan    → violet zone
  },
  tritanomaly: {
    bandA: { sourceRanges: [[60, 110]],   targetRange: [15,  45]  },
    bandB: { sourceRanges: [[190, 270]],  targetRange: [280, 320] },
  },
  // achromatopsia / blueConeMonochromacy: omitted — no hue fix meaningful for grayscale vision.
};

// Returns true if hue h (degrees) falls within any of the given [min, max) ranges.
// Ranges that wrap around 360° use min > max (e.g. [330, 60] means 330°–360° ∪ 0°–60°).
function hueInRanges(h: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([min, max]) =>
    min <= max ? h >= min && h < max : h >= min || h < max,
  );
}

// Returns the theme-resolved hex for a surface (auto-mirror or explicit override).
function themeResolvedSurfaceHex(
  surface: { hex: string; step: number; ramp: string; themeOverrides: Map<string, { hex: string }> },
  themeName: string,
  theme: ProcessedTheme,
  ramps: Map<string, ProcessedRamp>,
): string {
  const override = surface.themeOverrides.get(themeName);
  if (override) return override.hex;
  if (theme.elevationDirection === 'lighter') {
    const ramp = ramps.get(surface.ramp);
    if (ramp) {
      const maxStep = ramp.steps.length - 1;
      const mirroredStep = maxStep - surface.step;
      const mirroredData = ramp.steps[mirroredStep];
      if (mirroredData && mirroredData.hex !== surface.hex) return mirroredData.hex;
    }
  }
  return surface.hex;
}

function buildRampMetadata(ramps: Map<string, ProcessedRamp>): {
  chromaticRamps: Set<string>;
  rampMedianHues: Map<string, number>;
} {
  const chromaticRamps = new Set<string>();
  const rampMedianHues = new Map<string, number>();
  for (const [rampName, ramp] of ramps) {
    const mid = ramp.steps[Math.floor(ramp.steps.length / 2)];
    if (mid) {
      const { c, h } = hexToOklch(mid.hex);
      if (c > CHROMA_MIN) chromaticRamps.add(rampName);
      rampMedianHues.set(rampName, h);
    }
  }
  return { chromaticRamps, rampMedianHues };
}

function autoCVDSurfaces(
  processed: ProcessedInput,
  chromaticRamps: Set<string>,
  rampMedianHues: Map<string, number>,
  opts: Required<CVDOptions>,
): void {
  const cvdTypes: CVDType[] = [
    'protanopia', 'protanomaly',
    'deuteranopia', 'deuteranomaly',
    'tritanopia', 'tritanomaly',
  ];

  for (const cvdType of cvdTypes) {
    const visionMode = cvdType as VisionMode;
    const policy = CVD_HUE_POLICY[cvdType];
    if (!policy) continue; // achromatopsia — no hue fix

    for (const [themeName, theme] of processed.themes) {
      // Collect theme-resolved hex for each surface (applying auto-mirror or explicit override)
      const themeHexes = new Map<string, string>();
      for (const [surfaceName, surface] of processed.surfaces) {
        themeHexes.set(surfaceName, themeResolvedSurfaceHex(surface, themeName, theme, processed.ramps));
      }

      // Simulate all surface hexes under CVD
      const simHexes = new Map<string, string>();
      for (const [surfaceName, hex] of themeHexes) {
        simHexes.set(surfaceName, simulateCVD(hex, cvdType));
      }

      // Detect confused surface pairs by hue ΔE
      const confused = new Set<string>();
      const surfaceNames = Array.from(themeHexes.keys());
      for (let i = 0; i < surfaceNames.length; i++) {
        for (let j = i + 1; j < surfaceNames.length; j++) {
          const nameI = surfaceNames[i]!;
          const nameJ = surfaceNames[j]!;
          const defaultHueDE = oklabHueDE(themeHexes.get(nameI)!, themeHexes.get(nameJ)!);
          const cvdHueDE = oklabHueDE(simHexes.get(nameI)!, simHexes.get(nameJ)!);
          if (defaultHueDE > opts.distinguishableThresholdDE && cvdHueDE < opts.confusionThresholdDE) {
            confused.add(nameI);
            confused.add(nameJ);
          }
        }
      }

      if (confused.size === 0) continue;

      // Determine which ramps are affected — chromatic + falls in a confused hue band
      const bandRamps: { A: string[]; B: string[] } = { A: [], B: [] };
      for (const surfaceName of confused) {
        const surface = processed.surfaces.get(surfaceName)!;
        if (!chromaticRamps.has(surface.ramp)) continue;
        const sourceHue = rampMedianHues.get(surface.ramp);
        if (sourceHue === undefined) continue;
        if (hueInRanges(sourceHue, policy.bandA.sourceRanges) && !bandRamps.A.includes(surface.ramp)) {
          bandRamps.A.push(surface.ramp);
        } else if (hueInRanges(sourceHue, policy.bandB.sourceRanges) && !bandRamps.B.includes(surface.ramp)) {
          bandRamps.B.push(surface.ramp);
        }
      }

      // Spread target hues across band ranges, avoiding ramps already occupying the target zone.
      const affectedRamps = new Map<string, { targetHue: number; chromaScale: number }>();
      for (const [ramps, band] of [[bandRamps.A, policy.bandA], [bandRamps.B, policy.bandB]] as const) {
        if (ramps.length === 0) continue;
        const [lo, hi] = band.targetRange;
        // Collect hues of chromatic ramps already within (or near) the target range that aren't
        // being shifted — they act as fixed anchors the shifted ramps must avoid.
        const occupantHues: number[] = [];
        for (const [name, h] of rampMedianHues) {
          if (!chromaticRamps.has(name)) continue;
          if (bandRamps.A.includes(name) || bandRamps.B.includes(name)) continue;
          if (h >= lo - MIN_HUE_GAP_DEG && h < hi + MIN_HUE_GAP_DEG) occupantHues.push(h);
        }
        for (const [name, placement] of spreadRamps(ramps, lo, hi, rampMedianHues, occupantHues)) {
          affectedRamps.set(name, placement);
        }
      }

      if (affectedRamps.size === 0) continue;

      // Apply hue shift to all surfaces on affected ramps
      for (const [surfaceName, surface] of processed.surfaces) {
        const rampTarget = affectedRamps.get(surface.ramp);
        if (rampTarget === undefined) continue;
        const { targetHue, chromaScale } = rampTarget;

        const hex = themeHexes.get(surfaceName)!;
        const shiftedHex = shiftHueToTarget(hex, targetHue, chromaScale);
        if (shiftedHex === hex) continue;

        // Store per-theme CVD override
        if (!surface.visionOverrides.has(themeName)) {
          surface.visionOverrides.set(themeName, new Map());
        }
        surface.visionOverrides.get(themeName)!.set(visionMode, { hex: shiftedHex });
      }
    }
  }
}

function autoCVDVariants(
  variantMap: Map<VariantKey, ResolvedVariant>,
  processed: ProcessedInput,
  compliance: ComplianceEngine,
  opts: Required<CVDOptions>,
  chromaticRamps: Set<string>,
  rampMedianHues: Map<string, number>,
): void {
  const cvdTypes: CVDType[] = [
    'protanopia', 'protanomaly',
    'deuteranopia', 'deuteranomaly',
    'tritanopia', 'tritanomaly',
  ];
  const tokenNames = Array.from(processed.semantics.keys());

  for (const cvdType of cvdTypes) {
    const visionMode = cvdType as VisionMode;

    for (const [bgName, bg] of processed.themes) {
      for (const [stackName, surface] of bg.surfaces) {
        for (const fontSize of ALL_FONT_SIZES) {

          // 1. Collect all default token resolved hexes for this context
          const contextTokens: Array<{ tokenName: string; hex: string; semantic: ProcessedSemantic }> = [];
          for (const tokenName of tokenNames) {
            const semantic = processed.semantics.get(tokenName)!;
            const key = makeKey(tokenName, fontSize, bgName, stackName, 'default');
            const variant = variantMap.get(key);
            if (!variant) continue;
            contextTokens.push({ tokenName, hex: variant.hex, semantic });
          }

          if (contextTokens.length < 2) continue;

          // 2. Simulate all under CVD
          const simHexes = new Map<string, string>();
          for (const { tokenName, hex } of contextTokens) {
            simHexes.set(tokenName, simulateCVD(hex, cvdType));
          }

          // 3. Find confused pairs using HUE-ONLY ΔE.
          //    Total ΔE (oklabDE) includes lightness, which masks hue confusion:
          //    a light red and a dark green can have ΔE=12 even if both look olive under CVD.
          //    oklabHueDE ignores lightness and detects hue confusion specifically.
          const confused = new Set<string>();
          for (let i = 0; i < contextTokens.length; i++) {
            for (let j = i + 1; j < contextTokens.length; j++) {
              const ti = contextTokens[i]!;
              const tj = contextTokens[j]!;
              // Default pair must be distinguishable by hue (not just lightness)
              const defaultHueDE = oklabHueDE(ti.hex, tj.hex);
              // CVD-simulated pair must be hue-confused
              const cvdHueDE = oklabHueDE(simHexes.get(ti.tokenName)!, simHexes.get(tj.tokenName)!);
              if (defaultHueDE > opts.distinguishableThresholdDE && cvdHueDE < opts.confusionThresholdDE) {
                confused.add(ti.tokenName);
                confused.add(tj.tokenName);
              }
            }
          }

          if (confused.size === 0) continue;

          // 4. Determine which ramps are affected by confusion in this context.
          //    Any ramp that has at least one confused token in a source hue band is "affected".
          //    We then shift ALL tokens on an affected ramp — not just the confused ones —
          //    so that borderSuccess and fgSuccess shift together when emerald is affected.
          const policy = CVD_HUE_POLICY[cvdType];
          if (!policy) continue; // achromatopsia — no hue fix available

          // Collect which ramps belong to bandA vs bandB (keyed by band label).
          const bandRamps: { A: string[]; B: string[] } = { A: [], B: [] };
          for (const tokenName of confused) {
            const semantic = processed.semantics.get(tokenName)!;
            if (!chromaticRamps.has(semantic.ramp.name)) continue;
            const sourceHue = rampMedianHues.get(semantic.ramp.name);
            if (sourceHue === undefined) continue;
            if (hueInRanges(sourceHue, policy.bandA.sourceRanges) && !bandRamps.A.includes(semantic.ramp.name)) {
              bandRamps.A.push(semantic.ramp.name);
            } else if (hueInRanges(sourceHue, policy.bandB.sourceRanges) && !bandRamps.B.includes(semantic.ramp.name)) {
              bandRamps.B.push(semantic.ramp.name);
            }
          }

          // Spread target hues across the band's targetRange, avoiding chromatic ramps that
          // already occupy the target zone (e.g. an existing "info blue" ramp in the blue zone).
          // When free sub-spans exist, shifted ramps are placed there; otherwise chroma reduction
          // is used to keep them distinguishable from fixed occupants.
          const affectedRamps = new Map<string, { targetHue: number; chromaScale: number }>();
          for (const [ramps, band] of [[bandRamps.A, policy.bandA], [bandRamps.B, policy.bandB]] as const) {
            if (ramps.length === 0) continue;
            const [lo, hi] = band.targetRange;
            const occupantHues: number[] = [];
            for (const [name, h] of rampMedianHues) {
              if (!chromaticRamps.has(name)) continue;
              if (bandRamps.A.includes(name) || bandRamps.B.includes(name)) continue;
              if (h >= lo - MIN_HUE_GAP_DEG && h < hi + MIN_HUE_GAP_DEG) occupantHues.push(h);
            }
            for (const [name, placement] of spreadRamps(ramps, lo, hi, rampMedianHues, occupantHues)) {
              affectedRamps.set(name, placement);
            }
          }

          if (affectedRamps.size === 0) continue;

          // Shift ALL tokens whose ramp is affected (not just the confused subset).
          for (const tokenName of tokenNames) {
            const semantic = processed.semantics.get(tokenName)!;

            // Only process tokens on a ramp that was identified as affected.
            const rampTarget = affectedRamps.get(semantic.ramp.name);
            if (rampTarget === undefined) continue;
            const { targetHue, chromaScale } = rampTarget;

            const defaultKey = makeKey(tokenName, fontSize, bgName, stackName, 'default');
            const defaultVariant = variantMap.get(defaultKey);
            if (!defaultVariant) continue;
            const currentHex = defaultVariant.hex;

            // Shift hue to target. Overflow ramps also reduce chroma for distinguishability.
            const shiftedHex = shiftHueToTarget(currentHex, targetHue, chromaScale);
            if (shiftedHex === currentHex) continue; // Negligible change — skip.

            const ctx = {
              fontSizePx: parseInt(fontSize, 10),
              fontWeight: semantic.fontWeight,
              target: semantic.complianceTarget,
              level: processed.config.wcagTarget,
            };

            let finalHex = shiftedHex;
            let finalStep = defaultVariant.step;
            let complianceResult = compliance.evaluate(shiftedHex, surface.hex, ctx);

            if (!complianceResult.pass) {
              // Fallback: walk ramp steps outward from the default step, shift each to
              // the target hue, and use the first whose shifted version passes compliance.
              let found = false;
              for (let dist = 1; dist < semantic.ramp.steps.length && !found; dist++) {
                for (const idx of [defaultVariant.step + dist, defaultVariant.step - dist]) {
                  if (idx < 0 || idx >= semantic.ramp.steps.length) continue;
                  const stepHex = semantic.ramp.steps[idx]?.hex;
                  if (!stepHex) continue;
                  const candidate = shiftHueToTarget(stepHex, targetHue);
                  const result = compliance.evaluate(candidate, surface.hex, ctx);
                  if (result.pass) {
                    finalHex = candidate;
                    finalStep = idx;
                    complianceResult = result;
                    found = true;
                    break;
                  }
                }
              }
              if (!found) continue;
            }

            const cvdKey = makeKey(tokenName, fontSize, bgName, stackName, visionMode);
            variantMap.set(cvdKey, {
              ramp: semantic.ramp.name,
              step: finalStep,
              hex: finalHex,
              fontWeight: semantic.fontWeight,
              compliance: complianceResult,
            });
          }
        }
      }
    }
  }
}


// ── computeSurfaceTokens ─────────────────────────────────────────────────────
// For each surface, resolve all semantic tokens against that surface's hex so
// the CSS emitter can generate .bg-{name} utility classes with correct vars.

function resolveTokensForSurfaceHex(
  bgHex: string,
  processed: ProcessedInput,
  compliance: ComplianceEngine,
  wcagTarget: 'AA' | 'AAA',
): Map<string, string> {
  const result = new Map<string, string>();
  for (const [tokenName, semantic] of processed.semantics) {
    if (semantic.complianceTarget === 'decorative') continue;
    const ctx = {
      fontSizePx: 12, // most restrictive — ensures readability at any font size
      fontWeight: semantic.fontWeight,
      target: semantic.complianceTarget,
      level: wcagTarget,
    };
    const passes = (candidateHex: string): boolean =>
      compliance.evaluate(candidateHex, bgHex, ctx).pass;

    let step = findClosestPassingStep(semantic.ramp, semantic.defaultStep, passes, 'either');

    // No passing step exists (e.g. same-ramp token on a mid-tone surface of that ramp).
    // Fall back to the step with the highest contrast — best effort rather than leaving
    // the token unset, which would inherit a potentially invisible theme value.
    if (step === null) {
      let bestStep = 0;
      let bestValue = -Infinity;
      for (let i = 0; i < semantic.ramp.steps.length; i++) {
        const s = semantic.ramp.steps[i];
        if (!s) continue;
        const value = compliance.evaluate(s.hex, bgHex, ctx).value;
        if (value > bestValue) { bestValue = value; bestStep = i; }
      }
      step = bestStep;
    }

    const hex = semantic.ramp.steps[step]?.hex;
    if (hex) result.set(tokenName, hex);
  }
  return result;
}

function computeSurfaceTokens(
  processed: ProcessedInput,
  compliance: ComplianceEngine,
  wcagTarget: 'AA' | 'AAA',
): void {
  for (const surface of processed.surfaces.values()) {
    surface.surfaceTokens = resolveTokensForSurfaceHex(surface.hex, processed, compliance, wcagTarget);

    for (const [themeName, theme] of processed.themes) {
      const themeHex = themeResolvedSurfaceHex(surface, themeName, theme, processed.ramps);
      if (themeHex === surface.hex) continue;
      surface.themeSurfaceTokens.set(themeName, {
        bgHex: themeHex,
        tokens: resolveTokensForSurfaceHex(themeHex, processed, compliance, wcagTarget),
      });
    }
  }
}

export function buildRegistry(processed: ProcessedInput, compliance: ComplianceEngine): TokenRegistry {
  const variantMap = new Map<VariantKey, ResolvedVariant>();
  const tokenTargets = new Map<string, 'text' | 'ui-component' | 'decorative'>();
  const defaults: Record<string, string> = {};
  const themeFallbacks: Record<string, string[]> = {};

  // Build themeFallbacks
  for (const [bgName, bg] of processed.themes) {
    themeFallbacks[bgName] = bg.fallback;
  }

  const wcagTarget = processed.config.wcagTarget;
  const stepSelectionStrategy = processed.config.stepSelectionStrategy;
  const stackNames = Array.from(processed.stacks.keys());

  for (const [tokenName, semantic] of processed.semantics) {
    tokenTargets.set(tokenName, semantic.complianceTarget);
    // Set default hex
    const defaultStepData = semantic.ramp.steps[semantic.defaultStep];
    if (defaultStepData) {
      defaults[tokenName] = defaultStepData.hex;
    }

    // Build default vision mode variants
    buildVariantsForToken(
      tokenName,
      semantic.ramp,
      semantic.defaultStep,
      semantic.fontWeight,
      semantic.overrides,
      processed.themes,
      compliance,
      wcagTarget,
      stepSelectionStrategy,
      'default',
      variantMap,
      stackNames,
      semantic.complianceTarget,
    );

    // Build interaction variants — direction-aware delta relative to resolved base step.
    // Interaction steps are declared as absolute indices, but their visual intent is
    // relative (hover = +1 from base, active = +2, etc.). When the base gets
    // compliance-corrected to a different step, we apply the same signed delta in the
    // bg's elevation direction so hover/active always differ visibly from the base.
    for (const [stateName, interaction] of Object.entries(semantic.interactions)) {
      const interactionTokenName = `${tokenName}-${stateName}`;
      tokenTargets.set(interactionTokenName, semantic.complianceTarget);
      const interactionDelta = interaction.step - semantic.defaultStep;

      // Default fallback hex: use the absolute declared step (for resolveToken fallback chain).
      const interactionAbsStepData = semantic.ramp.steps[interaction.step];
      if (interactionAbsStepData) {
        defaults[interactionTokenName] = interactionAbsStepData.hex;
      }

      const allBgs = Array.from(processed.themes.keys());

      for (const [bgName, bg] of processed.themes) {
        // On dark bgs elevation goes lighter (lower index) → negate delta so hover is
        // still "further from default" in the readable direction.
        const directionFactor = bg.elevationDirection === 'lighter' ? -1 : 1;

        for (const stack of stackNames) {
          const surface = bg.surfaces.get(stack);
          if (!surface) continue;

          for (const fontSize of ALL_FONT_SIZES) {
            // Look up the already-resolved base step for this exact context.
            const baseKey = makeKey(tokenName, fontSize, bgName, stack, 'default');
            const baseVariant = variantMap.get(baseKey);
            const resolvedBaseStep = baseVariant?.step ?? semantic.defaultStep;

            // Apply direction-aware delta, clamped to ramp bounds.
            const rawStep = resolvedBaseStep + interactionDelta * directionFactor;
            const clampedStep = Math.max(0, Math.min(rawStep, semantic.ramp.steps.length - 1));
            const stepData = semantic.ramp.steps[clampedStep];
            if (!stepData) continue;

            const context = {
              fontSizePx: parseInt(fontSize, 10),
              fontWeight: semantic.fontWeight,
              target: semantic.complianceTarget,
              level: wcagTarget,
            };
            const complianceResult = compliance.evaluate(stepData.hex, surface.hex, context);
            const varKey = makeKey(interactionTokenName, fontSize, bgName, stack, 'default');
            variantMap.set(varKey, {
              ramp: semantic.ramp.name,
              step: clampedStep,
              hex: stepData.hex,
              fontWeight: semantic.fontWeight,
              compliance: complianceResult,
            });
          }
        }
      }

      // Apply any manual overrides declared on this interaction state.
      if (interaction.overrides.length > 0) {
        const overrideMap = patchWithOverrides([], interaction.overrides, allBgs, ALL_FONT_SIZES, stackNames);
        for (const [bgName, bg] of processed.themes) {
          for (const stack of stackNames) {
            const surface = bg.surfaces.get(stack);
            if (!surface) continue;
            for (const fontSize of ALL_FONT_SIZES) {
              const mapKey = `${bgName}__${fontSize}__${stack}`;
              if (!overrideMap.has(mapKey)) continue;
              const overrideStep = overrideMap.get(mapKey)!;
              const stepData = semantic.ramp.steps[overrideStep];
              if (!stepData) continue;
              const context = {
                fontSizePx: parseInt(fontSize, 10),
                fontWeight: semantic.fontWeight,
                target: semantic.complianceTarget,
                level: wcagTarget,
              };
              const complianceResult = compliance.evaluate(stepData.hex, surface.hex, context);
              const varKey = makeKey(interactionTokenName, fontSize, bgName, stack, 'default');
              variantMap.set(varKey, {
                ramp: semantic.ramp.name,
                step: overrideStep,
                hex: stepData.hex,
                fontWeight: semantic.fontWeight,
                compliance: complianceResult,
              });
            }
          }
        }
      }
    }
  }

  // Auto-generate CVD variants after all default variants are populated
  const cvdOpts = processed.config.cvd ?? {};
  if (cvdOpts.enabled !== false) {
    const resolvedCvdOpts: Required<CVDOptions> = {
      enabled: true,
      confusionThresholdDE: cvdOpts.confusionThresholdDE ?? 5,
      distinguishableThresholdDE: cvdOpts.distinguishableThresholdDE ?? 8,
    };
    const { chromaticRamps, rampMedianHues } = buildRampMetadata(processed.ramps);
    autoCVDVariants(variantMap, processed, compliance, resolvedCvdOpts, chromaticRamps, rampMedianHues);
    autoCVDSurfaces(processed, chromaticRamps, rampMedianHues, resolvedCvdOpts);
  }

  computeSurfaceTokens(processed, compliance, wcagTarget);

  const meta = {
    generatedAt: new Date().toISOString(),
    totalVariants: variantMap.size,
    tokenCount: processed.semantics.size,
    complianceEngine: compliance.id,
    wcagTarget,
    inputHash: djb2Hash(JSON.stringify({
      primitives: Object.fromEntries(
        Array.from(processed.ramps.entries()).map(([k, v]) => [k, v.steps.map(s => s.hex)])
      ),
    })),
  };

  return {
    ramps: processed.ramps,
    themes: processed.themes,
    themeFallbacks,
    surfaces: processed.surfaces,
    stacks: processed.stacks,
    variantMap,
    tokenTargets,
    defaults,
    meta,
  };
}

export function validateRegistry(registry: TokenRegistry): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [key, variant] of registry.variantMap) {
    if (!variant.compliance.pass) {
      warnings.push(`Variant ${key}: contrast ${variant.compliance.value.toFixed(2)} < required ${variant.compliance.required ?? '?'} (${variant.compliance.metric})`);
    }
  }

  return { errors, warnings };
}
