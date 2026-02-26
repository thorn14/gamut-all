# gamut-all

Contextual design token resolution for accessible color systems. Resolves semantic color tokens (`fgPrimary`, `fgLink`, etc.) to specific hex values based on four context dimensions: **font size**, **background**, **stack layer**, and **vision mode**. Compliance is guaranteed at build time — runtime resolution is a Map lookup, never color math.

## Packages

| Package | Description |
|---|---|
| [`@gamut-all/core`](#gamut-allcore) | Zero-dep token processing, registry builder, resolver, CSS generator, Vite plugin |
| [`@gamut-all/react`](#gamut-allreact) | React provider, hooks, components, HOC, dev inspector |
| [`@gamut-all/audit`](#gamut-allaudit) | CLI audit tool for CI — checks compliance and DOM context coverage |

---

## Installation

```sh
# Core only (Node, SSR, Vite plugin)
pnpm add @gamut-all/core

# React
pnpm add @gamut-all/core @gamut-all/react

# CI audit CLI
pnpm add -D @gamut-all/audit
```

---

## The Token Input File

One JSON file drives the entire system. Three required sections (`primitives`, `backgrounds`, `semantics`) and one optional (`config`). Add `$schema` for editor autocomplete:

```json
{ "$schema": "node_modules/@gamut-all/core/schema.json" }
```

### Minimal example

```json
{
  "primitives": {
    "neutral": ["#fafafa", "#f5f5f5", "#e5e5e5", "#d4d4d4", "#a3a3a3", "#737373", "#525252", "#404040", "#262626", "#171717"],
    "blue":    ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a"]
  },
  "backgrounds": {
    "white": { "ramp": "neutral", "step": 0 },
    "dark":  { "ramp": "neutral", "step": 8 }
  },
  "semantics": {
    "fgPrimary":   { "ramp": "neutral", "defaultStep": 8 },
    "fgSecondary": { "ramp": "neutral", "defaultStep": 5 },
    "fgLink": {
      "ramp": "blue",
      "defaultStep": 6,
      "interactions": {
        "hover":  { "step": 8 },
        "active": { "step": 9 }
      }
    }
  }
}
```

The system auto-generates contrast rules for every token × background × font size × stack combination. No overrides needed for well-ordered ramps.

### Full example (overrides, vision modes, interactions)

```json
{
  "$schema": "node_modules/@gamut-all/core/schema.json",
  "config": {
    "wcagTarget": "AA",
    "complianceEngine": "wcag21",
    "onUnresolvedOverride": "error"
  },
  "primitives": {
    "neutral": ["#fafafa", "#f5f5f5", "#e5e5e5", "#d4d4d4", "#a3a3a3", "#737373", "#525252", "#404040", "#262626", "#171717"],
    "blue":    ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a"],
    "red":     ["#fef2f2", "#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d"],
    "orange":  ["#fff7ed", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12"],
    "green":   ["#f0fdf4", "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d", "#166534", "#14532d"]
  },
  "backgrounds": {
    "white":   { "ramp": "neutral", "step": 0, "fallback": ["light", "card"] },
    "light":   { "ramp": "neutral", "step": 1, "fallback": ["white", "card"] },
    "card":    { "ramp": "neutral", "step": 2, "fallback": ["light", "white"] },
    "dark":    { "ramp": "neutral", "step": 8, "fallback": ["inverse"] },
    "inverse": { "ramp": "neutral", "step": 9, "fallback": ["dark"] }
  },
  "semantics": {
    "fgPrimary": {
      "ramp": "neutral",
      "defaultStep": 8,
      "overrides": [
        { "bg": ["dark", "inverse"], "step": 1 },
        { "bg": "white", "fontSize": "12px", "step": 9 }
      ]
    },
    "fgError": {
      "ramp": "red",
      "defaultStep": 6,
      "vision": {
        "deuteranopia": { "ramp": "orange", "defaultStep": 7 },
        "protanopia":   { "ramp": "orange", "defaultStep": 7 }
      }
    },
    "fgLink": {
      "ramp": "blue",
      "defaultStep": 6,
      "interactions": {
        "hover":  { "step": 8 },
        "active": { "step": 9 },
        "focus":  { "step": 7 }
      }
    }
  }
}
```

---

## `@gamut-all/core`

Zero dependencies. Works in Node, SSR, Vite plugins, any JS runtime.

### Build a registry

```typescript
import { processInput, buildRegistry, wcag21 } from '@gamut-all/core';
import tokenJson from './tokens.json';

const processed = processInput(tokenJson);
const registry  = buildRegistry(processed, wcag21);
```

### Resolve a token

```typescript
import { resolveToken } from '@gamut-all/core';

const hex = resolveToken('fgSecondary', {
  fontSize:   '16px',
  bgClass:    'dark',
  stackDepth: 'root',
  visionMode: 'default',
}, registry);

console.log(hex); // e.g. #d4d4d4
```

Resolution fallback order (no `throw`, no runtime color math):

1. Exact context match
2. Relax vision mode → `default`
3. Relax stack → `root` (via STACK_FALLBACK chain)
4. Relax background via declared `fallback` chain
5. Registry default for the token

### Resolve all tokens at once

```typescript
import { resolveAllTokens } from '@gamut-all/core';

const tokens = resolveAllTokens({
  fontSize: '16px', bgClass: 'dark', stackDepth: 'root', visionMode: 'default'
}, registry);

// Includes interaction variants:
tokens.fgLink;        // base
tokens['fgLink-hover'];
tokens['fgLink-active'];
```

### Generate CSS

```typescript
import { generateCSS } from '@gamut-all/core';

const css = generateCSS(registry);
// Emits :root, [data-bg="…"], [data-stack="…"][data-bg="…"],
// [data-vision="…"], [data-vision="…"] [data-bg="…"]
```

Sample output:

```css
:root {
  --fg-primary: #262626;
  --fg-link: #2563eb;
  --fg-link-hover: #1e40af;
  --fg-link-active: #1e3a8a;
}

[data-bg="dark"] {
  --fg-primary: #f5f5f5;
  --fg-link: #93c5fd;
  --fg-link-hover: #60a5fa;
}

[data-vision="deuteranopia"] {
  --fg-error: #ea580c;
}
```

### Serialize / deserialize

```typescript
import { serializeRegistry, deserializeRegistry } from '@gamut-all/core';

const json = JSON.stringify(serializeRegistry(registry));
const restored = deserializeRegistry(JSON.parse(json));
```

### Validate

```typescript
import { validateRegistry } from '@gamut-all/core';

const result = validateRegistry(registry);
// result.issues — array of non-compliant manually-overridden variants
```

### Vite plugin

```typescript
// vite.config.ts
import { designTokensPlugin } from '@gamut-all/core/vite';

export default defineConfig({
  plugins: [
    designTokensPlugin({
      input:     './tokens.json',
      outputDir: './src/generated',
      emitTypes: true,
      emitCSS:   true,
    }),
  ],
});
```

Emits:
- `tokens.ts` — `registry` export
- `tokens.css` — full CSS custom properties
- `token-types.d.ts` — typed unions (`TokenName`, `BackgroundClass`, `RampName`, etc.)

### Compliance engines

Two built-in engines, both satisfy the `ComplianceEngine` interface:

```typescript
import { wcag21, apca, buildRegistry } from '@gamut-all/core';

const wcagRegistry = buildRegistry(processed, wcag21);  // WCAG 2.1 contrast ratio
const apcaRegistry = buildRegistry(processed, apca);    // APCA 0.0.98G-4g Lc value
```

**WCAG 2.1** thresholds (AA): 4.5:1 for text < 18px normal / < 14px bold, 3:1 for large text.

**APCA** thresholds (AA Lc): 75 for < 14px, 60 for < 24px, 45 for ≥ 24px.

Both engines are drop-in replacements — swapping them requires no changes to resolver logic or schema.

### Context dimensions

```typescript
type FontSizeClass = '12px' | '14px' | '16px' | '20px' | '24px' | '32px';
type StackClass    = 'root' | 'card' | 'popover' | 'tooltip' | 'modal' | 'overlay';
type VisionMode    = 'default' | 'deuteranopia' | 'protanopia' | 'tritanopia' | 'achromatopsia';
```

---

## `@gamut-all/react`

Peer deps: `react ≥ 18`, `react-dom ≥ 18`, `@gamut-all/core`.

### Provider

```tsx
import { TokenProvider } from '@gamut-all/react';
import { registry } from 'virtual:design-tokens'; // or build it manually

function App() {
  return (
    <TokenProvider registry={registry}>
      <Router>
        <Layout />
      </Router>
    </TokenProvider>
  );
}
```

`TokenProvider` wraps children in a `data-vision` root element so the CSS cascade (`[data-vision="deuteranopia"] [data-bg="dark"]`) works without any JS resolution.

### Stack layers and tokenized elements

```tsx
import { StackLayer, TokenizedText } from '@gamut-all/react';

function UserCard({ name, email }: Props) {
  return (
    <StackLayer stack="card" bg="dark" className="rounded-xl p-6">
      <TokenizedText token="fgPrimary" as="h3">{name}</TokenizedText>
      <TokenizedText token="fgSecondary" as="p">{email}</TokenizedText>
    </StackLayer>
  );
}
```

### Hooks

```tsx
import { useRef } from 'react';
import { useToken, useResolvedTokens, useTokenVars, useTokenColor } from '@gamut-all/react';

// Resolved hex for one token, context read from DOM
function Badge({ label }: { label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const color = useToken('fgAccent', ref);
  return <span ref={ref} style={{ color }}>{label}</span>;
}

// All tokens (including interaction variants) as a record
function MetricBadge({ value, trend }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const tokens = useResolvedTokens(ref);
  return (
    <div ref={ref}>
      <span style={{ color: tokens.fgPrimary }}>{value}</span>
      <svg style={{ color: trend === 'up' ? tokens.fgSuccess : tokens.fgError }} />
    </div>
  );
}

// CSS custom properties object (e.g. for inline style)
function Card() {
  const ref = useRef<HTMLDivElement>(null);
  const vars = useTokenVars(ref); // { '--fg-primary': '#...', '--fg-link': '#...', ... }
  return <div ref={ref} style={vars} />;
}

// Without a DOM ref (explicit context)
const hex = useTokenColor('fgError', { bg: 'dark', stack: 'card' });
```

### Vision mode

```tsx
import { useTokenContext } from '@gamut-all/react';

function AccessibilitySettings() {
  const { visionMode, setVisionMode } = useTokenContext();
  return (
    <fieldset>
      {(['default', 'deuteranopia', 'protanopia', 'tritanopia'] as const).map((mode) => (
        <label key={mode}>
          <input
            type="radio"
            name="vision"
            value={mode}
            checked={visionMode === mode}
            onChange={() => setVisionMode(mode)}
          />
          {mode}
        </label>
      ))}
    </fieldset>
  );
}
```

### HOC and render prop

```tsx
import { withAutoContrast, TokenResolver } from '@gamut-all/react';

// HOC — injects color/style props from registry
const AccessibleButton = withAutoContrast(Button, { tokens: ['fgPrimary'] });

// Render prop
<TokenResolver token="fgLink">
  {(hex) => <a style={{ color: hex }}>Link</a>}
</TokenResolver>
```

### CSS vars directly (no JS hooks needed for interaction states)

```tsx
// Tailwind
<a className="text-[var(--fg-link)] hover:text-[var(--fg-link-hover)] active:text-[var(--fg-link-active)] transition-colors">
  Link
</a>

// Inline
<a style={{ color: 'var(--fg-link)' }}>Link</a>
```

---

## `@gamut-all/audit`

CI audit tooling — checks that the registry is fully compliant and that the DOM correctly declares context attributes.

### CLI

```sh
# Audit registry only
gamut-audit --registry ./dist/registry.json

# Audit registry + static HTML (requires jsdom: pnpm add -D jsdom)
gamut-audit --registry ./dist/registry.json --html ./dist/index.html

# Options
gamut-audit --registry ./dist/registry.json \
  --engine wcag21 \   # or: apca
  --level AA \        # or: AAA
  --format json       # or: text (default)
```

Exits with code `1` if any error-severity issues are found.

### Programmatic API

```typescript
import { auditRegistry, auditDOM, formatText, formatJSON } from '@gamut-all/audit';
import { buildRegistry, wcag21 } from '@gamut-all/core';

const registry = buildRegistry(processed, wcag21);

// Audit all variants in the registry
const result = auditRegistry(registry, wcag21, 'AA');
console.log(formatText(result));

// Audit a DOM subtree (jsdom or real DOM)
const domResult = auditDOM(document.body, registry);
// Flags: unknown data-bg values, CSS vars without data-bg ancestors, unrecognized token vars
```

### Playwright integration (optional)

```typescript
import { auditURL } from '@gamut-all/audit';
// pnpm add -D playwright

const result = await auditURL('http://localhost:3000', registry, {
  browser: 'chromium',
  width: 1280,
  height: 720,
});
console.log(formatJSON(result));
```

### Issue types

| Type | Severity | Description |
|---|---|---|
| `non-compliant-variant` | error | A variant fails the configured contrast threshold |
| `unknown-background` | error | `data-bg` value not found in the registry |
| `missing-data-bg` | warning | Element uses a token CSS var but has no `data-bg` ancestor |
| `unknown-token-var` | warning | CSS var matches token naming pattern but is not in the registry |

---

## How it works

### Build time

1. `processInput` validates the JSON, converts hex → OKLCH, caches relative luminance.
2. `autoGenerateRules` walks each ramp to find the closest compliant step for every token × background × font size × stack × vision combination.
3. Manual `overrides` are applied on top by specificity (dimension count), then declaration order.
4. `buildRegistry` expands everything into a flat `Map<VariantKey, ResolvedVariant>`.
5. `generateCSS` emits attribute-selector custom properties — no runtime computation needed.

### Runtime

`resolveToken` is a bounded Map lookup with a 5-step fallback chain. No color math, no DOM sampling, no heuristics. Target: < 10 μs per call.

### The CSS cascade as the primary delivery

Because `generateCSS` emits `[data-bg]`, `[data-vision]`, and `[data-stack][data-bg]` selectors, CSS itself handles most context switching. React hooks are available for cases where JS needs the hex values (canvas, SVG, charting libraries, etc.), but they are not required for standard HTML/CSS usage.

---

## Constraints

- **No runtime color math.** Resolution is Map lookup only.
- **OKLCH internally.** Teams provide hex; the system converts during registry build.
- **Declared context only.** Background is read from `data-bg` attributes and declared fallback chains — not inferred from DOM colors.
- **Text tokens only in v1.** Non-text tokens (borders, icons, etc.) are out of scope.
- **Color only.** Spacing, radius, elevation are out of scope.

---

## Workspace

```
packages/
├── core/    → @gamut-all/core   (zero deps, TypeScript ESM + CJS)
├── react/   → @gamut-all/react  (React ≥ 18)
└── audit/   → @gamut-all/audit  (CLI + programmatic audit)
```

```sh
pnpm build        # build all packages (Turborepo)
pnpm test         # run all tests (310 total)
pnpm typecheck    # tsc --noEmit across all packages
```

Tests: 190 core · 87 react · 33 audit — all passing.
