# @gamut-all/core

Zero-dependency TypeScript library for contextual design token resolution. Tokens are evaluated against backgrounds, elevation stacks, font sizes, and vision modes — with automatic WCAG/APCA compliance correction and CVD simulation built in.

## Installation

```sh
npm install @gamut-all/core
```

## Quick start

```ts
import { processInput, buildRegistry, wcag21, generateCSS } from '@gamut-all/core';
import type { TokenInput } from '@gamut-all/core';

const input: TokenInput = {
  config: { wcagTarget: 'AA', complianceEngine: 'wcag21' },
  primitives: {
    slate: ['#f8fafc', '#f1f5f9', /* ... */, '#0f172a'],
    blue:  ['#eff6ff', '#dbeafe', /* ... */, '#1e3a8a'],
  },
  themes: {
    light: { ramp: 'slate', step: 0 },
    dark:  { ramp: 'slate', step: 9, fallback: ['light'] },
  },
  surfaces: {
    bgDanger: { ramp: 'red', step: 1 },
  },
  foreground: {
    fgPrimary: { ramp: 'slate', defaultStep: 9 },
    fgDanger:  { ramp: 'red',  defaultStep: 5 },
  },
  nonText: {
    borderMain: { ramp: 'slate', defaultStep: 4 },
  },
};

const processed = processInput(input);
const registry  = buildRegistry(processed, wcag21);
const css       = generateCSS(registry);
```

## Vite plugin

The plugin generates `tokens.ts`, `tokens.css`, and `token-types.d.ts` at build time from a JSON config file.

```ts
// vite.config.ts
import { designTokensPlugin } from '@gamut-all/core/vite';

export default {
  plugins: [
    designTokensPlugin({ input: './tokens.json' }),
  ],
};
```

Generated files:
- **`tokens.ts`** — a serialised `TokenRegistry` object for the configured engine/level
- **`tokens.css`** — CSS custom properties for all contexts
- **`token-types.d.ts`** — TypeScript types for all token names

## Core API

### `processInput(input)`

Validates the input schema and converts all primitive color values to OKLCH. Returns a `ProcessedInput` ready for registry construction.

### `buildRegistry(processed, engine)`

Builds the full variant map — one entry per `(token, theme, fontSize, stack, visionMode)` combination. Automatically:

- Corrects non-compliant default steps using `autoGenerateRules()`
- Generates CVD variants via `autoCVDVariants()` and `autoCVDSurfaces()`
- Builds surface utility tokens for every stack elevation

### `generateCSS(registry)`

Returns a CSS string with blocks for `:root`, `[data-theme]`, `[data-theme] [data-stack]`, `[data-theme] [data-vision]`, and surface color utilities.

### `resolveToken(token, context, registry)`

Resolves a single token to a hex string using a 5-step fallback chain: exact match → default vision → stack relaxation → theme fallback → global default.

```ts
import { resolveToken } from '@gamut-all/core';

const hex = resolveToken('fgDanger', {
  bgClass: 'dark',
  stackDepth: 'root',
  fontSize: '16px',
  visionMode: 'default',
}, registry);
```

### `validateRegistry(registry)`

Returns `{ errors, warnings }`. Non-compliant variants are reported as warnings.

### `serializeRegistry` / `deserializeRegistry`

Convert a `TokenRegistry` (which uses `Map`) to and from a plain-JSON form suitable for bundling or network transfer.

```ts
import { serializeRegistry, deserializeRegistry } from '@gamut-all/core';

const json    = JSON.stringify(serializeRegistry(registry));
const restored = deserializeRegistry(JSON.parse(json));
```

## Compliance engines

```ts
import { wcag21, apca } from '@gamut-all/core';

buildRegistry(processed, wcag21); // WCAG 2.1 contrast ratio
buildRegistry(processed, apca);   // APCA 0.0.98G-4g Lc scores
```

| Engine | Text AA | Text AAA | UI component AA |
|--------|---------|----------|-----------------|
| `wcag21` | 4.5:1 (<24px) / 3:1 (≥24px) | 7:1 / 4.5:1 | 3:1 |
| `apca`   | Lc 60 (<24px) / Lc 45 (≥24px) | Lc 75 / Lc 60 | Lc 30 |

## Token input schema

### `TokenInput`

```ts
interface TokenInput {
  config?: {
    wcagTarget?: 'AA' | 'AAA';                    // Default: 'AA'
    complianceEngine?: 'wcag21' | 'apca';         // Default: 'wcag21'
    stepSelectionStrategy?: 'closest' | 'mirror-closest'; // Default: 'closest'
    defaultTheme?: string;
    stacks?: Record<string, number>;              // Elevation offsets
    onUnresolvedOverride?: 'error' | 'warn';
    cvd?: {
      enabled?: boolean;                          // Default: true
      confusionThresholdDE?: number;              // Default: 5
      distinguishableThresholdDE?: number;        // Default: 8
    };
  };
  primitives: Record<string, (string | ColorValue)[]>; // Ramp definitions
  themes: Record<string, ThemeInput>;
  surfaces?: Record<string, SurfaceInput>;
  foreground: Record<string, SemanticInput>;      // Text tokens
  nonText?: Record<string, SemanticInput>;        // Border / focus / ring tokens
}
```

### `ThemeInput`

```ts
interface ThemeInput {
  ramp: string;           // Name of a primitives ramp
  step: number;           // Base step index into the ramp
  fallback?: string[];    // Ordered fallback chain for unresolved tokens
}
```

### `SurfaceInput`

```ts
interface SurfaceInput {
  ramp: string;
  step: number;
  themes?: Record<string, { step: number }>;        // Override step per theme
  interactions?: Record<string, { step: number }>;  // hover, active, etc.
}
```

### `SemanticInput`

```ts
interface SemanticInput {
  ramp: string;
  defaultStep?: number;            // Omit to use ramp midpoint
  decorative?: boolean;            // Exempt from compliance (graphical elements)
  overrides?: ContextOverrideInput[];
  interactions?: Record<string, { step: number }>;
}
```

### W3C Color Module 2025.10

Primitives accept both plain hex strings and W3C `ColorValue` objects:

```json
{
  "primitives": {
    "display": [
      { "colorSpace": "display-p3", "components": [1, 0, 0], "hex": "#ff0000" }
    ]
  }
}
```

Supported color spaces: `srgb`, `srgb-linear`, `hsl`, `hwb`, `oklab`, `oklch`, `lab`, `lch`, `display-p3`, `a98-rgb`, `prophoto-rgb`, `rec2020`, `xyz-d65`, `xyz-d50`.

## CVD simulation

Tokens and surfaces automatically get CVD-corrected variants for all 6 chromatic deficiency types (protanopia, protanomaly, deuteranopia, deuteranomaly, tritanopia, tritanomaly). Pairs confused under a given deficiency type have their hues shifted into safe zones while avoiding hue collisions with already-distinct surfaces.

Disable per-project:

```json
{ "config": { "cvd": { "enabled": false } } }
```

## CSS selector order

`data-theme` is expected on `<html>` (or another ancestor). `data-vision` is applied by `<TokenProvider>` as a descendant `<div>`. The correct CSS selector form is:

```css
[data-theme="dark"] [data-vision="protanomaly"] { /* ... */ }
[data-theme="dark"] [data-vision="protanomaly"] [data-stack="modal"] { /* ... */ }
```

## TypeScript

The package ships dual CJS/ESM builds with full `.d.ts` declarations. All types are exported from the main entry point.
