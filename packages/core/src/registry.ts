import { autoGenerateRules, patchWithOverrides } from './rule-generator.js';
import { djb2Hash } from './serialize.js';
import { simulateCVD, oklabDE, findBestCVDStep } from './utils/cvd.js';
import type { CVDType, CVDOptions } from './utils/cvd.js';
import type {
  ProcessedInput,
  ProcessedRamp,
  ProcessedBackground,
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
  backgrounds: Map<string, ProcessedBackground>,
  compliance: ComplianceEngine,
  wcagTarget: 'AA' | 'AAA',
  stepSelectionStrategy: ProcessedInput['config']['stepSelectionStrategy'],
  visionMode: VisionMode,
  variantMap: Map<VariantKey, ResolvedVariant>,
  stackNames: StackClass[],
): void {
  const allBgs = Array.from(backgrounds.keys());

  const autoRules = autoGenerateRules(
    ramp,
    defaultStep,
    backgrounds,
    compliance,
    wcagTarget,
    ALL_FONT_SIZES,
    stackNames,
    stepSelectionStrategy,
  );
  const patchedMap = patchWithOverrides(autoRules, overrides, allBgs, ALL_FONT_SIZES, stackNames);

  for (const [bgName, bg] of backgrounds) {
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
          target: 'text' as const,
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

function autoCVDVariants(
  variantMap: Map<VariantKey, ResolvedVariant>,
  processed: ProcessedInput,
  compliance: ComplianceEngine,
  opts: Required<CVDOptions>,
): void {
  const cvdTypes: CVDType[] = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
  const tokenNames = Array.from(processed.semantics.keys());

  for (const cvdType of cvdTypes) {
    const visionMode = cvdType as VisionMode;

    for (const [bgName, bg] of processed.backgrounds) {
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

          // 3. Find confused pairs
          const confused = new Set<string>();
          for (let i = 0; i < contextTokens.length; i++) {
            for (let j = i + 1; j < contextTokens.length; j++) {
              const ti = contextTokens[i]!;
              const tj = contextTokens[j]!;
              const defaultDE = oklabDE(ti.hex, tj.hex);
              const cvdDE = oklabDE(simHexes.get(ti.tokenName)!, simHexes.get(tj.tokenName)!);
              if (defaultDE > opts.distinguishableThresholdDE && cvdDE < opts.confusionThresholdDE) {
                confused.add(ti.tokenName);
                confused.add(tj.tokenName);
              }
            }
          }

          // 4. For each confused token, find best step
          for (const tokenName of confused) {
            const semantic = processed.semantics.get(tokenName)!;
            const otherSimHexes = contextTokens
              .filter(t => t.tokenName !== tokenName)
              .map(t => simHexes.get(t.tokenName)!);

            // Get the current variant hex (auto-adjusted by rule generator)
            const defaultKey = makeKey(tokenName, fontSize, bgName, stackName, 'default');
            const defaultVariant = variantMap.get(defaultKey);
            if (!defaultVariant) continue;
            const currentHex = defaultVariant.hex;

            // Filter ramp steps to only those passing compliance
            const passSteps = semantic.ramp.steps.filter((step) =>
              compliance.evaluate(step.hex, surface.hex, {
                fontSizePx: parseInt(fontSize, 10),
                fontWeight: 400,
                target: 'text' as const,
                level: processed.config.wcagTarget,
              }).pass
            );

            if (passSteps.length === 0) continue;

            const bestHex = findBestCVDStep(passSteps, currentHex, cvdType, otherSimHexes, opts);
            if (bestHex === null) continue;

            const complianceResult = compliance.evaluate(bestHex, surface.hex, {
              fontSizePx: parseInt(fontSize, 10),
              fontWeight: 400,
              target: 'text' as const,
              level: processed.config.wcagTarget,
            });

            // Find the global step index in the ramp
            const globalStep = semantic.ramp.steps.findIndex(s => s.hex === bestHex);
            if (globalStep === -1) continue;

            const cvdKey = makeKey(tokenName, fontSize, bgName, stackName, visionMode);
            variantMap.set(cvdKey, {
              ramp: semantic.ramp.name,
              step: globalStep,
              hex: bestHex,
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
  const backgroundFallbacks: Record<string, string[]> = {};

  // Build backgroundFallbacks
  for (const [bgName, bg] of processed.backgrounds) {
    backgroundFallbacks[bgName] = bg.fallback;
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
      processed.backgrounds,
      compliance,
      wcagTarget,
      stepSelectionStrategy,
      'default',
      variantMap,
      stackNames,
    );

    // Build interaction variants
    for (const [stateName, interaction] of Object.entries(semantic.interactions)) {
      const interactionTokenName = `${tokenName}-${stateName}`;
      const interactionDefaultStep = interaction.step;
      const interactionStepData = semantic.ramp.steps[interactionDefaultStep];
      if (interactionStepData) {
        defaults[interactionTokenName] = interactionStepData.hex;
      }

      buildVariantsForToken(
        interactionTokenName,
        semantic.ramp,
        interaction.step,
        interaction.overrides,
        processed.backgrounds,
        compliance,
        wcagTarget,
        stepSelectionStrategy,
        'default',
        variantMap,
        stackNames,
      );
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
    backgrounds: processed.backgrounds,
    backgroundFallbacks,
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
