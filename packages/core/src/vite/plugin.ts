import type { Plugin, ResolvedConfig } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { processInput } from '../processor.js';
import { buildRegistry, validateRegistry } from '../registry.js';
import { generateCSS } from '../css.js';
import { generatePrimitivesCSS } from '../primitives-css.js';
import { buildContrastOverridesCSS } from '../contrast-overrides.js';
import { serializeRegistry } from '../serialize.js';
import { wcag21 } from '../compliance/wcag21.js';
import { apca } from '../compliance/apca.js';
import { normalizePrimitives } from '../processor.js';
import type { TokenInput, TokenRegistry, TokenOverridesInput, ColorValue, PrimitivesInput } from '../types.js';

const VIRTUAL_MODULE_ID = 'virtual:design-tokens';
const RESOLVED_VIRTUAL_ID = '\0virtual:design-tokens';

export type ComplianceTarget = 'wcag21-AA' | 'wcag21-AAA' | 'apca-AA' | 'apca-AAA';

export interface DesignTokensPluginOptions {
  /** Path to tokens.json (semantic definitions + config). Project-owned. */
  input: string;
  /** Path to a separate primitives JSON file (Figma-owned ramps). Merged into TokenInput.primitives. */
  primitives?: string;
  /** Path to overrides.json (designer fine-tuning). Project-owned. */
  overrides?: string;
  outputDir?: string;
  emitTypes?: boolean;
  emitCSS?: boolean;
  /** Emit primitives.css (stable ramp step values). Default: true. */
  emitPrimitives?: boolean;
  /**
   * Compliance targets to generate CSS for.
   * Default: ['wcag21-AA', 'wcag21-AAA']
   * - 'wcag21-AA' → tokens.css (full baseline)
   * - 'wcag21-AAA' → tokens-aaa.css (delta overrides)
   * - 'apca-AA' → tokens-apca.css (full baseline)
   * - 'apca-AAA' → tokens-apca-aaa.css (delta overrides)
   */
  complianceTargets?: ComplianceTarget[];
}

function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, (char) => `-${char.toLowerCase()}`);
}

function generateTypes(input: TokenInput): string {
  const allSemantics = { ...input.foreground, ...(input.nonText ?? {}) };
  const baseTokens = Object.keys(allSemantics);
  const interactionTokens: string[] = [];
  for (const [tokenName, sem] of Object.entries(allSemantics)) {
    if (sem.interactions) {
      for (const stateName of Object.keys(sem.interactions)) {
        interactionTokens.push(`${tokenName}-${stateName}`);
      }
    }
  }
  const themeClasses = Object.keys(input.themes);
  const rampNames = Object.keys(input.primitives);

  const lines = [
    '// Auto-generated — do not edit',
    `export type TokenName = ${baseTokens.map(t => `'${t}'`).join(' | ') || 'never'};`,
    `export type InteractionTokenName = ${interactionTokens.map(t => `'${t}'`).join(' | ') || 'never'};`,
    `export type ThemeClass = ${themeClasses.map(b => `'${b}'`).join(' | ') || 'never'};`,
    `export type RampName = ${rampNames.map(r => `'${r}'`).join(' | ') || 'never'};`,
  ];
  return lines.join('\n') + '\n';
}

function buildAndEmit(
  inputPath: string,
  outputDir: string,
  options: DesignTokensPluginOptions,
  log: (msg: string) => void,
): { registry: TokenRegistry; watchedFiles: string[] } {
  const raw = readFileSync(inputPath, 'utf-8');
  const tokenInput = JSON.parse(raw) as TokenInput & { $primitives?: string };
  const watchedFiles = [inputPath];

  // Resolve primitives — option path takes precedence over $primitives inline ref
  const primitivesOptionPath = options.primitives
    ? resolve(dirname(inputPath), options.primitives)
    : null;

  if (primitivesOptionPath) {
    watchedFiles.push(primitivesOptionPath);
    const primitivesRaw = readFileSync(primitivesOptionPath, 'utf-8');
    const primitivesData = JSON.parse(primitivesRaw) as PrimitivesInput;
    const normalized = normalizePrimitives(primitivesData);
    const inlinePrimitives = tokenInput.primitives
      ? normalizePrimitives(tokenInput.primitives as PrimitivesInput)
      : {};
    tokenInput.primitives = { ...normalized, ...inlinePrimitives };
  } else if (tokenInput['$primitives']) {
    // Legacy $primitives field in token file
    const primitivesPath = resolve(dirname(inputPath), tokenInput['$primitives']);
    watchedFiles.push(primitivesPath);
    const primitivesRaw = readFileSync(primitivesPath, 'utf-8');
    const primitivesData = JSON.parse(primitivesRaw) as PrimitivesInput;
    const normalized = normalizePrimitives(primitivesData);
    const inlinePrimitives = tokenInput.primitives
      ? normalizePrimitives(tokenInput.primitives as PrimitivesInput)
      : {};
    tokenInput.primitives = { ...normalized, ...inlinePrimitives };
  }
  delete tokenInput['$primitives'];

  // Resolve overrides
  let overrides: TokenOverridesInput | undefined;
  const overridesOptionPath = options.overrides
    ? resolve(dirname(inputPath), options.overrides)
    : null;

  if (overridesOptionPath && existsSync(overridesOptionPath)) {
    watchedFiles.push(overridesOptionPath);
    const overridesRaw = readFileSync(overridesOptionPath, 'utf-8');
    overrides = JSON.parse(overridesRaw) as TokenOverridesInput;
  }

  const input = tokenInput as TokenInput;
  const processed = processInput(input, overrides);

  // Default targets: respect the engine declared in the token config.
  // When complianceTargets is not specified, always emit both AA and AAA so
  // consumers get the contrast-override delta file out of the box.
  const configEngine = processed.config.complianceEngine; // 'wcag21' | 'apca'
  const defaultTargets: ComplianceTarget[] =
    configEngine === 'apca' ? ['apca-AA', 'apca-AAA'] : ['wcag21-AA', 'wcag21-AAA'];
  const targets = options.complianceTargets ?? defaultTargets;

  // Build all requested registries
  const registries = new Map<ComplianceTarget, TokenRegistry>();
  for (const target of targets) {
    const engine = target.startsWith('apca') ? apca : wcag21;
    const wcagLevel = target.endsWith('AAA') ? 'AAA' as const : 'AA' as const;
    // Re-process with overridden wcagTarget when needed
    const processedForTarget =
      wcagLevel !== processed.config.wcagTarget
        ? processInput({ ...input, config: { ...(input.config ?? {}), wcagTarget: wcagLevel } }, overrides)
        : processed;
    registries.set(target, buildRegistry(processedForTarget, engine));
  }

  // Primary registry for the virtual module — prefer AA target matching the config engine
  const primaryKey: ComplianceTarget = configEngine === 'apca' ? 'apca-AA' : 'wcag21-AA';
  const primaryRegistry =
    registries.get(primaryKey) ??
    registries.get('wcag21-AA') ??
    registries.get('apca-AA') ??
    Array.from(registries.values())[0]!;

  const validation = validateRegistry(primaryRegistry);
  log(`[design-tokens] Built registry: ${primaryRegistry.meta.totalVariants} variants, ${primaryRegistry.meta.tokenCount} tokens`);
  if (validation.warnings.length > 0) {
    log(`[design-tokens] ${validation.warnings.length} compliance warning(s):`);
    for (const w of validation.warnings.slice(0, 5)) {
      log(`  ⚠ ${w}`);
    }
    if (validation.warnings.length > 5) {
      log(`  ... and ${validation.warnings.length - 5} more`);
    }
  }

  mkdirSync(outputDir, { recursive: true });

  // Emit tokens.ts (primary registry)
  const serialized = serializeRegistry(primaryRegistry);
  const tokensTs = [
    '// Auto-generated — do not edit',
    `import { deserializeRegistry } from '@gamut-all/core';`,
    `import type { SerializedRegistry } from '@gamut-all/core';`,
    `const _data = ${JSON.stringify(serialized)} as SerializedRegistry;`,
    `export const registry = deserializeRegistry(_data);`,
  ].join('\n') + '\n';
  writeFileSync(join(outputDir, 'tokens.ts'), tokensTs, 'utf-8');

  // Emit CSS files
  if (options.emitCSS !== false) {
    // Full baseline CSS for each primary AA target
    const aaReg = registries.get('wcag21-AA');
    const aaApcaReg = registries.get('apca-AA');
    const aaaReg = registries.get('wcag21-AAA');
    const aaaApcaReg = registries.get('apca-AAA');

    if (aaReg) {
      writeFileSync(join(outputDir, 'tokens.css'), generateCSS(aaReg), 'utf-8');
    }
    if (aaApcaReg) {
      writeFileSync(join(outputDir, 'tokens-apca.css'), generateCSS(aaApcaReg), 'utf-8');
    }
    if (aaaReg && aaReg) {
      writeFileSync(join(outputDir, 'tokens-aaa.css'), buildContrastOverridesCSS(aaReg, aaaReg), 'utf-8');
    } else if (aaaReg) {
      writeFileSync(join(outputDir, 'tokens-aaa.css'), generateCSS(aaaReg), 'utf-8');
    }
    if (aaaApcaReg && aaApcaReg) {
      writeFileSync(join(outputDir, 'tokens-apca-aaa.css'), buildContrastOverridesCSS(aaApcaReg, aaaApcaReg), 'utf-8');
    } else if (aaaApcaReg) {
      writeFileSync(join(outputDir, 'tokens-apca-aaa.css'), generateCSS(aaaApcaReg), 'utf-8');
    }
  }

  // Emit primitives.css
  if (options.emitPrimitives !== false) {
    writeFileSync(join(outputDir, 'primitives.css'), generatePrimitivesCSS(processed), 'utf-8');
  }

  // Emit token-types.d.ts
  if (options.emitTypes !== false) {
    const types = generateTypes(input);
    writeFileSync(join(outputDir, 'token-types.d.ts'), types, 'utf-8');
  }

  return { registry: primaryRegistry, watchedFiles };
}

export function designTokensPlugin(options: DesignTokensPluginOptions): Plugin {
  let resolvedConfig: ResolvedConfig;
  let inputPath: string;
  let outputDir: string;
  let registry: TokenRegistry | null = null;
  let watchedFiles = new Set<string>();

  return {
    name: 'gamut-all:design-tokens',

    configResolved(config) {
      resolvedConfig = config;
      inputPath = resolve(config.root, options.input);
      outputDir = resolve(config.root, options.outputDir ?? './src/generated');

      const result = buildAndEmit(inputPath, outputDir, options, (msg) => config.logger.info(msg));
      registry = result.registry;
      watchedFiles = new Set(result.watchedFiles);
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) {
        if (!registry) {
          throw new Error('[design-tokens] Registry unavailable. Fix token build errors and restart Vite.');
        }
        const serialized = serializeRegistry(registry);
        return [
          '// virtual:design-tokens — auto-generated',
          `// @type {import('@gamut-all/core').TokenRegistry}`,
          `import { deserializeRegistry } from '@gamut-all/core';`,
          `export const registry = deserializeRegistry(${JSON.stringify(serialized)});`,
        ].join('\n');
      }
    },

    configureServer(server) {
      for (const file of watchedFiles) {
        server.watcher.add(file);
      }
      server.watcher.on('change', (file) => {
        if (!watchedFiles.has(file)) return;
        try {
          const result = buildAndEmit(inputPath, outputDir, options, (msg) => server.config.logger.info(msg));
          registry = result.registry;
          watchedFiles = new Set(result.watchedFiles);
          for (const watched of watchedFiles) {
            server.watcher.add(watched);
          }
          // Invalidate virtual module
          const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.hot.send({ type: 'full-reload' });
        } catch (err) {
          registry = null;
          server.config.logger.error(`[design-tokens] Rebuild failed: ${String(err)}`);
        }
      });
    },
  };
}
