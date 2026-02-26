# Contextual Design Token Resolution System

## What This Is

Two primary npm packages that resolve semantic color tokens (like `fgSecondary`) to specific values from color ramps based on context keys: font size class, declared background class, stack layer, and vision mode. Any team plugs in their own tokens via a single JSON file. The system builds a pre-computed lookup table and guarantees accessibility through ramp-step selection, not runtime color math. An optional third package provides CI audits.

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
- DOM context binding (reads declared context keys and inheritance)

The boundary: **core owns the math and the data, react owns the DOM and the component model.** A Vue or Svelte adapter would import core and build its own reactive layer.

---

## Key Constraints

- **No color manipulation or background inference at runtime.** Runtime resolution is Map lookup only.
- **OKLCH internally.** The system converts input hex to OKLCH for perceptual ordering and luminance. Teams provide hex; the system does the conversion during registry build.
- **Pluggable via one JSON file.** Teams don't adopt a framework — they describe their tokens and the system does the rest.
- **Color blindness is a context dimension**, not a filter. Different vision modes select different ramp steps or entirely different ramps.
- **Compliance engine is swappable through a neutral contract.** WCAG 2.1 today, APCA tomorrow, no resolver rewrite.
- **Text color tokens only in v1.** Non-text/image/icon/border token compliance is deferred to a later phase.
- **Color only.** Spacing, radius, elevation, and other non-color tokens are out of scope.

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

That's the minimum. No overrides and no vision modes. The system auto-generates text contrast rules by walking each ramp to find compliant steps per background.

### Full Example (with all optional fields)

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
    "white":   { "ramp": "neutral", "step": 0, "fallback": ["light", "card"], "aliases": ["bg-white", "surface-0"] },
    "light":   { "ramp": "neutral", "step": 1, "fallback": ["white", "card"], "aliases": ["bg-light", "surface-1"] },
    "card":    { "ramp": "neutral", "step": 2, "fallback": ["light", "white"], "aliases": ["bg-card", "surface-card"] },
    "dark":    { "ramp": "neutral", "step": 8, "fallback": ["inverse"], "aliases": ["bg-dark", "surface-dark"] },
    "inverse": { "ramp": "neutral", "step": 9, "fallback": ["dark"], "aliases": ["bg-inverse", "surface-inverse"] }
  },

  "semantics": {
    "fgPrimary": {
      "ramp": "neutral",
      "defaultStep": 8,
      "overrides": [
        { "bg": ["dark", "inverse"], "step": 1 },
        { "bg": ["dark", "inverse"], "fontSize": ["24px", "32px"], "step": 2 },
        { "bg": "white", "fontSize": "12px", "step": 9 }
      ]
    },
    "fgSecondary": {
      "ramp": "neutral",
      "defaultStep": 5,
      "overrides": [
        { "bg": "light", "step": 6 },
        { "bg": "card", "step": 6 },
        { "bg": ["dark", "inverse"], "step": 3 },
        { "bg": "white", "fontSize": "12px", "step": 6 },
        { "bg": "white", "fontSize": ["24px", "32px"], "step": 4 }
      ]
    },
    "fgTertiary":  { "ramp": "neutral", "defaultStep": 4 },
    "fgAccent":    { "ramp": "blue",    "defaultStep": 6 },
    "fgDisabled":  { "ramp": "neutral", "defaultStep": 3 },
    "fgInverse":   { "ramp": "neutral", "defaultStep": 1 },
    "fgLink": {
      "ramp": "blue",
      "defaultStep": 6,
      "interactions": {
        "hover":  { "step": 8 },
        "active": { "step": 9 },
        "focus":  { "step": 7 }
      }
    },
    "fgError": {
      "ramp": "red",
      "defaultStep": 6,
      "vision": {
        "deuteranopia": { "ramp": "orange", "defaultStep": 7 },
        "protanopia":   { "ramp": "orange", "defaultStep": 7 }
      }
    },
    "fgSuccess": {
      "ramp": "green",
      "defaultStep": 6,
      "vision": {
        "deuteranopia": { "ramp": "blue", "defaultStep": 6 },
        "protanopia":   { "ramp": "blue", "defaultStep": 6 }
      }
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
    /** @default "error" */
    onUnresolvedOverride?: 'error' | 'warn';
  };
  /** Color ramps. Key = ramp name, value = hex strings ordered light → dark. Any length. */
  primitives: Record<string, string[]>;
  /** Named backgrounds. Optional fallback/aliases avoid runtime color guessing. */
  backgrounds: Record<string, BackgroundInput>;
  /** Semantic tokens. Ramp + default step, optional overrides, vision modes, interactions. */
  semantics: Record<string, SemanticInput>;
}

interface BackgroundInput {
  ramp: string;
  step: number;
  fallback?: string[];   // resolution fallback order
  aliases?: string[];    // optional CSS class/var aliases for CI audits
}

type SemanticInput = {
  ramp: string;
  defaultStep: number;
  /** Manual context patches layered on top of auto-generated coverage. */
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

### Scope in v1

This contract covers **text color tokens only** (`WCAG 2.1 1.4.3` behavior by default).  
Non-text/image/icon/border tokens are intentionally deferred so the first implementation stays coherent and predictable.

### Coverage and Override Model

Override behavior is deterministic and easy to explain:

1. Build a full baseline matrix from auto-generation for every token across background × font size × stack × vision.
2. Apply `overrides` as patches on top of that matrix.
3. Re-validate the final matrix.

Specificity and precedence:
- Specificity is the count of dimensions matched: a 3-dimension match (`bg+fontSize+stack`) beats a 2-dimension match (`bg+fontSize`, `bg+stack`, `fontSize+stack`), which beats a 1-dimension match (`bg`, `fontSize`, `stack`).
- Ties (equal dimension count) are resolved by declaration order (last wins).
- Unknown targets in overrides fail build by default (`onUnresolvedOverride: "error"`), or warn if configured.

### Background Classification Strategy (No Hue/Chroma Adjustment)

For v1, do not infer background classes from sampled DOM colors.  
Use declared background keys and inheritance (`data-bg`), then fallback chains from `backgrounds[*].fallback`.

To catch mistakes, use CI audit mode:
- Match declared background aliases (`backgrounds[*].aliases`) against DOM classes/vars.
- Flag elements with token usage but no background class.
- Optionally run luminance-only heuristics as warnings, never as runtime resolution input.

### Compliance Engine Contract (Pluggable)

Instead of exposing WCAG-specific threshold math, engines expose pass/fail evaluation for a candidate pair:

```typescript
type ComplianceContext = {
  fontSizePx: number;
  fontWeight: number;
  target: 'text';
  level: 'AA' | 'AAA';
};

type ComplianceEvaluation = {
  pass: boolean;
  metric: string; // e.g. 'wcag21-ratio' or 'apca-lc'
  value: number;
  required?: number;
  polarity?: 'dark-on-light' | 'light-on-dark';
};

interface ComplianceEngine {
  id: string;
  evaluate(fgHex: string, bgHex: string, context: ComplianceContext): ComplianceEvaluation;
  preferredDirection?(bgHex: string): 'lighter' | 'darker' | 'either';
}
```

Why this shape works:
- WCAG can implement `metric = "wcag21-ratio"` with ratio pass/fail.
- APCA can implement `metric = "apca-lc"` with polarity-sensitive rules.
- Resolver and rule generator only need `pass`, so swapping engines does not change resolver logic.

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

Interaction variants are validated with the same engine and context model as base tokens. Teams can patch specific states with overrides when the generated step is not the intended visual hierarchy.

### What the System Does With the Input

During registry build (build-time plugin or CI precompile step):

1. **Validate input** against JSON schema. Catch ramp references that don't exist, step indices out of bounds, duplicate semantic names.

2. **Process primitives** — for each ramp, convert every hex to OKLCH and cache `relativeLuminance`. Warn if steps aren't monotonically ordered by luminance (auto-sort if fixable).

3. **Resolve backgrounds** — look up each background's hex from its ramp + step.

4. **Process semantics** — for each token:
   - Auto-generate a baseline matrix for all contexts.
   - If `interactions` provided, generate baseline matrices for each interaction state.
   - If `vision` overrides exist, repeat generation for each vision mode.
   - Apply manual `overrides` as context patches over generated results.
   - Re-validate post-patch; fail or warn based on `onUnresolvedOverride`.

5. **Build registry** — expand all combinations into the variant Map. Validate every entry.

### Auto-Rule Generation

```typescript
function autoGenerateRules(
  tokenRamp: ProcessedRamp,
  defaultStep: number,
  backgrounds: Map<string, ProcessedBackground>,
  compliance: ComplianceEngine,
  fontSizes: FontSizeClass[],
  stacks: StackClass[]
): ContextRule[] {
  // FontSizeClass values are intentionally numeric px strings ('12px', '14px', …)
  // so that parseInt(fontSize, 10) gives the pixel value for ComplianceContext.
  //
  // v1 limitation: fontWeight is fixed at 400. Bold-text WCAG thresholds are not
  // modelled in v1; teams can add manual overrides for bold large text if needed.
  const rules: ContextRule[] = [];
  for (const [bgName, bg] of backgrounds) {
    for (const fontSize of fontSizes) {
      for (const stack of stacks) {
        const context = {
          fontSizePx: parseInt(fontSize, 10),
          fontWeight: 400,
          target: 'text' as const,
          level: 'AA' as const,
        };

        const baseStep = tokenRamp.steps[defaultStep];
        const baseEval = compliance.evaluate(baseStep.hex, bg.hex, context);
        if (baseEval.pass) continue;

        const searchDirection =
          compliance.preferredDirection?.(bg.hex) ??
          (bg.relativeLuminance > 0.5 ? 'darker' : 'lighter');
        const passingStep = findClosestPassingStep(
          tokenRamp,
          defaultStep,
          (candidateHex) => compliance.evaluate(candidateHex, bg.hex, context).pass,
          searchDirection
        );

        if (passingStep !== null && passingStep !== defaultStep) {
          const rule: ContextRule = { bg: bgName, fontSize, stack, step: passingStep };
          rules.push(rule);
        }
      }
    }
  }

  // deduplicateRules collapses rules with identical bg+fontSize+stack keys,
  // keeping the last-declared entry (matches override precedence order).
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
- `ComplianceEngine` neutral interface + WCAG 2.1 implementation
- `autoGenerateRules()` — walk ramp to find compliant steps via `engine.evaluate()`
- `buildRegistry(processed, complianceEngine): TokenRegistry` — expand all variants including interaction states
- `resolveToken(token, context, registry): string` — bounded fallback lookups, target <10μs
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
// apca is added in Phase 5
export type { TokenInput, SemanticInput, TokenRegistry, ComplianceEngine, ... } from './types';
```

**Test by:**
- Feed sample JSON → build registry → resolve across contexts → validate all pass AA
- Confirm auto-rules select correct steps for dark/light backgrounds
- Confirm override patches are applied by specificity then declaration order
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
- Terminal output: variant count, pass rates, failures, unresolved override targets

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
export type TokenName = 'fgPrimary' | 'fgSecondary' | 'fgTertiary' | 'fgAccent' | 'fgDisabled' | 'fgInverse' | 'fgLink' | 'fgError' | 'fgSuccess';
export type InteractionTokenName = 'fgLink-hover' | 'fgLink-active' | 'fgLink-focus';
export type BackgroundClass = 'white' | 'light' | 'card' | 'dark' | 'inverse';
export type RampName = 'neutral' | 'blue' | 'red' | 'orange' | 'green';
```

### Phase 3: `@gamut-all/react` — Provider + Hooks

**Build:**
- `<TokenProvider>` — accepts pre-built `TokenRegistry` (preferred) or `TokenInput` in dev only
- DOM context binding:
  - Font size classifier: reads `getComputedStyle(el).fontSize`, then buckets to the nearest `FontSizeClass` by rounding down to the largest class ≤ computed value (floor bucketing). Values below `12px` clamp to `'12px'`; values above `32px` clamp to `'32px'`.
  - Background class reader (`data-bg`) with nearest `StackLayer` inheritance
  - Stack layer reader (`data-stack`) with nearest `StackLayer` inheritance
- `useDesignContext(ref)` — ResizeObserver + MutationObserver, debounced, shallow-compare
- `useToken(tokenName, ref)` → hex
- `useResolvedTokens(ref)` → includes interaction variants
- `useTokenVars(ref)` → CSSProperties with `--fg-*` and `--fg-*-hover` etc.
- `useTokenColor(tokenName, { bg?, stack? })` → hex without a ref
- `<StackLayer stack="modal" bg="dark">` — boundary component

**Test by:**
- Nested StackLayers resolve tokens differently per layer
- Missing `data-bg` emits dev warning and falls back to configured default

### Phase 4: `@gamut-all/react` — Consumer Components + HOC

**Build:**
- `<TokenizedText token="fgSecondary" as="p">`
- `<TokenizedContainer bg="dark" stack="card">`
- `withAutoContrast(Component, { tokens })` — HOC that injects resolved token hex values as props (e.g., `color`, `style.color`) from the registry without any runtime color math; resolution is still a Map lookup
- `<TokenResolver>` (render prop)
- `<TokenInspector>` (dev-only debug overlay — shows context keys, compliance metric, interaction states)

### Phase 5: Vision Mode + Compliance Extensibility

**`@gamut-all/core`:**
- Vision-aware auto-rule generation (`autoGenerateRules` loops over vision modes)
- APCA compliance engine (behind config flag; adds `apca.ts` + export)

**`@gamut-all/react`:**
- `visionMode` in provider context + `setVisionMode()`
- `data-vision` attribute on root element

### Phase 6: CI Audit Tooling (`@gamut-all/audit`) (Optional)

**Build:**
- CLI that loads generated registry + app pages (Playwright)
- Verifies token usage is tagged with declared context keys (`data-bg`, `data-stack`, `data-vision`)
- Audits computed foreground/background pairs with selected compliance engine
- Reports unknown backgrounds, missing context tags, and non-compliant combinations

---

## Internal Data Model (`@gamut-all/core`)

```typescript
/** Intermediate result of processInput — consumed by buildRegistry. */
interface ProcessedInput {
  ramps: Map<string, ProcessedRamp>;
  backgrounds: Map<string, ProcessedBackground>;
  semantics: Map<string, ProcessedSemantic>;
  config: Required<NonNullable<TokenInput['config']>>;
}

/** A single resolved context rule produced by autoGenerateRules. */
interface ContextRule {
  bg: string;
  fontSize: FontSizeClass;
  stack: StackClass;
  step: number;
}

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
  fallback: string[];
  aliases: string[];
}

interface ResolvedVariant {
  ramp: string;
  step: number;
  hex: string;
  compliance: ComplianceEvaluation;
}

type VariantKey = `${string}__${FontSizeClass}__${string}__${StackClass}__${VisionMode}`;

interface TokenRegistry {
  ramps: Map<string, ProcessedRamp>;
  backgrounds: Map<string, ProcessedBackground>;
  backgroundFallbacks: Record<string, string[]>;
  variantMap: Map<VariantKey, ResolvedVariant>;
  defaults: Record<string, string>;
  meta: {
    generatedAt: string;
    totalVariants: number;
    tokenCount: number;
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

  // 3. Relax stack toward 'root' — try current visionMode first, then 'default'
  for (const stack of STACK_FALLBACK[context.stackDepth] ?? []) {
    const sKey = `${token}__${context.fontSize}__${context.bgClass}__${stack}__${context.visionMode}`;
    const sFallback = registry.variantMap.get(sKey);
    if (sFallback) return sFallback.hex;

    if (context.visionMode !== 'default') {
      const svKey = `${token}__${context.fontSize}__${context.bgClass}__${stack}__default`;
      const svFallback = registry.variantMap.get(svKey);
      if (svFallback) return svFallback.hex;
    }
  }

  // 4. Relax background using declared fallback chain from input/build metadata
  for (const bg of registry.backgroundFallbacks[context.bgClass] ?? []) {
    const bKey = `${token}__${context.fontSize}__${bg}__root__${context.visionMode}`;
    const bFallback = registry.variantMap.get(bKey);
    if (bFallback) return bFallback.hex;
  }

  // 5. Default
  return registry.defaults[token];
}
```

Interaction variants are resolved with the same function — `fgLink-hover` is its own key in the registry. `resolveAllTokens` returns both base and interaction tokens.

---

## CSS Output (`@gamut-all/core`)

**Naming convention:** Semantic token names are converted from camelCase to kebab-case and prefixed with `--` (e.g., `fgPrimary` → `--fg-primary`, `fgLink` → `--fg-link`). Interaction variants append `-{state}` (e.g., `fgLink` hover → `--fg-link-hover`).

**`:root` represents the default background:** The `:root` block contains values for the implicit default context (no `data-bg` attribute). Per-background overrides are declared as `[data-bg="…"]` attribute selectors. The background with the lowest ramp step (lightest) typically matches `:root`; if teams need an explicit default, a `defaultBg` config key may be added in a future version.

```css
/* ── Base tokens ────────────────────────────────────────── */

:root {
  --fg-primary: #262626;
  --fg-secondary: #737373;
  --fg-tertiary: #a3a3a3;
  --fg-accent: #2563eb;
  --fg-disabled: #d4d4d4;
  --fg-inverse: #f5f5f5;
  --fg-link: #2563eb;
  --fg-error: #dc2626;
  --fg-success: #16a34a;

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

  --fg-link-hover: #60a5fa;
  --fg-link-active: #3b82f6;
}

[data-bg="inverse"] {
  --fg-primary: #fafafa;
  --fg-secondary: #d4d4d4;
  --fg-accent: #bfdbfe;
  --fg-error: #fecaca;
  --fg-success: #bbf7d0;
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
```

---

## Component Usage (`@gamut-all/react`)

### App root

```tsx
import { TokenProvider } from '@gamut-all/react';
import { registry } from 'virtual:design-tokens';

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
    <TokenProvider registry={registry}>
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
            <svg style={{ color: 'var(--fg-accent)' }} className="w-4 h-4"><AlertIcon /></svg>
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
│   │   ├── rule-generator.ts    # autoGenerateRules + override patch application
│   │   ├── registry.ts          # buildRegistry, validateRegistry
│   │   ├── resolver.ts          # resolveToken, resolveAllTokens, fallback chain
│   │   ├── serialize.ts         # Registry ↔ JSON
│   │   ├── css.ts               # generateCSS: base + overrides + interactions + vision
│   │   ├── compliance/
│   │   │   ├── types.ts         # ComplianceEngine neutral contract
│   │   │   └── wcag21.ts        # WCAG 2.1 text contrast implementation
│   │   │   # apca.ts added in Phase 5
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
│   │   ├── context-detection.ts  # orchestrator: composes dom/* into a DesignContext
│   │   ├── dom/
│   │   │   ├── font-size.ts      # reads + buckets computed font size
│   │   │   ├── background.ts     # reads data-bg attribute + inheritance
│   │   │   └── stack.ts          # reads data-stack attribute + inheritance
│   │   ├── components/
│   │   │   ├── StackLayer.tsx
│   │   │   ├── TokenizedText.tsx
│   │   │   ├── TokenizedContainer.tsx
│   │   │   ├── TokenResolver.tsx
│   │   │   ├── TokenInspector.tsx
│   │   │   └── withAutoContrast.tsx
│   │   ├── audit-helpers.ts      # dev/CI utilities: check data-bg coverage, warn on missing context tags
│   │   └── index.ts
│   └── tsconfig.json
│
├── audit/                        # Optional CI package
│   ├── package.json
│   ├── src/
│   │   ├── cli.ts
│   │   ├── playwright-runner.ts
│   │   └── report.ts
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
- **CSS/Figma/Style Dictionary parsers** — input is JSON.
- **The token generator** — separate tool that produces ramp arrays.
- **Runtime contrast computation** — registry builder picks steps at build time.
- **Runtime background color sampling** — use declared context keys, not inferred DOM colors.\
- **Framework adapters beyond React** — core is framework-agnostic; others are future packages.

## Success Criteria

1. A team provides a JSON file with hex arrays + semantic bindings → working resolution layer.
2. `resolveToken()` stays in a bounded fallback path and resolves in <10μs.
3. Auto-generated rules correctly select compliant steps per background.
4. Full baseline matrix is generated first, then manual overrides patch it by deterministic precedence.
5. Text tokens validate against configured level (WCAG AA/AAA in v1).
6. Interaction states produce `--token-{state}` CSS vars that resolve per context.
7. Background resolution uses declared `data-bg` + fallback chains, not runtime color inference.
8. Vision modes select different pre-defined ramp steps.
9. Swapping `ComplianceEngine` requires zero changes to resolver logic or input schema shape.
10. Ramp length is flexible — 10-step and 20-step ramps work identically.
11. CSS custom properties update per `data-bg` / `data-stack` / `data-vision`.
12. JSON schema provides editor autocomplete and catches invalid input.
13. `@gamut-all/core` works in Node/SSR without browser APIs.
14. Vite plugin emits typed unions from input JSON keys.
15. Optional CI audit catches missing context tags and non-compliant rendered pairs.
