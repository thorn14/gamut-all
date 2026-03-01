import { relativeLuminance } from '../utils/oklch.js';
import type { ComplianceEngine, ComplianceEvaluation, ComplianceContext } from '../types.js';

// APCA 0.0.98G-4g — https://github.com/Myndex/apca-w3

const Ythr = 0.022;
const Yc = 1.414;

export function softClamp(Y: number): number {
  return Y >= Ythr ? Y : Y + (Ythr - Y) ** Yc;
}

function getRequired(fontSizePx: number, level: 'AA' | 'AAA'): number {
  if (fontSizePx < 14) return level === 'AAA' ? 90 : 75;
  if (fontSizePx < 24) return level === 'AAA' ? 75 : 60;
  return level === 'AAA' ? 60 : 45;
}

export const apca: ComplianceEngine = {
  id: 'apca',

  evaluate(fgHex: string, bgHex: string, context: ComplianceContext): ComplianceEvaluation {
    if (context.target === 'decorative') {
      return { pass: true, metric: 'wcag-exempt', value: 0, required: 0 };
    }
    const txtY = softClamp(relativeLuminance(fgHex));
    const bgY = softClamp(relativeLuminance(bgHex));
    const required = context.target === 'ui-component'
      ? (context.level === 'AAA' ? 45 : 30)  // APCA guidance for non-text — size-independent
      : getRequired(context.fontSizePx, context.level);

    let Sapc: number;
    let polarity: 'dark-on-light' | 'light-on-dark';
    let lc: number;

    if (bgY > txtY) {
      // Dark text on light background
      Sapc = (bgY ** 0.56 - txtY ** 0.57) * 1.14;
      polarity = 'dark-on-light';
      if (Math.abs(Sapc) < 0.001) Sapc = 0;
      lc = Sapc > 0.027 ? (Sapc - 0.027) * 100 : 0;
    } else {
      // Light text on dark background
      Sapc = (bgY ** 0.65 - txtY ** 0.62) * 1.14;
      polarity = 'light-on-dark';
      if (Math.abs(Sapc) < 0.001) Sapc = 0;
      lc = Sapc < -0.027 ? (Sapc + 0.027) * 100 : 0;
    }

    const value = Math.abs(lc);

    return {
      pass: value >= required,
      metric: 'apca-lc',
      value,
      required,
      polarity,
    };
  },

  preferredDirection(bgHex: string): 'lighter' | 'darker' | 'either' {
    return relativeLuminance(bgHex) > 0.5 ? 'darker' : 'lighter';
  },
};
