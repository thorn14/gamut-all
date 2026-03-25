import { buildRegistry } from './registry.js';
import { generateCSS } from './css.js';
import { generatePrimitivesCSS } from './primitives-css.js';
import { buildContrastOverridesCSS } from './contrast-overrides.js';
import type { ProcessedInput, TokenRegistry, ComplianceEngine } from './types.js';

// ── Pipeline types ────────────────────────────────────────────────────────────

export interface PipelineContext {
  processed: ProcessedInput;
  compliance: ComplianceEngine;
}

export interface PipelineResult {
  registry?: TokenRegistry;
  css?: string;
  /** Named file outputs. Keys are relative file names, values are file content. */
  files: Record<string, string>;
  meta?: Record<string, unknown>;
}

export type PipelineStage = (
  ctx: PipelineContext,
  result: PipelineResult,
) => PipelineResult | Promise<PipelineResult>;

// ── Built-in stages ───────────────────────────────────────────────────────────

/** Builds the compliance registry. Must run before CSS stages. */
export const buildRegistryStage: PipelineStage = (ctx, result) => {
  const registry = buildRegistry(ctx.processed, ctx.compliance);
  return { ...result, registry };
};

/** Emits tokens.css (full baseline). Requires buildRegistryStage. */
export const generateCSSStage: PipelineStage = (_ctx, result) => {
  if (!result.registry) throw new Error('generateCSSStage requires buildRegistryStage to run first');
  const css = generateCSS(result.registry);
  return { ...result, css, files: { ...result.files, 'tokens.css': css } };
};

/** Emits primitives.css (stable ramp values). */
export const generatePrimitivesCSSStage: PipelineStage = (ctx, result) => {
  const css = generatePrimitivesCSS(ctx.processed);
  return { ...result, files: { ...result.files, 'primitives.css': css } };
};

/** Default stage set for a single AA compliance target. */
export const defaultStages: PipelineStage[] = [
  buildRegistryStage,
  generateCSSStage,
  generatePrimitivesCSSStage,
];

// ── createPipeline ────────────────────────────────────────────────────────────

/**
 * Composes an array of pipeline stages into a single function.
 *
 * Consumers can insert custom stages (e.g. brand token injection, name
 * conventions) without forking the library:
 *
 * ```ts
 * const run = createPipeline([
 *   buildRegistryStage,
 *   myBrandInjectionStage,
 *   generateCSSStage,
 *   generatePrimitivesCSSStage,
 * ]);
 * const result = await run(processed, wcag21);
 * ```
 */
export function createPipeline(
  stages: PipelineStage[],
): (processed: ProcessedInput, compliance: ComplianceEngine) => Promise<PipelineResult> {
  return async (processed, compliance) => {
    const ctx: PipelineContext = { processed, compliance };
    let result: PipelineResult = { files: {} };
    for (const stage of stages) {
      result = await stage(ctx, result);
    }
    return result;
  };
}

// ── Re-export stage helpers ───────────────────────────────────────────────────

export { buildContrastOverridesCSS };
