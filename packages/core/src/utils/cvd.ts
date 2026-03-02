import { hexToRgb, linearize, delinearize, hexToOklch, oklabToLinearSrgb, toHex8 } from './oklch.js';

export type CVDType =
  | 'protanopia'    | 'protanomaly'
  | 'deuteranopia'  | 'deuteranomaly'
  | 'tritanopia'    | 'tritanomaly'
  | 'achromatopsia' | 'blueConeMonochromacy';

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

// Partial severity for anomalous trichromacy (60% toward full dichromacy).
const ANOMALY_SEVERITY = 0.6;

// Deficiency simulation matrices (Viénot 1999 / Brettel 1997) — dichromacy types only.
const DEFICIENCY: Record<'protanopia' | 'deuteranopia' | 'tritanopia', [number, number, number][]> = {
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
    // Rod monochromacy: chroma → 0 in OKLab (perceptual luminance only).
    const { l } = hexToOklch(hex);
    const { r, g, b } = oklabToLinearSrgb(l, 0, 0);
    return toHex8(delinearize(Math.max(0, Math.min(1, r))), delinearize(Math.max(0, Math.min(1, g))), delinearize(Math.max(0, Math.min(1, b))));
  }

  if (cvdType === 'blueConeMonochromacy') {
    // S-cone (blue) monochromacy: luminance weighted toward blue channel.
    // Weights approximate the S-cone relative spectral sensitivity contribution.
    const { r, g, b } = hexToRgb(hex);
    const Y = 0.0182 * linearize(r) + 0.1055 * linearize(g) + 0.8763 * linearize(b);
    const v = delinearize(Math.max(0, Math.min(1, Y)));
    return toHex8(v, v, v);
  }

  if (cvdType === 'protanomaly' || cvdType === 'deuteranomaly' || cvdType === 'tritanomaly') {
    // Anomalous trichromacy: blend original with full dichromacy in linear sRGB.
    const dichromacyType = (cvdType.replace('omaly', 'opia')) as 'protanopia' | 'deuteranopia' | 'tritanopia';
    const dichromacyHex = simulateCVD(hex, dichromacyType);
    const { r: or, g: og, b: ob } = hexToRgb(hex);
    const { r: dr, g: dg, b: db } = hexToRgb(dichromacyHex);
    const linOr = linearize(or), linOg = linearize(og), linOb = linearize(ob);
    const linDr = linearize(dr), linDg = linearize(dg), linDb = linearize(db);
    return toHex8(
      delinearize(Math.max(0, Math.min(1, linOr + (linDr - linOr) * ANOMALY_SEVERITY))),
      delinearize(Math.max(0, Math.min(1, linOg + (linDg - linOg) * ANOMALY_SEVERITY))),
      delinearize(Math.max(0, Math.min(1, linOb + (linDb - linOb) * ANOMALY_SEVERITY))),
    );
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

  // 4. LMS → LMS_CVD via deficiency matrix (only dichromacy types reach here)
  const defMat = DEFICIENCY[cvdType as 'protanopia' | 'deuteranopia' | 'tritanopia'];
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
 * Hue-only OKLab distance: measures only the chroma (a*,b*) components.
 * Unlike oklabDE, ignores lightness — so two colors that differ only in lightness
 * score near 0. Use this for detecting hue confusion under CVD, where two colors
 * with different luminance can still look like the same hue to a CVD observer.
 */
export function oklabHueDE(hexA: string, hexB: string): number {
  const a = hexToOklch(hexA);
  const b = hexToOklch(hexB);
  const aRad = a.h * (Math.PI / 180);
  const bRad = b.h * (Math.PI / 180);
  const aA = a.c * Math.cos(aRad);
  const aB = a.c * Math.sin(aRad);
  const bA = b.c * Math.cos(bRad);
  const bBlab = b.c * Math.sin(bRad);
  return 100 * Math.sqrt((aA - bA) ** 2 + (aB - bBlab) ** 2);
}

/**
 * Rotate the hue of a color to `targetHue` degrees in OKLCH space,
 * preserving the original perceived lightness (L) and using the maximum
 * in-gamut chroma at that L + targetHue via binary-search gamut clipping.
 */
export function shiftHueToTarget(hex: string, targetHue: number): string {
  const { l, c } = hexToOklch(hex);
  const hRad = targetHue * (Math.PI / 180);

  const tryChroma = (chroma: number): [number, number, number] | null => {
    const a = chroma * Math.cos(hRad);
    const b = chroma * Math.sin(hRad);
    const lin = oklabToLinearSrgb(l, a, b);
    if (lin.r >= -0.0001 && lin.r <= 1.0001 &&
        lin.g >= -0.0001 && lin.g <= 1.0001 &&
        lin.b >= -0.0001 && lin.b <= 1.0001) {
      return [
        delinearize(Math.max(0, Math.min(1, lin.r))),
        delinearize(Math.max(0, Math.min(1, lin.g))),
        delinearize(Math.max(0, Math.min(1, lin.b))),
      ];
    }
    return null;
  };

  // Fast path: original chroma is in gamut at the new hue.
  const full = tryChroma(c);
  if (full !== null) return toHex8(full[0], full[1], full[2]);

  // Binary search for max in-gamut chroma at this L+hue (16 iters ≈ 1/65536 precision).
  let lo = 0, hi = c;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (tryChroma(mid) !== null) lo = mid; else hi = mid;
  }
  const result = tryChroma(lo);
  if (result !== null) return toHex8(result[0], result[1], result[2]);

  // Achromatic fallback (unreachable for any valid L, but safe).
  const lin = oklabToLinearSrgb(l, 0, 0);
  return toHex8(
    delinearize(Math.max(0, Math.min(1, lin.r))),
    delinearize(Math.max(0, Math.min(1, lin.g))),
    delinearize(Math.max(0, Math.min(1, lin.b))),
  );
}

