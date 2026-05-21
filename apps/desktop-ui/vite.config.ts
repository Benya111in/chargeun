import path from 'node:path'

import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import generatePracticeFromUrl from '../../api/generate-practice-from-url'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), localGeneratePracticeApi()],
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
      '@ansimtrack/perception-pipeline': path.resolve(
        __dirname,
        '../../workers/perception-pipeline/src/index.ts',
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

function localGeneratePracticeApi(): Plugin {
  return {
    name: 'local-generate-practice-api',
    configureServer(server) {
      server.middlewares.use('/api/generate-practice-from-url', (req, res) => {
        void generatePracticeFromUrl(req, res)
      })
    },
  }
}
