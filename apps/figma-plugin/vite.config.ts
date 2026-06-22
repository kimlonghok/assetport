/// <reference path="./src/vite-env.d.ts" />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ context }) => ({
  plugins: context === 'ui' ? [react(), tailwindcss()] : [],
  build: {
    rollupOptions: {
      output: {
        inlineDynamicImports: false,
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
}));
