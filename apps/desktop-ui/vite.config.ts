import path from 'node:path'

import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import generatePracticeFromUrl from '../../api/generate-practice-from-url'

const repoRoot = path.resolve(__dirname, '..', '..')
const rootEnv = loadEnv(process.env.NODE_ENV ?? 'development', repoRoot, '')
for (const key of ['OPENAI_API_KEY', 'OPENAI_GENERATION_MODEL']) {
  process.env[key] ||= rootEnv[key]
}

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
      allow: [repoRoot],
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
