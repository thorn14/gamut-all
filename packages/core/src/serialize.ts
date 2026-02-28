import type { TokenRegistry, VariantKey, ResolvedVariant, ProcessedRamp, ProcessedTheme, ProcessedSurface } from './types.js';

// ── djb2 hash — avoids node:crypto dependency ────────────────────────────────

export function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) + hash) ^ char;
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16);
}

// ── Serialized shapes ────────────────────────────────────────────────────────

interface SerializedRamp {
  name: string;
  steps: Array<{ index: number; hex: string; oklch: { l: number; c: number; h: number }; relativeLuminance: number }>;
  stepCount: number;
}

interface SerializedTheme {
  name: string;
  ramp: string;
  step: number;
  hex: string;
  relativeLuminance: number;
  fallback: string[];
  aliases: string[];
  elevationDirection: 'lighter' | 'darker';
  surfaces: [string, { step: number; hex: string; relativeLuminance: number }][];
}

interface SerializedSurface {
  name: string;
  ramp: string;
  step: number;
  hex: string;
  relativeLuminance: number;
}

interface SerializedVariant {
  ramp: string;
  step: number;
  hex: string;
  compliance: {
    pass: boolean;
    metric: string;
    value: number;
    required?: number;
    polarity?: 'dark-on-light' | 'light-on-dark';
  };
}

export interface SerializedRegistry {
  version: 2;
  meta: TokenRegistry['meta'];
  ramps: [string, SerializedRamp][];
  themes: [string, SerializedTheme][];
  themeFallbacks: Record<string, string[]>;
  surfaces: [string, SerializedSurface][];
  variantMap: [string, SerializedVariant][];
  defaults: Record<string, string>;
}

// ── serializeRegistry ────────────────────────────────────────────────────────

export function serializeRegistry(registry: TokenRegistry): SerializedRegistry {
  const ramps: [string, SerializedRamp][] = Array.from(registry.ramps.entries()).map(
    ([key, ramp]) => [key, {
      name: ramp.name,
      steps: ramp.steps.map(s => ({
        index: s.index,
        hex: s.hex,
        oklch: s.oklch,
        relativeLuminance: s.relativeLuminance,
      })),
      stepCount: ramp.stepCount,
    }]
  );

  const themes: [string, SerializedTheme][] = Array.from(registry.themes.entries()).map(
    ([key, bg]) => [key, {
      name: bg.name,
      ramp: bg.ramp,
      step: bg.step,
      hex: bg.hex,
      relativeLuminance: bg.relativeLuminance,
      fallback: bg.fallback,
      aliases: bg.aliases,
      elevationDirection: bg.elevationDirection,
      surfaces: Array.from(bg.surfaces.entries()).map(([stack, surface]) => [stack, {
        step: surface.step,
        hex: surface.hex,
        relativeLuminance: surface.relativeLuminance,
      }]),
    }]
  );

  const surfaces: [string, SerializedSurface][] = Array.from(registry.surfaces.entries()).map(
    ([key, surface]) => [key, {
      name: surface.name,
      ramp: surface.ramp,
      step: surface.step,
      hex: surface.hex,
      relativeLuminance: surface.relativeLuminance,
    }]
  );

  const variantMap: [string, SerializedVariant][] = Array.from(registry.variantMap.entries()).map(
    ([key, variant]) => [key, {
      ramp: variant.ramp,
      step: variant.step,
      hex: variant.hex,
      compliance: variant.compliance,
    }]
  );

  return {
    version: 2,
    meta: registry.meta,
    ramps,
    themes,
    themeFallbacks: registry.themeFallbacks,
    surfaces,
    variantMap,
    defaults: registry.defaults,
  };
}

// ── deserializeRegistry ──────────────────────────────────────────────────────

export function deserializeRegistry(serialized: SerializedRegistry): TokenRegistry {
  const ramps = new Map<string, ProcessedRamp>(
    serialized.ramps.map(([key, ramp]) => [key, {
      name: ramp.name,
      steps: ramp.steps,
      stepCount: ramp.stepCount,
    }])
  );

  const themes = new Map<string, ProcessedTheme>(
    serialized.themes.map(([key, bg]) => [key, {
      ...bg,
      surfaces: new Map(bg.surfaces),
    }])
  );

  const surfaces = new Map<string, ProcessedSurface>(
    serialized.surfaces.map(([key, surface]) => [key, surface])
  );

  const variantMap = new Map<VariantKey, ResolvedVariant>(
    serialized.variantMap.map(([key, variant]) => [key as VariantKey, variant])
  );

  return {
    ramps,
    themes,
    themeFallbacks: serialized.themeFallbacks,
    surfaces,
    variantMap,
    defaults: serialized.defaults,
    meta: serialized.meta,
  };
}
