import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import generatePracticeFromUrl from '../api/generate-practice-from-url'

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const generatedDir = join(rootDir, 'apps/desktop-ui/public/generated')
const port = Number(process.env.PORT || 10000)

mkdirSync(generatedDir, { recursive: true })

const server = createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url || '/',
      `http://${req.headers.host || 'localhost'}`,
    )

    if (url.pathname === '/api/health' || url.pathname === '/health') {
      if (req.method !== 'GET') {
        return sendJson(res, 405, {
          error: 'method_not_allowed',
          message: `${req.method} is not supported.`,
        })
      }

      return sendJson(res, 200, {
        generatorAccessConfigured: Boolean(
          process.env.GENERATOR_ACCESS_CODES || process.env.BETA_ACCESS_CODES,
        ),
        generationModel: process.env.OPENAI_GENERATION_MODEL || 'gpt-5.5',
        hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
        publicGeneratorApiBase: process.env.PUBLIC_GENERATOR_API_BASE || null,
        runtimeVersion:
          process.env.RENDER_GIT_COMMIT?.slice(0, 7) ||
          process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
          'local',
        service: 'chagunchagun-generator-api',
        status: 'ok',
      })
    }

    if (url.pathname === '/api/generate-practice-from-url') {
      return void generatePracticeFromUrl(req, res)
    }

    if (url.pathname.startsWith('/generated/')) {
      return serveGeneratedAsset(req, res, url.pathname)
    }

    return sendJson(res, 404, {
      error: 'not_found',
      message: 'Not found.',
    })
  } catch (error) {
    return sendJson(res, 500, {
      error: 'server_error',
      message: error instanceof Error ? error.message : 'Server error.',
    })
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Generator API listening on 0.0.0.0:${port}`)
})

function serveGeneratedAsset(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) {
  if (req.method === 'OPTIONS') {
    setGeneratedAssetCors(req, res)
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, {
      error: 'method_not_allowed',
      message: `${req.method} is not supported.`,
    })
  }

  const filePath = safeGeneratedAssetPath(pathname)
  if (!filePath || !existsSync(filePath)) {
    return sendJson(res, 404, {
      error: 'asset_not_found',
      message: 'Generated asset not found.',
    })
  }

  const stat = statSync(filePath)
  if (!stat.isFile()) {
    return sendJson(res, 404, {
      error: 'asset_not_found',
      message: 'Generated asset not found.',
    })
  }

  setGeneratedAssetCors(req, res)
  res.setHeader('accept-ranges', 'bytes')
  res.setHeader('cache-control', 'public, max-age=3600')
  res.setHeader('content-type', mimeTypeForFile(filePath))

  const range = req.headers.range
  if (range) {
    const parsed = parseRangeHeader(range, stat.size)
    if (!parsed) {
      res.statusCode = 416
      res.setHeader('content-range', `bytes */${stat.size}`)
      res.end()
      return
    }

    const { end, start } = parsed
    res.statusCode = 206
    res.setHeader('content-length', String(end - start + 1))
    res.setHeader('content-range', `bytes ${start}-${end}/${stat.size}`)

    if (req.method === 'HEAD') {
      res.end()
      return
    }

    createReadStream(filePath, { end, start }).pipe(res)
    return
  }

  res.statusCode = 200
  res.setHeader('content-length', String(stat.size))

  if (req.method === 'HEAD') {
    res.end()
    return
  }

  createReadStream(filePath).pipe(res)
}

function safeGeneratedAssetPath(pathname: string) {
  const relative = decodeURIComponent(pathname.replace(/^\/generated\//, ''))
  const filePath = normalize(join(generatedDir, relative))

  if (
    filePath !== generatedDir &&
    !filePath.startsWith(`${generatedDir}${sep}`)
  ) {
    return null
  }

  return filePath
}

function parseRangeHeader(range: string, size: number) {
  const match = range.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) {
    return null
  }

  const startText = match[1]
  const endText = match[2]
  let start = startText ? Number(startText) : 0
  let end = endText ? Number(endText) : size - 1

  if (!startText && endText) {
    const suffixLength = Number(endText)
    start = Math.max(size - suffixLength, 0)
    end = size - 1
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null
  }

  return {
    end: Math.min(end, size - 1),
    start,
  }
}

function setGeneratedAssetCors(req: IncomingMessage, res: ServerResponse) {
  const allowedOrigins = [
    'http://localhost:1420',
    'http://localhost:4173',
    'http://127.0.0.1:1420',
    'http://127.0.0.1:4173',
    'https://benya111in.github.io',
    ...(process.env.GENERATOR_ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]
  const origin = req.headers.origin

  if (typeof origin === 'string' && allowedOrigins.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-methods', 'GET, HEAD, OPTIONS')
    res.setHeader('access-control-allow-headers', 'range')
    res.setHeader('vary', 'origin')
  }
}

function mimeTypeForFile(filePath: string) {
  switch (extname(filePath).toLowerCase()) {
    case '.json':
      return 'application/json; charset=utf-8'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.mp4':
      return 'video/mp4'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}
