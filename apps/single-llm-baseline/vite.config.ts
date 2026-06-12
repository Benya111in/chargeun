import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const repoRoot = path.resolve(__dirname, '..', '..')

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 1432,
    strictPort: true,
    fs: {
      allow: [repoRoot],
    },
  },
  preview: {
    port: 1433,
    strictPort: true,
  },
})
