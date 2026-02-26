import type { TokenInput } from './types.js';

interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isValidHex(s: string): boolean {
  return HEX_RE.test(s);
}

export function validateSchema(input: unknown): SchemaValidationResult {
  const errors: string[] = [];

  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: ['Input must be an object'] };
  }

  const obj = input as Record<string, unknown>;

  // ── primitives ──────────────────────────────────────────────────────────────
  if (!obj['primitives'] || typeof obj['primitives'] !== 'object' || Array.isArray(obj['primitives'])) {
    errors.push('primitives must be an object');
  } else {
    const primitives = obj['primitives'] as Record<string, unknown>;
    for (const [rampName, steps] of Object.entries(primitives)) {
      if (!Array.isArray(steps)) {
        errors.push(`primitives.${rampName} must be an array`);
      } else {
        steps.forEach((step, i) => {
          if (typeof step !== 'string' || !isValidHex(step)) {
            errors.push(`primitives.${rampName}[${i}] must be a valid hex color (got ${String(step)})`);
          }
        });
      }
    }
  }

  // ── backgrounds ─────────────────────────────────────────────────────────────
  if (!obj['backgrounds'] || typeof obj['backgrounds'] !== 'object' || Array.isArray(obj['backgrounds'])) {
    errors.push('backgrounds must be an object');
  } else {
    const backgrounds = obj['backgrounds'] as Record<string, unknown>;
    const primitives = (typeof obj['primitives'] === 'object' && obj['primitives'] !== null && !Array.isArray(obj['primitives']))
      ? obj['primitives'] as Record<string, unknown>
      : {};

    for (const [bgName, bgVal] of Object.entries(backgrounds)) {
      if (typeof bgVal !== 'object' || bgVal === null || Array.isArray(bgVal)) {
        errors.push(`backgrounds.${bgName} must be an object`);
        continue;
      }
      const bg = bgVal as Record<string, unknown>;
      if (typeof bg['ramp'] !== 'string') {
        errors.push(`backgrounds.${bgName}.ramp must be a string`);
      } else {
        const rampSteps = primitives[bg['ramp']];
        if (!rampSteps) {
          errors.push(`backgrounds.${bgName}.ramp references unknown ramp "${bg['ramp']}"`);
        } else if (Array.isArray(rampSteps)) {
          if (typeof bg['step'] !== 'number' || !Number.isInteger(bg['step']) || bg['step'] < 0 || bg['step'] >= rampSteps.length) {
            errors.push(`backgrounds.${bgName}.step ${String(bg['step'])} is out of bounds for ramp "${bg['ramp']}" (length ${rampSteps.length})`);
          }
        }
      }
    }
  }

  // ── semantics ───────────────────────────────────────────────────────────────
  if (!obj['semantics'] || typeof obj['semantics'] !== 'object' || Array.isArray(obj['semantics'])) {
    errors.push('semantics must be an object');
  } else {
    const semantics = obj['semantics'] as Record<string, unknown>;
    const primitives = (typeof obj['primitives'] === 'object' && obj['primitives'] !== null && !Array.isArray(obj['primitives']))
      ? obj['primitives'] as Record<string, unknown>
      : {};
    const backgrounds = (typeof obj['backgrounds'] === 'object' && obj['backgrounds'] !== null && !Array.isArray(obj['backgrounds']))
      ? obj['backgrounds'] as Record<string, unknown>
      : {};

    for (const [tokenName, semVal] of Object.entries(semantics)) {
      if (typeof semVal !== 'object' || semVal === null || Array.isArray(semVal)) {
        errors.push(`semantics.${tokenName} must be an object`);
        continue;
      }
      const sem = semVal as Record<string, unknown>;

      if (typeof sem['ramp'] !== 'string') {
        errors.push(`semantics.${tokenName}.ramp must be a string`);
      } else {
        const rampSteps = primitives[sem['ramp']];
        if (!rampSteps) {
          errors.push(`semantics.${tokenName}.ramp references unknown ramp "${sem['ramp']}"`);
        } else if (Array.isArray(rampSteps)) {
          if (typeof sem['defaultStep'] !== 'number' || !Number.isInteger(sem['defaultStep']) || sem['defaultStep'] < 0 || sem['defaultStep'] >= rampSteps.length) {
            errors.push(`semantics.${tokenName}.defaultStep ${String(sem['defaultStep'])} is out of bounds for ramp "${sem['ramp']}" (length ${rampSteps.length})`);
          }

          // overrides
          if (sem['overrides'] !== undefined) {
            if (!Array.isArray(sem['overrides'])) {
              errors.push(`semantics.${tokenName}.overrides must be an array`);
            } else {
              sem['overrides'].forEach((ov: unknown, i: number) => {
                validateOverride(ov, `semantics.${tokenName}.overrides[${i}]`, rampSteps.length, backgrounds, errors);
              });
            }
          }

          // interactions
          if (sem['interactions'] !== undefined) {
            if (typeof sem['interactions'] !== 'object' || sem['interactions'] === null || Array.isArray(sem['interactions'])) {
              errors.push(`semantics.${tokenName}.interactions must be an object`);
            } else {
              const interactions = sem['interactions'] as Record<string, unknown>;
              for (const [stateName, stateVal] of Object.entries(interactions)) {
                if (typeof stateVal !== 'object' || stateVal === null || Array.isArray(stateVal)) {
                  errors.push(`semantics.${tokenName}.interactions.${stateName} must be an object`);
                  continue;
                }
                const state = stateVal as Record<string, unknown>;
                if (typeof state['step'] !== 'number' || !Number.isInteger(state['step']) || state['step'] < 0 || state['step'] >= rampSteps.length) {
                  errors.push(`semantics.${tokenName}.interactions.${stateName}.step ${String(state['step'])} is out of bounds`);
                }
                if (state['overrides'] !== undefined && Array.isArray(state['overrides'])) {
                  state['overrides'].forEach((ov: unknown, i: number) => {
                    validateOverride(ov, `semantics.${tokenName}.interactions.${stateName}.overrides[${i}]`, rampSteps.length, backgrounds, errors);
                  });
                }
              }
            }
          }

          // vision
          if (sem['vision'] !== undefined) {
            if (typeof sem['vision'] !== 'object' || sem['vision'] === null || Array.isArray(sem['vision'])) {
              errors.push(`semantics.${tokenName}.vision must be an object`);
            } else {
              const vision = sem['vision'] as Record<string, unknown>;
              for (const [visionMode, visionVal] of Object.entries(vision)) {
                if (typeof visionVal !== 'object' || visionVal === null || Array.isArray(visionVal)) {
                  errors.push(`semantics.${tokenName}.vision.${visionMode} must be an object`);
                  continue;
                }
                const v = visionVal as Record<string, unknown>;
                let visionRampSteps: unknown[] = rampSteps;
                if (v['ramp'] !== undefined) {
                  if (typeof v['ramp'] !== 'string') {
                    errors.push(`semantics.${tokenName}.vision.${visionMode}.ramp must be a string`);
                  } else {
                    const vRamp = primitives[v['ramp']];
                    if (!vRamp) {
                      errors.push(`semantics.${tokenName}.vision.${visionMode}.ramp references unknown ramp "${v['ramp']}"`);
                    } else if (Array.isArray(vRamp)) {
                      visionRampSteps = vRamp;
                    }
                  }
                }
                if (v['defaultStep'] !== undefined) {
                  if (typeof v['defaultStep'] !== 'number' || !Number.isInteger(v['defaultStep']) || v['defaultStep'] < 0 || v['defaultStep'] >= visionRampSteps.length) {
                    errors.push(`semantics.${tokenName}.vision.${visionMode}.defaultStep ${String(v['defaultStep'])} is out of bounds`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // ── config ──────────────────────────────────────────────────────────────────
  if (obj['config'] !== undefined) {
    if (typeof obj['config'] !== 'object' || obj['config'] === null || Array.isArray(obj['config'])) {
      errors.push('config must be an object');
    } else {
      const config = obj['config'] as Record<string, unknown>;
      const backgrounds = (typeof obj['backgrounds'] === 'object' && obj['backgrounds'] !== null && !Array.isArray(obj['backgrounds']))
        ? obj['backgrounds'] as Record<string, unknown>
        : {};

      if (config['defaultBg'] !== undefined) {
        if (typeof config['defaultBg'] !== 'string') {
          errors.push('config.defaultBg must be a string');
        } else if (!backgrounds[config['defaultBg']]) {
          errors.push(`config.defaultBg "${config['defaultBg']}" is not a key in backgrounds`);
        }
      }

      if (config['stepSelectionStrategy'] !== undefined) {
        if (typeof config['stepSelectionStrategy'] !== 'string') {
          errors.push('config.stepSelectionStrategy must be a string');
        } else if (config['stepSelectionStrategy'] !== 'closest' && config['stepSelectionStrategy'] !== 'mirror-closest') {
          errors.push('config.stepSelectionStrategy must be one of: closest, mirror-closest');
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateOverride(
  ov: unknown,
  path: string,
  rampLength: number,
  backgrounds: Record<string, unknown>,
  errors: string[],
): void {
  if (typeof ov !== 'object' || ov === null || Array.isArray(ov)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const o = ov as Record<string, unknown>;
  if (typeof o['step'] !== 'number' || !Number.isInteger(o['step']) || o['step'] < 0 || o['step'] >= rampLength) {
    errors.push(`${path}.step ${String(o['step'])} is out of bounds (ramp length ${rampLength})`);
  }
  if (o['bg'] !== undefined) {
    const bgs = Array.isArray(o['bg']) ? o['bg'] : [o['bg']];
    for (const bg of bgs) {
      if (typeof bg === 'string' && !backgrounds[bg]) {
        errors.push(`${path}.bg references unknown background "${bg}"`);
      }
    }
  }
}

export function validateInput(input: TokenInput): SchemaValidationResult {
  return validateSchema(input as unknown);
}
