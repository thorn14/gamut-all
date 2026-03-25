import type { ProcessedInput } from './types.js';

/**
 * Generates a CSS block of ramp primitive custom properties.
 *
 * Output example:
 *   :root {
 *     --violet-0: #f5f0ff;
 *     --violet-1: #ede4ff;
 *     ...
 *   }
 *
 * This output is stable (ramps rarely change) so consumers can cache it
 * separately from the compliance-aware tokens.css.
 */
export function generatePrimitivesCSS(processed: ProcessedInput): string {
  const lines: string[] = [':root {'];

  for (const [rampName, ramp] of processed.ramps) {
    for (const step of ramp.steps) {
      lines.push(`  --${rampName}-${step.index}: ${step.hex};`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}
