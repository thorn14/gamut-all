import type { TokenInput, SemanticInput, BackgroundInput } from './types.js';

function cloneInput(input: TokenInput): TokenInput {
  return JSON.parse(JSON.stringify(input)) as TokenInput;
}

function mergeSemanticToneOverride(
  semantic: SemanticInput,
  toneOverride: NonNullable<SemanticInput['tone']>[string],
): SemanticInput {
  return {
    ...semantic,
    ramp: toneOverride.ramp ?? semantic.ramp,
    defaultStep: toneOverride.defaultStep ?? semantic.defaultStep,
    overrides: [
      ...(semantic.overrides ?? []),
      ...(toneOverride.overrides ?? []),
    ],
  };
}

function mergeBackgroundToneOverride(
  background: BackgroundInput,
  toneOverride: NonNullable<BackgroundInput['tone']>[string],
): BackgroundInput {
  return {
    ...background,
    ramp: toneOverride.ramp ?? background.ramp,
    step: toneOverride.step ?? background.step,
    fallback: toneOverride.fallback ?? background.fallback,
    aliases: toneOverride.aliases ?? background.aliases,
  };
}

/**
 * Applies a semantic tone profile declared in token schema.
 * Tone overrides are optional and only affect semantics that define them.
 */
export function applyToneMode(input: TokenInput, toneMode: string): TokenInput {
  const next = cloneInput(input);
  if (!toneMode || toneMode === 'default') return next;

  for (const [bgName, background] of Object.entries(next.backgrounds)) {
    const toneOverride = background.tone?.[toneMode];
    if (!toneOverride) continue;
    next.backgrounds[bgName] = mergeBackgroundToneOverride(background, toneOverride);
  }

  for (const [tokenName, semantic] of Object.entries(next.semantics)) {
    const toneOverride = semantic.tone?.[toneMode];
    if (!toneOverride) continue;
    next.semantics[tokenName] = mergeSemanticToneOverride(semantic, toneOverride);
  }

  return next;
}
