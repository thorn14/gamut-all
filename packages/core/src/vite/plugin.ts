import type { Plugin, ResolvedConfig } from 'vite';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { processInput } from '../processor.js';
import { buildRegistry, validateRegistry } from '../registry.js';
import { generateCSS } from '../css.js';
import { serializeRegistry } from '../serialize.js';
import { wcag21 } from '../compliance/wcag21.js';
import type { TokenInput, TokenRegistry } from '../types.js';

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
  const baseTokens = Object.keys(input.semantics);
  const interactionTokens: string[] = [];
  for (const [tokenName, sem] of Object.entries(input.semantics)) {
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
): TokenRegistry {
  const raw = readFileSync(inputPath, 'utf-8');
  const tokenInput = JSON.parse(raw) as TokenInput & { $primitives?: string };

  // Resolve $primitives external file
  if (tokenInput['$primitives']) {
    const primitivesPath = resolve(dirname(inputPath), tokenInput['$primitives']);
    const primitivesRaw = readFileSync(primitivesPath, 'utf-8');
    const primitivesData = JSON.parse(primitivesRaw) as Record<string, string[]>;
    // Merge: inline primitives take precedence
    tokenInput.primitives = { ...primitivesData, ...(tokenInput.primitives ?? {}) };
    delete tokenInput['$primitives'];
  }

  const input = tokenInput as TokenInput;
  const processed = processInput(input);
  const registry = buildRegistry(processed, wcag21);
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

  return registry;
}

export function designTokensPlugin(options: DesignTokensPluginOptions): Plugin {
  let resolvedConfig: ResolvedConfig;
  let inputPath: string;
  let outputDir: string;
  let registry: TokenRegistry | null = null;

  return {
    name: 'gamut-all:design-tokens',

    configResolved(config) {
      resolvedConfig = config;
      inputPath = resolve(config.root, options.input);
      outputDir = resolve(config.root, options.outputDir ?? './src/generated');

      try {
        registry = buildAndEmit(inputPath, outputDir, options, (msg) => config.logger.info(msg));
      } catch (err) {
        config.logger.error(`[design-tokens] Failed to build registry: ${String(err)}`);
      }
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) {
        if (!registry) {
          return 'export const registry = null;';
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
      server.watcher.add(inputPath);
      server.watcher.on('change', (file) => {
        if (file !== inputPath) return;
        try {
          registry = buildAndEmit(inputPath, outputDir, options, (msg) => server.config.logger.info(msg));
          // Invalidate virtual module
          const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.hot.send({ type: 'full-reload' });
        } catch (err) {
          server.config.logger.error(`[design-tokens] Rebuild failed: ${String(err)}`);
        }
      });
    },
  };
}
