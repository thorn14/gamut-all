import type { FontSizeClass } from '@gamut-all/core';

const BREAKPOINTS: number[] = [12, 14, 16, 20, 24, 32];
const CLASSES: FontSizeClass[] = ['12px', '14px', '16px', '20px', '24px', '32px'];

export function bucketFontSize(px: number): FontSizeClass {
  if (px < 12) return '12px';
  if (px >= 32) return '32px';
  for (let i = BREAKPOINTS.length - 1; i >= 0; i--) {
    if (px >= (BREAKPOINTS[i] ?? 0)) return CLASSES[i] ?? '12px';
  }
  return '12px';
}

export function readFontSize(el: Element): FontSizeClass {
  const computed = window.getComputedStyle(el).fontSize;
  const px = parseFloat(computed);
  return isNaN(px) ? '16px' : bucketFontSize(px);
}
