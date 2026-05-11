import {
  perceptionPacketSchema,
  type CaptureFrameSample,
  type PerceptionPacket,
} from '@ansimtrack/shared-types'

export type WebApiHealth = {
  betaAccessConfigured: boolean
  hasOpenAiKey: boolean
  maxFramesPerAnalysis: number
  maxSessionMinutes: number
  models: {
    analysis: string
    transcription: string
  }
  rateLimit: {
    analyzePerMinute: number
    transcribePerMinute: number
  }
  status: 'missing-openai-key' | 'ready'
  version: string
}

export type AnalyzeFrameWindowInput = {
  asrText?: string
  betaCode: string
  frames: CaptureFrameSample[]
  signal?: AbortSignal
  sessionId: string
  tEndMs: number
  tStartMs: number
}

export type AnalyzeFrameWindowResult = {
  packet: PerceptionPacket
  source: string
}

export type TranscribeAudioChunkInput = {
  audioBlob: Blob
  betaCode: string
  durationMs: number
  sessionId: string
}

export type TranscribeAudioChunkResult = {
  durationMs: number
  source: string
  transcript: string
}

export type VerifyBetaCodeResult = {
  ok: boolean
}

export class WebApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.code = code
    this.status = status
  }
}

export async function getWebApiHealth(): Promise<WebApiHealth> {
  const response = await fetch('/api/health', {
    headers: {
      accept: 'application/json',
    },
  })
  return parseJsonResponse<WebApiHealth>(response)
}

export async function verifyBetaCode(
  betaCode: string,
): Promise<VerifyBetaCodeResult> {
  const response = await fetch('/api/verify-beta-code', {
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-beta-code': betaCode,
    },
    method: 'POST',
  })

  return parseJsonResponse<VerifyBetaCodeResult>(response)
}

export async function analyzeFrameWindow(
  input: AnalyzeFrameWindowInput,
): Promise<AnalyzeFrameWindowResult> {
  const response = await fetch('/api/analyze-frame-window', {
    body: JSON.stringify({
      asrText: input.asrText ?? '',
      frames: input.frames.slice(-3).map((frame) => ({
        height: frame.height,
        imageRef: frame.imageRef,
        tsMs: frame.tsMs,
        width: frame.width,
      })),
      sessionId: input.sessionId,
      tEndMs: input.tEndMs,
      tStartMs: input.tStartMs,
    }),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-beta-code': input.betaCode,
    },
    method: 'POST',
    signal: input.signal,
  })
  const payload = await parseJsonResponse<{ packet: unknown; source: string }>(
    response,
  )
  const parsedPacket = perceptionPacketSchema.safeParse(payload.packet)

  if (!parsedPacket.success) {
    throw new WebApiError(
      502,
      'invalid_perception_packet',
      '분석 서버 응답 형식이 올바르지 않습니다.',
    )
  }

  return {
    packet: parsedPacket.data,
    source: payload.source,
  }
}

export async function transcribeAudioChunk(
  input: TranscribeAudioChunkInput,
): Promise<TranscribeAudioChunkResult> {
  const response = await fetch('/api/transcribe-audio', {
    body: JSON.stringify({
      audioDataUrl: await blobToDataUrl(input.audioBlob),
      durationMs: input.durationMs,
      sessionId: input.sessionId,
    }),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-beta-code': input.betaCode,
    },
    method: 'POST',
  })

  return parseJsonResponse<TranscribeAudioChunkResult>(response)
}

export function sendClientEvent(input: {
  eventType: string
  message?: string
  route?: string
}) {
  void fetch('/api/client-event', {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  }).catch(() => undefined)
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
    message?: string
  }

  if (!response.ok) {
    throw new WebApiError(
      response.status,
      payload.error ?? 'request_failed',
      payload.message ?? '요청을 처리하지 못했습니다.',
    )
  }

  return payload as T
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('audio blob read failed'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}
