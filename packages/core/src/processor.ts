import { validateSchema } from './schema.js';
import { colorValueToHex, hexToOklch, relativeLuminance } from './utils/oklch.js';
import type {
  TokenInput,
  TokenOverridesInput,
  ProcessedInput,
  ProcessedRamp,
  ProcessedStep,
  ProcessedTheme,
  ProcessedSurface,
  ProcessedSemantic,
  ContextOverrideInput,
  StackClass,
  ColorValue,
  PrimitivesInput,
  W3CColorGroup,
  W3CColorToken,
} from './types.js';

function isW3CColorGroup(val: unknown): val is W3CColorGroup {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && (val as Record<string, unknown>)['$type'] === 'color';
}

function isW3CColorToken(val: unknown): val is W3CColorToken {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && '$value' in (val as Record<string, unknown>);
}

/**
 * Normalizes a W3C Design Tokens color group into an ordered array of color values.
 * Step keys can be any valid token name — numeric keys like "0", "50", "100" are
 * sorted numerically; non-numeric keys like "light", "medium", "dark" preserve
 * JSON insertion order. If the group mixes numeric and non-numeric keys, all
 * entries use insertion order.
 */
function normalizeW3CColorGroup(group: W3CColorGroup): (string | ColorValue)[] {
  const raw: [string, string | ColorValue][] = [];
  for (const [key, val] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    if (isW3CColorToken(val)) {
      raw.push([key, val.$value]);
    }
  }

  const allNumeric = raw.every(([k]) => !Number.isNaN(Number(k)));
  if (allNumeric) {
    raw.sort((a, b) => Number(a[0]) - Number(b[0]));
  }

  return raw.map(([, v]) => v);
}

/**
 * Normalizes primitives from either the legacy array format or W3C Design Tokens
 * group format into the canonical Record<string, (string | ColorValue)[]> shape.
 */
export function normalizePrimitives(primitives: PrimitivesInput): Record<string, (string | ColorValue)[]> {
  const result: Record<string, (string | ColorValue)[]> = {};
  for (const [rampName, rampValue] of Object.entries(primitives)) {
    if (rampName.startsWith('$')) continue;
    if (Array.isArray(rampValue)) {
      result[rampName] = rampValue;
    } else if (isW3CColorGroup(rampValue)) {
      result[rampName] = normalizeW3CColorGroup(rampValue);
    }
  }
  return result;
}

export function processInput(input: TokenInput, overrides?: TokenOverridesInput): ProcessedInput {
  // 0. Normalize W3C primitives to internal array format
  const normalizedPrimitives = normalizePrimitives(input.primitives);
  const normalizedInput: TokenInput = { ...input, primitives: normalizedPrimitives };

  // 1. Validate schema — throw on errors
  const validation = validateSchema(normalizedInput as unknown);
  if (!validation.valid) {
    throw new Error(`Invalid token input:\n${validation.errors.join('\n')}`);
  }

  const warnings: string[] = [];

  // 2. Build ProcessedRamp for each primitive (ColorValue → hex → OKLCH)
  const ramps = new Map<string, ProcessedRamp>();
  for (const [rampName, colorValues] of Object.entries(normalizedPrimitives)) {
    const steps: ProcessedStep[] = colorValues.map((cv, index) => {
      const hex = colorValueToHex(cv);
      return {
        index,
        hex,
        oklch: hexToOklch(hex),
        relativeLuminance: relativeLuminance(hex),
      };
    });

    // Warn if luminance is not monotonically ordered
    let monotonic = true;
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1];
      const curr = steps[i];
      if (prev !== undefined && curr !== undefined) {
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

  // 3. Resolve config + stacks (must happen before themes)
  const inputConfig = input.config ?? {};
  const themeKeys = Object.keys(input.themes);
  const firstTheme = themeKeys[0] ?? '';

  const inputStacks = inputConfig.stacks ?? {};
  // 'root' at offset 0 is always implicit — users never need to declare it.
  // Stack definitions are a design decision — the library does not presume any named levels.
  const resolvedStackEntries: [string, number][] = [
    ['root', 0],
    ...Object.entries(inputStacks)
      .filter(([k]) => k !== 'root')
      .map(([k, v]): [string, number] => [k, v ?? 0]),
  ];

  const stacks = new Map<StackClass, number>(resolvedStackEntries);

  const config = {
    wcagTarget: inputConfig.wcagTarget ?? 'AA' as const,
    complianceEngine: inputConfig.complianceEngine ?? 'wcag21' as const,
    onUnresolvedOverride: inputConfig.onUnresolvedOverride ?? 'error' as const,
    defaultTheme: inputConfig.defaultTheme ?? firstTheme,
    stepSelectionStrategy: inputConfig.stepSelectionStrategy ?? 'closest' as const,
    cvd: inputConfig.cvd,
  };

  if (!firstTheme) {
    warnings.push('No themes defined — defaultTheme will be empty string');
  } else if (!inputConfig.defaultTheme) {
    warnings.push(`defaultTheme not set — using first theme key "${firstTheme}" (JSON key order dependent)`);
  }

  // 4. Build ProcessedTheme for each theme (uses resolved stacks)
  const themes = new Map<string, ProcessedTheme>();
  for (const [bgName, bgInput] of Object.entries(input.themes)) {
    const ramp = ramps.get(bgInput.ramp);
    if (!ramp) {
      throw new Error(`Theme "${bgName}" references unknown ramp "${bgInput.ramp}"`);
    }
    const step = ramp.steps[bgInput.step];
    if (!step) {
      throw new Error(`Theme "${bgName}" step ${bgInput.step} is out of bounds`);
    }

    // Determine elevation direction: steps above midpoint are dark → go lighter
    const mid = (ramp.steps.length - 1) / 2;
    const elevationDirection: 'lighter' | 'darker' = bgInput.step > mid ? 'lighter' : 'darker';
    const stepDelta = elevationDirection === 'darker' ? +1 : -1;

    // Pre-compute surface for each stack level
    const surfaces = new Map<StackClass, { step: number; hex: string; relativeLuminance: number }>();
    for (const [stackName, offset] of stacks) {
      const surfaceStep = Math.max(0, Math.min(ramp.steps.length - 1, bgInput.step + stepDelta * offset));
      const surfaceStepData = ramp.steps[surfaceStep]!;
      surfaces.set(stackName, {
        step: surfaceStep,
        hex: surfaceStepData.hex,
        relativeLuminance: surfaceStepData.relativeLuminance,
      });
    }

    themes.set(bgName, {
      name: bgName,
      ramp: bgInput.ramp,
      step: bgInput.step,
      hex: step.hex,
      relativeLuminance: step.relativeLuminance,
      fallback: bgInput.fallback ?? [],
      aliases: bgInput.aliases ?? [],
      elevationDirection,
      surfaces,
    });
  }

  // 5. Build ProcessedSurface for each surface
  const processedSurfaces = new Map<string, ProcessedSurface>();
  for (const [name, s] of Object.entries(input.surfaces ?? {})) {
    const ramp = ramps.get(s.ramp);
    if (!ramp) {
      throw new Error(`Surface "${name}" references unknown ramp "${s.ramp}"`);
    }
    const step = ramp.steps[s.step];
    if (!step) {
      throw new Error(`Surface "${name}" step ${s.step} out of bounds`);
    }

    // Resolve per-theme step overrides
    const themeOverrides = new Map<string, { step: number; hex: string; relativeLuminance: number }>();
    for (const [themeName, override] of Object.entries(s.themes ?? {})) {
      const overrideStep = ramp.steps[override.step];
      if (!overrideStep) {
        throw new Error(`Surface "${name}" theme "${themeName}" step ${override.step} out of bounds`);
      }
      themeOverrides.set(themeName, {
        step: override.step,
        hex: overrideStep.hex,
        relativeLuminance: overrideStep.relativeLuminance,
      });
    }

    // Resolve interaction states
    const interactions: Record<string, { step: number; hex: string; relativeLuminance: number }> = {};
    for (const [stateName, state] of Object.entries(s.interactions ?? {})) {
      const stateStep = ramp.steps[state.step];
      if (!stateStep) {
        throw new Error(`Surface "${name}" interaction "${stateName}" step ${state.step} out of bounds`);
      }
      interactions[stateName] = {
        step: state.step,
        hex: stateStep.hex,
        relativeLuminance: stateStep.relativeLuminance,
      };
    }

    processedSurfaces.set(name, {
      name,
      ramp: s.ramp,
      step: s.step,
      hex: step.hex,
      relativeLuminance: step.relativeLuminance,
      themeOverrides,
      interactions,
      visionOverrides: new Map(),
      surfaceTokens: new Map(),
      themeSurfaceTokens: new Map(),
    });
  }

  // 6. Build ProcessedSemantic for each semantic (foreground + nonText)
  const semantics = new Map<string, ProcessedSemantic>();

  function processSemanticsSection(
    entries: Record<string, import('./types.js').SemanticInput>,
    complianceTarget: 'text' | 'ui-component',
  ): void {
    for (const [tokenName, semInput] of Object.entries(entries)) {
      if (semantics.has(tokenName)) {
        throw new Error(`Token "${tokenName}" appears in both foreground and nonText sections`);
      }

      const ramp = ramps.get(semInput.ramp);
      if (!ramp) {
        throw new Error(`Semantic "${tokenName}" references unknown ramp "${semInput.ramp}"`);
      }

      // Resolve defaultStep: use provided value or fall back to ramp midpoint
      const resolvedDefaultStep = semInput.defaultStep !== undefined
        ? semInput.defaultStep
        : Math.floor(ramp.steps.length / 2);

      // Decorative tokens are WCAG-exempt — override compliance target regardless of section
      const resolvedComplianceTarget: 'text' | 'ui-component' | 'decorative' =
        semInput.decorative ? 'decorative' : complianceTarget;

      const resolvedFontWeight = semInput.fontWeight ?? 400;

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

      semantics.set(tokenName, {
        name: tokenName,
        ramp,
        defaultStep: resolvedDefaultStep,
        fontWeight: resolvedFontWeight,
        complianceTarget: resolvedComplianceTarget,
        overrides: semInput.overrides ?? [],
        interactions,
      });
    }
  }

  processSemanticsSection(input.foreground, 'text');
  processSemanticsSection(input.nonText ?? {}, 'ui-component');

  // 7. Apply token overrides (post-processing fine-tuning layer)
  if (overrides?.tokenOverrides) {
    for (const [tokenName, entry] of Object.entries(overrides.tokenOverrides)) {
      const sem = semantics.get(tokenName);
      if (!sem) continue; // Unknown token — silently skip (design asset may lead main config)

      if (entry.decorative === true) {
        sem.complianceTarget = 'decorative';
      }
      if (entry.defaultStep !== undefined) {
        sem.defaultStep = entry.defaultStep;
      }

      // Convert themes/stacks shorthand into ContextOverrideInput entries (appended)
      const extraOverrides: ContextOverrideInput[] = [];
      if (entry.themes) {
        for (const [themeName, themeOverride] of Object.entries(entry.themes)) {
          extraOverrides.push({ bg: themeName, step: themeOverride.step });
        }
      }
      if (entry.stacks) {
        for (const [stackName, step] of Object.entries(entry.stacks)) {
          extraOverrides.push({ stack: stackName, step });
        }
      }

      // Explicit overrides array replaces; themes/stacks shorthand appends
      if (entry.overrides !== undefined) {
        sem.overrides = [...entry.overrides, ...extraOverrides];
      } else if (extraOverrides.length > 0) {
        sem.overrides = [...sem.overrides, ...extraOverrides];
      }

      // Merge interactions (replace existing states, keep unmentioned states)
      if (entry.interactions) {
        for (const [stateName, stateInput] of Object.entries(entry.interactions)) {
          sem.interactions[stateName] = {
            step: stateInput.step,
            overrides: stateInput.overrides ?? sem.interactions[stateName]?.overrides ?? [],
          };
        }
      }
    }
  }

  return { ramps, themes, surfaces: processedSurfaces, semantics, stacks, config };
}
