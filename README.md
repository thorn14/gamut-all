# gamut-all

![Demo](demo.gif)

Design tokens that are automatic.

Most token systems are hand-curated for every single state, with every possible combination. gamut-all automates that work. Define your ramps. Name your themes and surfaces. It finds the right color for every context — background, elevation, vision mode — and guarantees WCAG AA/AAA compliance at build time. If a specified step doesn't work, it will choose the next closest color that maps properly. No more semantic token soup.

**How it works.** You define color ramps (ordered arrays of hex or OKLCH values) and name your theme and surface contexts. The engine evaluates every token × surface × font size × elevation × vision mode combination at build time and emits a flat CSS custom properties file. At runtime, `data-theme`, `data-stack`, and `data-vision` attributes on DOM elements activate the right values through the CSS cascade — no JavaScript required for standard usage.

**What's possible.**

- **Themes** — `data-theme="light"` / `"dark"` / any named theme switches the full token set automatically
- **Elevation** — `data-stack="card"` / `"modal"` / `"tooltip"` shifts the surface one or more ramp steps and re-resolves every token against the new surface, no `data-theme` override needed
- **Vision modes** — `data-vision="deuteranopia"` swaps tokens that declare alternate ramps or uses automated CVD simulation to find distinguishable passing steps
- **Compliance** — WCAG 2.1 or APCA; AA or AAA; verified at build time with a CLI coverage report showing exactly which ramp steps pass on which surfaces
- **Contextual Overrides** — Surgical overrides for specific backgrounds, font sizes, or stack levels when auto-resolution needs a hint

---

## vs. Standard Semantic Token Systems

Traditional semantic token systems (Style Dictionary, Theo, W3C Design Tokens) ask you to define every combination by hand. Every new surface, stack level, font size, vision mode, or interaction state multiplies the work.

| | Standard tokens | gamut-all |
|---|---|---|
| Define each theme variant | ✗ manually | ✓ automatic |
| Define each elevation variant | ✗ manually | ✓ automatic |
| Define vision mode overrides | ✗ manually | ✓ declare ramp, rest is generated |
| Compliance checked | ✗ manually or not at all | ✓ at build time, every variant |
| New surface added | ✗ update every token | ✓ update one theme/surface entry |
| Ramp color changed | ✗ audit all downstream tokens | ✓ re-run build |
| Coverage visibility | ✗ none | ✓ `gamut-audit --report coverage` |

---

## Installation

### For Humans

```bash
pnpm add @gamut-all/core
```

Add the Vite plugin:

```ts
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

Import the generated CSS in your entry point:

```ts
import './generated/tokens.css';
```

For React:

```bash
pnpm add @gamut-all/react
```

### For LLM Agents

The schema is the source of truth for the `tokens.json` structure. You can find it in `@gamut-all/core/schema.json`.

---

## tokens.json

One file drives everything.

```json
{
  "$schema": "node_modules/@gamut-all/core/schema.json",
  "config": {
    "wcagTarget": "AA",
    "complianceEngine": "wcag21",
    "defaultTheme": "light"
  },
  "primitives": {
    "slate": ["#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8",
              "#64748b", "#475569", "#334155", "#1e293b", "#0f172a", "#020617"],
    "blue":  ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa",
              "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a", "#172554"]
  },
  "themes": {
    "light": { "ramp": "slate", "step": 0, "fallback": ["dark"] },
    "dark":  { "ramp": "slate", "step": 9, "fallback": ["light"] }
  },
  "foreground": {
    "fgPrimary": { "ramp": "slate", "defaultStep": 9 },
    "fgLink": {
      "ramp": "blue",
      "defaultStep": 6,
      "interactions": { "hover": { "step": 8 }, "active": { "step": 9 } }
    }
  },
  "nonText": {
    "borderAction": { "ramp": "blue", "defaultStep": 5 }
  }
}
```

Use it in markup with `data-theme` for theme switching and `data-stack` for elevation:

```html
<!-- Theme -->
<html data-theme="dark">

<!-- Elevation — cascades from the ancestor -->
<div data-stack="card">
  <div data-stack="modal">
    <div data-stack="tooltip">
```

---

## Configuration

### `config`

| Field | Default | Description |
|---|---|---|
| `wcagTarget` | `"AA"` | Minimum contrast level — `"AA"` or `"AAA"` |
| `complianceEngine` | `"wcag21"` | `"wcag21"` (ratio) or `"apca"` (Lc value) |
| `defaultTheme` | — | The theme used for `:root` styles |
| `stepSelectionStrategy` | `"mirror-closest"` | How to find the nearest passing step when the default fails |
| `onUnresolvedOverride` | `"warn"` | What to do when a manual override fails compliance |
| `stacks` | `{ root: 0, card: 1, popover: 2, ... }` | Elevation offsets per stack level |
| `cvd` | `{ enabled: true, ... }` | Color Vision Deficiency simulation options |

### `themes` / `surfaces`

| Field | Description |
|---|---|
| `ramp` | Which primitive ramp to use |
| `step` | Index into the ramp (0 = lightest) |
| `fallback` | (Themes only) Other themes to inherit from when a token has no entry for this one |
| `aliases` | (Themes only) Alternate names for this theme |

### `foreground` / `nonText` (Tokens)

| Field | Description |
|---|---|
| `ramp` | Source ramp for this token |
| `defaultStep` | Preferred step — auto-adjusted to the nearest compliant step if it fails |
| `decorative` | If true, WCAG contrast checks are bypassed |
| `interactions` | Interaction state steps — `hover`, `active`, `focus` |
| `overrides` | Array of context-specific overrides (`bg`, `fontSize`, `stack`, `step`) |

---

## React Components & Hooks

The `@gamut-all/react` package provides tools for using tokens in React applications.

- **`TokenProvider`** — Top-level provider that manages the token registry and context.
- **`TokenizedText`** — A component that automatically applies the correct foreground tokens and font-size context.
- **`StackLayer`** — A component that increments the `data-stack` attribute and updates the internal elevation context.
- **`useToken(tokenName)`** — Hook to resolve a token value for the current context.
- **`useTokenVars()`** — Hook to get all token values as a CSS-variable-compatible object.
- **`withAutoContrast(Component)`** — HOC that ensures children meet contrast requirements by injecting appropriate background/foreground props.

---

## Commands

### Workspace

```bash
pnpm build      # build all packages
pnpm test       # run all tests
pnpm typecheck  # typecheck all packages
```

### Audit CLI

```bash
# Check every variant passes compliance — exits 1 on failure
gamut-audit --registry ./dist/registry.json

# Coverage report — passing step ranges per token × surface
gamut-audit --registry ./dist/registry.json --report coverage

# Audit a static HTML file against the registry
gamut-audit --registry ./dist/registry.json --html ./dist/index.html
```

---

## Packages

| Package | Description |
|---|---|
| [`@gamut-all/core`](./packages/core) | Token processing, registry, CSS generation, Vite plugin |
| [`@gamut-all/react`](./packages/react) | `TokenProvider`, `StackLayer`, hooks, automatic contrast components |
| [`@gamut-all/audit`](./packages/audit) | `gamut-audit` CLI for CI/CD compliance auditing |
