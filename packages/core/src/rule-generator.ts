import type {
  ProcessedRamp,
  ProcessedBackground,
  ComplianceEngine,
  FontSizeClass,
  StackClass,
  ContextRule,
  ContextOverrideInput,
} from './types.js';

// ── findClosestPassingStep ───────────────────────────────────────────────────

export function findClosestPassingStep(
  ramp: ProcessedRamp,
  preferredStep: number,
  passes: (candidateHex: string) => boolean,
  direction: 'lighter' | 'darker' | 'either',
): number | null {
  const step = ramp.steps[preferredStep];
  if (step && passes(step.hex)) return preferredStep;

  if (direction === 'darker') {
    // Search toward higher indices (darker)
    for (let i = preferredStep + 1; i < ramp.steps.length; i++) {
      const s = ramp.steps[i];
      if (s && passes(s.hex)) return i;
    }
    return null;
  }

  if (direction === 'lighter') {
    // Search toward lower indices (lighter)
    for (let i = preferredStep - 1; i >= 0; i--) {
      const s = ramp.steps[i];
      if (s && passes(s.hex)) return i;
    }
    return null;
  }

  // 'either' — search both directions, return closer
  let darkerResult: number | null = null;
  let lighterResult: number | null = null;

  for (let i = preferredStep + 1; i < ramp.steps.length; i++) {
    const s = ramp.steps[i];
    if (s && passes(s.hex)) { darkerResult = i; break; }
  }
  for (let i = preferredStep - 1; i >= 0; i--) {
    const s = ramp.steps[i];
    if (s && passes(s.hex)) { lighterResult = i; break; }
  }

  if (darkerResult === null) return lighterResult;
  if (lighterResult === null) return darkerResult;

  const darkerDist = darkerResult - preferredStep;
  const lighterDist = preferredStep - lighterResult;
  return darkerDist <= lighterDist ? darkerResult : lighterResult;
}

// ── deduplicateRules ─────────────────────────────────────────────────────────

function deduplicateRules(rules: ContextRule[]): ContextRule[] {
  const map = new Map<string, ContextRule>();
  for (const rule of rules) {
    const key = `${rule.bg}__${rule.fontSize}__${rule.stack}`;
    map.set(key, rule); // last-write wins
  }
  return Array.from(map.values());
}

// ── autoGenerateRules ────────────────────────────────────────────────────────

export function autoGenerateRules(
  tokenRamp: ProcessedRamp,
  defaultStep: number,
  backgrounds: Map<string, ProcessedBackground>,
  compliance: ComplianceEngine,
  fontSizes: FontSizeClass[],
  stacks: StackClass[],
): ContextRule[] {
  // v1: only emit stack='root' entries — all stacks produce identical rules
  // (compliance is bgHex-dependent only)
  void stacks; // accepted but only 'root' entries are emitted

  const rules: ContextRule[] = [];

  for (const [bgName, bg] of backgrounds) {
    for (const fontSize of fontSizes) {
      const context = {
        fontSizePx: parseInt(fontSize, 10),
        fontWeight: 400,
        target: 'text' as const,
        level: 'AA' as const,
      };

      const baseStep = tokenRamp.steps[defaultStep];
      if (!baseStep) continue;

      const baseEval = compliance.evaluate(baseStep.hex, bg.hex, context);
      if (baseEval.pass) continue;

      const searchDirection =
        compliance.preferredDirection?.(bg.hex) ??
        (bg.relativeLuminance > 0.5 ? 'darker' : 'lighter');

      const passingStep = findClosestPassingStep(
        tokenRamp,
        defaultStep,
        (candidateHex) => compliance.evaluate(candidateHex, bg.hex, context).pass,
        searchDirection,
      );

      if (passingStep !== null && passingStep !== defaultStep) {
        const rule: ContextRule = { bg: bgName, fontSize, stack: 'root', step: passingStep };
        rules.push(rule);
      }
    }
  }

  return deduplicateRules(rules);
}

// ── expandOverride ───────────────────────────────────────────────────────────

export function expandOverride(
  override: ContextOverrideInput,
  allBgs: string[],
  allFontSizes: FontSizeClass[],
  allStacks: StackClass[],
): ContextRule[] {
  const bgs: string[] = override.bg === undefined
    ? allBgs
    : Array.isArray(override.bg) ? override.bg : [override.bg];

  const fontSizes: FontSizeClass[] = override.fontSize === undefined
    ? allFontSizes
    : Array.isArray(override.fontSize) ? override.fontSize as FontSizeClass[] : [override.fontSize as FontSizeClass];

  const stacks: StackClass[] = override.stack === undefined
    ? allStacks
    : Array.isArray(override.stack) ? override.stack as StackClass[] : [override.stack as StackClass];

  const rules: ContextRule[] = [];
  for (const bg of bgs) {
    for (const fontSize of fontSizes) {
      for (const stack of stacks) {
        rules.push({ bg, fontSize, stack, step: override.step });
      }
    }
  }
  return rules;
}

// ── patchWithOverrides ───────────────────────────────────────────────────────

function overrideSpecificity(override: ContextOverrideInput): number {
  let count = 0;
  if (override.bg !== undefined) count++;
  if (override.fontSize !== undefined) count++;
  if (override.stack !== undefined) count++;
  return count;
}

export function patchWithOverrides(
  autoRules: ContextRule[],
  overrides: ContextOverrideInput[],
  allBgs: string[],
  allFontSizes: FontSizeClass[],
  allStacks: StackClass[],
): Map<string, number> {
  // Seed map from autoRules
  const map = new Map<string, number>();
  for (const rule of autoRules) {
    const key = `${rule.bg}__${rule.fontSize}__${rule.stack}`;
    map.set(key, rule.step);
  }

  // Sort overrides: ascending specificity, ties by declaration index (so higher-spec + later wins)
  const indexed = overrides.map((ov, i) => ({ ov, i }));
  indexed.sort((a, b) => {
    const specA = overrideSpecificity(a.ov);
    const specB = overrideSpecificity(b.ov);
    if (specA !== specB) return specA - specB;
    return a.i - b.i;
  });

  // Apply each override
  for (const { ov } of indexed) {
    const expanded = expandOverride(ov, allBgs, allFontSizes, allStacks);
    for (const rule of expanded) {
      const key = `${rule.bg}__${rule.fontSize}__${rule.stack}`;
      map.set(key, rule.step);
    }
  }

  return map;
}
