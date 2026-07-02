import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Popup build only. The popup loads as an ES module, so shared imports (auth.ts) may be
// split into chunks. The content script is built separately (vite.content.config.ts) as a
// self-contained IIFE, because a classic MV3 content script cannot use ES `import`.
export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
})
