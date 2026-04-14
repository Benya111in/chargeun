import path from 'node:path'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@ansimtrack/shadow-buffer': path.resolve(
        __dirname,
        '../../packages/shadow-buffer/src/index.ts',
      ),
      '@ansimtrack/shared-types': path.resolve(
        __dirname,
        '../../packages/shared-types/src/index.ts',
      ),
      '@ansimtrack/llm-orchestrator': path.resolve(
        __dirname,
        '../../workers/llm-orchestrator/src/index.ts',
      ),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    fs: {
      allow: [path.resolve(__dirname, '..', '..')],
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
})
