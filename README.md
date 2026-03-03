# gamut-all

![Demo](demo.gif)

Design tokens that are automatic.

Most token systems require hand-curating every state — every theme variant, every elevation level, every vision mode. gamut-all automates that work. Define your color ramps and name your themes and surfaces. The engine evaluates every token × surface × font size × elevation × vision mode combination at build time and emits a flat CSS custom properties file. At runtime, `data-theme`, `data-stack`, and `data-vision` attributes on DOM elements activate the right values through the CSS cascade — no JavaScript required for standard usage.

**What's possible.**

- **Themes** — `data-theme="light"` / `"dark"` / any named theme switches the full token set automatically
- **Surfaces** — Named colored backgrounds (`bgBrand`, `bgDanger`) emitted as `--bg-*` CSS vars, with hover/active states and automatic dark-theme adaptation via ramp mirroring or nearest fit
- **Elevation** — `data-stack="modal"` / `"tooltip"` shifts the surface one or more ramp steps and re-resolves every token against the new surface hex
- **CVD simulation** — Automatic hue-shifted variants for all six chromatic vision deficiency types, applied to both semantic tokens and surface backgrounds. Activates via `data-vision`.
- **Compliance** — WCAG 2.1 or APCA; AA or AAA; verified at build time with a CLI coverage report showing exactly which ramp steps pass on which surfaces
- **Contextual overrides** — Surgical overrides for specific backgrounds, font sizes, or stack levels when auto-resolution needs a hint

---

## vs. Standard semantic token systems

| | Standard tokens | gamut-all |
|---|---|---|
| Define each theme variant | ✗ manually | ✓ automatic |
| Define each elevation variant | ✗ manually | ✓ automatic |
| Surface dark-theme adaptation | ✗ manually | ✓ auto-mirrors across ramp midpoint |
| Surface hover/active states | ✗ separately defined | ✓ inline `interactions` |
| Vision mode overrides | ✗ manually | ✓ auto-generated via CVD simulation |
| Compliance checked | ✗ manually or not at all | ✓ at build time, every variant |
| New surface added | ✗ update every token | ✓ update one surface entry |
| Ramp color changed | ✗ audit all downstream tokens | ✓ re-run build |
| Coverage visibility | ✗ none | ✓ `gamut-audit --report coverage` |

---

## Installation

```bash
pnpm add @gamut-all/core        # token engine, Vite plugin, CSS generation
pnpm add @gamut-all/react       # React provider, hooks, components
pnpm add @gamut-all/audit       # gamut-audit CLI for CI
```

Add the Vite plugin:

```ts
// vite.config.ts
import { designTokensPlugin } from '@gamut-all/core/vite';

export default defineConfig({
  plugins: [
    designTokensPlugin({ input: './tokens.json' }),
  ],
});
```

Import the generated CSS in your entry point:

```ts
import './generated/tokens.css';
```

### For LLM Agents

The schema is the source of truth for the `tokens.json` structure: `node_modules/@gamut-all/core/schema.json`.

---

## tokens.json

Two files drive everything. Primitives live in their own file so the ramp palette can be shared, versioned, and swapped independently of the token definitions.

**`primitives.json`**

```json
{
  "$schema": "node_modules/@gamut-all/core/primitives-schema.json",
  "slate":   ["#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8",
              "#64748b", "#475569", "#334155", "#1e293b", "#0f172a"],
  "blue":    ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa",
              "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a"],
  "red":     ["#fef2f2", "#fee2e2", "#fecaca", "#fca5a5", "#f87171",
              "#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d"],
  "emerald": ["#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399",
              "#10b981", "#059669", "#047857", "#065f46", "#064e3b"]
}
```

**`tokens.json`**

```json
{
  "$schema": "node_modules/@gamut-all/core/schema.json",
  "$primitives": "./primitives.json",
  "config": {
    "wcagTarget": "AA",
    "complianceEngine": "wcag21",
    "stacks": { "nav": 1, "modal": 1, "tooltip": 1 }
  },
  "themes": {
    "light": { "ramp": "slate", "step": 0, "fallback": ["dark"] },
    "dark":  { "ramp": "slate", "step": 9, "fallback": ["light"] }
  },
  "surfaces": {
    "bgMain":        { "ramp": "slate",   "step": 1,
                       "interactions": { "hover": { "step": 2 }, "active": { "step": 3 } } },
    "bgBrand":       { "ramp": "blue",    "step": 5 },
    "bgDanger":      { "ramp": "red",     "step": 6 },
    "bgDangerMuted": { "ramp": "red",     "step": 1 },
    "bgSuccess":     { "ramp": "emerald", "step": 6 },
    "bgInverse":     { "ramp": "slate",   "step": 9,
                       "themes": { "dark": { "step": 0 } } }
  },
  "foreground": {
    "fgMain":    { "ramp": "slate",   "defaultStep": 9 },
    "fgBrand":   { "ramp": "blue",    "defaultStep": 5,
                   "interactions": { "hover": { "step": 6 }, "active": { "step": 7 } } },
    "fgDanger":  { "ramp": "red",     "defaultStep": 5 },
    "fgSuccess": { "ramp": "emerald", "defaultStep": 5 }
  },
  "nonText": {
    "borderMain":   { "ramp": "slate", "defaultStep": 4 },
    "borderDanger": { "ramp": "red",   "defaultStep": 5 }
  }
}
```

Use in markup:

```html
<!-- Activate a theme -->
<html data-theme="dark">

<!-- Elevate the surface — tokens recalculate against the modal surface -->
<div data-stack="modal">

<!-- Preview a vision mode — hue-shifted tokens and surfaces activate -->
<div data-vision="deuteranopia">
```

---

## Surfaces

Surfaces are named background colors. They emit as `--bg-*` CSS vars and adapt automatically to dark themes by mirroring the ramp.

### Generated CSS

```css
:root {
  --bg-main:        #f1f5f9;  /* slate step 1  */
  --bg-main-hover:  #e2e8f0;  /* slate step 2  */
  --bg-main-active: #cbd5e1;  /* slate step 3  */
  --bg-danger-muted:#fee2e2;  /* red step 1    */
}

[data-theme="dark"] {
  --bg-main:        #1e293b;  /* auto-mirrored: slate step 9−1 = step 8 */
  --bg-main-hover:  #334155;  /* auto-mirrored: slate step 9−2 = step 7 */
  --bg-main-active: #475569;  /* auto-mirrored: slate step 9−3 = step 6 */
  --bg-danger-muted:#991b1b;  /* auto-mirrored: red step 9−1   = step 8 */
}
```

### Auto-mirroring

When a theme's step is above the ramp midpoint (dark themes), every surface is automatically mirrored:

```
mirroredStep = (rampLength − 1) − declaredStep
```

This applies across all ramps. A muted red surface (step 1) on a dark theme becomes a deep red (step 8). No manual dark overrides needed. Interaction states are mirrored independently.

### Explicit theme overrides

Override the auto-mirror for a specific surface by declaring a `themes` map:

```json
"bgInverse": {
  "ramp": "slate",
  "step": 9,
  "themes": { "dark": { "step": 0 } }
}
```

The explicit value takes full precedence over mirroring.

---

## Surface utility classes

Every surface emits a `.bg-{name}` CSS class (and `.hover\:bg-{name}:hover`) that sets the `background` and re-declares all foreground token vars resolved against that surface hex. Apply the class and descendants get correct contrast automatically.

```html
<div class="bg-bgDangerMuted">
  <p style="color: var(--fg-main)">Accessible on muted red</p>
  <p style="color: var(--fg-danger)">Danger text — also auto-resolved</p>
</div>

<button class="bg-bgMain hover:bg-bgBrand">
  Hover — all child token vars update to the brand surface context
</button>
```

Generated output:

```css
.bg-bgDangerMuted,
.hover\:bg-bgDangerMuted:hover {
  background: var(--bg-danger-muted);
  --fg-main:   #7f1d1d;  /* highest-contrast red step against #fee2e2 */
  --fg-danger: #991b1b;
  /* ... all tokens resolved at 12px AA */
}

[data-theme="dark"] .bg-bgDangerMuted,
[data-theme="dark"] .hover\:bg-bgDangerMuted:hover {
  --fg-main:   #fecaca;
  --fg-danger: #f87171;
}
```

A theme override block is only emitted when at least one token value differs from the default.

When a token shares its ramp with the surface (e.g. `fgDanger` on `bgDanger`, both using the red ramp), no step may reach the AA threshold. The engine falls back to the highest-contrast step in the ramp and flags it as `non-compliant-surface-token` in the audit output.

---

## Elevation stacks

Stacks model elevated UI surfaces — drawers, tooltips, modals. Each stack name maps to an offset (in ramp steps) that is added to the theme's base step when resolving the surface:

```json
"stacks": { "nav": 1, "modal": 1, "tooltip": 1, "overlay": 2 }
```

Every token is re-evaluated for contrast against the elevated surface hex:

```css
[data-theme="light"] [data-stack="modal"] {
  --bg-surface: var(--slate-1);   /* one step darker than root */
  --fg-main: #0f172a;             /* recalculated against the modal surface */
}
```

---

## Color Vision Deficiency (CVD)

gamut-all automatically generates hue-shifted variants for all six chromatic deficiency types. No configuration required — it runs at build time and activates via `data-vision`.

### How it works

1. **Simulate** — Every token and surface hex is run through the Viénot 1999 / Brettel 1997 HPE pipeline for each CVD type.
2. **Detect confusion** — Pairs that are distinguishable in normal vision but fall below the hue ΔE threshold under simulation are flagged.
3. **Shift hues** — Affected ramps are shifted to safe hue zones defined by a per-CVD policy. When multiple ramps target the same zone, their hues are spread proportionally. Ramps that would crowd an existing color are placed in the available gap; if no gap exists, chroma is progressively reduced to maintain saturation-based differentiation.
4. **Compliance check** — Each shifted foreground token is tested for contrast against its surface. If the shifted default step fails, ramp steps are walked outward until one passes. If none pass, no variant is emitted for that token.
5. **Surfaces** — The same confusion detection and hue-shift logic runs over surfaces, writing per-theme CVD overrides into `[data-vision="X"]` blocks.

### Supported types

| `data-vision` | Type |
|---|---|
| `protanopia` / `protanomaly` | Red-blind / Red-weak |
| `deuteranopia` / `deuteranomaly` | Green-blind / Green-weak |
| `tritanopia` / `tritanomaly` | Blue-blind / Blue-weak |

Achromatopsia and blue cone monochromacy are not hue-shifted (full grayscale vision requires pattern/icon changes that CSS cannot provide).

### Generated CSS

```css
/* Normal vision */
:root {
  --fg-success: #059669;  /* emerald step 6 */
  --fg-danger:  #dc2626;  /* red step 6     */
  --bg-danger-muted: #fee2e2;
}

/* Green-blind — danger/success shifted to blue/violet zones */
[data-vision="deuteranopia"] {
  --fg-success: #1d6fa8;  /* hue-shifted emerald */
  --fg-danger:  #7c1fa0;  /* hue-shifted red     */
  --bg-danger-muted: #e2d4ee; /* surface also shifted */
}
```

### Hue band policy

| CVD type | Confused source bands | Safe target zones |
|---|---|---|
| Protanopia / Protanomaly | Red/warm (0°–90°) | Blue (230°–270°) |
| | Green/teal (90°–200°) | Violet (295°–335°) |
| Deuteranopia / Deuteranomaly | Red/warm (0°–90°) | Blue (230°–270°) |
| | Green/teal (90°–200°) | Violet (295°–335°) |
| Tritanopia / Tritanomaly | Yellow/amber (60°–110°) | Orange/red (15°–45°) |
| | Blue/cyan (190°–270°) | Violet (280°–320°) |

---

## Compliance

Tokens are evaluated at three levels:

- **Text** (`foreground`) — WCAG 2.1: 4.5:1 AA / 7:1 AAA for text < 24px; 3:1 / 4.5:1 at 24px+. APCA: Lc 60/75/45/60 by size.
- **UI component** (`nonText`) — WCAG 2.1: 3:1 AA / 4.5:1 AAA size-independent. APCA: Lc 30 AA / Lc 45 AAA.
- **Decorative** — exempt from all thresholds.

When a declared default step fails compliance, the engine automatically finds the nearest passing step. Manually pinned steps that fail are flagged as errors by `validateRegistry()`.

---

## Audit

```bash
# Every variant passes compliance — exits 1 on any failure
gamut-audit --registry ./dist/registry.json

# Passing step ranges per token × surface
gamut-audit --registry ./dist/registry.json --report coverage --font-size 16

# Scan a built HTML file for unknown data-theme, missing ancestors, unknown CSS vars
gamut-audit --registry ./dist/registry.json --html ./dist/index.html
```

See [`@gamut-all/audit`](./packages/audit) for the programmatic API and full CLI reference.

---

## Configuration reference

See [`@gamut-all/core`](./packages/core) for the full `TokenInput` schema. Key `config` fields:

| Field | Default | Description |
|---|---|---|
| `wcagTarget` | `"AA"` | `"AA"` or `"AAA"` |
| `complianceEngine` | `"wcag21"` | `"wcag21"` or `"apca"` |
| `stepSelectionStrategy` | `"closest"` | `"closest"` or `"mirror-closest"` |
| `stacks` | `{ root: 0 }` | Elevation offset per named stack |
| `cvd.enabled` | `true` | Set `false` to disable CVD generation |

---

## Packages

| Package | Description |
|---|---|
| [`@gamut-all/core`](./packages/core) | Token processing, registry, CSS generation, Vite plugin |
| [`@gamut-all/react`](./packages/react) | `TokenProvider`, `StackLayer`, hooks, automatic contrast components |
| [`@gamut-all/audit`](./packages/audit) | `gamut-audit` CLI for CI/CD compliance auditing |

## Workspace commands

```bash
pnpm build      # build all packages
pnpm lint       # lint all workspaces
pnpm test       # run all tests
pnpm typecheck  # typecheck all packages
pnpm check      # lint + typecheck + test + format check
pnpm demo       # run the portfolio demo app (examples/demo)
pnpm demo:build # build the demo app
pnpm demo:preview # preview the built demo
```

## Demo hosting

The demo is a static Vite app in [`examples/demo`](./examples/demo) and is not published as a package (`private: true`).
Host `examples/demo/dist` on Vercel, Netlify, or GitHub Pages.
