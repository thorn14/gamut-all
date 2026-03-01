import { hexToRgb, linearize, delinearize, hexToOklch, oklabToLinearSrgb, toHex8 } from './oklch.js';

export type CVDType = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

export interface CVDOptions {
  enabled?: boolean;
  confusionThresholdDE?: number;
  distinguishableThresholdDE?: number;
}

// Hunt-Pointer-Estevez XYZ-D65 → LMS
const M_HPE: [number, number, number][] = [
  [ 0.4002,  0.7076, -0.0808],
  [-0.2263,  1.1653,  0.0457],
  [ 0.0000,  0.0000,  0.9182],
];

// Inverse HPE: LMS → XYZ-D65
const M_HPE_INV: [number, number, number][] = [
  [ 1.8600, -1.1295,  0.2199],
  [ 0.3612,  0.6388, -0.0001],
  [ 0.0000,  0.0000,  1.0891],
];

// XYZ-D65 → linear sRGB
const M_XYZ_TO_SRGB: [number, number, number][] = [
  [ 3.2404542, -1.5371385, -0.4985314],
  [-0.9692660,  1.8760108,  0.0415560],
  [ 0.0556434, -0.2040259,  1.0572252],
];

// Deficiency simulation matrices (Viénot 1999 / Brettel 1997)
const DEFICIENCY: Record<Exclude<CVDType, 'achromatopsia'>, [number, number, number][]> = {
  protanopia:   [[ 0,       1.05118, -0.05116],
                 [ 0,       1,        0      ],
                 [ 0,       0,        1      ]],
  deuteranopia: [[ 1,       0,        0      ],
                 [ 0.9513,  0,        0.0487 ],
                 [ 0,       0,        1      ]],
  tritanopia:   [[ 1,       0,        0      ],
                 [ 0,       1,        0      ],
                 [-0.8674,  1.8673,   0      ]],
};

function mat3x3Vec(m: [number, number, number][], v: [number, number, number]): [number, number, number] {
  return [
    m[0]![0] * v[0] + m[0]![1] * v[1] + m[0]![2] * v[2],
    m[1]![0] * v[0] + m[1]![1] * v[1] + m[1]![2] * v[2],
    m[2]![0] * v[0] + m[2]![1] * v[1] + m[2]![2] * v[2],
  ];
}

export function simulateCVD(hex: string, cvdType: CVDType): string {
  if (cvdType === 'achromatopsia') {
    // Chroma → 0 in OKLab (lightness-only)
    const { l } = hexToOklch(hex);
    const { r, g, b } = oklabToLinearSrgb(l, 0, 0);
    return toHex8(delinearize(Math.max(0, Math.min(1, r))), delinearize(Math.max(0, Math.min(1, g))), delinearize(Math.max(0, Math.min(1, b))));
  }

  // 1. hex → linear sRGB
  const { r: rs, g: gs, b: bs } = hexToRgb(hex);
  const linR = linearize(rs);
  const linG = linearize(gs);
  const linB = linearize(bs);

  // 2. linear sRGB → XYZ-D65 (using oklch.ts constants)
  const X = 0.4124564 * linR + 0.3575761 * linG + 0.1804375 * linB;
  const Y = 0.2126729 * linR + 0.7151522 * linG + 0.0721750 * linB;
  const Z = 0.0193339 * linR + 0.1191920 * linG + 0.9503041 * linB;

  // 3. XYZ → LMS_HPE
  const [L, M, S] = mat3x3Vec(M_HPE, [X, Y, Z]);

  // 4. LMS → LMS_CVD via deficiency matrix
  const defMat = DEFICIENCY[cvdType];
  const [Ld, Md, Sd] = mat3x3Vec(defMat, [L!, M!, S!]);

  // 5. LMS_CVD → XYZ via inverse HPE
  const [Xd, Yd, Zd] = mat3x3Vec(M_HPE_INV, [Ld!, Md!, Sd!]);

  // 6. XYZ → linear sRGB, clamp
  const [rLin, gLin, bLin] = mat3x3Vec(M_XYZ_TO_SRGB, [Xd!, Yd!, Zd!]);
  const rC = Math.max(0, Math.min(1, rLin!));
  const gC = Math.max(0, Math.min(1, gLin!));
  const bC = Math.max(0, Math.min(1, bLin!));

  // 7. delinearize → hex
  return toHex8(delinearize(rC), delinearize(gC), delinearize(bC));
}

export function oklabDE(hexA: string, hexB: string): number {
  const a = hexToOklch(hexA);
  const b = hexToOklch(hexB);
  // OKLab: a* = C*cos(H), b* = C*sin(H)
  const aRad = a.h * (Math.PI / 180);
  const bRad = b.h * (Math.PI / 180);
  const aA = a.c * Math.cos(aRad);
  const aB = a.c * Math.sin(aRad);
  const bA = b.c * Math.cos(bRad);
  const bBlab = b.c * Math.sin(bRad);
  const dL = a.l - b.l;
  const dA = aA - bA;
  const dBl = aB - bBlab;
  // Scaled ×100 to match CIELAB-like range (0–100) so thresholds like 5 and 8 make sense
  return 100 * Math.sqrt(dL * dL + dA * dA + dBl * dBl);
}

/**
 * Find the best step from `steps` (compliance-passing) to distinguish `currentHex`
 * from `otherSimHexes` under CVD. `currentHex` is the hex currently in use.
 * Returns the hex of the best step, or null if no meaningful improvement is found.
 */
export function findBestCVDStep(
  steps: Array<{ hex: string }>,
  currentHex: string,
  cvdType: CVDType,
  otherSimHexes: string[],
  opts: Required<CVDOptions>,
): string | null {
  const W1 = 0.7;
  const W2 = 0.3;

  const currentSimHex = simulateCVD(currentHex, cvdType);

  let bestHex: string | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < steps.length; i++) {
    const stepHex = steps[i]?.hex;
    if (!stepHex) continue;

    const simHex = simulateCVD(stepHex, cvdType);

    // Separation from all other simulated tokens
    const minSep = otherSimHexes.length > 0
      ? Math.min(...otherSimHexes.map(other => oklabDE(simHex, other)))
      : opts.distinguishableThresholdDE;

    // Penalty for drifting from current appearance (visual weight preservation)
    const drift = oklabDE(simHex, currentSimHex);

    const score = W1 * minSep - W2 * drift;

    if (score > bestScore) {
      bestScore = score;
      bestHex = stepHex;
    }
  }

  if (bestHex === null) return null;

  // Only return if it's meaningfully better than staying at the current hex
  const currentSep = otherSimHexes.length > 0
    ? Math.min(...otherSimHexes.map(other => oklabDE(currentSimHex, other)))
    : opts.distinguishableThresholdDE;
  const currentScore = W1 * currentSep; // drift from itself = 0

  if (bestScore - currentScore < 0.5) return null;
  if (bestHex === currentHex) return null;
  return bestHex;
}
