import { createContext, useContext } from 'react';
import type { TokenRegistry, VisionMode } from '@gamut-all/core';

export interface TokenContextValue {
  registry: TokenRegistry;
  defaultBg: string;
  visionMode: VisionMode;
  setVisionMode: (mode: VisionMode) => void;
}

export const TokenContext = createContext<TokenContextValue | null>(null);

export function useTokenContextValue(): TokenContextValue {
  const ctx = useContext(TokenContext);
  if (!ctx) throw new Error('useTokenContextValue must be used within <TokenProvider>');
  return ctx;
}
