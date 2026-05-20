import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const rootDir = resolve(process.cwd())
const distDir = join(rootDir, 'apps/desktop-ui/dist')
const apiDir = join(rootDir, 'api')
const defaultPort = 4173

type ApiHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void> | void

const apiHandlers = new Map<string, ApiHandler>()

async function main() {
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error('apps/desktop-ui/dist is missing. Run pnpm build first.')
  }

  const port = readPort()
  const server = createServer(async (req, res) => {
    try {
      if (req.url?.startsWith('/api/')) {
        await handleApi(req, res)
        return
      }

      serveStatic(req, res)
    } catch (error) {
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('content-type', 'application/json; charset=utf-8')
      }

      res.end(
        JSON.stringify({
          error: 'local_preview_error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
      )
    }
  })

  server.listen(port, '127.0.0.1', () => {
    console.log(`SlowLearner web preview: http://127.0.0.1:${port}`)
  })
}

async function handleApi(req: IncomingMessage, res: ServerResponse) {
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
  const route = pathname.replace(/^\/api\//, '').replace(/\/+$/, '')
  const handler = await loadApiHandler(route)

  if (!handler) {
    res.statusCode = 404
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify({
        error: 'api_route_not_found',
        message: `${pathname} is not available in local preview.`,
      }),
    )
    return
  }

  await handler(req, res)
}

async function loadApiHandler(route: string) {
  if (apiHandlers.has(route)) {
    return apiHandlers.get(route)
  }

  const handlerPath = join(apiDir, `${route}.ts`)
  if (!existsSync(handlerPath)) {
    return null
  }

  const module = (await import(
    `${pathToFileURL(handlerPath).href}?t=${Date.now()}`
  )) as {
    default?: ApiHandler
  }

  if (typeof module.default !== 'function') {
    return null
  }

  apiHandlers.set(route, module.default)
  return module.default
}

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const pathname = decodeURIComponent(
    new URL(req.url ?? '/', 'http://127.0.0.1').pathname,
  )
  const requestedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const directPath = join(distDir, requestedPath)
  const filePath =
    existsSync(directPath) && statSync(directPath).isFile()
      ? directPath
      : join(distDir, 'index.html')
  const stat = statSync(filePath)
  const range = req.headers.range

  res.setHeader('accept-ranges', 'bytes')
  res.setHeader('content-type', contentTypeFor(filePath))

  if (range) {
    const parsedRange = parseRangeHeader(range, stat.size)

    if (!parsedRange) {
      res.statusCode = 416
      res.setHeader('content-range', `bytes */${stat.size}`)
      res.end()
      return
    }

    res.statusCode = 206
    res.setHeader(
      'content-range',
      `bytes ${parsedRange.start}-${parsedRange.end}/${stat.size}`,
    )
    res.setHeader('content-length', parsedRange.end - parsedRange.start + 1)
    createReadStream(filePath, parsedRange).pipe(res)
    return
  }

  res.statusCode = 200
  res.setHeader('content-length', stat.size)
  createReadStream(filePath).pipe(res)
}

function parseRangeHeader(range: string, size: number) {
  const match = range.match(/^bytes=(\d*)-(\d*)$/)

  if (!match) {
    return null
  }

  const [, rawStart, rawEnd] = match
  const suffixLength = rawStart ? null : Number(rawEnd)
  const start = rawStart
    ? Number(rawStart)
    : Number.isFinite(suffixLength)
      ? Math.max(size - suffixLength, 0)
      : 0
  const end = rawEnd && rawStart ? Number(rawEnd) : size - 1

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
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

function contentTypeFor(filePath: string) {
  switch (extname(filePath)) {
    case '.css':
      return 'text/css; charset=utf-8'
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.mp4':
      return 'video/mp4'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.webm':
      return 'video/webm'
    default:
      return 'application/octet-stream'
  }
}

function readPort() {
  const portArgIndex = process.argv.findIndex((arg) => arg === '--port')
  const portArg =
    portArgIndex >= 0 ? process.argv[portArgIndex + 1] : process.env.PORT
  const port = Number(portArg)

  return Number.isFinite(port) && port > 0 ? port : defaultPort
}

void main()
