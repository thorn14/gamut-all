import { useState } from 'react';
import type { ReactNode } from 'react';
import type { TokenRegistry, VisionMode } from '@gamut-all/core';
import { TokenContext } from './context.js';

interface TokenProviderProps {
  registry: TokenRegistry;
  defaultVisionMode?: VisionMode;
  children: ReactNode;
}

export function TokenProvider({ registry, defaultVisionMode = 'default', children }: TokenProviderProps) {
  const [visionMode, setVisionMode] = useState<VisionMode>(defaultVisionMode);

  const firstBg = registry.backgrounds.keys().next().value as string | undefined;
  const defaultBg = firstBg ?? '';

  return (
    <div data-vision={visionMode} style={{ display: 'contents' }}>
      <TokenContext.Provider value={{ registry, defaultBg, visionMode, setVisionMode }}>
        {children}
      </TokenContext.Provider>
    </div>
  );
}
