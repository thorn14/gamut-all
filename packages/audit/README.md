# @gamut-all/audit

CI tooling for `@gamut-all/core` design tokens. Audits every token variant for compliance, scans the DOM for misconfigured theme and stack attributes, and produces coverage reports showing which steps pass at each font size.

## Installation

```sh
npm install @gamut-all/audit @gamut-all/core
```

For `auditURL` (Playwright-based DOM auditing), also install Playwright as a peer:

```sh
npm install playwright
```

## CLI

```sh
gamut-audit --registry ./dist/registry.json [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--registry` | _(required)_ | Path to a serialized registry JSON file |
| `--html` | — | HTML file to scan with `auditDOM` |
| `--engine` | `wcag21` | `wcag21` or `apca` |
| `--level` | `AA` | `AA` or `AAA` |
| `--format` | `text` | `text` or `json` |
| `--report` | `audit` | `audit` or `coverage` |
| `--font-size` | `16` | Font size (px) used for coverage report |

Exit code is `0` when there are no errors, `1` when errors are found.

## Programmatic API

### `auditRegistry(registry, engine, level?)`

Checks every variant in the registry against the compliance engine. Fails on non-compliant resolved steps (surface utility tokens included).

```ts
import { auditRegistry, formatText } from '@gamut-all/audit';
import { wcag21 } from '@gamut-all/core';

const result = auditRegistry(registry, wcag21, 'AA');
console.log(formatText(result));

if (result.failCount > 0) process.exit(1);
```

### `auditDOM(root, registry, options?)`

Scans a live DOM tree for attribute errors:

- `unknown-theme` — `data-theme` value not present in the registry
- `missing-data-theme` — element with token CSS vars but no `data-theme` ancestor
- `unknown-surface` — `data-bg` value not in `registry.surfaces`
- `missing-data-stack` _(warning)_ — contextual element with no `data-stack`
- `unknown-token-var` — CSS `var(--fg-*)` reference to an unknown token

```ts
import { auditDOM, formatText } from '@gamut-all/audit';

const result = auditDOM(document.body, registry);
console.log(formatText(result));
```

### `auditURL(url, registry, options?)`

Launches a Playwright browser, navigates to `url`, and runs `auditDOM` against the rendered page. Requires `playwright` as a peer dependency.

```ts
import { auditURL, formatJSON } from '@gamut-all/audit';

const result = await auditURL('https://localhost:3000', registry, {
  width: 1280,
  height: 720,
  browser: 'chromium', // 'chromium' | 'firefox' | 'webkit'
});

console.log(formatJSON(result));
```

### `auditCoverage(registry, engine, level?, opts?)`

For each token and each background, reports the full range of steps that pass compliance and where the configured step falls within that range. Useful for designers checking step choices.

```ts
import { auditCoverage, formatCoverageText } from '@gamut-all/audit';
import { wcag21 } from '@gamut-all/core';

const report = auditCoverage(registry, wcag21, 'AA', { fontSizePx: 16 });
console.log(formatCoverageText(report));
```

## Result types

### `AuditResult`

```ts
interface AuditResult {
  issues: AuditIssue[];
  variantsChecked: number;
  elementsChecked: number;
  passCount: number;
  failCount: number;
}

interface AuditIssue {
  type: IssueType;
  severity: 'error' | 'warning';
  token?: string;
  element?: string;      // CSS selector path (DOM audits)
  message: string;
  context?: Record<string, unknown>;
}

type IssueType =
  | 'non-compliant-variant'
  | 'non-compliant-surface-token'
  | 'unknown-theme'
  | 'missing-data-theme'
  | 'unknown-surface'
  | 'missing-data-stack'
  | 'unknown-token-var';
```

### `CoverageReport`

```ts
interface CoverageReport {
  tokens: TokenCoverage[];
  meta: {
    engine: string;
    level: 'AA' | 'AAA';
    fontSize: string;
    generatedAt: string;
  };
}
```

## Formatters

```ts
import {
  formatText,        // Human-readable audit result
  formatJSON,        // Machine-readable audit result
  formatCoverageText, // Tabular coverage report
  formatCoverageJSON, // JSON coverage export
} from '@gamut-all/audit';
```

## CI example

```yaml
# .github/workflows/tokens.yml
- name: Audit tokens
  run: |
    node -e "
      import('@gamut-all/audit').then(async ({ auditRegistry, formatText }) => {
        const { registry } = await import('./dist/tokens.js');
        const { wcag21 } = await import('@gamut-all/core');
        const result = auditRegistry(registry, wcag21, 'AA');
        console.log(formatText(result));
        process.exit(result.failCount > 0 ? 1 : 0);
      });
    "
```
