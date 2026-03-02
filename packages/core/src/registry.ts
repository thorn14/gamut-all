import { autoGenerateRules, patchWithOverrides } from './rule-generator.js';
import { djb2Hash } from './serialize.js';
import { simulateCVD, oklabHueDE, shiftHueToTarget } from './utils/cvd.js';
import { hexToOklch } from './utils/oklch.js';
import type { CVDType, CVDOptions } from './utils/cvd.js';
import type {
  ProcessedInput,
  ProcessedRamp,
  ProcessedTheme,
  ProcessedSemantic,
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
          fontWeight: 400,
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
          compliance: complianceResult,
        });
      }
    }
  }
}

// Minimum OKLab chroma for a ramp to be considered "chromatic" (not neutral/gray).
// Neutral ramps should not substitute for semantic color tokens under CVD correction.
const CHROMA_MIN = 0.05;

type HueBand = { sourceRanges: Array<[number, number]>; targetHue: number };

// Per CVD type: which source hue bands are confused, and which target hue to shift to.
// Hue angles are OKLCH (degrees, 0–360). Ranges are [min, max) and may wrap around 360°.
// Tokens on ramps outside all source bands are NOT corrected for that CVD type.
// bandA and bandB map to different target hues, ensuring confused pairs always diverge.
const CVD_HUE_POLICY: Partial<Record<CVDType, { bandA: HueBand; bandB: HueBand }>> = {
  protanopia: {
    bandA: { sourceRanges: [[330, 360], [0, 90]],  targetHue: 250 },  // red/warm  → blue
    bandB: { sourceRanges: [[90, 200]],             targetHue: 315 },  // green/teal → violet
  },
  protanomaly: {
    bandA: { sourceRanges: [[330, 360], [0, 90]],  targetHue: 250 },
    bandB: { sourceRanges: [[90, 200]],             targetHue: 315 },
  },
  deuteranopia: {
    bandA: { sourceRanges: [[330, 360], [0, 90]],  targetHue: 250 },
    bandB: { sourceRanges: [[90, 200]],            targetHue: 315 },
  },
  deuteranomaly: {
    bandA: { sourceRanges: [[330, 360], [0, 90]],  targetHue: 250 },
    bandB: { sourceRanges: [[90, 200]],            targetHue: 315 },
  },
  tritanopia: {
    bandA: { sourceRanges: [[60, 110]],   targetHue: 30  },  // yellow/amber → orange/red
    bandB: { sourceRanges: [[190, 270]],  targetHue: 300 },  // blue/cyan    → violet
  },
  tritanomaly: {
    bandA: { sourceRanges: [[60, 110]],   targetHue: 30  },
    bandB: { sourceRanges: [[190, 270]],  targetHue: 300 },
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

function autoCVDVariants(
  variantMap: Map<VariantKey, ResolvedVariant>,
  processed: ProcessedInput,
  compliance: ComplianceEngine,
  opts: Required<CVDOptions>,
): void {
  const cvdTypes: CVDType[] = [
    'protanopia', 'protanomaly',
    'deuteranopia', 'deuteranomaly',
    'tritanopia', 'tritanomaly',
  ];
  const tokenNames = Array.from(processed.semantics.keys());

  // Pre-compute which ramps are chromatic (non-gray) based on their median step,
  // and record each ramp's median hue for policy-aware safe-family matching.
  const chromaticRamps = new Set<string>();
  const rampMedianHues = new Map<string, number>();
  for (const [rampName, ramp] of processed.ramps) {
    const mid = ramp.steps[Math.floor(ramp.steps.length / 2)];
    if (mid) {
      const { c, h } = hexToOklch(mid.hex);
      if (c > CHROMA_MIN) chromaticRamps.add(rampName);
      rampMedianHues.set(rampName, h);
    }
  }

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

          // 4. Hue-shift substitution: rotate each confused token's hue to the target angle
          //    for its confusion band, preserving L and C.
          //    Tokens not in any band (e.g. blue under deuteranopia) are skipped.
          for (const tokenName of confused) {
            const semantic = processed.semantics.get(tokenName)!;

            // Guard: neutral/gray ramps have ill-defined hue — skip them.
            if (!chromaticRamps.has(semantic.ramp.name)) continue;

            const defaultKey = makeKey(tokenName, fontSize, bgName, stackName, 'default');
            const defaultVariant = variantMap.get(defaultKey);
            if (!defaultVariant) continue;
            const currentHex = defaultVariant.hex;

            const policy = CVD_HUE_POLICY[cvdType];
            if (!policy) continue; // achromatopsia — no hue fix available

            const sourceHue = rampMedianHues.get(semantic.ramp.name);
            if (sourceHue === undefined) continue;

            let targetHue: number;
            if (hueInRanges(sourceHue, policy.bandA.sourceRanges)) {
              targetHue = policy.bandA.targetHue;
            } else if (hueInRanges(sourceHue, policy.bandB.sourceRanges)) {
              targetHue = policy.bandB.targetHue;
            } else {
              continue; // Not in any confusion source band for this CVD type — skip.
            }

            // Shift hue to target while preserving L and C.
            const shiftedHex = shiftHueToTarget(currentHex, targetHue);
            if (shiftedHex === currentHex) continue; // Negligible change — skip.

            const ctx = {
              fontSizePx: parseInt(fontSize, 10),
              fontWeight: 400,
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
              compliance: complianceResult,
            });
          }
        }
      }
    }
  }
}

export function buildRegistry(processed: ProcessedInput, compliance: ComplianceEngine): TokenRegistry {
  const variantMap = new Map<VariantKey, ResolvedVariant>();
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
              fontWeight: 400,
              target: semantic.complianceTarget,
              level: wcagTarget,
            };
            const complianceResult = compliance.evaluate(stepData.hex, surface.hex, context);
            const varKey = makeKey(interactionTokenName, fontSize, bgName, stack, 'default');
            variantMap.set(varKey, {
              ramp: semantic.ramp.name,
              step: clampedStep,
              hex: stepData.hex,
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
                fontWeight: 400,
                target: semantic.complianceTarget,
                level: wcagTarget,
              };
              const complianceResult = compliance.evaluate(stepData.hex, surface.hex, context);
              const varKey = makeKey(interactionTokenName, fontSize, bgName, stack, 'default');
              variantMap.set(varKey, {
                ramp: semantic.ramp.name,
                step: overrideStep,
                hex: stepData.hex,
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
    autoCVDVariants(variantMap, processed, compliance, {
      enabled: true,
      confusionThresholdDE: cvdOpts.confusionThresholdDE ?? 5,
      distinguishableThresholdDE: cvdOpts.distinguishableThresholdDE ?? 8,
    });
  }

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
