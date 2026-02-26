import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { deserializeRegistry, wcag21, apca } from '@gamut-all/core';
import { auditRegistry, auditDOM } from './runner.js';
import { formatText, formatJSON } from './report.js';

const USAGE = `
Usage: gamut-audit [options]

Options:
  --registry <path>   Path to serialized registry JSON (required)
  --html <path>       Audit a static HTML file (optional, requires jsdom)
  --engine <id>       Compliance engine: wcag21 (default) | apca
  --level <level>     Compliance level: AA (default) | AAA
  --format <fmt>      Output format: text (default) | json
  --help              Show this help

Examples:
  gamut-audit --registry ./dist/registry.json
  gamut-audit --registry ./dist/registry.json --html ./dist/index.html --format json
`.trim();

type Serialized = Parameters<typeof deserializeRegistry>[0];

interface JsdomLike {
  JSDOM: new (html: string) => { window: { document: { body: Element } } };
}

async function main(): Promise<void> {
  const { values, positionals: _ } = parseArgs({
    options: {
      registry: { type: 'string' },
      html:     { type: 'string' },
      engine:   { type: 'string', default: 'wcag21' },
      level:    { type: 'string', default: 'AA' },
      format:   { type: 'string', default: 'text' },
      help:     { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (!values.registry) {
    console.error('Error: --registry is required\n');
    console.error(USAGE);
    process.exit(1);
  }

  // Load registry
  let serialized: Serialized;
  try {
    const raw = readFileSync(values.registry, 'utf-8');
    serialized = JSON.parse(raw) as Serialized;
  } catch (err) {
    console.error(`Error: failed to load registry from "${values.registry}": ${String(err)}`);
    process.exit(1);
  }

  const registry = deserializeRegistry(serialized);

  // Resolve engine
  const engineId = values.engine ?? 'wcag21';
  const engine = engineId === 'apca' ? apca : wcag21;
  const level = (values.level === 'AAA' ? 'AAA' : 'AA') as 'AA' | 'AAA';

  // Run registry audit
  const result = auditRegistry(registry, engine, level);

  // Optionally audit a static HTML file
  if (values.html) {
    try {
      const html = readFileSync(values.html, 'utf-8');
      let jsdomMod: JsdomLike | null = null;
      try {
        // Dynamic import — jsdom is an optional peer dep
        // @ts-ignore – optional peer dep, not listed in package.json
        jsdomMod = await import('jsdom') as unknown as JsdomLike;
      } catch {
        console.error('Warning: jsdom not installed — skipping HTML audit. Run: pnpm add -D jsdom');
      }
      if (jsdomMod) {
        const dom = new jsdomMod.JSDOM(html);
        const domResult = auditDOM(dom.window.document.body as unknown as Element, registry);
        result.issues.push(...domResult.issues);
        result.elementsChecked += domResult.elementsChecked;
        result.failCount += domResult.failCount;
        result.passCount += domResult.passCount;
      }
    } catch (err) {
      console.error(`Error: failed to read HTML from "${values.html}": ${String(err)}`);
      process.exit(1);
    }
  }

  // Format output
  const fmt = values.format ?? 'text';
  const output = fmt === 'json' ? formatJSON(result) : formatText(result);
  console.log(output);

  // Exit with non-zero if there are errors
  const hasErrors = result.issues.some(i => i.severity === 'error');
  process.exit(hasErrors ? 1 : 0);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
