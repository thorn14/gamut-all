import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { buildRegistry, processInput, wcag21, apca } from '@gamut-all/core';
import type { TokenInput, TokenRegistry, ComplianceEngine } from '@gamut-all/core';
import tokensRaw from '../tokens.json';
import primitivesRaw from '../primitives.json';
import './app.css';
import './generated/tokens.css';
import App from './App';

// Resolve $primitives at runtime (vite plugin does this at build time;
// here we merge manually so processInput receives a complete TokenInput).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { $schema: _ps, ...primitivesData } = primitivesRaw;
const tokenInput = {
  ...tokensRaw,
  primitives: { ...primitivesData, ...(tokensRaw as Record<string, unknown> & { primitives?: Record<string, unknown> }).primitives },
} as unknown as TokenInput;

type ContrastTarget = 'AA' | 'AAA';

function buildRegistryFor(wcagTarget: ContrastTarget, engine: ComplianceEngine): TokenRegistry {
  const input: TokenInput = {
    ...tokenInput,
    config: { ...tokenInput.config, wcagTarget },
  };
  return buildRegistry(processInput(input), engine);
}

const registries = {
  wcag: { AA: buildRegistryFor('AA', wcag21), AAA: buildRegistryFor('AAA', wcag21) },
  apca: { AA: buildRegistryFor('AA', apca),   AAA: buildRegistryFor('AAA', apca)  },
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App registries={registries} />
  </StrictMode>,
);
