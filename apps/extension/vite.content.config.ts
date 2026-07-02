import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Builds the content script as a self-contained IIFE (all imports inlined, no ES `import`),
// which is what a classic MV3 content script requires. emptyOutDir:false so it doesn't wipe
// the popup output built by vite.config.ts.
export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, 'src/content.ts'),
      formats: ['iife'],
      name: 'SimplyContent',
      fileName: () => 'content.js',
    },
  },
})
