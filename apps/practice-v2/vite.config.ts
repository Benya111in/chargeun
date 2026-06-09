import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const repoRoot = path.resolve(__dirname, '..', '..')

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 1430,
    strictPort: true,
    fs: {
      allow: [repoRoot],
    },
  },
  preview: {
    port: 1431,
    strictPort: true,
  },
  test: {
    environment: 'node',
  },
})
