import { relativeLuminance } from '../utils/oklch.js';
import { contrastRatio } from '../utils/contrast.js';
import type { ComplianceEngine, ComplianceEvaluation, ComplianceContext } from '../types.js';

// Large text threshold (fontWeight fixed at 400 in v1): >= 24px
// AA: normal 4.5:1, large 3:1 | AAA: normal 7:1, large 4.5:1
export const wcag21: ComplianceEngine = {
  id: 'wcag21',

  evaluate(fgHex: string, bgHex: string, context: ComplianceContext): ComplianceEvaluation {
    if (context.target === 'decorative') {
      return { pass: true, metric: 'wcag-exempt', value: 0, required: 0 };
    }
    const fgL = relativeLuminance(fgHex);
    const bgL = relativeLuminance(bgHex);
    const ratio = contrastRatio(fgL, bgL);
    // Bold threshold deferred — fontWeight fixed at 400 in v1
    const isLargeText = context.fontSizePx >= 24;
    const required =
      context.target === 'ui-component'
        ? (context.level === 'AAA' ? 4.5 : 3)   // SC 1.4.11 — size-independent
        : context.level === 'AAA'
          ? (isLargeText ? 4.5 : 7)              // SC 1.4.3 AAA
          : (isLargeText ? 3 : 4.5);             // SC 1.4.3 AA
    return {
      pass: ratio >= required,
      metric: 'wcag21-ratio',
      value: ratio,
      required,
      polarity: fgL < bgL ? 'dark-on-light' : 'light-on-dark',
    };
  },

  preferredDirection(bgHex: string): 'lighter' | 'darker' | 'either' {
    return relativeLuminance(bgHex) > 0.5 ? 'darker' : 'lighter';
  },
};
