# Contextual Design Token Resolution System

## What This Is

Two npm packages that resolve semantic color tokens (like `fgSecondary`) to specific values from color ramps based on runtime context — font size, effective background color, stacking depth, and vision mode. Any team plugs in their own tokens via a single JSON file. The system builds a pre-computed lookup table and guarantees WCAG compliance through ramp-step selection, not runtime color math.

### Package Split

**`@gamut-all/core`** — Zero dependencies. No React. Works in Node, SSR, Vite plugins, any JS runtime.
- Token input parsing + JSON schema
- Hex → OKLCH conversion + luminance caching
- Auto-rule generation (find compliant ramp steps per background)
- Registry builder (expand all variants into Map)
- Resolution engine (pure function, Map lookups)
- Compliance engines (WCAG 2.1, APCA draft)
- Validation + CSS generation
- Vite plugin for build-time generation
- Serialization/deserialization

**`@gamut-all/react`** — Peer deps: React ≥18, `@gamut-all/core`.
- `<TokenProvider>` context
- All hooks (`useToken`, `useResolvedTokens`, `useTokenVars`, etc.)
- `<StackLayer>`, `<TokenizedText>`, `<TokenizedContainer>`
- `withAutoContrast` HOC, `<TokenResolver>` render prop
- `<TokenInspector>` dev overlay
- DOM context detection (font size, background, stack depth)
- Environment sensor hooks (ambient light, prefers-contrast)

The boundary: **core owns the math and the data, react owns the DOM and the component model.** A Vue or Svelte adapter would import core and build its own reactive layer.

---

## Key Constraints

- **No color manipulation at runtime.** Resolution is a Map lookup against pre-computed variants.
- **OKLCH internally.** The system converts input hex to OKLCH for perceptual ordering and luminance. Teams provide hex; the system does the conversion during registry build.
- **Pluggable via one JSON file.** Teams don't adopt a framework — they describe their tokens and the system does the rest.
- **Color blindness is a context dimension**, not a filter. Different vision modes select different ramp steps or entirely different ramps.
- **Compliance engine is swappable.** WCAG 2.1 today, APCA tomorrow — without touching resolution logic or token definitions.
- **Color only.** Spacing, radius, elevation, and other non-color tokens are out of scope. They don't have contrast compliance math and don't benefit from the ramp-step resolution model.

---

## The Input Contract

One JSON file. Three required sections: `primitives`, `backgrounds`, `semantics`. One optional: `config`.

A team produces this from whatever tooling they use — Figma Tokens Studio export, Style Dictionary build, a script that reads their CSS variables, hand-authored. The system doesn't care how it was made.

The package publishes a JSON schema at `@gamut-all/core/schema.json` so teams get editor autocomplete and validation:
```json
{ "$schema": "node_modules/@gamut-all/core/schema.json" }
```

### Minimal Example

```json
{
  "primitives": {
    "neutral": ["#fafafa", "#f5f5f5", "#e5e5e5", "#d4d4d4", "#a3a3a3", "#737373", "#525252", "#404040", "#262626", "#171717"],
    "blue": ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a"],
    "red": ["#fef2f2", "#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d"],
    "orange": ["#fff7ed", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12"],
    "green": ["#f0fdf4", "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d", "#166534", "#14532d"]
  },
  "backgrounds": {
    "white":   { "ramp": "neutral", "step": 0 },
    "light":   { "ramp": "neutral", "step": 1 },
    "card":    { "ramp": "neutral", "step": 2 },
    "dark":    { "ramp": "neutral", "step": 8 },
    "inverse": { "ramp": "neutral", "step": 9 }
  },
  "semantics": {
    "fgPrimary":   { "ramp": "neutral", "defaultStep": 8 },
    "fgSecondary": { "ramp": "neutral", "defaultStep": 5 },
    "fgTertiary":  { "ramp": "neutral", "defaultStep": 4 },
    "fgAccent":    { "ramp": "blue",    "defaultStep": 6 },
    "fgDisabled":  { "ramp": "neutral", "defaultStep": 3 },
    "fgInverse":   { "ramp": "neutral", "defaultStep": 1 },
    "fgLink":      { "ramp": "blue",    "defaultStep": 6 },
    "fgError":     { "ramp": "red",     "defaultStep": 6 },
    "fgSuccess":   { "ramp": "green",   "defaultStep": 6 }
  }
}
```

That's the minimum. No overrides, no vision modes, no roles — the system auto-generates context rules by walking each ramp to find compliant steps per background. Defaults to `role: "text"` for all tokens.

### Full Example (with all optional fields)

```json
{
  "$schema": "node_modules/@gamut-all/core/schema.json",

  "config": {
    "wcagTarget": "AA",
    "complianceEngine": "wcag21"
  },

  "primitives": {
    "neutral": ["#fafafa", "#f5f5f5", "#e5e5e5", "#d4d4d4", "#a3a3a3", "#737373", "#525252", "#404040", "#262626", "#171717"],
    "blue":    ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a"],
    "red":     ["#fef2f2", "#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d"],
    "orange":  ["#fff7ed", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12"],
    "green":   ["#f0fdf4", "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d", "#166534", "#14532d"]
  },

  "backgrounds": {
    "white":   { "ramp": "neutral", "step": 0 },
    "light":   { "ramp": "neutral", "step": 1 },
    "card":    { "ramp": "neutral", "step": 2 },
    "dark":    { "ramp": "neutral", "step": 8 },
    "inverse": { "ramp": "neutral", "step": 9 }
  },

  "semantics": {
    "fgPrimary": {
      "ramp": "neutral",
      "defaultStep": 8,
      "role": "text",
      "overrides": [
        { "bg": ["dark", "inverse"], "step": 1 },
        { "bg": ["dark", "inverse"], "fontSize": ["24px", "32px"], "step": 2 },
        { "bg": "white", "fontSize": "12px", "step": 9 }
      ]
    },
    "fgSecondary": {
      "ramp": "neutral",
      "defaultStep": 5,
      "role": "text",
      "overrides": [
        { "bg": "light", "step": 6 },
        { "bg": "card", "step": 6 },
        { "bg": ["dark", "inverse"], "step": 3 },
        { "bg": "white", "fontSize": "12px", "step": 6 },
        { "bg": "white", "fontSize": ["24px", "32px"], "step": 4 }
      ]
    },
    "fgTertiary":  { "ramp": "neutral", "defaultStep": 4, "role": "text" },
    "fgAccent":    { "ramp": "blue",    "defaultStep": 6, "role": "text" },
    "fgDisabled":  { "ramp": "neutral", "defaultStep": 3, "role": "text" },
    "fgInverse":   { "ramp": "neutral", "defaultStep": 1, "role": "text" },
    "fgLink": {
      "ramp": "blue",
      "defaultStep": 6,
      "role": "text",
      "interactions": {
        "hover":  { "step": 8 },
        "active": { "step": 9 },
        "focus":  { "step": 7 }
      }
    },
    "fgError": {
      "ramp": "red",
      "defaultStep": 6,
      "role": "text",
      "vision": {
        "deuteranopia": { "ramp": "orange", "defaultStep": 7 },
        "protanopia":   { "ramp": "orange", "defaultStep": 7 }
      }
    },
    "fgSuccess": {
      "ramp": "green",
      "defaultStep": 6,
      "role": "text",
      "vision": {
        "deuteranopia": { "ramp": "blue", "defaultStep": 6 },
        "protanopia":   { "ramp": "blue", "defaultStep": 6 }
      }
    },
    "fgIcon": {
      "ramp": "neutral",
      "defaultStep": 4,
      "role": "non-text",
      "overrides": [
        { "bg": ["dark", "inverse"], "step": 3 }
      ]
    },
    "fgIconAccent": {
      "ramp": "blue",
      "defaultStep": 5,
      "role": "non-text"
    },
    "fgBorder": {
      "ramp": "neutral",
      "defaultStep": 3,
      "role": "non-text"
    },
    "fgBorderAccent": {
      "ramp": "blue",
      "defaultStep": 4,
      "role": "non-text"
    }
  }
}
```

### Input Types (`@gamut-all/core`)

```typescript
/** The one file a team provides. */
interface TokenInput {
  $schema?: string;
  config?: {
    wcagTarget?: 'AA' | 'AAA';
    complianceEngine?: 'wcag21' | 'apca';
  };
  /** Color ramps. Key = ramp name, value = hex strings ordered light → dark. Any length. */
  primitives: Record<string, string[]>;
  /** Named backgrounds. Each points to a ramp + step index. */
  backgrounds: Record<string, { ramp: string; step: number }>;
  /** Semantic tokens. Ramp + default step, optional overrides, vision modes, interactions, role. */
  semantics: Record<string, SemanticInput>;
}

type SemanticInput = {
  ramp: string;
  defaultStep: number;
  /** 'text' = WCAG 1.4.3 (size-dependent thresholds).
   *  'non-text' = WCAG 1.4.11 (3:1 always, font size ignored).
   *  Default: 'text'. */
  role?: 'text' | 'non-text';
  /** Manual context overrides. If omitted, system auto-generates rules. */
  overrides?: ContextOverrideInput[];
  /** Interaction state step variants. Each produces a --token-{state} CSS var. */
  interactions?: Record<string, { step: number; overrides?: ContextOverrideInput[] }>;
  /** Vision mode alternatives — can swap ramp entirely. */
  vision?: Record<string, {
    ramp?: string;
    defaultStep?: number;
    overrides?: ContextOverrideInput[];
  }>;
};

interface ContextOverrideInput {
  bg?: string | string[];
  fontSize?: string | string[];
  stack?: string | string[];
  step: number;
}
```

### Token Roles: Text vs Non-Text

The `role` field determines which WCAG success criterion applies:

| Role | WCAG Criterion | Contrast Requirement | Font Size Matters? |
|------|----------------|---------------------|-------------------|
| `text` (default) | 1.4.3 Contrast (Minimum) | 4.5:1 normal, 3:1 large text | Yes |
| `non-text` | 1.4.11 Non-text Contrast | 3:1 always | No |

**`text`** tokens: foreground text colors. Contrast threshold varies by font size (and weight). Auto-rule generator produces variants across all font size × background combinations.

**`non-text`** tokens: icons, borders, form controls, graphical indicators. 3:1 regardless of size. Auto-rule generator skips the font-size dimension entirely, reducing variant count by 6× for these tokens.

The compliance engine receives the role:

```typescript
interface ComplianceEngine {
  getRequiredContrast(
    fontSizePx: number,
    fontWeight?: number,
    role?: 'text' | 'non-text'
  ): number;
}

// WCAG 2.1:
// role === 'text'     → 4.5 (normal) or 3.0 (large) for AA
// role === 'non-text' → 3.0 (always) for AA
```

### Interaction States

The `interactions` field produces additional CSS custom properties for hover, active, focus, etc. Each interaction step goes through the same auto-rule pipeline — the system finds the compliant step closest to the specified step on each background.

From the input:
```json
"fgLink": {
  "ramp": "blue",
  "defaultStep": 6,
  "interactions": {
    "hover":  { "step": 8 },
    "active": { "step": 9 }
  }
}
```

The system generates:
```css
:root {
  --fg-link: #2563eb;
  --fg-link-hover: #1e40af;
  --fg-link-active: #1e3a8a;
}
[data-bg="dark"] {
  --fg-link: #93c5fd;
  --fg-link-hover: #60a5fa;
  --fg-link-active: #3b82f6;
}
```

Interaction variants are validated against the compliance engine with the same thresholds as the base token. WCAG doesn't technically require contrast on transient states, but the system validates them anyway — teams can override specific steps if the validation is too strict for their intent.

### What the System Does With the Input

During registry build (build time via Vite plugin, or app init):

1. **Validate input** against JSON schema. Catch ramp references that don't exist, step indices out of bounds, duplicate semantic names.

2. **Process primitives** — for each ramp, convert every hex to OKLCH and cache `relativeLuminance`. Warn if steps aren't monotonically ordered by luminance (auto-sort if fixable).

3. **Resolve backgrounds** — look up each background's hex from its ramp + step.

4. **Process semantics** — for each token:
   - Read `role` (default: `'text'`).
   - If `overrides` provided, use them.
   - If `overrides` omitted, **auto-generate rules**: for each background (and, for `text` role, each font size), walk the ramp to find the closest compliant step to `defaultStep`.
   - If `interactions` provided, repeat rule generation for each interaction state.
   - If `vision` overrides exist, repeat for each vision mode.

5. **Build registry** — expand all combinations into the variant Map. Validate every entry.

### Auto-Rule Generation

```typescript
function autoGenerateRules(
  tokenRamp: ProcessedRamp,
  defaultStep: number,
  backgrounds: Map<string, ProcessedBackground>,
  compliance: ComplianceEngine,
  role: 'text' | 'non-text',
  fontSizes: FontSizeClass[]
): ContextRule[] {
  const rules: ContextRule[] = [];

  // Non-text tokens: font size doesn't matter, use a single pass
  const sizesToCheck = role === 'non-text' ? ['16px' as FontSizeClass] : fontSizes;

  for (const [bgName, bg] of backgrounds) {
    for (const fontSize of sizesToCheck) {
      const required = compliance.getRequiredContrast(parseInt(fontSize), 400, role);

      const defaultRatio = computeContrast(tokenRamp.steps[defaultStep], bg);
      if (defaultRatio >= required) continue;

      const bgIsLight = bg.relativeLuminance > 0.5;
      const searchDirection = bgIsLight ? 'darker' : 'lighter';
      const passingStep = findClosestPassingStep(
        tokenRamp, defaultStep, bg, required, searchDirection
      );

      if (passingStep !== null && passingStep !== defaultStep) {
        const rule: ContextRule = { bg: bgName, step: passingStep, minRatio: required };
        // Only include fontSize for text tokens
        if (role === 'text') rule.fontSize = fontSize;
        rules.push(rule);
      }
    }
  }

  return deduplicateRules(rules);
}
```

---

## Phases

### Phase 1: `@gamut-all/core` — Types, Processing, Resolution
Foundation. Zero dependencies. Pure TypeScript.

**Build:**
- `TokenInput` type + JSON schema (`schema.json`) for editor validation
- `processInput(input: TokenInput): ProcessedInput` — hex → OKLCH, luminance, ramp validation
- Internal types: `ProcessedRamp`, `ProcessedStep`, `ProcessedBackground`, `ResolvedVariant`, `VariantKey`, `TokenRegistry`
- `ComplianceEngine` interface with `role` parameter + WCAG 2.1 implementation
- `autoGenerateRules()` — walk ramp to find compliant steps, respects `role` (skips font-size dimension for non-text)
- `buildRegistry(processed, complianceEngine): TokenRegistry` — expand all variants including interaction states
- `resolveToken(token, context, registry): string` — ≤5 Map.get() calls
- `resolveAllTokens(context, registry): Record<string, string>` — includes interaction variants (e.g., `fgLink`, `fgLink-hover`, `fgLink-active`)
- Fallback chain: exact → relax vision → relax stack → relax bg → default
- `validateRegistry(registry): ValidationResult`
- `serializeRegistry` / `deserializeRegistry` (Map ↔ JSON)
- `generateCSS(registry): string` — data-attribute custom properties including interaction variants

**Package exports:**
```typescript
// @gamut-all/core
export { processInput, buildRegistry, validateRegistry } from './registry';
export { resolveToken, resolveAllTokens } from './resolver';
export { generateCSS } from './css';
export { serializeRegistry, deserializeRegistry } from './serialize';
export { wcag21 } from './compliance/wcag21';
export type { TokenInput, SemanticInput, TokenRegistry, ComplianceEngine, ... } from './types';
```

**Test by:**
- Feed sample JSON → build registry → resolve across contexts → validate all pass AA
- Confirm auto-rules select correct steps for dark/light backgrounds
- Confirm non-text tokens produce fewer variants (no font-size dimension)
- Confirm interaction state variants resolve per-context
- Confirm <10μs per resolve call
- Validate JSON schema rejects bad input

### Phase 2: `@gamut-all/core` — Vite Plugin
Build-time generation so consuming projects ship pre-computed registries.

**Build:**
- Vite plugin: read JSON → `processInput` → `buildRegistry` → emit `tokens.ts` + `tokens.css` + `token-types.d.ts`
- Virtual module: `import { registry } from 'virtual:design-tokens'`
- Type emission: generate typed unions from input JSON keys
- HMR: watch input JSON, regenerate on change
- Terminal output: variant count, AA/AAA pass rates, failures, text vs non-text breakdown

**Plugin config:**
```typescript
// vite.config.ts
import { designTokensPlugin } from '@gamut-all/core/vite';

export default defineConfig({
  plugins: [
    designTokensPlugin({
      input: './tokens.json',
      outputDir: './src/generated',
      emitTypes: true,
      emitCSS: true,
    }),
  ],
});
```

**Generated types:**
```typescript
// Auto-generated — do not edit
export type TokenName = 'fgPrimary' | 'fgSecondary' | 'fgTertiary' | 'fgAccent' | 'fgDisabled' | 'fgInverse' | 'fgLink' | 'fgError' | 'fgSuccess' | 'fgIcon' | 'fgIconAccent' | 'fgBorder' | 'fgBorderAccent';
export type InteractionTokenName = 'fgLink-hover' | 'fgLink-active' | 'fgLink-focus';
export type BackgroundClass = 'white' | 'light' | 'card' | 'dark' | 'inverse';
export type RampName = 'neutral' | 'blue' | 'red' | 'orange' | 'green';
```

### Phase 3: `@gamut-all/react` — Provider + Hooks

**Build:**
- `<TokenProvider>` — accepts `TokenInput` JSON or pre-built `TokenRegistry`
- DOM context detection:
  - Font size classifier
  - Background detector — snap to nearest defined background by OKLCH lightness
  - Stack depth detector — `data-stack-context` walk, z-index/role fallback
- `useDesignContext(ref)` — ResizeObserver + MutationObserver, debounced, shallow-compare
- `useToken(tokenName, ref)` → hex
- `useResolvedTokens(ref)` → includes interaction variants
- `useTokenVars(ref)` → CSSProperties with `--fg-*` and `--fg-*-hover` etc.
- `useTokenColor(tokenName, { bg?, stack? })` → hex without a ref
- `<StackLayer stack="modal" bg="dark">` — boundary component

**Test by:**
- Nested StackLayers resolve tokens differently per layer
- Background detection snaps to defined BackgroundDefs

### Phase 4: `@gamut-all/react` — Consumer Components + HOC

**Build:**
- `<TokenizedText token="fgSecondary" as="p">`
- `<TokenizedContainer bg="dark" stack="card">`
- `withAutoContrast(Component, { tokens })`
- `<TokenResolver>` (render prop)
- `<TokenInspector>` (dev-only debug overlay — shows role, compliance level, interaction states)

### Phase 5: Vision Mode + Compliance Extensibility

**`@gamut-all/core`:**
- VisionMode dimension on VariantKey
- Vision-aware rule generation
- APCA compliance engine (behind config flag)

**`@gamut-all/react`:**
- `visionMode` in provider context + `setVisionMode()`
- `data-vision` attribute on root element

### Phase 6: `@gamut-all/react` — Environment Extensions (Optional)

**Build:**
- `useEnvironmentContext()` — AmbientLightSensor, `prefers-contrast`, time-of-day
- Environment conditions map to step selections
- Graceful degradation

---

## Internal Data Model (`@gamut-all/core`)

```typescript
interface ProcessedRamp {
  name: string;
  steps: ProcessedStep[];
  stepCount: number;
}

interface ProcessedStep {
  index: number;
  hex: string;
  oklch: { l: number; c: number; h: number };
  relativeLuminance: number;
}

interface ProcessedBackground {
  name: string;
  ramp: string;
  step: number;
  hex: string;
  relativeLuminance: number;
}

interface ResolvedVariant {
  ramp: string;
  step: number;
  hex: string;
  role: 'text' | 'non-text';
  compliance: ComplianceResult;
}

type VariantKey = `${string}__${FontSizeClass}__${string}__${StackClass}__${VisionMode}`;

interface TokenRegistry {
  ramps: Map<string, ProcessedRamp>;
  backgrounds: Map<string, ProcessedBackground>;
  variantMap: Map<VariantKey, ResolvedVariant>;
  defaults: Record<string, string>;
  meta: {
    generatedAt: string;
    totalVariants: number;
    textTokenCount: number;
    nonTextTokenCount: number;
    complianceEngine: string;
    wcagTarget: 'AA' | 'AAA';
    inputHash: string;
  };
}

interface DesignContext {
  fontSize: FontSizeClass;
  bgClass: string;
  stackDepth: StackClass;
  visionMode: VisionMode;
}
```

### Fixed vs Input-Driven Types

```typescript
// FIXED — perceptual/DOM/biological concepts.
type FontSizeClass = '12px' | '14px' | '16px' | '20px' | '24px' | '32px';
type StackClass = 'root' | 'card' | 'popover' | 'tooltip' | 'modal' | 'overlay';
type VisionMode = 'default' | 'deuteranopia' | 'protanopia' | 'tritanopia' | 'achromatopsia';

// INPUT-DRIVEN — string-keyed at runtime, typed via Vite codegen.
// Token names, background names, ramp names: from the JSON.
```

---

## Resolution Engine (`@gamut-all/core`)

```typescript
const STACK_FALLBACK: Record<StackClass, StackClass[]> = {
  overlay: ['modal', 'tooltip', 'popover', 'card', 'root'],
  modal:   ['tooltip', 'popover', 'card', 'root'],
  tooltip: ['popover', 'card', 'root'],
  popover: ['card', 'root'],
  card:    ['root'],
  root:    [],
};

function resolveToken(token: string, context: DesignContext, registry: TokenRegistry): string {
  // 1. Exact match
  const key = `${token}__${context.fontSize}__${context.bgClass}__${context.stackDepth}__${context.visionMode}`;
  const exact = registry.variantMap.get(key);
  if (exact) return exact.hex;

  // 2. Fall back to default vision
  if (context.visionMode !== 'default') {
    const vKey = `${token}__${context.fontSize}__${context.bgClass}__${context.stackDepth}__default`;
    const vFallback = registry.variantMap.get(vKey);
    if (vFallback) return vFallback.hex;
  }

  // 3. Relax stack toward 'root'
  for (const stack of STACK_FALLBACK[context.stackDepth] ?? []) {
    const sKey = `${token}__${context.fontSize}__${context.bgClass}__${stack}__${context.visionMode}`;
    const sFallback = registry.variantMap.get(sKey);
    if (sFallback) return sFallback.hex;
  }

  // 4. Default
  return registry.defaults[token];
}
```

Interaction variants are resolved with the same function — `fgLink-hover` is its own key in the registry. `resolveAllTokens` returns both base and interaction tokens.

---

## CSS Output (`@gamut-all/core`)

```css
/* ── Base tokens ────────────────────────────────────────── */

:root {
  /* Text tokens */
  --fg-primary: #262626;
  --fg-secondary: #737373;
  --fg-tertiary: #a3a3a3;
  --fg-accent: #2563eb;
  --fg-disabled: #d4d4d4;
  --fg-inverse: #f5f5f5;
  --fg-link: #2563eb;
  --fg-error: #dc2626;
  --fg-success: #16a34a;

  /* Non-text tokens */
  --fg-icon: #a3a3a3;
  --fg-icon-accent: #3b82f6;
  --fg-border: #d4d4d4;
  --fg-border-accent: #93c5fd;

  /* Interaction states */
  --fg-link-hover: #1e40af;
  --fg-link-active: #1e3a8a;
  --fg-link-focus: #1d4ed8;

  /* Backgrounds */
  --bg-white: #fafafa;
  --bg-light: #f5f5f5;
  --bg-card: #e5e5e5;
  --bg-dark: #262626;
  --bg-inverse: #171717;

  /* Full ramp references */
  --neutral-0: #fafafa;
  --neutral-1: #f5f5f5;
  /* ... all steps ... */
  --neutral-9: #171717;

  --blue-0: #eff6ff;
  /* ... all steps ... */
  --blue-9: #1e3a8a;
}

/* ── Background overrides ───────────────────────────────── */

[data-bg="dark"] {
  --fg-primary: #f5f5f5;
  --fg-secondary: #d4d4d4;
  --fg-tertiary: #a3a3a3;
  --fg-accent: #93c5fd;
  --fg-disabled: #525252;
  --fg-inverse: #262626;
  --fg-link: #93c5fd;
  --fg-error: #fca5a5;
  --fg-success: #86efac;

  --fg-icon: #d4d4d4;
  --fg-icon-accent: #60a5fa;
  --fg-border: #525252;
  --fg-border-accent: #3b82f6;

  --fg-link-hover: #60a5fa;
  --fg-link-active: #3b82f6;
}

[data-bg="inverse"] {
  --fg-primary: #fafafa;
  --fg-secondary: #d4d4d4;
  --fg-accent: #bfdbfe;
  --fg-error: #fecaca;
  --fg-success: #bbf7d0;

  --fg-icon: #d4d4d4;
  --fg-border: #525252;
}

[data-bg="light"] {
  --fg-secondary: #525252;
}

[data-bg="card"] {
  --fg-secondary: #525252;
}

/* ── Stack-specific ─────────────────────────────────────── */

[data-stack="tooltip"][data-bg="dark"] {
  --fg-primary: #fafafa;
  --fg-secondary: #e5e5e5;
}

/* ── Vision modes ───────────────────────────────────────── */

[data-vision="deuteranopia"] {
  --fg-error: #ea580c;
  --fg-success: #2563eb;
}

[data-vision="deuteranopia"][data-bg="dark"] {
  --fg-error: #fdba74;
  --fg-success: #93c5fd;
}

[data-vision="protanopia"] {
  --fg-error: #ea580c;
  --fg-success: #2563eb;
}

/* ── System preferences ─────────────────────────────────── */

@media (prefers-contrast: more) {
  :root {
    --fg-primary: #171717;
    --fg-secondary: #404040;
    --fg-accent: #1e40af;
    --fg-icon: #737373;
    --fg-border: #a3a3a3;
  }
}
```

---

## Component Usage (`@gamut-all/react`)

### App root

```tsx
import tokenJson from './tokens.json';
import { TokenProvider } from '@gamut-all/react';

function App() {
  return (
    <TokenProvider input={tokenJson} strategy="context-aware">
      <Router>
        <Layout />
      </Router>
    </TokenProvider>
  );
}
```

### Text tokens

```tsx
import { StackLayer, TokenizedText } from '@gamut-all/react';

function UserCard({ name, email, role }: UserCardProps) {
  return (
    <StackLayer stack="card" bg="light" className="rounded-xl p-6">
      <TokenizedText token="fgPrimary" as="h3" className="text-lg font-semibold">
        {name}
      </TokenizedText>
      <TokenizedText token="fgSecondary" as="p" className="text-sm mt-1">
        {email}
      </TokenizedText>
      <TokenizedText token="fgTertiary" as="span" className="text-xs mt-2">
        {role}
      </TokenizedText>
    </StackLayer>
  );
}
```

### Icons and borders (non-text tokens)

```tsx
function AlertCard({ message, type }: AlertProps) {
  const iconColor = type === 'error' ? 'var(--fg-error)' : 'var(--fg-success)';

  return (
    <StackLayer stack="card" bg="light" className="rounded-lg p-4">
      <div className="flex items-start gap-3">
        {/* Icon uses non-text token — 3:1 requirement, not 4.5:1 */}
        <svg style={{ color: iconColor }} className="w-5 h-5 mt-0.5" fill="currentColor">
          {type === 'error' ? <ErrorIcon /> : <CheckIcon />}
        </svg>
        <div>
          <TokenizedText token="fgPrimary" as="p" className="text-sm font-medium">
            {message}
          </TokenizedText>
        </div>
      </div>
      {/* Border uses non-text token */}
      <div
        className="mt-3 pt-3"
        style={{ borderTop: '1px solid var(--fg-border)' }}
      >
        <span className="text-[var(--fg-tertiary)] text-xs">2 minutes ago</span>
      </div>
    </StackLayer>
  );
}
```

### Interaction states via CSS

```tsx
function NavLink({ href, children }: NavLinkProps) {
  return (
    <a
      href={href}
      className="transition-colors"
      style={{
        color: 'var(--fg-link)',
        // No JS needed for hover — CSS handles it
      }}
    >
      {children}
      <style>{`
        a:hover { color: var(--fg-link-hover) !important; }
        a:active { color: var(--fg-link-active) !important; }
        a:focus-visible { color: var(--fg-link-focus) !important; }
      `}</style>
    </a>
  );
}

// Or with Tailwind (cleaner):
function NavLinkTW({ href, children }: NavLinkProps) {
  return (
    <a
      href={href}
      className="text-[var(--fg-link)] hover:text-[var(--fg-link-hover)] active:text-[var(--fg-link-active)] focus-visible:text-[var(--fg-link-focus)] transition-colors"
    >
      {children}
    </a>
  );
}
```

### Dashboard with CSS vars

```tsx
function Dashboard() {
  return (
    <TokenProvider input={tokenJson} strategy="context-aware">
      <main className="bg-[var(--bg-white)]">
        <h1 className="text-[var(--fg-primary)] text-2xl font-bold">Dashboard</h1>
        <p className="text-[var(--fg-secondary)] text-sm">Last updated 5 min ago</p>

        <StackLayer stack="card" bg="dark" className="rounded-lg p-4 mt-6">
          <h2 className="text-[var(--fg-primary)] text-lg">Revenue</h2>
          <p className="text-[var(--fg-secondary)]">$1.2M this quarter</p>
          <span className="text-[var(--fg-accent)] hover:text-[var(--fg-link-hover)] text-xs cursor-pointer transition-colors">
            View details →
          </span>
        </StackLayer>

        <StackLayer stack="card" bg="card" className="rounded-lg p-4 mt-4">
          <div className="flex items-center gap-2">
            <svg style={{ color: 'var(--fg-icon)' }} className="w-4 h-4"><AlertIcon /></svg>
            <span className="text-[var(--fg-error)] text-sm font-medium">
              3 alerts need attention
            </span>
          </div>
        </StackLayer>
      </main>
    </TokenProvider>
  );
}
```

### Hooks for custom logic

```tsx
import { useRef } from 'react';
import { useResolvedTokens } from '@gamut-all/react';

function MetricBadge({ value, trend }: { value: string; trend: 'up' | 'down' }) {
  const ref = useRef<HTMLDivElement>(null);
  const tokens = useResolvedTokens(ref);

  return (
    <div ref={ref} className="flex items-center gap-2">
      <span style={{ color: tokens.fgPrimary }} className="text-xl font-bold">
        {value}
      </span>
      <svg style={{ color: trend === 'up' ? tokens.fgSuccess : tokens.fgError }} className="w-4 h-4">
        {trend === 'up' ? <ArrowUp /> : <ArrowDown />}
      </svg>
    </div>
  );
}
```

### Ramp escape hatch

```tsx
function GradientBanner() {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, var(--blue-6), var(--blue-8))`,
        color: 'var(--fg-inverse)',
        padding: 32,
        borderRadius: 12,
      }}
    >
      <h2 className="text-2xl font-bold">Ship faster</h2>
    </div>
  );
}
```

### Vision mode toggle

```tsx
import { useTokenContext } from '@gamut-all/react';

function AccessibilitySettings() {
  const { visionMode, setVisionMode } = useTokenContext();

  return (
    <fieldset>
      <legend className="text-[var(--fg-primary)] font-medium">Color Vision</legend>
      {(['default', 'deuteranopia', 'protanopia', 'tritanopia'] as const).map((mode) => (
        <label key={mode} className="flex items-center gap-2 mt-2">
          <input
            type="radio"
            name="vision"
            value={mode}
            checked={visionMode === mode}
            onChange={() => setVisionMode(mode)}
          />
          <span className="text-[var(--fg-secondary)] text-sm capitalize">{mode}</span>
        </label>
      ))}
    </fieldset>
  );
}
```

### Using core without React

```typescript
import { processInput, buildRegistry, resolveToken, wcag21 } from '@gamut-all/core';
import tokenJson from './tokens.json';

const processed = processInput(tokenJson);
const registry = buildRegistry(processed, wcag21);

const hex = resolveToken('fgSecondary', {
  fontSize: '16px',
  bgClass: 'dark',
  stackDepth: 'root',
  visionMode: 'default',
}, registry);

console.log(hex); // #d4d4d4

// Resolve an icon token — font size doesn't affect the result
const iconHex = resolveToken('fgIcon', {
  fontSize: '12px', // ignored for non-text tokens
  bgClass: 'dark',
  stackDepth: 'root',
  visionMode: 'default',
}, registry);

console.log(iconHex); // #d4d4d4
```

---

## File Structure

```
packages/
├── core/
│   ├── package.json
│   ├── schema.json              # JSON schema for TokenInput
│   ├── src/
│   │   ├── types.ts             # TokenInput, ProcessedRamp, Registry, DesignContext
│   │   ├── schema.ts            # Runtime validation
│   │   ├── processor.ts         # hex → OKLCH, luminance, ramp validation
│   │   ├── rule-generator.ts    # autoGenerateRules, role-aware (skips font-size for non-text)
│   │   ├── registry.ts          # buildRegistry, validateRegistry
│   │   ├── resolver.ts          # resolveToken, resolveAllTokens, fallback chain
│   │   ├── serialize.ts         # Registry ↔ JSON
│   │   ├── css.ts               # generateCSS: base + overrides + interactions + vision
│   │   ├── compliance/
│   │   │   ├── types.ts         # ComplianceEngine interface (with role param)
│   │   │   ├── wcag21.ts        # WCAG 2.1: text (1.4.3) + non-text (1.4.11)
│   │   │   └── apca.ts          # APCA draft (Phase 5)
│   │   ├── utils/
│   │   │   ├── oklch.ts         # hex → OKLCH, OKLCH → relative luminance
│   │   │   └── contrast.ts      # WCAG luminance, contrast ratio
│   │   ├── vite/
│   │   │   └── plugin.ts        # JSON → registry → .ts + .css + .d.ts
│   │   └── index.ts
│   └── tsconfig.json
│
├── react/
│   ├── package.json
│   ├── src/
│   │   ├── TokenProvider.tsx
│   │   ├── hooks.ts
│   │   ├── context-detection.ts
│   │   ├── dom/
│   │   │   ├── font-size.ts
│   │   │   ├── background.ts
│   │   │   └── stack.ts
│   │   ├── components/
│   │   │   ├── StackLayer.tsx
│   │   │   ├── TokenizedText.tsx
│   │   │   ├── TokenizedContainer.tsx
│   │   │   ├── TokenResolver.tsx
│   │   │   ├── TokenInspector.tsx
│   │   │   └── withAutoContrast.tsx
│   │   ├── environment.ts
│   │   └── index.ts
│   └── tsconfig.json
│
└── examples/
    ├── basic/
    ├── tailwind/
    └── vite-plugin/
```

---

## What NOT to Build

- **Color manipulation** — no darken/lighten/blend. Ramps are the API.
- **HSL anything** — OKLCH only internally.
- **Spacing, radius, elevation** — no contrast compliance math, no ramp-step model. Out of scope.
- **CSS/Figma/Style Dictionary parsers** — input is JSON.
- **The token generator** — separate tool that produces ramp arrays.
- **Runtime contrast computation** — registry builder picks steps at build time.
- **Framework adapters beyond React** — core is framework-agnostic; others are future packages.

## Success Criteria

1. A team provides a JSON file with hex arrays + semantic bindings → working resolution layer.
2. `resolveToken()` is ≤5 Map.get() calls, <10μs.
3. Auto-generated rules correctly select compliant steps per background.
4. Manual overrides take precedence over auto-generated rules.
5. `role: "non-text"` tokens validate against 3:1 and skip font-size variants.
6. `role: "text"` tokens validate against 4.5:1 (normal) / 3:1 (large).
7. Interaction states produce `--token-{state}` CSS vars that resolve per context.
8. Background classifier snaps to defined backgrounds by OKLCH lightness.
9. Vision modes select different pre-defined ramp steps.
10. Swapping ComplianceEngine requires zero changes to resolution logic or input JSON.
11. Ramp length is flexible — 10-step and 20-step ramps work identically.
12. CSS custom properties update per `data-bg` / `data-stack` / `data-vision`.
13. JSON schema provides editor autocomplete and catches invalid input.
14. `@gamut-all/core` works in Node/SSR without browser APIs.
15. Vite plugin emits typed unions from input JSON keys.
