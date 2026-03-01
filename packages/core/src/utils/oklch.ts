import type { ColorValue, ColorComponent } from '../types.js';

function componentToNumber(c: ColorComponent): number {
  return c === 'none' ? 0 : c;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function toHex8(v: number): string {
  const byte = Math.round(clamp01(v) * 255);
  return byte.toString(16).padStart(2, '0');
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

function delinearize(x: number): number {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

/**
 * Convert a W3C ColorValue (or plain hex string shorthand) to an sRGB hex string.
 * Supports srgb, srgb-linear, hsl, hwb, display-p3, oklab, oklch,
 * lab, lch, xyz-d65, xyz-d50.
 * Out-of-gamut values are clamped to sRGB.
 */
export function colorValueToHex(cv: string | ColorValue): string {
  if (typeof cv === 'string') return cv;
  if (cv.hex) return cv.hex;

  const [c0, c1, c2] = cv.components;
  const a = componentToNumber(c0);
  const b = componentToNumber(c1);
  const c = componentToNumber(c2);

  let r: number, g: number, bl: number;

  switch (cv.colorSpace) {
    case 'srgb':
      r = a; g = b; bl = c;
      break;
    case 'srgb-linear':
      r = delinearize(a); g = delinearize(b); bl = delinearize(c);
      break;
    case 'hsl': {
      const h = a, s = b / 100, l = c / 100;
      const chroma = (1 - Math.abs(2 * l - 1)) * s;
      const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
      const m = l - chroma / 2;
      let r1 = 0, g1 = 0, b1 = 0;
      if (h < 60)       { r1 = chroma; g1 = x; }
      else if (h < 120) { r1 = x; g1 = chroma; }
      else if (h < 180) { g1 = chroma; b1 = x; }
      else if (h < 240) { g1 = x; b1 = chroma; }
      else if (h < 300) { r1 = x; b1 = chroma; }
      else              { r1 = chroma; b1 = x; }
      r = r1 + m; g = g1 + m; bl = b1 + m;
      break;
    }
    case 'hwb': {
      const hh = a, w = b / 100, bk = c / 100;
      const sum = w + bk;
      const wn = sum > 1 ? w / sum : w;
      const bn = sum > 1 ? bk / sum : bk;
      const hslFromHwb = hslFromHue(hh);
      r = hslFromHwb.r * (1 - wn - bn) + wn;
      g = hslFromHwb.g * (1 - wn - bn) + wn;
      bl = hslFromHwb.b * (1 - wn - bn) + wn;
      break;
    }
    case 'oklab': {
      const rgb = oklabToLinearSrgb(a, b, c);
      r = delinearize(rgb.r); g = delinearize(rgb.g); bl = delinearize(rgb.b);
      break;
    }
    case 'oklch': {
      const L = a, C = b, H = c;
      const aLab = C * Math.cos(H * Math.PI / 180);
      const bLab = C * Math.sin(H * Math.PI / 180);
      const rgb = oklabToLinearSrgb(L, aLab, bLab);
      r = delinearize(rgb.r); g = delinearize(rgb.g); bl = delinearize(rgb.b);
      break;
    }
    case 'display-p3': {
      const lin = { r: linearize(a), g: linearize(b), b: linearize(c) };
      const xyz = p3ToXyzD65(lin.r, lin.g, lin.b);
      const srgbLin = xyzD65ToLinearSrgb(xyz.x, xyz.y, xyz.z);
      r = delinearize(srgbLin.r); g = delinearize(srgbLin.g); bl = delinearize(srgbLin.b);
      break;
    }
    case 'lab': {
      const xyz = labToXyzD50(a, b, c);
      const d65 = xyzD50ToD65(xyz.x, xyz.y, xyz.z);
      const srgbLin = xyzD65ToLinearSrgb(d65.x, d65.y, d65.z);
      r = delinearize(srgbLin.r); g = delinearize(srgbLin.g); bl = delinearize(srgbLin.b);
      break;
    }
    case 'lch': {
      const L = a, C = b, H = c;
      const aLab = C * Math.cos(H * Math.PI / 180);
      const bLab = C * Math.sin(H * Math.PI / 180);
      const xyz = labToXyzD50(L, aLab, bLab);
      const d65 = xyzD50ToD65(xyz.x, xyz.y, xyz.z);
      const srgbLin = xyzD65ToLinearSrgb(d65.x, d65.y, d65.z);
      r = delinearize(srgbLin.r); g = delinearize(srgbLin.g); bl = delinearize(srgbLin.b);
      break;
    }
    case 'xyz-d65': {
      const srgbLin = xyzD65ToLinearSrgb(a, b, c);
      r = delinearize(srgbLin.r); g = delinearize(srgbLin.g); bl = delinearize(srgbLin.b);
      break;
    }
    case 'xyz-d50': {
      const d65 = xyzD50ToD65(a, b, c);
      const srgbLin = xyzD65ToLinearSrgb(d65.x, d65.y, d65.z);
      r = delinearize(srgbLin.r); g = delinearize(srgbLin.g); bl = delinearize(srgbLin.b);
      break;
    }
    default: {
      r = a; g = b; bl = c;
    }
  }

  return `#${toHex8(r)}${toHex8(g)}${toHex8(bl)}`;
}

function hslFromHue(h: number): { r: number; g: number; b: number } {
  const hp = h / 60;
  const x = 1 - Math.abs(hp % 2 - 1);
  if (hp < 1) return { r: 1, g: x, b: 0 };
  if (hp < 2) return { r: x, g: 1, b: 0 };
  if (hp < 3) return { r: 0, g: 1, b: x };
  if (hp < 4) return { r: 0, g: x, b: 1 };
  if (hp < 5) return { r: x, g: 0, b: 1 };
  return { r: 1, g: 0, b: x };
}

function oklabToLinearSrgb(L: number, a: number, bLab: number): { r: number; g: number; b: number } {
  const lms_l_ = L + 0.3963377774 * a + 0.2158037573 * bLab;
  const lms_m_ = L - 0.1055613458 * a - 0.0638541728 * bLab;
  const lms_s_ = L - 0.0894841775 * a - 1.2914855480 * bLab;

  const lms_l = lms_l_ ** 3;
  const lms_m = lms_m_ ** 3;
  const lms_s = lms_s_ ** 3;

  return {
    r:  4.0767416621 * lms_l - 3.3077115913 * lms_m + 0.2309699292 * lms_s,
    g: -1.2684380046 * lms_l + 2.6097574011 * lms_m - 0.3413193965 * lms_s,
    b: -0.0041960863 * lms_l - 0.7034186147 * lms_m + 1.7076147010 * lms_s,
  };
}

function p3ToXyzD65(r: number, g: number, b: number): { x: number; y: number; z: number } {
  return {
    x: 0.4865709 * r + 0.2656677 * g + 0.1982173 * b,
    y: 0.2289746 * r + 0.6917385 * g + 0.0792869 * b,
    z: 0.0000000 * r + 0.0451134 * g + 1.0439444 * b,
  };
}

function xyzD65ToLinearSrgb(x: number, y: number, z: number): { r: number; g: number; b: number } {
  return {
    r:  3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    g: -0.9692660 * x + 1.8760108 * y + 0.0415560 * z,
    b:  0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  };
}

function labToXyzD50(L: number, a: number, b: number): { x: number; y: number; z: number } {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const eps = 216 / 24389;
  const kappa = 24389 / 27;

  const xr = fx ** 3 > eps ? fx ** 3 : (116 * fx - 16) / kappa;
  const yr = L > kappa * eps ? ((L + 16) / 116) ** 3 : L / kappa;
  const zr = fz ** 3 > eps ? fz ** 3 : (116 * fz - 16) / kappa;

  return {
    x: xr * 0.9642,
    y: yr * 1.0000,
    z: zr * 0.8251,
  };
}

function xyzD50ToD65(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return {
    x:  0.9555766 * x - 0.0230393 * y + 0.0631636 * z,
    y: -0.0282895 * x + 1.0099416 * y + 0.0210077 * z,
    z:  0.0122982 * x - 0.0204830 * y + 1.3299098 * z,
  };
}

/**
 * Convert a hex color string to a W3C ColorValue in sRGB color space.
 * Useful for migrating from raw hex strings to the W3C format.
 */
export function hexToColorValue(hex: string): ColorValue {
  const { r, g, b } = hexToRgb(hex);
  return {
    colorSpace: 'srgb',
    components: [
      Math.round(r * 1000) / 1000,
      Math.round(g * 1000) / 1000,
      Math.round(b * 1000) / 1000,
    ],
    hex,
  };
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const R = linearize(r);
  const G = linearize(g);
  const B = linearize(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const { r, g, b } = hexToRgb(hex);
  const R = linearize(r);
  const G = linearize(g);
  const B = linearize(b);

  const X = 0.4124 * R + 0.3576 * G + 0.1805 * B;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = 0.0193 * R + 0.1192 * G + 0.9505 * B;

  const lms_l = 0.8189330101 * X + 0.3618667424 * Y - 0.1288597137 * Z;
  const lms_m = 0.0329845436 * X + 0.9293118715 * Y + 0.0361456387 * Z;
  const lms_s = 0.0482003018 * X + 0.2643662691 * Y + 0.6338517070 * Z;

  const lms_l_ = Math.cbrt(lms_l);
  const lms_m_ = Math.cbrt(lms_m);
  const lms_s_ = Math.cbrt(lms_s);

  const L = 0.2104542553 * lms_l_ + 0.7936177850 * lms_m_ - 0.0040720468 * lms_s_;
  const a = 1.9779984951 * lms_l_ - 2.4285922050 * lms_m_ + 0.4505937099 * lms_s_;
  const bLab = 0.0259040371 * lms_l_ + 0.7827717662 * lms_m_ - 0.8086757660 * lms_s_;

  const C = Math.sqrt(a * a + bLab * bLab);
  let H = Math.atan2(bLab, a) * (180 / Math.PI);
  if (H < 0) H += 360;

  return { l: L, c: C, h: H };
}
