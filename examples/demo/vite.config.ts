import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { designTokensPlugin } from '@gamut-all/core/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    designTokensPlugin({
      input: './tokens.json',
      outputDir: './src/generated',
      emitTypes: true,
      emitCSS: true,
    }),
  ],
});
