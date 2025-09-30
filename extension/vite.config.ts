import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build three entry points:
// - popup.html (HTML entry)
// - src/background/index.ts -> background.js (MV3 ESM service worker)
// - src/content/index.ts -> content.js (classic script; bundled into single file)
export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: 'popup.html',
        background: 'src/background/index.ts',
        content: 'src/content/index.ts'
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js';
          if (chunk.name === 'content') return 'content.js';
          return '[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});

