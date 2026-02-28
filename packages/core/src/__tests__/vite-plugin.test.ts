import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { designTokensPlugin } from '../vite/plugin.js';

const TOKENS_JSON = JSON.stringify({
  primitives: {
    neutral: ['#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4', '#a3a3a3', '#737373', '#525252', '#404040', '#262626', '#171717'],
    blue: ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a'],
  },
  themes: {
    white: { ramp: 'neutral', step: 0 },
    dark: { ramp: 'neutral', step: 8 },
  },
  semantics: {
    fgPrimary: { ramp: 'neutral', defaultStep: 8 },
    fgLink: {
      ramp: 'blue',
      defaultStep: 6,
      interactions: { hover: { step: 8 } },
    },
  },
});

describe('designTokensPlugin', () => {
  let tmpDir: string;
  let tokensFile: string;
  let outputDir: string;
  let plugin: ReturnType<typeof designTokensPlugin>;
  let configResolved: boolean = false;

  beforeAll(() => {
    tmpDir = join(tmpdir(), `gamut-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    tokensFile = join(tmpDir, 'tokens.json');
    outputDir = join(tmpDir, 'generated');
    writeFileSync(tokensFile, TOKENS_JSON, 'utf-8');

    plugin = designTokensPlugin({
      input: 'tokens.json',
      outputDir: './generated',
      emitTypes: true,
      emitCSS: true,
    });

    // Simulate configResolved
    const mockConfig = {
      root: tmpDir,
      logger: {
        info: () => {},
        warn: () => {},
        error: console.error,
      },
    };

    // Call configResolved hook
    const hook = plugin.configResolved as ((config: unknown) => void) | undefined;
    if (hook) {
      hook(mockConfig);
      configResolved = true;
    }
  });

  afterAll(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates outputDir', () => {
    expect(existsSync(outputDir)).toBe(true);
  });

  it('emits tokens.ts', () => {
    const tokensTs = join(outputDir, 'tokens.ts');
    expect(existsSync(tokensTs)).toBe(true);
    const content = readFileSync(tokensTs, 'utf-8');
    expect(content).toContain('deserializeRegistry');
    expect(content).toContain('registry');
  });

  it('emits tokens.css', () => {
    const tokensCss = join(outputDir, 'tokens.css');
    expect(existsSync(tokensCss)).toBe(true);
    const content = readFileSync(tokensCss, 'utf-8');
    expect(content).toContain(':root');
    expect(content).toContain('--fg-primary');
  });

  it('emits token-types.d.ts', () => {
    const typesFile = join(outputDir, 'token-types.d.ts');
    expect(existsSync(typesFile)).toBe(true);
    const content = readFileSync(typesFile, 'utf-8');
    expect(content).toContain('TokenName');
    expect(content).toContain('fgPrimary');
    expect(content).toContain('ThemeClass');
    expect(content).toContain('white');
  });

  it('resolveId maps virtual:design-tokens to resolved ID', () => {
    const resolveId = plugin.resolveId as ((id: string) => string | undefined) | undefined;
    if (resolveId) {
      expect(resolveId('virtual:design-tokens')).toBe('\0virtual:design-tokens');
      expect(resolveId('other-module')).toBeUndefined();
    }
  });

  it('load returns registry module for virtual ID', () => {
    const load = plugin.load as ((id: string) => string | undefined) | undefined;
    if (load) {
      const result = load('\0virtual:design-tokens');
      expect(result).toBeDefined();
      expect(result).toContain('deserializeRegistry');
      expect(result).toContain('registry');
    }
  });

  it('load returns nothing for other IDs', () => {
    const load = plugin.load as ((id: string) => string | undefined) | undefined;
    if (load) {
      const result = load('other-id');
      expect(result).toBeUndefined();
    }
  });

  it('token-types.d.ts includes interaction token types', () => {
    const typesFile = join(outputDir, 'token-types.d.ts');
    const content = readFileSync(typesFile, 'utf-8');
    expect(content).toContain('InteractionTokenName');
    expect(content).toContain('fgLink-hover');
  });
});
