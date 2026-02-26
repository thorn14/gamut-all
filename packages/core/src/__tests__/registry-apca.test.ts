import { describe, it, expect } from 'vitest';
import { buildRegistry } from '../registry.js';
import { processInput } from '../processor.js';
import { apca } from '../compliance/apca.js';
import { wcag21 } from '../compliance/wcag21.js';
import type { TokenInput } from '../types.js';

const input: TokenInput = {
  primitives: {
    neutral: [
      '#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4',
      '#a3a3a3', '#737373', '#525252', '#404040',
      '#262626', '#171717',
    ],
    blue: [
      '#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd',
      '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8',
      '#1e40af', '#1e3a8a',
    ],
    orange: [
      '#fff7ed', '#ffedd5', '#fed7aa', '#fdba74',
      '#fb923c', '#f97316', '#ea580c', '#c2410c',
      '#9a3412', '#7c2d12',
    ],
  },
  backgrounds: {
    white: { ramp: 'neutral', step: 0, fallback: ['dark'] },
    dark:  { ramp: 'neutral', step: 8, fallback: ['white'] },
  },
  semantics: {
    fgPrimary: { ramp: 'neutral', defaultStep: 8 },
    fgError: {
      ramp: 'neutral',
      defaultStep: 6,
      vision: {
        deuteranopia: { ramp: 'orange', defaultStep: 7 },
        protanopia:   { ramp: 'orange', defaultStep: 7 },
      },
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

  it('all auto-generated variants pass compliance', () => {
    for (const [key, variant] of registry.variantMap) {
      expect(variant.compliance.pass).toBe(true);
    }
  });

  it('produces vision-mode variants for deuteranopia', () => {
    let found = false;
    for (const key of registry.variantMap.keys()) {
      if (key.includes('__deuteranopia')) { found = true; break; }
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

  it('vision variant uses different hex than default for fgError', () => {
    const defaultKey = 'fgError__16px__white__root__default';
    const deuterKey  = 'fgError__16px__white__root__deuteranopia';
    const def = registry.variantMap.get(defaultKey as Parameters<typeof registry.variantMap.get>[0]);
    const deut = registry.variantMap.get(deuterKey as Parameters<typeof registry.variantMap.get>[0]);
    if (def && deut) {
      expect(deut.hex).not.toBe(def.hex);
    }
  });

  it('apca engine is a drop-in: wcag21 and apca registries share same key structure', () => {
    const wcagRegistry = buildRegistry(processed, wcag21);
    // Same variant keys
    const apcaKeys = new Set(registry.variantMap.keys());
    const wcagKeys = new Set(wcagRegistry.variantMap.keys());
    expect(apcaKeys.size).toBe(wcagKeys.size);
    for (const key of wcagKeys) {
      expect(apcaKeys.has(key)).toBe(true);
    }
  });
});
