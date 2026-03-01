import type { DesignContext, VisionMode } from '@gamut-all/core';
import { readFontSize } from './dom/font-size.js';
import { readTheme } from './dom/background.js';
import { readStack } from './dom/stack.js';

export function detectContext(
  el: Element,
  defaultBg: string,
  visionMode: VisionMode,
  devMode: boolean = false,
): DesignContext {
  const bg = readTheme(el);
  if (bg === null && devMode) {
    console.warn(
      `[gamut-all] No data-theme attribute found for element or its ancestors. ` +
      `Falling back to defaultBg="${defaultBg}". Add data-theme to your layout root.`
    );
  }
  return {
    fontSize: readFontSize(el),
    bgClass: bg ?? defaultBg,
    stackDepth: readStack(el),
    visionMode,
  };
}

export function shallowEqual(a: DesignContext, b: DesignContext): boolean {
  return (
    a.fontSize === b.fontSize &&
    a.bgClass === b.bgClass &&
    a.stackDepth === b.stackDepth &&
    a.visionMode === b.visionMode
  );
}
