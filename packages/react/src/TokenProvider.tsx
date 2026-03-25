import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { TokenRegistry, VisionMode } from '@gamut-all/core';
import { TokenContext } from './context.js';
import type { ContrastMode } from './context.js';

const VISION_STORAGE_KEY = 'gamut-vision-mode';
const CONTRAST_STORAGE_KEY = 'gamut-contrast-mode';

function readStorage<T extends string>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return (stored as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable (SSR, private browsing, storage full) — ignore
  }
}

interface TokenProviderProps {
  registry: TokenRegistry;
  defaultVisionMode?: VisionMode;
  /** Default contrast compliance level. Persisted to localStorage. Default: 'AA'. */
  defaultContrastMode?: ContrastMode;
  children: ReactNode;
}

export function TokenProvider({
  registry,
  defaultVisionMode = 'default',
  defaultContrastMode = 'AA',
  children,
}: TokenProviderProps) {
  const [visionMode, setVisionModeState] = useState<VisionMode>(() =>
    readStorage(VISION_STORAGE_KEY, defaultVisionMode),
  );
  const [contrastMode, setContrastModeState] = useState<ContrastMode>(() =>
    readStorage(CONTRAST_STORAGE_KEY, defaultContrastMode),
  );

  const setVisionMode = (mode: VisionMode) => {
    writeStorage(VISION_STORAGE_KEY, mode);
    setVisionModeState(mode);
  };

  const setContrastMode = (mode: ContrastMode) => {
    writeStorage(CONTRAST_STORAGE_KEY, mode);
    setContrastModeState(mode);
  };

  // Apply data-contrast="more" on <html> when AAA is active.
  // This matches [data-contrast="more"] selectors in tokens-aaa.css.
  useEffect(() => {
    if (contrastMode === 'AAA') {
      document.documentElement.setAttribute('data-contrast', 'more');
    } else {
      document.documentElement.removeAttribute('data-contrast');
    }
  }, [contrastMode]);

  const firstBg = registry.themes.keys().next().value as string | undefined;
  const defaultBg = firstBg ?? '';

  return (
    <div data-vision={visionMode} style={{ display: 'contents' }}>
      <TokenContext.Provider
        value={{ registry, defaultBg, visionMode, setVisionMode, contrastMode, setContrastMode }}
      >
        {children}
      </TokenContext.Provider>
    </div>
  );
}
