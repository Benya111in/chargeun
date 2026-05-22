import { randomUUID } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
} from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

import generatePracticeFromUrl, {
  buildGeneratedPracticeId,
} from '../api/generate-practice-from-url'
import {
  generatedQualityVersion,
  isR2Configured,
  type GeneratedArtifactManifest,
  verifyPublicArtifactUrl,
} from './generated-artifact-store'

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const generatedDir = join(rootDir, 'apps/desktop-ui/public/generated')
const port = Number(process.env.PORT || 10000)
const processingLeaseMs = 45 * 60 * 1000

type GenerationJobStatus =
  | 'approved'
  | 'blocked'
  | 'failed'
  | 'needs_repair'
  | 'processing'
  | 'published'
  | 'queued'

type GenerationJob = {
  clientToken: string
  createdAt: string
  id: string
  message?: string
  qualityReport?: Record<string, unknown>
  record?: Record<string, unknown>
  sourceUrl: string
  status: GenerationJobStatus
  updatedAt: string
  workerStartedAt?: string
}

const generationJobs = new Map<string, GenerationJob>()
const queuedJobIds: string[] = []

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
        qualityVersion: generatedQualityVersion,
        r2Configured: isR2Configured(),
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

    if (url.pathname.startsWith('/api/generation-jobs')) {
      return void handleGenerationJobs(req, res, url)
    }

    if (url.pathname.startsWith('/api/worker/jobs')) {
      return void handleWorkerJobs(req, res, url)
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

async function handleGenerationJobs(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (req.method === 'OPTIONS') {
    setApiCors(req, res)
    res.statusCode = 204
    res.end()
    return
  }

  if (url.pathname === '/api/generation-jobs') {
    if (req.method !== 'POST') {
      return sendApiJson(req, res, 405, {
        error: 'method_not_allowed',
        message: `${req.method} is not supported.`,
      })
    }

    if (!validateGeneratorAccessCode(req, res)) {
      return
    }

    try {
      const body = await readJsonBody(req)
      const { id, sourceUrl } = buildGeneratedPracticeId(body?.sourceUrl)
      const existing = generationJobs.get(id)

      if (existing && existing.status !== 'failed') {
        return sendApiJson(req, res, 200, {
          job: publicGenerationJob(existing, true),
          record: existing.record ?? null,
        })
      }

      const now = new Date().toISOString()
      const job: GenerationJob = {
        clientToken: randomUUID(),
        createdAt: now,
        id,
        sourceUrl,
        status: 'queued',
        updatedAt: now,
      }

      generationJobs.set(id, job)
      queuedJobIds.push(id)

      return sendApiJson(req, res, 202, {
        job: publicGenerationJob(job, true),
      })
    } catch (error) {
      return sendApiJson(req, res, 400, {
        error: 'invalid_generation_job',
        message:
          error instanceof Error
            ? error.message
            : '생성 작업을 만들지 못했습니다.',
      })
    }
  }

  const statusMatch = url.pathname.match(/^\/api\/generation-jobs\/([^/]+)$/)
  if (statusMatch) {
    if (req.method !== 'GET') {
      return sendApiJson(req, res, 405, {
        error: 'method_not_allowed',
        message: `${req.method} is not supported.`,
      })
    }

    const jobId = decodeURIComponent(statusMatch[1])
    const job = generationJobs.get(jobId)
    if (!job) {
      return sendApiJson(req, res, 404, {
        error: 'job_not_found',
        message: '생성 작업을 찾지 못했습니다.',
      })
    }

    const token =
      url.searchParams.get('token') ||
      getRequestHeader(req, 'x-job-token') ||
      ''
    if (token !== job.clientToken) {
      return sendApiJson(req, res, 401, {
        error: 'job_token_required',
        message: '생성 작업 확인 토큰이 필요합니다.',
      })
    }

    return sendApiJson(req, res, 200, {
      job: publicGenerationJob(job, false),
      record: job.record ?? null,
    })
  }

  return sendApiJson(req, res, 404, {
    error: 'not_found',
    message: 'Not found.',
  })
}

async function handleWorkerJobs(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (req.method === 'OPTIONS') {
    setApiCors(req, res)
    res.statusCode = 204
    res.end()
    return
  }

  if (!validateWorkerAccess(req, res)) {
    return
  }

  if (url.pathname === '/api/worker/jobs/next') {
    if (req.method !== 'GET') {
      return sendApiJson(req, res, 405, {
        error: 'method_not_allowed',
        message: `${req.method} is not supported.`,
      })
    }

    requeueExpiredProcessingJobs()

    while (queuedJobIds.length > 0) {
      const jobId = queuedJobIds.shift()
      if (!jobId) {
        continue
      }

      const job = generationJobs.get(jobId)
      if (!job || job.status !== 'queued') {
        continue
      }

      const now = new Date().toISOString()
      job.status = 'processing'
      job.updatedAt = now
      job.workerStartedAt = now

      return sendApiJson(req, res, 200, {
        job: {
          id: job.id,
          sourceUrl: job.sourceUrl,
        },
      })
    }

    return sendApiJson(req, res, 200, {
      job: null,
    })
  }

  const assetMatch = url.pathname.match(
    /^\/api\/worker\/jobs\/([^/]+)\/assets\/([^/]+)$/,
  )
  if (assetMatch) {
    if (req.method !== 'PUT') {
      return sendApiJson(req, res, 405, {
        error: 'method_not_allowed',
        message: `${req.method} is not supported.`,
      })
    }

    const jobId = decodeURIComponent(assetMatch[1])
    const fileName = decodeURIComponent(assetMatch[2])
    const job = generationJobs.get(jobId)
    if (!job) {
      return sendApiJson(req, res, 404, {
        error: 'job_not_found',
        message: '생성 작업을 찾지 못했습니다.',
      })
    }

    const filePath = safeGeneratedUploadPath(jobId, fileName)
    if (!filePath) {
      return sendApiJson(req, res, 400, {
        error: 'invalid_asset_name',
        message: '업로드할 수 없는 생성 파일 이름입니다.',
      })
    }

    mkdirSync(join(generatedDir, jobId), { recursive: true })
    await pipeline(req, createWriteStream(filePath))
    job.updatedAt = new Date().toISOString()

    return sendApiJson(req, res, 200, {
      ok: true,
    })
  }

  const completeMatch = url.pathname.match(
    /^\/api\/worker\/jobs\/([^/]+)\/complete$/,
  )
  if (completeMatch) {
    if (req.method !== 'POST') {
      return sendApiJson(req, res, 405, {
        error: 'method_not_allowed',
        message: `${req.method} is not supported.`,
      })
    }

    const jobId = decodeURIComponent(completeMatch[1])
    const job = generationJobs.get(jobId)
    if (!job) {
      return sendApiJson(req, res, 404, {
        error: 'job_not_found',
        message: '생성 작업을 찾지 못했습니다.',
      })
    }

    const body = await readJsonBody(req)
    const record = body?.record as Record<string, unknown> | undefined
    if (!record || record.id !== jobId) {
      return sendApiJson(req, res, 400, {
        error: 'invalid_record',
        message: '생성 결과 record가 작업 id와 맞지 않습니다.',
      })
    }

    try {
      await assertPublishableRecord(jobId, record)
    } catch (error) {
      job.record = record
      job.qualityReport = extractQualityReport(record)
      job.status = 'blocked'
      job.updatedAt = new Date().toISOString()
      job.message =
        error instanceof Error
          ? error.message
          : '생성 결과가 공개 품질 검사를 통과하지 못했습니다.'

      return sendApiJson(req, res, 422, {
        error: 'publish_gate_failed',
        job: publicGenerationJob(job, false),
        message: job.message,
      })
    }

    job.record = record
    job.qualityReport = extractQualityReport(record)
    job.status = 'published'
    job.updatedAt = new Date().toISOString()
    job.message = undefined

    return sendApiJson(req, res, 200, {
      job: publicGenerationJob(job, false),
      record: job.record,
    })
  }

  const needsRepairMatch = url.pathname.match(
    /^\/api\/worker\/jobs\/([^/]+)\/needs-repair$/,
  )
  if (needsRepairMatch) {
    if (req.method !== 'POST') {
      return sendApiJson(req, res, 405, {
        error: 'method_not_allowed',
        message: `${req.method} is not supported.`,
      })
    }

    const jobId = decodeURIComponent(needsRepairMatch[1])
    const job = generationJobs.get(jobId)
    if (!job) {
      return sendApiJson(req, res, 404, {
        error: 'job_not_found',
        message: '생성 작업을 찾지 못했습니다.',
      })
    }

    const body = await readJsonBody(req).catch(() => ({}))
    job.message =
      typeof body?.message === 'string' && body.message.trim()
        ? body.message.trim()
        : '자동 품질 검사에서 재생성이 필요합니다.'
    job.qualityReport = isRecord(body?.qualityReport)
      ? body.qualityReport
      : undefined
    job.status = 'needs_repair'
    job.updatedAt = new Date().toISOString()

    return sendApiJson(req, res, 200, {
      job: publicGenerationJob(job, false),
    })
  }

  const blockMatch = url.pathname.match(/^\/api\/worker\/jobs\/([^/]+)\/block$/)
  if (blockMatch) {
    if (req.method !== 'POST') {
      return sendApiJson(req, res, 405, {
        error: 'method_not_allowed',
        message: `${req.method} is not supported.`,
      })
    }

    const jobId = decodeURIComponent(blockMatch[1])
    const job = generationJobs.get(jobId)
    if (!job) {
      return sendApiJson(req, res, 404, {
        error: 'job_not_found',
        message: '생성 작업을 찾지 못했습니다.',
      })
    }

    const body = await readJsonBody(req).catch(() => ({}))
    job.message =
      typeof body?.message === 'string' && body.message.trim()
        ? body.message.trim()
        : '자동 생성 품질 검사에서 막혔습니다.'
    job.qualityReport = isRecord(body?.qualityReport)
      ? body.qualityReport
      : undefined
    job.status = 'blocked'
    job.updatedAt = new Date().toISOString()

    return sendApiJson(req, res, 200, {
      job: publicGenerationJob(job, false),
    })
  }

  const failMatch = url.pathname.match(/^\/api\/worker\/jobs\/([^/]+)\/fail$/)
  if (failMatch) {
    if (req.method !== 'POST') {
      return sendApiJson(req, res, 405, {
        error: 'method_not_allowed',
        message: `${req.method} is not supported.`,
      })
    }

    const jobId = decodeURIComponent(failMatch[1])
    const job = generationJobs.get(jobId)
    if (!job) {
      return sendApiJson(req, res, 404, {
        error: 'job_not_found',
        message: '생성 작업을 찾지 못했습니다.',
      })
    }

    const body = await readJsonBody(req).catch(() => ({}))
    job.message =
      typeof body?.message === 'string' && body.message.trim()
        ? body.message.trim()
        : '맥북 worker가 생성 작업을 완료하지 못했습니다.'
    job.status = 'failed'
    job.updatedAt = new Date().toISOString()

    return sendApiJson(req, res, 200, {
      job: publicGenerationJob(job, false),
    })
  }

  return sendApiJson(req, res, 404, {
    error: 'not_found',
    message: 'Not found.',
  })
}

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
  res.setHeader('cache-control', 'no-store')
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

function safeGeneratedUploadPath(jobId: string, fileName: string) {
  if (!/^generated-[a-f0-9]{12}$/u.test(jobId)) {
    return null
  }

  if (!isAllowedGeneratedUploadName(fileName)) {
    return null
  }

  const filePath = normalize(join(generatedDir, jobId, fileName))
  const jobDir = normalize(join(generatedDir, jobId))
  if (filePath !== jobDir && !filePath.startsWith(`${jobDir}${sep}`)) {
    return null
  }

  return filePath
}

function isAllowedGeneratedUploadName(fileName: string) {
  return (
    fileName === 'scenario.json' ||
    fileName === 'source.mp4' ||
    fileName === 'source.info.json' ||
    /^source\.[a-z0-9-]+(?:-orig)?\.vtt$/iu.test(fileName) ||
    /^visual-caption-frame-\d{2}\.jpg$/u.test(fileName)
  )
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

function setApiCors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin

  if (typeof origin === 'string' && isAllowedOrigin(origin)) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, OPTIONS')
    res.setHeader(
      'access-control-allow-headers',
      'content-type, x-generator-code, x-job-token, x-worker-token',
    )
    res.setHeader('vary', 'origin')
  }
}

function setGeneratedAssetCors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin

  if (typeof origin === 'string' && isAllowedOrigin(origin)) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-methods', 'GET, HEAD, OPTIONS')
    res.setHeader('access-control-allow-headers', 'range')
    res.setHeader('vary', 'origin')
  }
}

function isAllowedOrigin(origin: string) {
  try {
    const url = new URL(origin)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return true
    }
  } catch {
    return false
  }

  return getAllowedOrigins().includes(origin)
}

function getAllowedOrigins() {
  return [
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

function publicGenerationJob(job: GenerationJob, includeClientToken: boolean) {
  return {
    createdAt: job.createdAt,
    id: job.id,
    message: job.message ?? null,
    qualityReport: job.qualityReport ?? null,
    sourceUrl: job.sourceUrl,
    status: job.status,
    updatedAt: job.updatedAt,
    ...(includeClientToken ? { clientToken: job.clientToken } : {}),
  }
}

async function assertPublishableRecord(
  jobId: string,
  record: Record<string, unknown>,
) {
  const customScenario = isRecord(record.customScenario)
    ? record.customScenario
    : null
  if (!customScenario) {
    throw new Error('생성 결과에 학습 시나리오가 없습니다.')
  }

  const qualityReport = extractQualityReport(record)
  if (!qualityReport || qualityReport.passed !== true) {
    throw new Error('생성 결과가 품질 검사를 통과하지 못했습니다.')
  }

  const artifactManifest = extractArtifactManifest(record)
  if (artifactManifest) {
    const [scenarioOk, videoOk] = await Promise.all([
      verifyPublicArtifactUrl(artifactManifest.scenarioJsonUrl),
      verifyPublicArtifactUrl(artifactManifest.sourceVideoUrl),
    ])

    if (!scenarioOk || !videoOk) {
      throw new Error('생성 artifact 공개 URL 확인에 실패했습니다.')
    }

    return
  }

  const scenarioPath = safeGeneratedUploadPath(jobId, 'scenario.json')
  const sourcePath = safeGeneratedUploadPath(jobId, 'source.mp4')
  if (
    !scenarioPath ||
    !sourcePath ||
    !existsSync(scenarioPath) ||
    !existsSync(sourcePath)
  ) {
    throw new Error('생성 artifact가 서버에 없습니다.')
  }
}

function extractQualityReport(record: Record<string, unknown>) {
  const customScenario = isRecord(record.customScenario)
    ? record.customScenario
    : null
  const qualityReport = isRecord(customScenario?.generationQualityReport)
    ? customScenario.generationQualityReport
    : null

  return qualityReport
}

function extractArtifactManifest(
  record: Record<string, unknown>,
): GeneratedArtifactManifest | null {
  const customScenario = isRecord(record.customScenario)
    ? record.customScenario
    : null
  const manifest = isRecord(customScenario?.generatedArtifactManifest)
    ? customScenario.generatedArtifactManifest
    : null

  if (
    !manifest ||
    typeof manifest.scenarioJsonUrl !== 'string' ||
    typeof manifest.sourceVideoUrl !== 'string'
  ) {
    return null
  }

  return manifest as GeneratedArtifactManifest
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function requeueExpiredProcessingJobs() {
  const now = Date.now()

  for (const job of generationJobs.values()) {
    if (job.status !== 'processing' || !job.workerStartedAt) {
      continue
    }

    const startedAt = Date.parse(job.workerStartedAt)
    if (!Number.isFinite(startedAt) || now - startedAt <= processingLeaseMs) {
      continue
    }

    job.status = 'queued'
    job.updatedAt = new Date().toISOString()
    job.workerStartedAt = undefined
    queuedJobIds.push(job.id)
  }
}

function validateGeneratorAccessCode(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const configuredCodes = parseAccessCodes()
  if (configuredCodes.length === 0) {
    return true
  }

  const accessCode = getRequestHeader(req, 'x-generator-code')?.trim() ?? ''
  if (accessCode && configuredCodes.includes(accessCode)) {
    return true
  }

  sendApiJson(req, res, 401, {
    error: 'generator_code_required',
    message: '생성 비밀번호가 필요합니다.',
  })
  return false
}

function validateWorkerAccess(req: IncomingMessage, res: ServerResponse) {
  const workerToken = getWorkerToken()
  if (!workerToken) {
    sendApiJson(req, res, 503, {
      error: 'worker_token_not_configured',
      message: 'GENERATOR_WORKER_TOKEN이 서버에 설정되어 있지 않습니다.',
    })
    return false
  }

  const requestToken = getRequestHeader(req, 'x-worker-token')?.trim() ?? ''
  if (requestToken && requestToken === workerToken) {
    return true
  }

  sendApiJson(req, res, 401, {
    error: 'worker_token_required',
    message: 'worker 인증 토큰이 필요합니다.',
  })
  return false
}

function getWorkerToken() {
  const configuredWorkerToken = process.env.GENERATOR_WORKER_TOKEN?.trim()
  if (configuredWorkerToken) {
    return configuredWorkerToken
  }

  return parseAccessCodes()[0] ?? ''
}

function parseAccessCodes() {
  return (
    process.env.GENERATOR_ACCESS_CODES ||
    process.env.BETA_ACCESS_CODES ||
    ''
  )
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
}

function getRequestHeader(req: IncomingMessage, name: string) {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

async function readJsonBody(req: IncomingMessage) {
  let text = ''
  for await (const chunk of req) {
    text += chunk
    if (text.length > 1_000_000) {
      throw new Error('요청 본문이 너무 큽니다.')
    }
  }

  if (!text.trim()) {
    return {}
  }

  return JSON.parse(text) as Record<string, unknown>
}

function sendApiJson(
  req: IncomingMessage,
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
) {
  setApiCors(req, res)
  sendJson(res, statusCode, payload)
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
