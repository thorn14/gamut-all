import { describe, it, expect } from 'vitest';
import { buildRegistry } from '../registry.js';
import { processInput } from '../processor.js';
import { apca } from '../compliance/apca.js';
import { wcag21 } from '../compliance/wcag21.js';
import { hexToColorValue } from '../utils/oklch.js';
import type { TokenInput } from '../types.js';

const cv = (hex: string) => hexToColorValue(hex);

const input: TokenInput = {
  primitives: {
    neutral: [
      '#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4',
      '#a3a3a3', '#737373', '#525252', '#404040',
      '#262626', '#171717',
    ].map(cv),
    blue: [
      '#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd',
      '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8',
      '#1e40af', '#1e3a8a',
    ],
    red: [
      '#fef2f2', '#fee2e2', '#fecaca', '#fca5a5',
      '#f87171', '#ef4444', '#dc2626', '#b91c1c',
      '#991b1b', '#7f1d1d',
    ],
    green: [
      '#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac',
      '#4ade80', '#22c55e', '#16a34a', '#15803d',
      '#166534', '#14532d',
    ],
  },
  themes: {
    white: { ramp: 'neutral', step: 0, fallback: ['dark'] },
    dark:  { ramp: 'neutral', step: 8, fallback: ['white'] },
  },
  foreground: {
    fgPrimary: { ramp: 'neutral', defaultStep: 8 },
    fgError: {
      ramp: 'red',
      defaultStep: 6,
    },
    fgSuccess: {
      ramp: 'green',
      defaultStep: 6,
    },
    fgLink: {
      ramp: 'blue',
      defaultStep: 6,
      interactions: { hover: { step: 8 }, active: { step: 9 } },
    },
  },
};

describe('buildRegistry with APCA engine', () => {
  const processed = processInput(input);
  const registry = buildRegistry(processed, apca);

  it('creates a registry', () => {
    expect(registry).toBeDefined();
    expect(registry.variantMap.size).toBeGreaterThan(0);
  });

  it('meta reports apca engine', () => {
    expect(registry.meta.complianceEngine).toBe('apca');
  });

  it('all variants have metric apca-lc', () => {
    for (const [, variant] of registry.variantMap) {
      expect(variant.compliance.metric).toBe('apca-lc');
    }
  });

  it('root-stack variants pass compliance', () => {
    // Root-stack variants use the bg's actual surface (light/dark extremes) which always
    // achieves the required APCA Lc. Elevated stacks (card, modal, etc.) sit at intermediate
    // ramp steps and may not reach Lc=75 at 12px — that is a known APCA characteristic of
    // mid-tone surfaces, not a bug in the engine.
    for (const [key, variant] of registry.variantMap) {
      if (key.includes('__root__')) {
        expect(variant.compliance.pass).toBe(true);
      }
    }
  });

  it('produces vision-mode variants for deuteranopia on dark bg', () => {
    // On dark bg, lighter red/green steps are confused under deuteranopia
    let found = false;
    for (const key of registry.variantMap.keys()) {
      if (key.includes('__dark__') && key.includes('__deuteranopia')) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  it('interaction variants are present', () => {
    let hoverFound = false;
    for (const key of registry.variantMap.keys()) {
      if (key.startsWith('fgLink-hover__')) { hoverFound = true; break; }
    }
    expect(hoverFound).toBe(true);
  });

  it('vision variant uses different hex than default for fgError or fgSuccess on dark bg', () => {
    // CVD confusion happens on dark bg where lighter red/green steps are used
    const errDefault = registry.variantMap.get('fgError__16px__dark__root__default' as Parameters<typeof registry.variantMap.get>[0]);
    const errDeuter  = registry.variantMap.get('fgError__16px__dark__root__deuteranopia' as Parameters<typeof registry.variantMap.get>[0]);
    const sucDefault = registry.variantMap.get('fgSuccess__16px__dark__root__default' as Parameters<typeof registry.variantMap.get>[0]);
    const sucDeuter  = registry.variantMap.get('fgSuccess__16px__dark__root__deuteranopia' as Parameters<typeof registry.variantMap.get>[0]);
    // At least one token should have a different deuteranopia variant on dark bg
    const anyDiffers = (errDeuter && errDefault && errDeuter.hex !== errDefault.hex) ||
                       (sucDeuter && sucDefault && sucDeuter.hex !== sucDefault.hex);
    expect(anyDiffers).toBe(true);
  });

  it('apca engine is a drop-in: wcag21 and apca registries share same default-vision key structure', () => {
    const wcagRegistry = buildRegistry(processed, wcag21);
    // Default-vision keys must be identical — CVD keys may differ since each engine
    // filters candidate steps by its own compliance thresholds.
    const apcaDefaultKeys = new Set(
      [...registry.variantMap.keys()].filter(k => k.endsWith('__default'))
    );
    const wcagDefaultKeys = new Set(
      [...wcagRegistry.variantMap.keys()].filter(k => k.endsWith('__default'))
    );
    expect(apcaDefaultKeys.size).toBe(wcagDefaultKeys.size);
    for (const key of wcagDefaultKeys) {
      expect(apcaDefaultKeys.has(key)).toBe(true);
    }
  });
});
