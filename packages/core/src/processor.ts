import { validateSchema } from './schema.js';
import { hexToOklch, relativeLuminance } from './utils/oklch.js';
import type {
  TokenInput,
  ProcessedInput,
  ProcessedRamp,
  ProcessedStep,
  ProcessedBackground,
  ProcessedSemantic,
  ContextOverrideInput,
} from './types.js';

export function processInput(input: TokenInput): ProcessedInput {
  // 1. Validate schema — throw on errors
  const validation = validateSchema(input as unknown);
  if (!validation.valid) {
    throw new Error(`Invalid token input:\n${validation.errors.join('\n')}`);
  }

  const warnings: string[] = [];

  // 2. Build ProcessedRamp for each primitive
  const ramps = new Map<string, ProcessedRamp>();
  for (const [rampName, hexArray] of Object.entries(input.primitives)) {
    const steps: ProcessedStep[] = hexArray.map((hex, index) => ({
      index,
      hex,
      oklch: hexToOklch(hex),
      relativeLuminance: relativeLuminance(hex),
    }));

    // Warn if luminance is not monotonically ordered
    let monotonic = true;
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1];
      const curr = steps[i];
      if (prev !== undefined && curr !== undefined) {
        // Light-to-dark: luminance should decrease or stay same
        // Check both directions are consistent
        if (i === 1 && prev.relativeLuminance < curr.relativeLuminance) {
          // Ascending order is fine (step 0 darkest)
        } else if (i > 1) {
          const prevPrev = steps[i - 2];
          if (prevPrev !== undefined) {
            const dir1 = prev.relativeLuminance - prevPrev.relativeLuminance;
            const dir2 = curr.relativeLuminance - prev.relativeLuminance;
            if (Math.sign(dir1) !== 0 && Math.sign(dir2) !== 0 && Math.sign(dir1) !== Math.sign(dir2)) {
              monotonic = false;
              break;
            }
          }
        }
      }
    }
    if (!monotonic) {
      warnings.push(`Ramp "${rampName}" luminance is not monotonically ordered`);
    }

    ramps.set(rampName, { name: rampName, steps, stepCount: steps.length });
  }

  // 3. Build ProcessedBackground for each background
  const backgrounds = new Map<string, ProcessedBackground>();
  for (const [bgName, bgInput] of Object.entries(input.backgrounds)) {
    const ramp = ramps.get(bgInput.ramp);
    if (!ramp) {
      throw new Error(`Background "${bgName}" references unknown ramp "${bgInput.ramp}"`);
    }
    const step = ramp.steps[bgInput.step];
    if (!step) {
      throw new Error(`Background "${bgName}" step ${bgInput.step} is out of bounds`);
    }
    backgrounds.set(bgName, {
      name: bgName,
      ramp: bgInput.ramp,
      step: bgInput.step,
      hex: step.hex,
      relativeLuminance: step.relativeLuminance,
      fallback: bgInput.fallback ?? [],
      aliases: bgInput.aliases ?? [],
    });
  }

  // 4. Build ProcessedSemantic for each semantic
  const semantics = new Map<string, ProcessedSemantic>();
  for (const [tokenName, semInput] of Object.entries(input.semantics)) {
    const ramp = ramps.get(semInput.ramp);
    if (!ramp) {
      throw new Error(`Semantic "${tokenName}" references unknown ramp "${semInput.ramp}"`);
    }

    // Build interactions
    const interactions: Record<string, { step: number; overrides: ContextOverrideInput[] }> = {};
    if (semInput.interactions) {
      for (const [stateName, stateInput] of Object.entries(semInput.interactions)) {
        interactions[stateName] = {
          step: stateInput.step,
          overrides: stateInput.overrides ?? [],
        };
      }
    }

    // Build vision overrides — resolve ramp refs
    const vision: Record<string, { ramp: ProcessedRamp; defaultStep: number; overrides: ContextOverrideInput[] }> = {};
    if (semInput.vision) {
      for (const [visionMode, visionInput] of Object.entries(semInput.vision)) {
        const visionRampName = visionInput.ramp ?? semInput.ramp;
        const visionRamp = ramps.get(visionRampName);
        if (!visionRamp) {
          throw new Error(`Semantic "${tokenName}" vision "${visionMode}" references unknown ramp "${visionRampName}"`);
        }
        const visionDefaultStep = visionInput.defaultStep ?? semInput.defaultStep;
        vision[visionMode] = {
          ramp: visionRamp,
          defaultStep: visionDefaultStep,
          overrides: visionInput.overrides ?? [],
        };
      }
    }

    semantics.set(tokenName, {
      name: tokenName,
      ramp,
      defaultStep: semInput.defaultStep,
      overrides: semInput.overrides ?? [],
      interactions,
      vision,
    });
  }

  // 5. Resolve config with defaults
  const backgroundKeys = Array.from(backgrounds.keys());
  const firstBg = backgroundKeys[0] ?? '';
  const inputConfig = input.config ?? {};
  const config: Required<NonNullable<TokenInput['config']>> = {
    wcagTarget: inputConfig.wcagTarget ?? 'AA',
    complianceEngine: inputConfig.complianceEngine ?? 'wcag21',
    onUnresolvedOverride: inputConfig.onUnresolvedOverride ?? 'error',
    defaultBg: inputConfig.defaultBg ?? firstBg,
    stepSelectionStrategy: inputConfig.stepSelectionStrategy ?? 'closest',
  };

  if (!firstBg) {
    warnings.push('No backgrounds defined — defaultBg will be empty string');
  } else if (!inputConfig.defaultBg) {
    warnings.push(`defaultBg not set — using first background key "${firstBg}" (JSON key order dependent)`);
  }

  return { ramps, backgrounds, semantics, config };
}
