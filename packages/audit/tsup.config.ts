import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['playwright', 'playwright-core'],
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    sourcemap: true,
    banner: { js: '#!/usr/bin/env node' },
    external: ['playwright', 'playwright-core'],
  },
]);
