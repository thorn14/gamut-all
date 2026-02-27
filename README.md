# gamut-all

![Demo](demo.gif)

Design tokens that are automatic.

Most token systems are hand curated for every single state, with every possible combination. I've built systems that relied on multiple themes, elevations, and varying backgrounds and text colors.

gamut-all does that work. Define your ramps. Name your surfaces. It finds the right color for every context — background, elevation, vision mode — and guarantees WCAG AA/AAA compliance at build time. If a specified step doesn't work, it will choose the next closest color that maps properly. No more semantic token soup.

![Automatic text contrast](/gamut-all/auto-text-contrast.png)
![Automatic stacking background contrast](/gamut-all/text-stacking.png)

**How it works.** You define color ramps (ordered arrays of hex values) and name your surface contexts. The engine evaluates every token × surface × font size × elevation × vision mode combination at build time and emits a flat CSS custom properties file. At runtime, `data-bg`, `data-stack`, and `data-vision` attributes on DOM elements activate the right values through the CSS cascade — no JavaScript required for standard usage.

**What's possible.**

- **Themes** — `data-bg="light"` / `"dark"` / any named background switches the full token set automatically
- **Elevation** — `data-stack="card"` / `"modal"` / `"tooltip"` shifts the surface one or more ramp steps and re-resolves every token against the new surface, no `data-bg` override needed
- **Vision modes** — `data-vision="deuteranopia"` swaps any token that declares an alternate ramp, leaving the rest unchanged
- **Tone variants** — per-surface ramp overrides let you shift the entire palette (warm stone, cool gray, night neutral) without duplicating token definitions
- **Interactions** — `hover`, `active`, and `focus` steps emit as separate CSS vars (`--fg-link-hover`) with no extra config
- **Compliance** — WCAG 2.1 or APCA; AA or AAA; verified at build time with a CLI coverage report showing exactly which ramp steps pass on which surfaces

---

## vs. Standard Semantic Token Systems

Traditional semantic token systems (Style Dictionary, Theo, W3C Design Tokens) ask you to define every combination by hand:

```json
{
  "color-text-primary-light":              { "value": "{color-slate-900}" },
  "color-text-primary-dark":               { "value": "{color-slate-100}" },
  "color-text-primary-light-card":         { "value": "{color-slate-900}" },
  "color-text-primary-dark-card":          { "value": "{color-slate-200}" },
  "color-text-primary-light-modal":        { "value": "{color-slate-900}" },
  "color-text-primary-dark-modal":         { "value": "{color-slate-300}" },
  "color-text-primary-deuteranopia-light": { "value": "{color-slate-900}" },
  "color-text-primary-deuteranopia-dark":  { "value": "{color-slate-100}" }
  ...
}
```

Every new surface, stack level, font size, vision mode, or interaction state multiplies the work. Compliance is checked manually — or not at all. When a ramp changes, every downstream token is suspect.

The combinatorial math is brutal. A modest system — 7 tokens, 3 backgrounds, 6 elevations, 6 font sizes, 5 vision modes — has **6,300 possible combinations** before interaction states. Teams handle this by only supporting a fraction of them and leaving the rest as undocumented behaviour.

**gamut-all collapses that to a single config.** The same 7-token system, fully specified with all combinations generated and compliance-verified, is 125 lines of JSON producing 1,404 resolved variants automatically.

| | Standard tokens | gamut-all |
|---|---|---|
| Define each theme variant | ✗ manually | ✓ automatic |
| Define each elevation variant | ✗ manually | ✓ automatic |
| Define vision mode overrides | ✗ manually | ✓ declare ramp, rest is generated |
| Compliance checked | ✗ manually or not at all | ✓ at build time, every variant |
| New surface added | ✗ update every token | ✓ update one background entry |
| Ramp color changed | ✗ audit all downstream tokens | ✓ re-run build |
| Coverage visibility | ✗ none | ✓ `gamut-audit --report coverage` |

The tradeoff: gamut-all requires ramp-based color definitions. If your palette is arbitrary (non-sequential hex values with no ramp structure), the auto-resolution can't work. Ramps are the prerequisite — which is already best practice for any system that needs dark mode.

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

For CI auditing:

```bash
pnpm add -D @gamut-all/audit
```

### For LLM Agents

Read the schema first, then create `tokens.json` at the project root:

```bash
cat node_modules/@gamut-all/core/schema.json
```

The schema is the source of truth. Add `$schema` to your `tokens.json` for IDE autocomplete:

```json
{ "$schema": "node_modules/@gamut-all/core/schema.json" }
```

---

## tokens.json

One file drives everything. Three sections required, one optional.

```json
{
  "$schema": "node_modules/@gamut-all/core/schema.json",
  "config": {
    "wcagTarget": "AA",
    "complianceEngine": "wcag21"
  },
  "primitives": {
    "slate": ["#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8",
              "#64748b", "#475569", "#334155", "#1e293b", "#0f172a", "#020617"],
    "blue":  ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa",
              "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a", "#172554"]
  },
  "backgrounds": {
    "light": { "ramp": "slate", "step": 0, "fallback": ["dark"] },
    "dark":  { "ramp": "slate", "step": 9, "fallback": ["light"] }
  },
  "semantics": {
    "fgPrimary": { "ramp": "slate", "defaultStep": 9 },
    "fgLink": {
      "ramp": "blue",
      "defaultStep": 6,
      "interactions": { "hover": { "step": 8 }, "active": { "step": 9 } }
    }
  }
}
```

Use it in markup with `data-bg` for theme switching and `data-stack` for elevation:

```html
<!-- Theme -->
<html data-bg="dark">

<!-- Elevation — no data-bg needed, cascades from the ancestor -->
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
| `stepSelectionStrategy` | `"mirror-closest"` | How to find the nearest passing step when the default fails |
| `onUnresolvedOverride` | `"warn"` | What to do when a manual override fails compliance: `"error"`, `"warn"`, or `"ignore"` |
| `stacks` | `{ root: 0, card: 1, popover: 2, tooltip: 2, modal: 2, overlay: 3 }` | Elevation offsets per stack level — each shifts the surface by N ramp steps |

### `backgrounds`

| Field | Description |
|---|---|
| `ramp` | Which primitive ramp to use |
| `step` | Index into the ramp (0 = lightest) |
| `fallback` | Other backgrounds to inherit from when a token has no entry for this one |
| `tone` | Optional per-tone ramp overrides (e.g. warm/cool/night variants) |

### `semantics`

| Field | Description |
|---|---|
| `ramp` | Source ramp for this token |
| `defaultStep` | Preferred step — auto-adjusted to the nearest compliant step if it fails |
| `tone` | Per-tone ramp + step overrides |
| `vision` | Per-vision-mode ramp + step overrides (`deuteranopia`, `protanopia`, `tritanopia`) |
| `interactions` | Interaction state steps — `hover`, `active`, `focus` |

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

# JSON output, AAA level, APCA engine
gamut-audit --registry ./dist/registry.json \
  --report coverage --font-size 12 --format json --level AAA --engine apca
```

| Flag | Default | Description |
|---|---|---|
| `--registry <path>` | — | Serialized registry JSON (required) |
| `--html <path>` | — | Static HTML to audit (requires `jsdom`) |
| `--engine` | `wcag21` | `wcag21` or `apca` |
| `--level` | `AA` | `AA` or `AAA` |
| `--format` | `text` | `text` or `json` |
| `--report` | `audit` | `audit` or `coverage` |
| `--font-size` | `16` | Font size in px for coverage report |

---

## Packages

| Package | Description |
|---|---|
| [`@gamut-all/core`](./packages/core) | Token processing, registry, CSS generation, Vite plugin |
| [`@gamut-all/react`](./packages/react) | `TokenProvider`, `StackLayer`, hooks, `withAutoContrast` |
| [`@gamut-all/audit`](./packages/audit) | `gamut-audit` CLI, `auditRegistry`, `auditCoverage` |
