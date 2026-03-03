import type { Plugin, ResolvedConfig } from 'vite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { processInput } from '../processor.js';
import { buildRegistry, validateRegistry } from '../registry.js';
import { generateCSS } from '../css.js';
import { serializeRegistry } from '../serialize.js';
import { wcag21 } from '../compliance/wcag21.js';
import { apca } from '../compliance/apca.js';
import type { TokenInput, TokenRegistry, ColorValue } from '../types.js';

const VIRTUAL_MODULE_ID = 'virtual:design-tokens';
const RESOLVED_VIRTUAL_ID = '\0virtual:design-tokens';

export interface DesignTokensPluginOptions {
  input: string;
  outputDir?: string;
  emitTypes?: boolean;
  emitCSS?: boolean;
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

  // Resolve $primitives external file
  if (tokenInput['$primitives']) {
    const primitivesPath = resolve(dirname(inputPath), tokenInput['$primitives']);
    watchedFiles.push(primitivesPath);
    const primitivesRaw = readFileSync(primitivesPath, 'utf-8');
    const primitivesData = JSON.parse(primitivesRaw) as Record<string, (string | ColorValue)[]>;
    // Strip JSON-schema metadata keys before merging
    for (const key of Object.keys(primitivesData)) {
      if (key.startsWith('$')) delete primitivesData[key];
    }
    // Merge: inline primitives take precedence
    tokenInput.primitives = { ...primitivesData, ...(tokenInput.primitives ?? {}) };
    delete tokenInput['$primitives'];
  }

  const input = tokenInput as TokenInput;
  const processed = processInput(input);
  const engine = processed.config.complianceEngine === 'apca' ? apca : wcag21;
  const registry = buildRegistry(processed, engine);
  const validation = validateRegistry(registry);

  // Log summary
  log(`[design-tokens] Built registry: ${registry.meta.totalVariants} variants, ${registry.meta.tokenCount} tokens`);
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

  // Emit tokens.ts
  const serialized = serializeRegistry(registry);
  const tokensTs = [
    '// Auto-generated — do not edit',
    `import { deserializeRegistry } from '@gamut-all/core';`,
    `import type { SerializedRegistry } from '@gamut-all/core';`,
    `const _data = ${JSON.stringify(serialized)} as SerializedRegistry;`,
    `export const registry = deserializeRegistry(_data);`,
  ].join('\n') + '\n';
  writeFileSync(join(outputDir, 'tokens.ts'), tokensTs, 'utf-8');

  // Emit tokens.css
  if (options.emitCSS !== false) {
    const css = generateCSS(registry);
    writeFileSync(join(outputDir, 'tokens.css'), css, 'utf-8');
  }

  // Emit token-types.d.ts
  if (options.emitTypes !== false) {
    const types = generateTypes(input);
    writeFileSync(join(outputDir, 'token-types.d.ts'), types, 'utf-8');
  }

  return { registry, watchedFiles };
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
