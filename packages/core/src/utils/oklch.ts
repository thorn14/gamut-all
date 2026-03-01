// Pure functions — no imports required.

export function delinearize(x: number): number {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

export function oklabToLinearSrgb(L: number, a: number, b: number): { r: number; g: number; b: number } {
  // OKLab M2 inverse: OKLab → LMS (cube-root space)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  // Cube
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // M1 inverse: LMS → linear sRGB (Björn Ottosson)
  return {
    r:  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

export function toHex8(r: number, g: number, b: number): string {
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
  const h2 = (n: number) => clamp(n).toString(16).padStart(2, '0');
  return `#${h2(r)}${h2(g)}${h2(b)}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  let r: number, g: number, b: number;

  if (clean.length === 3) {
    const r1 = clean[0] ?? '0';
    const g1 = clean[1] ?? '0';
    const b1 = clean[2] ?? '0';
    r = parseInt(r1 + r1, 16) / 255;
    g = parseInt(g1 + g1, 16) / 255;
    b = parseInt(b1 + b1, 16) / 255;
  } else {
    r = parseInt(clean.slice(0, 2), 16) / 255;
    g = parseInt(clean.slice(2, 4), 16) / 255;
    b = parseInt(clean.slice(4, 6), 16) / 255;
  }

  return { r, g, b };
}

export function linearize(x: number): number {
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const R = linearize(r);
  const G = linearize(g);
  const B = linearize(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  // Step 1: hex → linear sRGB
  const { r, g, b } = hexToRgb(hex);
  const R = linearize(r);
  const G = linearize(g);
  const B = linearize(b);

  // Step 2: linear sRGB → XYZ D65
  const X = 0.4124 * R + 0.3576 * G + 0.1805 * B;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = 0.0193 * R + 0.1192 * G + 0.9505 * B;

  // Step 3: XYZ → OKLab (Björn Ottosson)
  // M1: XYZ → LMS cone response
  const lms_l = 0.8189330101 * X + 0.3618667424 * Y - 0.1288597137 * Z;
  const lms_m = 0.0329845436 * X + 0.9293118715 * Y + 0.0361456387 * Z;
  const lms_s = 0.0482003018 * X + 0.2643662691 * Y + 0.6338517070 * Z;

  // Apply cube root
  const lms_l_ = Math.cbrt(lms_l);
  const lms_m_ = Math.cbrt(lms_m);
  const lms_s_ = Math.cbrt(lms_s);

  // M2: LMS → OKLab
  const L = 0.2104542553 * lms_l_ + 0.7936177850 * lms_m_ - 0.0040720468 * lms_s_;
  const a = 1.9779984951 * lms_l_ - 2.4285922050 * lms_m_ + 0.4505937099 * lms_s_;
  const bLab = 0.0259040371 * lms_l_ + 0.7827717662 * lms_m_ - 0.8086757660 * lms_s_;

  // Step 4: OKLab → OKLCH
  const C = Math.sqrt(a * a + bLab * bLab);
  let H = Math.atan2(bLab, a) * (180 / Math.PI);
  if (H < 0) H += 360;

  return { l: L, c: C, h: H };
}
