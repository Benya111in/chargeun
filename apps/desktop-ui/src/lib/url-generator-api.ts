import type { GeneratedScenarioRecord } from './generated-scenario'

const generatorApiBaseStorageKey = 'chagunchagun.generator-api-base.v1'
const generatorAccessCodeSessionKey = 'chagunchagun.generator-access-code.v1'

export type GeneratorApiConfig = {
  apiBase: string
  configuredFrom: 'env' | 'query' | 'same-origin' | 'storage'
  requiresRemoteApi: boolean
}

export type GenerationJobStatus =
  | 'blocked'
  | 'canceled'
  | 'failed'
  | 'needs_repair'
  | 'processing'
  | 'published'
  | 'queued'

export type GenerationJobProgress = {
  message: string | null
  progressEvents?: GenerationJobProgressEvent[]
  qualityReport?: Record<string, unknown> | null
  stage?: string | null
  status: GenerationJobStatus
}

export type GenerationJobProgressEvent = {
  at?: string
  details?: string[]
  message?: string | null
  sequence?: number
  stage?: string | null
  status?: GenerationJobStatus
}

export type RequestGeneratedPracticeOptions = {
  apiBase?: string
  onProgress?: (progress: GenerationJobProgress) => void
  signal?: AbortSignal
  timeoutMs?: number | null
}

export const localGeneratorApiBase = 'http://127.0.0.1:10000'

export function getDefaultGenerationPollTimeoutMs() {
  return null
}

export function getGeneratorApiConfig(): GeneratorApiConfig {
  const queryApiBase = readApiBaseFromQuery()
  if (queryApiBase) {
    persistGeneratorApiBase(queryApiBase)

    return {
      apiBase: queryApiBase,
      configuredFrom: 'query',
      requiresRemoteApi: false,
    }
  }

  const envApiBase = normalizeApiBase(import.meta.env.VITE_GENERATOR_API_BASE)
  if (envApiBase) {
    return {
      apiBase: envApiBase,
      configuredFrom: 'env',
      requiresRemoteApi: false,
    }
  }

  const storedApiBase = loadStoredGeneratorApiBase()
  if (storedApiBase) {
    return {
      apiBase: storedApiBase,
      configuredFrom: 'storage',
      requiresRemoteApi: false,
    }
  }

  return {
    apiBase: '',
    configuredFrom: 'same-origin',
    requiresRemoteApi: isGitHubPagesHost(),
  }
}

export function persistGeneratorApiBase(input: string) {
  const apiBase = normalizeApiBase(input)

  if (!apiBase || typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(generatorApiBaseStorageKey, apiBase)
}

export function clearStoredGeneratorApiBase() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(generatorApiBaseStorageKey)
}

export function loadStoredGeneratorAccessCode() {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.sessionStorage.getItem(generatorAccessCodeSessionKey) ?? ''
}

export function persistGeneratorAccessCode(input: string) {
  if (typeof window === 'undefined') {
    return
  }

  const trimmed = input.trim()

  if (trimmed) {
    window.sessionStorage.setItem(generatorAccessCodeSessionKey, trimmed)
  } else {
    window.sessionStorage.removeItem(generatorAccessCodeSessionKey)
  }
}

export function isPublishedGenerationStatus(status: string | undefined) {
  return status === 'published'
}

function createAbortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

export async function requestGeneratedPracticeFromApi(
  sourceUrl: string,
  accessCode = '',
  options: RequestGeneratedPracticeOptions = {},
): Promise<{
  record: GeneratedScenarioRecord
}> {
  const config = getGeneratorApiConfig()
  const apiBase = normalizeApiBase(options.apiBase) || config.apiBase

  if (!apiBase && config.requiresRemoteApi) {
    throw new Error(
      'GitHub Pages는 API key를 안전하게 보관할 수 없습니다. 생성 API 서버 주소를 먼저 연결해 주세요.',
    )
  }

  const queued = await queueGeneratedPracticeJob(
    apiBase,
    sourceUrl,
    accessCode,
    options.signal,
  )

  if (queued) {
    return pollGeneratedPracticeJob(apiBase, queued, options)
  }

  return requestGeneratedPracticeDirectly(
    apiBase,
    sourceUrl,
    accessCode,
    options.signal,
  )
}

async function queueGeneratedPracticeJob(
  apiBase: string,
  sourceUrl: string,
  accessCode: string,
  signal?: AbortSignal,
) {
  const response = await fetch(`${apiBase}/api/generation-jobs`, {
    body: JSON.stringify({ sourceUrl }),
    headers: {
      'content-type': 'application/json',
      ...(accessCode.trim()
        ? {
            'x-generator-code': accessCode.trim(),
          }
        : {}),
    },
    method: 'POST',
    signal,
  })

  if (response.status === 404) {
    return null
  }

  const payload = (await response.json().catch(() => ({}))) as {
    job?: {
      clientToken?: string
      id?: string
      message?: string | null
      status?: string
    }
    message?: string
    record?: GeneratedScenarioRecord | null
  }

  if (!response.ok || !payload.job?.id || !payload.job.clientToken) {
    throw new Error(
      payload.message ??
        payload.job?.message ??
        '생성 작업을 서버에 등록하지 못했습니다.',
    )
  }

  if (payload.record && isPublishedGenerationStatus(payload.job.status)) {
    return {
      publishedRecord: payload.record,
      id: payload.job.id,
      token: payload.job.clientToken,
    }
  }

  return {
    id: payload.job.id,
    token: payload.job.clientToken,
  }
}

async function pollGeneratedPracticeJob(
  apiBase: string,
  job: {
    id: string
    publishedRecord?: GeneratedScenarioRecord
    token: string
  },
  options: RequestGeneratedPracticeOptions = {},
) {
  if (job.publishedRecord) {
    return { record: job.publishedRecord }
  }

  const startedAt = Date.now()
  const timeoutMs =
    options.timeoutMs === undefined
      ? getDefaultGenerationPollTimeoutMs()
      : options.timeoutMs
  const handleAbort = () => {
    void cancelGeneratedPracticeJob(apiBase, job)
  }

  if (options.signal?.aborted) {
    handleAbort()
    throw createAbortError()
  }

  options.signal?.addEventListener('abort', handleAbort, { once: true })

  try {
    while (timeoutMs === null || Date.now() - startedAt < timeoutMs) {
      await wait(2_500, options.signal)

      const response = await fetch(
        `${apiBase}/api/generation-jobs/${encodeURIComponent(
          job.id,
        )}?token=${encodeURIComponent(job.token)}`,
        { signal: options.signal },
      )
      const payload = (await response.json().catch(() => ({}))) as {
      job?: {
        message?: string | null
        progressEvents?: GenerationJobProgressEvent[]
        qualityReport?: Record<string, unknown> | null
        stage?: string | null
        status?: GenerationJobStatus
      }
        message?: string
        record?: GeneratedScenarioRecord | null
      }

      if (!response.ok) {
        throw new Error(
          payload.message || '생성 작업 상태를 확인하지 못했습니다.',
        )
      }

      if (isKnownGenerationStatus(payload.job?.status)) {
        options.onProgress?.({
          message: payload.job.message ?? null,
          progressEvents: Array.isArray(payload.job.progressEvents)
            ? payload.job.progressEvents
            : [],
          qualityReport: payload.job.qualityReport ?? null,
          stage: payload.job.stage ?? null,
          status: payload.job.status,
        })
      }

      if (isPublishedGenerationStatus(payload.job?.status) && payload.record) {
        return { record: payload.record }
      }

      if (payload.job?.status === 'canceled') {
        throw createAbortError()
      }

      if (
        payload.job?.status === 'failed' ||
        payload.job?.status === 'blocked'
      ) {
        options.onProgress?.({
          message:
            payload.job.message ??
            '생성 서버가 마지막 보장 생성물을 준비하고 있습니다.',
          progressEvents: Array.isArray(payload.job.progressEvents)
            ? payload.job.progressEvents
            : [],
          qualityReport: payload.job.qualityReport ?? null,
          stage: payload.job.stage ?? 'repair_coordinator',
          status: 'needs_repair',
        })
      }
    }

    throw new Error(
      '생성 시간이 너무 오래 걸립니다. 생성 서버가 켜져 있는지 확인해 주세요.',
    )
  } finally {
    options.signal?.removeEventListener('abort', handleAbort)
  }
}

async function cancelGeneratedPracticeJob(
  apiBase: string,
  job: { id: string; token: string },
) {
  try {
    await fetch(
      `${apiBase}/api/generation-jobs/${encodeURIComponent(
        job.id,
      )}/cancel?token=${encodeURIComponent(job.token)}`,
      {
        keepalive: true,
        method: 'POST',
      },
    )
  } catch {
    // The UI is already aborting locally; cancellation is best-effort over HTTP.
  }
}

function isKnownGenerationStatus(
  status: string | undefined,
): status is GenerationJobStatus {
  return (
    status === 'queued' ||
    status === 'processing' ||
    status === 'needs_repair' ||
    status === 'published' ||
    status === 'canceled' ||
    status === 'blocked' ||
    status === 'failed'
  )
}

async function requestGeneratedPracticeDirectly(
  apiBase: string,
  sourceUrl: string,
  accessCode = '',
  signal?: AbortSignal,
) {
  const response = await fetch(`${apiBase}/api/generate-practice-from-url`, {
    body: JSON.stringify({ sourceUrl }),
    headers: {
      'content-type': 'application/json',
      ...(accessCode.trim()
        ? {
            'x-generator-code': accessCode.trim(),
          }
        : {}),
    },
    method: 'POST',
    signal,
  })

  let payload: {
    message?: string
    record?: GeneratedScenarioRecord
  } = {}

  try {
    payload = (await response.json()) as typeof payload
  } catch {
    // GitHub Pages returns HTML for missing /api routes. Surface a useful error.
  }

  if (!response.ok || !payload.record) {
    throw new Error(
      payload.message ??
        '생성 API 서버에서 학습 화면을 만들지 못했습니다. 서버 주소와 API key 설정을 확인해 주세요.',
    )
  }

  return { record: payload.record }
}

function readApiBaseFromQuery() {
  if (typeof window === 'undefined') {
    return ''
  }

  const searchParams = new URLSearchParams(window.location.search)
  const hashQuery = window.location.hash.split('?')[1]
  const hashParams = new URLSearchParams(hashQuery ?? '')

  return normalizeApiBase(
    searchParams.get('apiBase') ??
      searchParams.get('generatorApiBase') ??
      hashParams.get('apiBase') ??
      hashParams.get('generatorApiBase') ??
      '',
  )
}

function loadStoredGeneratorApiBase() {
  if (typeof window === 'undefined') {
    return ''
  }

  return normalizeApiBase(
    window.localStorage.getItem(generatorApiBaseStorageKey) ?? '',
  )
}

function normalizeApiBase(input: unknown) {
  if (typeof input !== 'string') {
    return ''
  }

  const trimmed = input.trim().replace(/\/+$/u, '')
  if (!trimmed) {
    return ''
  }

  try {
    const url = new URL(trimmed)

    if (
      url.protocol !== 'https:' &&
      url.hostname !== 'localhost' &&
      url.hostname !== '127.0.0.1'
    ) {
      return ''
    }

    return url.toString().replace(/\/+$/u, '')
  } catch {
    return ''
  }
}

function isGitHubPagesHost() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.location.hostname.endsWith('github.io')
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, ms)

    const abort = () => {
      window.clearTimeout(timeoutId)
      reject(new DOMException('Aborted', 'AbortError'))
    }

    signal?.addEventListener('abort', abort, { once: true })
  })
}
