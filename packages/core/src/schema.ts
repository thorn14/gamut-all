import type { TokenInput, ColorSpace } from './types.js';

interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const VALID_COLOR_SPACES: ColorSpace[] = [
  'srgb', 'srgb-linear', 'hsl', 'hwb', 'lab', 'lch',
  'oklab', 'oklch', 'display-p3', 'a98-rgb', 'prophoto-rgb',
  'rec2020', 'xyz-d65', 'xyz-d50',
];

function validateW3CAnnotations(obj: Record<string, unknown>, path: string, errors: string[]): void {
  if (obj['$description'] !== undefined && typeof obj['$description'] !== 'string') {
    errors.push(`${path}.$description must be a string`);
  }
  if (obj['$deprecated'] !== undefined && typeof obj['$deprecated'] !== 'boolean' && typeof obj['$deprecated'] !== 'string') {
    errors.push(`${path}.$deprecated must be a boolean or string`);
  }
  if (obj['$extensions'] !== undefined && (typeof obj['$extensions'] !== 'object' || obj['$extensions'] === null || Array.isArray(obj['$extensions']))) {
    errors.push(`${path}.$extensions must be an object`);
  }
}

function isValidColorValue(val: unknown, path: string, errors: string[]): boolean {
  // Plain hex string shorthand — accepted as backward-compatible convenience
  if (typeof val === 'string') {
    if (!HEX_RE.test(val)) {
      errors.push(`${path} must be a valid hex color string or ColorValue object (got "${val}")`);
      return false;
    }
    return true;
  }

  if (typeof val !== 'object' || val === null || Array.isArray(val)) {
    errors.push(`${path} must be a hex color string or ColorValue object`);
    return false;
  }
  const cv = val as Record<string, unknown>;

  if (typeof cv['colorSpace'] !== 'string' || !VALID_COLOR_SPACES.includes(cv['colorSpace'] as ColorSpace)) {
    errors.push(`${path}.colorSpace must be one of: ${VALID_COLOR_SPACES.join(', ')}`);
    return false;
  }

  if (!Array.isArray(cv['components']) || cv['components'].length !== 3) {
    errors.push(`${path}.components must be an array of exactly 3 elements`);
    return false;
  }
  for (let j = 0; j < cv['components'].length; j++) {
    const c = cv['components'][j];
    if (typeof c !== 'number' && c !== 'none') {
      errors.push(`${path}.components[${j}] must be a number or "none"`);
    }
  }

  if (cv['alpha'] !== undefined) {
    if (typeof cv['alpha'] !== 'number' || cv['alpha'] < 0 || cv['alpha'] > 1) {
      errors.push(`${path}.alpha must be a number between 0 and 1`);
    }
  }

  if (cv['hex'] !== undefined) {
    if (typeof cv['hex'] !== 'string' || !HEX_RE.test(cv['hex'])) {
      errors.push(`${path}.hex must be a valid hex color string`);
    }
  }

  return true;
}

export function validateSchema(input: unknown): SchemaValidationResult {
  const errors: string[] = [];

  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: ['Input must be an object'] };
  }

  const obj = input as Record<string, unknown>;

  // ── top-level W3C annotations ────────────────────────────────────────────────
  validateW3CAnnotations(obj, 'root', errors);
  if (obj['$version'] !== undefined && typeof obj['$version'] !== 'string') {
    errors.push('$version must be a string');
  }

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
          isValidColorValue(step, `primitives.${rampName}[${i}]`, errors);
        });
      }
    }
  }

  // ── themes ──────────────────────────────────────────────────────────────────
  if (!obj['themes'] || typeof obj['themes'] !== 'object' || Array.isArray(obj['themes'])) {
    errors.push('themes must be an object');
  } else {
    const themes = obj['themes'] as Record<string, unknown>;
    const primitives = (typeof obj['primitives'] === 'object' && obj['primitives'] !== null && !Array.isArray(obj['primitives']))
      ? obj['primitives'] as Record<string, unknown>
      : {};

    for (const [bgName, bgVal] of Object.entries(themes)) {
      if (typeof bgVal !== 'object' || bgVal === null || Array.isArray(bgVal)) {
        errors.push(`themes.${bgName} must be an object`);
        continue;
      }
      const bg = bgVal as Record<string, unknown>;
      validateW3CAnnotations(bg, `themes.${bgName}`, errors);
      if (typeof bg['ramp'] !== 'string') {
        errors.push(`themes.${bgName}.ramp must be a string`);
      } else {
        const rampSteps = primitives[bg['ramp']];
        if (!rampSteps) {
          errors.push(`themes.${bgName}.ramp references unknown ramp "${bg['ramp']}"`);
        } else if (Array.isArray(rampSteps)) {
          if (typeof bg['step'] !== 'number' || !Number.isInteger(bg['step']) || bg['step'] < 0 || bg['step'] >= rampSteps.length) {
            errors.push(`themes.${bgName}.step ${String(bg['step'])} is out of bounds for ramp "${bg['ramp']}" (length ${rampSteps.length})`);
          }
        }
      }
    }
  }

  // ── surfaces ────────────────────────────────────────────────────────────────
  if (obj['surfaces'] !== undefined) {
    if (typeof obj['surfaces'] !== 'object' || Array.isArray(obj['surfaces'])) {
      errors.push('surfaces must be an object');
    } else {
      const surfaces = obj['surfaces'] as Record<string, unknown>;
      const primitives = (typeof obj['primitives'] === 'object' && obj['primitives'] !== null && !Array.isArray(obj['primitives']))
        ? obj['primitives'] as Record<string, unknown>
        : {};

      for (const [surfaceName, surfaceVal] of Object.entries(surfaces)) {
        if (typeof surfaceVal !== 'object' || surfaceVal === null || Array.isArray(surfaceVal)) {
          errors.push(`surfaces.${surfaceName} must be an object`);
          continue;
        }
        const s = surfaceVal as Record<string, unknown>;
        validateW3CAnnotations(s, `surfaces.${surfaceName}`, errors);

        // Reject theme-only fields
        for (const forbidden of ['fallback', 'tone', 'aliases']) {
          if (s[forbidden] !== undefined) {
            errors.push(`surfaces.${surfaceName} must not have "${forbidden}" (surfaces are fixed hexes, not themes)`);
          }
        }

        if (typeof s['ramp'] !== 'string') {
          errors.push(`surfaces.${surfaceName}.ramp must be a string`);
        } else {
          const rampSteps = primitives[s['ramp']];
          if (!rampSteps) {
            errors.push(`surfaces.${surfaceName}.ramp references unknown ramp "${s['ramp']}"`);
          } else if (Array.isArray(rampSteps)) {
            if (typeof s['step'] !== 'number' || !Number.isInteger(s['step']) || s['step'] < 0 || s['step'] >= rampSteps.length) {
              errors.push(`surfaces.${surfaceName}.step ${String(s['step'])} is out of bounds for ramp "${s['ramp']}" (length ${rampSteps.length})`);
            }
          }
        }
      }
    }
  }

  // ── detect old semantics key ─────────────────────────────────────────────────
  if (obj['semantics'] !== undefined) {
    errors.push('"semantics" is not valid — use "foreground" for text tokens and "nonText" for borders/focus/rings');
  }

  // ── shared semantic section validator ────────────────────────────────────────
  function validateSemanticsSection(
    sectionName: string,
    sectionObj: Record<string, unknown>,
    primitives: Record<string, unknown>,
    themes: Record<string, unknown>,
  ): void {
    for (const [tokenName, semVal] of Object.entries(sectionObj)) {
      if (typeof semVal !== 'object' || semVal === null || Array.isArray(semVal)) {
        errors.push(`${sectionName}.${tokenName} must be an object`);
        continue;
      }
      const sem = semVal as Record<string, unknown>;
      validateW3CAnnotations(sem, `${sectionName}.${tokenName}`, errors);
      if (sem['$type'] !== undefined && typeof sem['$type'] !== 'string') {
        errors.push(`${sectionName}.${tokenName}.$type must be a string`);
      }
      if (sem['decorative'] !== undefined && typeof sem['decorative'] !== 'boolean') {
        errors.push(`${sectionName}.${tokenName}.decorative must be a boolean`);
      }

      if (typeof sem['ramp'] !== 'string') {
        errors.push(`${sectionName}.${tokenName}.ramp must be a string`);
      } else {
        const rampSteps = primitives[sem['ramp']];
        if (!rampSteps) {
          errors.push(`${sectionName}.${tokenName}.ramp references unknown ramp "${sem['ramp']}"`);
        } else if (Array.isArray(rampSteps)) {
          // defaultStep is optional — only validate bounds if provided
          if (sem['defaultStep'] !== undefined) {
            if (typeof sem['defaultStep'] !== 'number' || !Number.isInteger(sem['defaultStep']) || sem['defaultStep'] < 0 || sem['defaultStep'] >= rampSteps.length) {
              errors.push(`${sectionName}.${tokenName}.defaultStep ${String(sem['defaultStep'])} is out of bounds for ramp "${sem['ramp']}" (length ${rampSteps.length})`);
            }
          }

          // overrides
          if (sem['overrides'] !== undefined) {
            if (!Array.isArray(sem['overrides'])) {
              errors.push(`${sectionName}.${tokenName}.overrides must be an array`);
            } else {
              sem['overrides'].forEach((ov: unknown, i: number) => {
                validateOverride(ov, `${sectionName}.${tokenName}.overrides[${i}]`, rampSteps.length, themes, errors);
              });
            }
          }

          // interactions
          if (sem['interactions'] !== undefined) {
            if (typeof sem['interactions'] !== 'object' || sem['interactions'] === null || Array.isArray(sem['interactions'])) {
              errors.push(`${sectionName}.${tokenName}.interactions must be an object`);
            } else {
              const interactions = sem['interactions'] as Record<string, unknown>;
              for (const [stateName, stateVal] of Object.entries(interactions)) {
                if (typeof stateVal !== 'object' || stateVal === null || Array.isArray(stateVal)) {
                  errors.push(`${sectionName}.${tokenName}.interactions.${stateName} must be an object`);
                  continue;
                }
                const state = stateVal as Record<string, unknown>;
                if (typeof state['step'] !== 'number' || !Number.isInteger(state['step']) || state['step'] < 0 || state['step'] >= rampSteps.length) {
                  errors.push(`${sectionName}.${tokenName}.interactions.${stateName}.step ${String(state['step'])} is out of bounds`);
                }
                if (state['overrides'] !== undefined && Array.isArray(state['overrides'])) {
                  state['overrides'].forEach((ov: unknown, i: number) => {
                    validateOverride(ov, `${sectionName}.${tokenName}.interactions.${stateName}.overrides[${i}]`, rampSteps.length, themes, errors);
                  });
                }
              }
            }
          }

        }
      }
    }
  }

  // ── foreground (required) ────────────────────────────────────────────────────
  if (!obj['foreground'] || typeof obj['foreground'] !== 'object' || Array.isArray(obj['foreground'])) {
    errors.push('foreground must be an object');
  } else {
    const primitives = (typeof obj['primitives'] === 'object' && obj['primitives'] !== null && !Array.isArray(obj['primitives']))
      ? obj['primitives'] as Record<string, unknown>
      : {};
    const themes = (typeof obj['themes'] === 'object' && obj['themes'] !== null && !Array.isArray(obj['themes']))
      ? obj['themes'] as Record<string, unknown>
      : {};
    validateSemanticsSection('foreground', obj['foreground'] as Record<string, unknown>, primitives, themes);
  }

  // ── nonText (optional) ───────────────────────────────────────────────────────
  if (obj['nonText'] !== undefined) {
    if (typeof obj['nonText'] !== 'object' || Array.isArray(obj['nonText'])) {
      errors.push('nonText must be an object');
    } else {
      const primitives = (typeof obj['primitives'] === 'object' && obj['primitives'] !== null && !Array.isArray(obj['primitives']))
        ? obj['primitives'] as Record<string, unknown>
        : {};
      const themes = (typeof obj['themes'] === 'object' && obj['themes'] !== null && !Array.isArray(obj['themes']))
        ? obj['themes'] as Record<string, unknown>
        : {};
      validateSemanticsSection('nonText', obj['nonText'] as Record<string, unknown>, primitives, themes);
    }
  }

  // ── config ──────────────────────────────────────────────────────────────────
  if (obj['config'] !== undefined) {
    if (typeof obj['config'] !== 'object' || obj['config'] === null || Array.isArray(obj['config'])) {
      errors.push('config must be an object');
    } else {
      const config = obj['config'] as Record<string, unknown>;
      const themes = (typeof obj['themes'] === 'object' && obj['themes'] !== null && !Array.isArray(obj['themes']))
        ? obj['themes'] as Record<string, unknown>
        : {};

      if (config['defaultTheme'] !== undefined) {
        if (typeof config['defaultTheme'] !== 'string') {
          errors.push('config.defaultTheme must be a string');
        } else if (!themes[config['defaultTheme']]) {
          errors.push(`config.defaultTheme "${config['defaultTheme']}" is not a key in themes`);
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
  themes: Record<string, unknown>,
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
      if (typeof bg === 'string' && !themes[bg]) {
        errors.push(`${path}.bg references unknown theme "${bg}"`);
      }
    }
  }
}

export function validateInput(input: TokenInput): SchemaValidationResult {
  return validateSchema(input as unknown);
}
