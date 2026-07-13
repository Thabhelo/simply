import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, 'src/siteAuth.ts'),
      formats: ['iife'],
      name: 'SimplySiteAuth',
      fileName: () => 'siteAuth.js',
    },
  },
})
