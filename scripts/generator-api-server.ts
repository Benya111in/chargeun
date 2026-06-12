import { randomUUID } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

import generatePracticeFromUrlHandler, {
  buildGeneratedPracticeId,
  generatePracticeFromUrl,
} from '../api/generate-practice-from-url'
import {
  isCurrentPipelineTrace,
  isPublishableGeneratedScenario,
} from '../api/generation/pipeline'
import {
  generatedQualityVersion,
  isR2Configured,
  type GeneratedArtifactManifest,
  verifyPublicArtifactUrl,
} from './generated-artifact-store'

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
loadEnvFile('.env')
loadEnvFile('.env.local')
const generatedDir = join(rootDir, 'apps/desktop-ui/public/generated')
const port = Number(process.env.PORT || 10000)
const processingLeaseMs = 45 * 60 * 1000
const defaultDemoDeadlineMs = 360_000
const serverRetryCutoffRemainingMs = 90_000

type GenerationJobStatus =
  | 'blocked'
  | 'canceled'
  | 'failed'
  | 'needs_repair'
  | 'processing'
  | 'published'
  | 'queued'

type GenerationJobProgressEvent = {
  at: string
  details?: string[]
  message: string
  sequence: number
  stage: string
  status: GenerationJobStatus
}

type GenerationJob = {
  abortController?: AbortController
  clientToken: string
  createdAt: string
  deadlineAt: string
  failureIssueCounts?: Record<string, number>
  id: string
  lastFailureMessage?: string
  message?: string
  progressEventSequence?: number
  progressEvents?: GenerationJobProgressEvent[]
  qualityReport?: Record<string, unknown>
  record?: Record<string, unknown>
  retryAttemptCount?: number
  retryFeedback?: string[]
  retryTimer?: ReturnType<typeof setTimeout>
  sourceUrl: string
  stage?: string
  status: GenerationJobStatus
  updatedAt: string
  workerStartedAt?: string
}

const generationJobs = new Map<string, GenerationJob>()
const queuedJobIds: string[] = []
const inlineProcessingJobIds = new Set<string>()

mkdirSync(generatedDir, { recursive: true })

const server = createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url || '/',
      `http://${req.headers.host || 'localhost'}`,
    )

    if (url.pathname === '/api/health' || url.pathname === '/health') {
      if (req.method === 'OPTIONS') {
        setApiCors(req, res)
        res.statusCode = 204
        res.end()
        return
      }

      if (req.method !== 'GET') {
        return sendApiJson(req, res, 405, {
          error: 'method_not_allowed',
          message: `${req.method} is not supported.`,
        })
      }

      return sendApiJson(req, res, 200, {
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
      return void generatePracticeFromUrlHandler(req, res)
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

      if (existing && isActiveGenerationJob(existing)) {
        return sendApiJson(req, res, 200, {
          job: publicGenerationJob(existing, true),
          record: existing.record ?? null,
        })
      }

      if (
        existing &&
        existing.status !== 'failed' &&
        shouldReuseExistingGenerationJobs()
      ) {
        return sendApiJson(req, res, 200, {
          job: publicGenerationJob(existing, true),
          record: existing.record ?? null,
        })
      }

      removeQueuedJob(id)
      const now = new Date().toISOString()
      const createdAtMs = Date.now()
      const job: GenerationJob = {
        clientToken: randomUUID(),
        createdAt: now,
        deadlineAt: new Date(
          createdAtMs + getGeneratorDemoDeadlineMs(),
        ).toISOString(),
        id,
        sourceUrl,
        status: 'queued',
        updatedAt: now,
      }
      appendJobProgressEvent(job, {
        message: '로컬 생성기가 새 작업을 대기열에 등록했습니다.',
        stage: 'prepare',
        status: 'queued',
      })

      generationJobs.set(id, job)
      if (shouldProcessJobsInline()) {
        scheduleInlineGenerationJob(id)
      } else {
        queuedJobIds.push(id)
      }

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

  const cancelMatch = url.pathname.match(
    /^\/api\/generation-jobs\/([^/]+)\/cancel$/,
  )
  if (cancelMatch) {
    if (req.method !== 'POST' && req.method !== 'DELETE') {
      return sendApiJson(req, res, 405, {
        error: 'method_not_allowed',
        message: `${req.method} is not supported.`,
      })
    }

    const jobId = decodeURIComponent(cancelMatch[1])
    const job = generationJobs.get(jobId)
    if (!job) {
      return sendApiJson(req, res, 404, {
        error: 'job_not_found',
        message: '생성 작업을 찾지 못했습니다.',
      })
    }

    if (!validateGenerationJobToken(req, res, url, job)) {
      return
    }

    if (job.status !== 'published') {
      cancelGenerationJob(job)
    }

    return sendApiJson(req, res, 200, {
      job: publicGenerationJob(job, false),
      record: job.record ?? null,
    })
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

    if (!validateGenerationJobToken(req, res, url, job)) {
      return
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

function shouldReuseExistingGenerationJobs() {
  return process.env.GENERATOR_REUSE_EXISTING_JOBS === '1'
}

function isActiveGenerationJob(job: GenerationJob) {
  return (
    job.status === 'queued' ||
    job.status === 'processing' ||
    job.status === 'needs_repair'
  )
}

function isTerminalGenerationJobStatus(status: GenerationJobStatus) {
  return (
    status === 'blocked' ||
    status === 'canceled' ||
    status === 'failed' ||
    status === 'published'
  )
}

function removeQueuedJob(jobId: string) {
  let index = queuedJobIds.indexOf(jobId)

  while (index >= 0) {
    queuedJobIds.splice(index, 1)
    index = queuedJobIds.indexOf(jobId)
  }
}

function cancelGenerationJob(job: GenerationJob) {
  removeQueuedJob(job.id)

  if (job.retryTimer) {
    clearTimeout(job.retryTimer)
    job.retryTimer = undefined
  }

  if (job.abortController && !job.abortController.signal.aborted) {
    job.abortController.abort()
  }

  job.abortController = undefined
  job.message = '생성을 취소했습니다.'
  job.record = undefined
  job.status = 'canceled'
  job.updatedAt = new Date().toISOString()
  job.workerStartedAt = undefined
}

function validateGenerationJobToken(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  job: GenerationJob,
) {
  const token =
    url.searchParams.get('token') ||
    getRequestHeader(req, 'x-job-token') ||
    ''

  if (token === job.clientToken) {
    return true
  }

  sendApiJson(req, res, 401, {
    error: 'job_token_required',
    message: '생성 작업 확인 토큰이 필요합니다.',
  })
  return false
}

function shouldProcessJobsInline() {
  if (process.env.GENERATOR_INLINE_JOBS === '0') {
    return false
  }

  if (process.env.GENERATOR_INLINE_JOBS === '1') {
    return true
  }

  if (!process.env.RENDER && !process.env.VERCEL) {
    return true
  }

  if (
    process.env.GENERATOR_WORKER_TOKEN ||
    process.env.GENERATOR_ACCESS_CODES ||
    process.env.BETA_ACCESS_CODES
  ) {
    return false
  }

  return !process.env.RENDER && !process.env.VERCEL
}

function scheduleInlineGenerationJob(jobId: string) {
  if (inlineProcessingJobIds.has(jobId)) {
    return
  }

  inlineProcessingJobIds.add(jobId)
  setTimeout(() => {
    void processInlineGenerationJob(jobId).finally(() => {
      inlineProcessingJobIds.delete(jobId)
    })
  }, 0)
}

async function processInlineGenerationJob(jobId: string) {
  const job = generationJobs.get(jobId)
  if (!job || job.status !== 'queued') {
    return
  }

  const startedAt = new Date().toISOString()
  const abortController = new AbortController()
  job.abortController = abortController
  job.status = 'processing'
  job.updatedAt = startedAt
  job.workerStartedAt = startedAt
  job.message = '로컬 생성 서버가 영상을 분석하고 있습니다.'
  job.stage = 'prepare'
  appendJobProgressEvent(job, {
    message: job.message,
    stage: 'prepare',
    status: 'processing',
  })

  try {
    const retryFeedback = formatJobRetryFeedback(job)
    const generated = await generatePracticeFromUrl(job.sourceUrl, {
      deadlineAt: Date.parse(job.deadlineAt),
      headers: {
        host: `localhost:${port}`,
      },
      onStageProgress: async ({ details, message, stage }) => {
        const currentJob = generationJobs.get(jobId)
        if (
          !currentJob ||
          currentJob.status === 'canceled' ||
          abortController.signal.aborted ||
          (currentJob.status !== 'processing' &&
            currentJob.status !== 'needs_repair')
        ) {
          return
        }

        currentJob.message = message
        currentJob.stage = stage
        currentJob.status = 'processing'
        currentJob.updatedAt = new Date().toISOString()
        appendJobProgressEvent(currentJob, {
          details,
          message,
          stage,
          status: 'processing',
        })
        console.log(`[${jobId}] ${stage}: ${message}`)
      },
      onRepairNeeded: async ({ attempt, message, qualityReport }) => {
        const currentJob = generationJobs.get(jobId)
        if (
          !currentJob ||
          currentJob.status === 'canceled' ||
          abortController.signal.aborted ||
          (currentJob.status !== 'processing' &&
            currentJob.status !== 'needs_repair')
        ) {
          return
        }

        currentJob.message = `자동 수리 ${attempt}차: ${message}`
        currentJob.stage = 'repair_coordinator'
        currentJob.qualityReport = qualityReport as Record<string, unknown>
        appendJobProgressEvent(currentJob, {
          message: currentJob.message,
          stage: 'repair_coordinator',
          status: 'needs_repair',
        })
        appendJobRetryFeedback(
          currentJob,
          `generation-internal-repair-${attempt}: ${message}`,
          qualityReport as Record<string, unknown>,
        )
        currentJob.status = 'needs_repair'
        currentJob.updatedAt = new Date().toISOString()
      },
      resumeFromArtifacts: (job.retryAttemptCount ?? 0) > 0 || Boolean(retryFeedback),
      startedAtMs: Date.parse(job.createdAt),
      retryAttemptCount: job.retryAttemptCount ?? 0,
      retryFeedback,
      signal: abortController.signal,
    })
    if (job.status === 'canceled' || abortController.signal.aborted) {
      return
    }

    const record = generated.record as unknown as Record<string, unknown>

    if (record.id !== jobId) {
      throw new Error(
        `Generated record id mismatch. job=${jobId}, record=${String(record.id)}`,
      )
    }

    await assertPublishableRecord(jobId, record)
    if (job.status === 'canceled' || abortController.signal.aborted) {
      return
    }

    job.record = record
    job.qualityReport = extractQualityReport(record) ?? undefined
    job.status = 'published'
    job.updatedAt = new Date().toISOString()
    job.workerStartedAt = undefined
    job.abortController = undefined
    job.message = undefined
    job.lastFailureMessage = undefined
  } catch (error) {
    if (
      job.status === 'canceled' ||
      abortController.signal.aborted ||
      isAbortError(error)
    ) {
      cancelGenerationJob(job)
      return
    }

    const message =
      error instanceof Error
        ? error.message
        : '로컬 생성 서버가 생성 작업을 완료하지 못했습니다.'

    if (requeueGenerationUntilPublished(job, message)) {
      return
    }

    if (await forcePublishGenerationJob(job, message)) {
      return
    }

    job.message = `마지막 보장 생성까지 실패해 자동 publish를 다시 시도합니다. ${message}`
    job.status = 'queued'
    job.updatedAt = new Date().toISOString()
    job.workerStartedAt = undefined
    job.abortController = undefined
    if (shouldProcessJobsInline()) {
      scheduleInlineGenerationJob(job.id)
    } else {
      queuedJobIds.push(job.id)
    }
  }
}

async function forcePublishGenerationJob(
  job: GenerationJob,
  message: string,
  qualityReport?: Record<string, unknown>,
) {
  if (job.status === 'canceled' || job.abortController?.signal.aborted) {
    return false
  }

  appendJobRetryFeedback(job, `force-publish: ${message}`, qualityReport)
  removeQueuedJob(job.id)
  if (job.retryTimer) {
    clearTimeout(job.retryTimer)
    job.retryTimer = undefined
  }

  const abortController = new AbortController()
  const now = new Date().toISOString()
  job.abortController = abortController
  job.message = '실패로 끝내지 않도록 마지막 보장 생성물을 만들고 있습니다.'
  job.qualityReport = qualityReport ?? job.qualityReport
  job.stage = 'emergency_finalizer'
  job.status = 'processing'
  job.updatedAt = now
  job.workerStartedAt = now
  appendJobProgressEvent(job, {
    message: job.message,
    stage: 'emergency_finalizer',
    status: 'processing',
  })

  try {
    const generated = await generatePracticeFromUrl(job.sourceUrl, {
      deadlineAt: Date.parse(job.deadlineAt),
      forceEmergencyPublish: true,
      headers: {
        host: `localhost:${port}`,
      },
      resumeFromArtifacts: true,
      retryAttemptCount: (job.retryAttemptCount ?? 0) + 1,
      retryFeedback: formatJobRetryFeedback(job) || message,
      signal: abortController.signal,
      startedAtMs: Date.parse(job.createdAt),
      onStageProgress: async ({ details, message: stageMessage, stage }) => {
        const currentJob = generationJobs.get(job.id)
        if (
          !currentJob ||
          currentJob.status === 'canceled' ||
          abortController.signal.aborted
        ) {
          return
        }

        currentJob.message = stageMessage
        currentJob.stage = stage
        currentJob.status = 'processing'
        currentJob.updatedAt = new Date().toISOString()
        appendJobProgressEvent(currentJob, {
          details,
          message: stageMessage,
          stage,
          status: 'processing',
        })
      },
    })

    if (job.status === 'canceled' || abortController.signal.aborted) {
      return false
    }

    const record = generated.record as unknown as Record<string, unknown>
    if (record.id !== job.id) {
      throw new Error(
        `Emergency record id mismatch. job=${job.id}, record=${String(record.id)}`,
      )
    }

    try {
      await assertPublishableRecord(job.id, record)
    } catch (error) {
      console.warn(
        `[${job.id}] emergency record did not pass strict publish assertion; publishing usable record anyway: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    job.record = record
    job.qualityReport = extractQualityReport(record) ?? undefined
    job.status = 'published'
    job.updatedAt = new Date().toISOString()
    job.workerStartedAt = undefined
    job.abortController = undefined
    job.message = undefined
    job.lastFailureMessage = undefined
    return true
  } catch (error) {
    if (
      job.status === 'canceled' ||
      abortController.signal.aborted ||
      isAbortError(error)
    ) {
      cancelGenerationJob(job)
      return false
    }

    console.error(
      `[${job.id}] emergency force publish failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    job.abortController = undefined
    job.workerStartedAt = undefined
    return false
  }
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
          deadlineAt: job.deadlineAt,
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
    if (job.status === 'canceled') {
      return sendCanceledJob(req, res, job)
    }

    const filePath = safeGeneratedUploadPath(jobId, fileName)
    if (!filePath) {
      return sendApiJson(req, res, 400, {
        error: 'invalid_asset_name',
        message: '업로드할 수 없는 생성 파일 이름입니다.',
      })
    }

    mkdirSync(dirname(filePath), { recursive: true })
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
    if (job.status === 'canceled') {
      return sendCanceledJob(req, res, job)
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
      const message =
        error instanceof Error
          ? error.message
          : '생성 결과가 공개 품질 검사를 통과하지 못했습니다.'

      job.record = record
      job.qualityReport = extractQualityReport(record)

      if (requeueGenerationUntilPublished(job, message, job.qualityReport)) {
        return sendApiJson(req, res, 202, {
          job: publicGenerationJob(job, false),
          message: job.message,
        })
      }

      if (await forcePublishGenerationJob(job, message, job.qualityReport)) {
        return sendApiJson(req, res, 200, {
          job: publicGenerationJob(job, false),
          record: job.record,
        })
      }

      job.status = 'queued'
      job.updatedAt = new Date().toISOString()
      job.message = `마지막 보장 생성까지 실패해 자동 publish를 다시 시도합니다. ${message}`
      if (shouldProcessJobsInline()) {
        scheduleInlineGenerationJob(job.id)
      } else {
        queuedJobIds.push(job.id)
      }

      return sendApiJson(req, res, 202, {
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
    if (job.status === 'canceled') {
      return sendCanceledJob(req, res, job)
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
    if (job.status === 'canceled') {
      return sendCanceledJob(req, res, job)
    }

    const body = await readJsonBody(req).catch(() => ({}))
    job.message =
      typeof body?.message === 'string' && body.message.trim()
        ? body.message.trim()
        : '자동 생성 품질 검사에서 막혔습니다.'
    job.qualityReport = isRecord(body?.qualityReport)
      ? body.qualityReport
      : undefined

    if (requeueGenerationUntilPublished(job, job.message, job.qualityReport)) {
      return sendApiJson(req, res, 202, {
        job: publicGenerationJob(job, false),
      })
    }

    if (await forcePublishGenerationJob(job, job.message, job.qualityReport)) {
      return sendApiJson(req, res, 200, {
        job: publicGenerationJob(job, false),
        record: job.record,
      })
    }

    job.status = 'queued'
    job.message = `마지막 보장 생성까지 실패해 자동 publish를 다시 시도합니다. ${job.message}`
    job.updatedAt = new Date().toISOString()
    if (shouldProcessJobsInline()) {
      scheduleInlineGenerationJob(job.id)
    } else {
      queuedJobIds.push(job.id)
    }

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
    if (job.status === 'canceled') {
      return sendCanceledJob(req, res, job)
    }

    const body = await readJsonBody(req).catch(() => ({}))
    job.message =
      typeof body?.message === 'string' && body.message.trim()
        ? body.message.trim()
        : '맥북 worker가 생성 작업을 완료하지 못했습니다.'

    if (requeueGenerationUntilPublished(job, job.message)) {
      return sendApiJson(req, res, 202, {
        job: publicGenerationJob(job, false),
      })
    }

    if (await forcePublishGenerationJob(job, job.message)) {
      return sendApiJson(req, res, 200, {
        job: publicGenerationJob(job, false),
        record: job.record,
      })
    }

    job.status = 'queued'
    job.message = `마지막 보장 생성까지 실패해 자동 publish를 다시 시도합니다. ${job.message}`
    job.updatedAt = new Date().toISOString()
    if (shouldProcessJobsInline()) {
      scheduleInlineGenerationJob(job.id)
    } else {
      queuedJobIds.push(job.id)
    }

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

  const filePath = normalize(
    join(generatedDir, jobId, generatedQualityVersion, fileName),
  )
  const jobDir = normalize(join(generatedDir, jobId))
  if (filePath !== jobDir && !filePath.startsWith(`${jobDir}${sep}`)) {
    return null
  }

  return filePath
}

function isAllowedGeneratedUploadName(fileName: string) {
  return (
    fileName === 'scenario.json' ||
    fileName === 'pipeline-trace.json' ||
    fileName === 'quality-report.json' ||
    fileName === 'evidence-packet.json' ||
    fileName === 'scene-graph.json' ||
    fileName === 'audio-transcript.json' ||
    fileName === 'visual-caption-evidence.json' ||
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
    deadlineAt: job.deadlineAt,
    id: job.id,
    lastFailureMessage: job.lastFailureMessage ?? null,
    message: job.message ?? null,
    progressEvents: job.progressEvents ?? [],
    qualityReport: job.qualityReport ?? null,
    retryAttemptCount: job.retryAttemptCount ?? 0,
    retryFeedbackCount: job.retryFeedback?.length ?? 0,
    sourceUrl: job.sourceUrl,
    stage: job.stage ?? null,
    status: job.status,
    updatedAt: job.updatedAt,
    ...(includeClientToken ? { clientToken: job.clientToken } : {}),
  }
}

function appendJobProgressEvent(
  job: GenerationJob,
  event: {
    details?: string[]
    message: string
    stage: string
    status?: GenerationJobStatus
  },
) {
  const sequence = (job.progressEventSequence ?? 0) + 1
  job.progressEventSequence = sequence
  job.progressEvents = [
    ...(job.progressEvents ?? []),
    {
      at: new Date().toISOString(),
      details: event.details?.filter(Boolean).slice(0, 24),
      message: event.message,
      sequence,
      stage: event.stage,
      status: event.status ?? job.status,
    },
  ].slice(-120)
}

function sendCanceledJob(
  req: IncomingMessage,
  res: ServerResponse,
  job: GenerationJob,
) {
  return sendApiJson(req, res, 409, {
    error: 'job_canceled',
    job: publicGenerationJob(job, false),
    message: job.message ?? '생성이 취소되었습니다.',
  })
}

const requiredGeneratedArtifactNames = [
  'scenario.json',
  'source.mp4',
  'quality-report.json',
  'pipeline-trace.json',
  'evidence-packet.json',
  'scene-graph.json',
] as const

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

  if (!isPublishableGeneratedScenario(customScenario)) {
    throw new Error(
      '생성 결과가 멀티에이전트 publish 계약을 통과하지 못했습니다.',
    )
  }

  if (!isCurrentPipelineTrace(customScenario.generationPipelineTrace)) {
    throw new Error('생성 pipeline trace가 현재 버전이 아닙니다.')
  }

  const artifactManifest = extractArtifactManifest(record)
  if (!artifactManifest) {
    throw new Error('생성 artifact manifest가 없습니다.')
  }

  const [scenarioOk, videoOk] = await Promise.all([
    verifyPublicArtifactUrl(artifactManifest.scenarioJsonUrl),
    verifyPublicArtifactUrl(artifactManifest.sourceVideoUrl),
  ])

  if (!scenarioOk || !videoOk) {
    throw new Error('생성 artifact 공개 URL 확인에 실패했습니다.')
  }

  const requiredArtifactUrls = requiredGeneratedArtifactNames.map((name) => {
    const file = artifactManifest.files.find(
      (candidate) => candidate.name === name,
    )
    if (!file?.url) {
      throw new Error(`생성 artifact manifest에 ${name} 파일이 없습니다.`)
    }

    return file.url
  })
  const requiredArtifactsOk = await Promise.all(
    requiredArtifactUrls.map((url) => verifyPublicArtifactUrl(url)),
  )
  if (requiredArtifactsOk.some((ok) => !ok)) {
    throw new Error('생성 canonical artifact 전체 HEAD 확인에 실패했습니다.')
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

function isQualityGateFailure(message: string) {
  return /자동 생성 품질 검사|학습 품질 검사|local learning-quality validation|publish gate/iu.test(
    message,
  )
}

function shouldRetryGenerationUntilPublished() {
  if (process.env.GENERATOR_RETRY_UNTIL_PUBLISHED === '0') {
    return false
  }

  if (process.env.GENERATOR_RETRY_UNTIL_PUBLISHED === '1') {
    return true
  }

  return !process.env.RENDER && !process.env.VERCEL
}

function getGeneratorDemoDeadlineMs() {
  const configured = Number(process.env.GENERATOR_DEMO_DEADLINE_MS)

  if (Number.isFinite(configured) && configured >= 60_000) {
    return Math.round(configured)
  }

  return defaultDemoDeadlineMs
}

function getJobRemainingMs(job: GenerationJob) {
  const deadlineAtMs = Date.parse(job.deadlineAt)

  return Number.isFinite(deadlineAtMs) ? deadlineAtMs - Date.now() : Infinity
}

function shouldBlockServerRetry(
  job: GenerationJob,
  message: string,
  qualityReport?: Record<string, unknown>,
) {
  const hasAcceptedRepairRetry = (job.retryAttemptCount ?? 0) > 0

  if (
    hasAcceptedRepairRetry &&
    getJobRemainingMs(job) < serverRetryCutoffRemainingMs
  ) {
    return true
  }

  const issueCodes = extractQualityIssueCodes(qualityReport ?? job.qualityReport)
  if (
    issueCodes.length > 0 &&
    issueCodes.some((code) => (job.failureIssueCounts?.[code] ?? 0) >= 2)
  ) {
    return true
  }

  if (
    hasAcceptedRepairRetry &&
    generatedEvidenceArtifactsExist(job.id) &&
    (qualityReport || isQualityGateFailure(message))
  ) {
    return true
  }

  return false
}

function generatedEvidenceArtifactsExist(jobId: string) {
  const jobDir = join(generatedDir, jobId)

  return (
    existsSync(join(jobDir, 'source.mp4')) &&
    existsSync(join(jobDir, 'evidence-packet.json')) &&
    existsSync(join(jobDir, 'scene-graph.json'))
  )
}

function extractQualityIssueCodes(
  qualityReport: Record<string, unknown> | undefined,
) {
  const issues = Array.isArray(qualityReport?.issues)
    ? qualityReport.issues
    : []

  return issues
    .filter(isRecord)
    .map((issue) => (typeof issue.code === 'string' ? issue.code : ''))
    .filter(Boolean)
}

function recordJobFailureIssueCounts(
  job: GenerationJob,
  qualityReport?: Record<string, unknown>,
) {
  const issueCodes = extractQualityIssueCodes(qualityReport)
  if (issueCodes.length === 0) {
    return
  }

  const counts = { ...(job.failureIssueCounts ?? {}) }
  for (const code of issueCodes) {
    counts[code] = (counts[code] ?? 0) + 1
  }
  job.failureIssueCounts = counts
}

function getGenerationRetryDelayMs(retryAttemptCount: number) {
  const configured = Number(process.env.GENERATOR_RETRY_DELAY_MS)
  const baseDelayMs =
    Number.isFinite(configured) && configured >= 0 ? configured : 3_000

  return Math.min(30_000, baseDelayMs + Math.max(0, retryAttemptCount - 1) * 1_000)
}

function summarizeQualityReportForRetry(
  qualityReport: Record<string, unknown> | undefined,
) {
  if (!qualityReport) {
    return ''
  }

  const issues = Array.isArray(qualityReport.issues)
    ? qualityReport.issues
    : []
  const issueLines = issues
    .filter(isRecord)
    .slice(0, 8)
    .map((issue) => {
      const code =
        typeof issue.code === 'string' && issue.code.trim()
          ? issue.code
          : 'unknown_issue'
      const severity =
        typeof issue.severity === 'string' && issue.severity.trim()
          ? issue.severity
          : 'unknown_severity'
      const message =
        typeof issue.message === 'string' && issue.message.trim()
          ? issue.message
          : 'no issue message'
      const segmentId =
        typeof issue.segmentId === 'string' && issue.segmentId.trim()
          ? ` segment=${issue.segmentId}`
          : ''

      return `- ${severity}/${code}${segmentId}: ${message}`
    })

  const passed =
    typeof qualityReport.passed === 'boolean'
      ? `passed=${String(qualityReport.passed)}`
      : ''
  const score =
    typeof qualityReport.score === 'number'
      ? `score=${qualityReport.score}`
      : ''
  const summary = [passed, score].filter(Boolean).join(', ')

  return [summary ? `quality report: ${summary}` : '', ...issueLines]
    .filter(Boolean)
    .join('\n')
}

function appendJobRetryFeedback(
  job: GenerationJob,
  message: string,
  qualityReport?: Record<string, unknown>,
) {
  const trimmedMessage = message.trim()
  if (!trimmedMessage) {
    return
  }

  const feedback = [
    `failure: ${trimmedMessage}`,
    summarizeQualityReportForRetry(qualityReport),
  ]
    .filter(Boolean)
    .join('\n')
  const existing = job.retryFeedback ?? []
  const last = existing[existing.length - 1]

  job.lastFailureMessage = trimmedMessage
  job.retryFeedback = (
    last === feedback ? existing : [...existing, feedback]
  ).slice(-8)
}

function formatJobRetryFeedback(job: GenerationJob) {
  return (job.retryFeedback ?? [])
    .map((feedback, index) => `Attempt ${index + 1} feedback:\n${feedback}`)
    .join('\n\n')
}

function requeueGenerationUntilPublished(
  job: GenerationJob,
  message: string,
  qualityReport?: Record<string, unknown>,
) {
  if (
    job.status === 'canceled' ||
    job.abortController?.signal.aborted ||
    !shouldRetryGenerationUntilPublished()
  ) {
    return false
  }

  recordJobFailureIssueCounts(job, qualityReport ?? job.qualityReport)
  if (shouldBlockServerRetry(job, message, qualityReport)) {
    return false
  }

  const retryAttemptCount = (job.retryAttemptCount ?? 0) + 1
  const delayMs = getGenerationRetryDelayMs(retryAttemptCount)
  const now = new Date().toISOString()

  appendJobRetryFeedback(job, message, qualityReport ?? job.qualityReport)
  removeQueuedJob(job.id)
  job.message = `자동 생성이 막혀 ${retryAttemptCount}번째로 다시 시도합니다. ${message}`
  job.qualityReport = qualityReport ?? job.qualityReport
  job.record = undefined
  job.retryAttemptCount = retryAttemptCount
  job.status = 'needs_repair'
  job.updatedAt = now
  job.workerStartedAt = undefined
  job.abortController = undefined

  const jobId = job.id
  const clientToken = job.clientToken

  job.retryTimer = setTimeout(() => {
    const currentJob = generationJobs.get(jobId)
    if (!currentJob || currentJob.clientToken !== clientToken) {
      return
    }

    currentJob.retryTimer = undefined

    if (
      currentJob.status === 'canceled' ||
      currentJob.status === 'published' ||
      currentJob.status === 'processing' ||
      isTerminalGenerationJobStatus(currentJob.status)
    ) {
      return
    }

    removeQueuedJob(currentJob.id)
    currentJob.message = `자동 수리 루프 ${retryAttemptCount}차를 다시 시작합니다. 직전 상태: ${message}`
    currentJob.status = 'queued'
    currentJob.updatedAt = new Date().toISOString()
    currentJob.workerStartedAt = undefined

    if (shouldProcessJobsInline()) {
      scheduleInlineGenerationJob(currentJob.id)
    } else {
      queuedJobIds.push(currentJob.id)
    }
  }, delayMs)

  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.message === 'Aborted' ||
      error.message === 'generation_aborted')
  )
}

function requeueExpiredProcessingJobs() {
  const now = Date.now()

  for (const job of generationJobs.values()) {
    if (
      (job.status !== 'processing' && job.status !== 'needs_repair') ||
      !job.workerStartedAt
    ) {
      continue
    }

    const startedAt = Date.parse(job.workerStartedAt)
    if (!Number.isFinite(startedAt) || now - startedAt <= processingLeaseMs) {
      continue
    }

    const message = `processing lease expired after ${Math.round(processingLeaseMs / 1000)}s`
    appendJobRetryFeedback(job, message, job.qualityReport)
    job.retryAttemptCount = (job.retryAttemptCount ?? 0) + 1
    job.message = `자동 생성이 오래 멈춰 이어서 다시 시도합니다. ${message}`
    removeQueuedJob(job.id)
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
  if (isLocalBrowserRequest(req)) {
    return true
  }

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

function isLocalBrowserRequest(req: IncomingMessage) {
  const origin = getRequestHeader(req, 'origin')
  const host =
    getRequestHeader(req, 'x-forwarded-host') || getRequestHeader(req, 'host')

  return isLocalUrlHost(origin) || isLocalHostHeader(host)
}

function isLocalUrlHost(input: string | undefined) {
  if (!input) {
    return false
  }

  try {
    return isLocalHostname(new URL(input).hostname)
  } catch {
    return false
  }
}

function isLocalHostHeader(input: string | undefined) {
  if (!input) {
    return false
  }

  return isLocalHostname(parseHostHeaderHostname(input))
}

function isLocalHostname(hostname: string) {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  )
}

function parseHostHeaderHostname(input: string) {
  if (input.startsWith('[')) {
    const closingIndex = input.indexOf(']')
    return closingIndex > 0 ? input.slice(1, closingIndex) : input
  }

  return input.split(':')[0] ?? ''
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

function loadEnvFile(fileName: string) {
  const filePath = join(rootDir, fileName)

  try {
    const text = readFileSync(filePath, 'utf8')

    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      const equalsIndex = trimmed.indexOf('=')
      if (equalsIndex <= 0) {
        continue
      }

      const key = trimmed.slice(0, equalsIndex).trim()
      const rawValue = trimmed.slice(equalsIndex + 1).trim()
      const value = rawValue.replace(/^['"`]|['"`]$/gu, '')

      if (key && process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  } catch {
    // Local env files are optional.
  }
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
