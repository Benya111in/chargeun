const defaultAnalysisModel = 'gpt-5.5'
const defaultTranscribeModel = 'gpt-4o-mini-transcribe'
const defaultMaxFrames = 3
const defaultMaxSessionMinutes = 10
const maxImageBytes = 1_200_000
const maxAudioBytes = 25 * 1024 * 1024

const rateBuckets = new Map<
  string,
  {
    count: number
    resetAt: number
  }
>()

export type JsonResponse = Record<string, unknown>

export function getConfig() {
  return {
    analysisModel:
      process.env.OPENAI_ANALYSIS_MODEL?.trim() || defaultAnalysisModel,
    betaCodes: parseCsv(process.env.BETA_ACCESS_CODES),
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    maxFramesPerAnalysis: clampNumber(
      Number(process.env.MAX_FRAMES_PER_ANALYSIS),
      1,
      3,
      defaultMaxFrames,
    ),
    maxSessionMinutes: clampNumber(
      Number(process.env.MAX_SESSION_MINUTES),
      1,
      60,
      defaultMaxSessionMinutes,
    ),
    transcribeModel:
      process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || defaultTranscribeModel,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
  }
}

export function sendJson(res: any, statusCode: number, payload: JsonResponse) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export function assertMethod(req: any, res: any, methods: string[]) {
  if (methods.includes(req.method)) {
    return true
  }

  sendJson(res, 405, {
    error: 'method_not_allowed',
    message: `${req.method} is not supported.`,
  })
  return false
}

export function assertSameOrigin(req: any, res: any) {
  const origin = getHeader(req, 'origin')
  const host = getHeader(req, 'x-forwarded-host') || getHeader(req, 'host')

  if (!origin || !host) {
    return true
  }

  try {
    if (new URL(origin).host === host) {
      return true
    }
  } catch {
    // Fall through to rejection.
  }

  sendJson(res, 403, {
    error: 'origin_forbidden',
    message: 'Only same-origin API calls are accepted.',
  })
  return false
}

export function getGeneratorAllowedOrigins() {
  return [
    'http://localhost:1420',
    'http://localhost:4173',
    'http://127.0.0.1:1420',
    'http://127.0.0.1:4173',
    'https://benya111in.github.io',
    ...parseCsv(process.env.GENERATOR_ALLOWED_ORIGINS),
  ]
}

export function handleCors(req: any, res: any, allowedOrigins: string[]) {
  const origin = getHeader(req, 'origin')
  const isAllowed = Boolean(origin && allowedOrigins.includes(origin))

  if (isAllowed) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-methods', 'POST, OPTIONS')
    res.setHeader(
      'access-control-allow-headers',
      'content-type, x-generator-code',
    )
    res.setHeader('vary', 'origin')
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = isAllowed || !origin ? 204 : 403
    res.end()
    return true
  }

  return false
}

export function assertSameOriginOrAllowed(
  req: any,
  res: any,
  allowedOrigins: string[],
) {
  const origin = getHeader(req, 'origin')
  const host = getHeader(req, 'x-forwarded-host') || getHeader(req, 'host')

  if (!origin || !host) {
    return true
  }

  try {
    if (new URL(origin).host === host || allowedOrigins.includes(origin)) {
      return true
    }
  } catch {
    // Fall through to rejection.
  }

  sendJson(res, 403, {
    error: 'origin_forbidden',
    message: 'This origin is not allowed to call the generator API.',
  })
  return false
}

export function validateBetaAccess(req: any, res: any) {
  const config = getConfig()
  const betaCode = getHeader(req, 'x-beta-code')
  const hasConfiguredCodes = config.betaCodes.length > 0

  if (!hasConfiguredCodes) {
    sendJson(res, 401, {
      error: 'beta_code_required',
      message: '베타 접근 코드가 설정되지 않았습니다.',
    })
    return {
      betaCode: '',
      ok: false,
    }
  }

  if (betaCode && config.betaCodes.includes(betaCode)) {
    return {
      betaCode,
      ok: true,
    }
  }

  sendJson(res, 401, {
    error: 'beta_code_required',
    message: '베타 접근 코드가 필요합니다.',
  })
  return {
    betaCode: '',
    ok: false,
  }
}

export function assertRateLimit(input: {
  betaCode: string
  endpoint: string
  limit: number
  req: any
  res: any
  sessionId?: string
}) {
  const now = Date.now()
  const resetAt = now + 60_000
  const key = [
    input.endpoint,
    getClientIp(input.req),
    input.betaCode,
    input.sessionId || 'no-session',
  ].join(':')
  const current = rateBuckets.get(key)

  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt })
    return true
  }

  if (current.count >= input.limit) {
    sendJson(input.res, 429, {
      error: 'rate_limited',
      message: '요청이 많습니다. 잠시 뒤 다시 시도해 주세요.',
      resetAt: current.resetAt,
    })
    return false
  }

  current.count += 1
  return true
}

export async function readJsonBody(req: any) {
  if (req.body && typeof req.body === 'object') {
    return req.body
  }

  if (typeof req.body === 'string') {
    return JSON.parse(req.body)
  }

  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

export function parseDataUrl(
  input: unknown,
  options: {
    allowedMimeTypes: string[]
    maxBytes: number
  },
) {
  if (typeof input !== 'string') {
    throw new ValidationError('data_url_required', 'data URL is required.')
  }

  const match = input.match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i)
  if (!match) {
    throw new ValidationError('invalid_data_url', 'Invalid data URL.')
  }

  const mimeType = match[1].toLowerCase()
  if (!options.allowedMimeTypes.includes(mimeType)) {
    throw new ValidationError(
      'unsupported_mime_type',
      `${mimeType} is not supported.`,
    )
  }

  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
  if (buffer.byteLength > options.maxBytes) {
    throw new ValidationError('payload_too_large', 'Payload is too large.')
  }

  return {
    buffer,
    mimeType,
  }
}

export function parseImageDataUrl(input: unknown) {
  return parseDataUrl(input, {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: maxImageBytes,
  })
}

export function parseAudioDataUrl(input: unknown) {
  return parseDataUrl(input, {
    allowedMimeTypes: [
      'audio/mp3',
      'audio/mp4',
      'audio/mpeg',
      'audio/mpga',
      'audio/wav',
      'audio/webm',
      'video/mp4',
      'video/webm',
    ],
    maxBytes: maxAudioBytes,
  })
}

export function sanitizeLabel(input: unknown) {
  return typeof input === 'string' ? input.trim().slice(0, 80) : ''
}

export function sanitizeText(input: unknown, maxLength = 2000) {
  return typeof input === 'string' ? input.trim().slice(0, maxLength) : ''
}

export function sanitizeBbox(input: unknown): [number, number, number, number] {
  if (!Array.isArray(input) || input.length !== 4) {
    return [0.08, 0.08, 0.2, 0.12]
  }

  const [x, y, width, height] = input.map((value) =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0,
  )

  return [
    clampNumber(x, 0, 1, 0.08),
    clampNumber(y, 0, 1, 0.08),
    clampNumber(width, 0.01, 1, 0.2),
    clampNumber(height, 0.01, 1, 0.12),
  ]
}

export function sanitizeConfidence(input: unknown) {
  return clampNumber(
    typeof input === 'number' ? input : Number(input),
    0,
    1,
    0.58,
  )
}

export function parseModelJson(text: string) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return JSON.parse(fenced?.[1] ?? trimmed)
}

export class ValidationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export function handleApiError(res: any, error: unknown) {
  if (error instanceof ValidationError) {
    sendJson(res, 400, {
      error: error.code,
      message: error.message,
    })
    return
  }

  sendJson(res, 500, {
    error: 'internal_error',
    message: error instanceof Error ? error.message : 'Unknown server error.',
  })
}

export function getFileExtension(mimeType: string) {
  switch (mimeType) {
    case 'audio/mp4':
    case 'video/mp4':
      return 'mp4'
    case 'audio/mpeg':
    case 'audio/mp3':
      return 'mp3'
    case 'audio/mpga':
      return 'mpga'
    case 'audio/wav':
      return 'wav'
    case 'audio/webm':
    case 'video/webm':
      return 'webm'
    default:
      return 'bin'
  }
}

function getHeader(req: any, name: string) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function getClientIp(req: any) {
  const forwarded = getHeader(req, 'x-forwarded-for')
  return (
    forwarded?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'local'
  )
}

function parseCsv(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function clampNumber(
  value: number,
  min: number,
  max: number,
  fallback: number,
) {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, value))
}
