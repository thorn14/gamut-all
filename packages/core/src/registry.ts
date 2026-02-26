import { autoGenerateRules, patchWithOverrides } from './rule-generator.js';
import { djb2Hash } from './serialize.js';
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
import { ALL_FONT_SIZES, ALL_STACKS, ALL_VISION_MODES } from './types.js';

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
  visionMode: VisionMode,
  variantMap: Map<VariantKey, ResolvedVariant>,
): void {
  const allBgs = Array.from(backgrounds.keys());

  const autoRules = autoGenerateRules(ramp, defaultStep, backgrounds, compliance, ALL_FONT_SIZES, ALL_STACKS);
  const patchedMap = patchWithOverrides(autoRules, overrides, allBgs, ALL_FONT_SIZES, ALL_STACKS);

  for (const [bgName, bg] of backgrounds) {
    for (const fontSize of ALL_FONT_SIZES) {
      const mapKey = `${bgName}__${fontSize}__root`;
      const step = patchedMap.has(mapKey) ? patchedMap.get(mapKey)! : defaultStep;
      const stepData = ramp.steps[step];
      if (!stepData) continue;

      const context = {
        fontSizePx: parseInt(fontSize, 10),
        fontWeight: 400,
        target: 'text' as const,
        level: wcagTarget,
      };
      const complianceResult = compliance.evaluate(stepData.hex, bg.hex, context);

      const varKey = makeKey(tokenName, fontSize, bgName, 'root', visionMode);
      variantMap.set(varKey, {
        ramp: ramp.name,
        step,
        hex: stepData.hex,
        compliance: complianceResult,
      });
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
      'default',
      variantMap,
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
        'default',
        variantMap,
      );
    }

    // Build vision mode variants
    for (const [visionModeStr, visionData] of Object.entries(semantic.vision)) {
      const visionMode = visionModeStr as VisionMode;
      if (!ALL_VISION_MODES.includes(visionMode)) continue;

      buildVariantsForToken(
        tokenName,
        visionData.ramp,
        visionData.defaultStep,
        visionData.overrides,
        processed.backgrounds,
        compliance,
        wcagTarget,
        visionMode,
        variantMap,
      );
    }
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
