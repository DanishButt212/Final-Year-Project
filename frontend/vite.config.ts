import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  // Same-origin /api in development, like the Vercel rewrite in production.
  // Pre-bundle dependencies that are only reached through lazy chunks, so the dev server does not discover them
  // mid-session and reload the page (which breaks in-flight lazy imports, for example during the browser tests).
  optimizeDeps: {
    include: ['driver.js', 'react-pdf', 'recharts', 'cmdk', '@radix-ui/react-popover'],
  },
  server: {
    proxy: {
      '/api': { target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000', changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    // The first test of a file pays for importing lazy route modules under jsdom.
    testTimeout: 30_000,
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
