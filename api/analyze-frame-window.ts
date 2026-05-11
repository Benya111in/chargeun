import OpenAI from 'openai'

import {
  ValidationError,
  assertMethod,
  assertRateLimit,
  assertSameOrigin,
  getConfig,
  handleApiError,
  parseImageDataUrl,
  parseModelJson,
  readJsonBody,
  sanitizeBbox,
  sanitizeConfidence,
  sanitizeLabel,
  sanitizeText,
  sendJson,
  validateBetaAccess,
} from './_shared'

type FrameInput = {
  height: number
  imageRef: string
  tsMs: number
  width: number
}

const perceptionSchema = {
  additionalProperties: false,
  properties: {
    objectHints: {
      items: {
        additionalProperties: false,
        properties: {
          bbox: {
            items: { type: 'number' },
            maxItems: 4,
            minItems: 4,
            type: 'array',
          },
          conf: { maximum: 1, minimum: 0, type: 'number' },
          label: { type: 'string' },
        },
        required: ['label', 'bbox', 'conf'],
        type: 'object',
      },
      type: 'array',
    },
    ocrTokens: {
      items: { type: 'string' },
      type: 'array',
    },
    uiElements: {
      items: {
        additionalProperties: false,
        properties: {
          bbox: {
            items: { type: 'number' },
            maxItems: 4,
            minItems: 4,
            type: 'array',
          },
          conf: { maximum: 1, minimum: 0, type: 'number' },
          label: { type: 'string' },
        },
        required: ['label', 'bbox', 'conf'],
        type: 'object',
      },
      type: 'array',
    },
  },
  required: ['ocrTokens', 'uiElements', 'objectHints'],
  type: 'object',
}

export default async function handler(req: any, res: any) {
  if (!assertMethod(req, res, ['POST']) || !assertSameOrigin(req, res)) {
    return
  }

  const access = validateBetaAccess(req, res)
  if (!access.ok) {
    return
  }

  try {
    const config = getConfig()
    const body = await readJsonBody(req)
    const input = validateAnalyzeBody(body, config.maxFramesPerAnalysis)

    if (!config.hasOpenAiKey) {
      sendJson(res, 503, {
        error: 'openai_key_missing',
        message: '서버에 OpenAI API key가 설정되지 않았습니다.',
      })
      return
    }

    if (
      !assertRateLimit({
        betaCode: access.betaCode,
        endpoint: 'analyze-frame-window',
        limit: 18,
        req,
        res,
        sessionId: input.sessionId,
      })
    ) {
      return
    }

    const extraction = await extractPerceptionWithOpenAI({
      asrText: input.asrText,
      frames: input.frames,
      model: config.analysisModel,
    })

    sendJson(res, 200, {
      packet: {
        asrText: input.asrText,
        keyframes: input.frames.map(
          (frame, index) =>
            `web-frame://${input.sessionId}/${frame.tsMs}/${index}`,
        ),
        objectHints: sanitizeVisualEntries(extraction.objectHints),
        ocrTokens: sanitizeTokens(extraction.ocrTokens),
        sessionId: input.sessionId,
        tEndMs: input.tEndMs,
        tStartMs: input.tStartMs,
        uiElements: sanitizeVisualEntries(extraction.uiElements),
      },
      source: 'openai-responses',
    })
  } catch (error) {
    handleApiError(res, error)
  }
}

export function validateAnalyzeBody(body: any, maxFrames: number) {
  const sessionId = sanitizeText(body?.sessionId, 120)
  const tStartMs = Number(body?.tStartMs)
  const tEndMs = Number(body?.tEndMs)
  const asrText = sanitizeText(body?.asrText ?? '', 2000)
  const rawFrames = body?.frames

  if (!sessionId) {
    throw new ValidationError('session_id_required', 'sessionId is required.')
  }

  if (
    !Number.isFinite(tStartMs) ||
    !Number.isFinite(tEndMs) ||
    tEndMs < tStartMs
  ) {
    throw new ValidationError('invalid_time_range', 'Invalid frame time range.')
  }

  if (!Array.isArray(rawFrames) || rawFrames.length === 0) {
    throw new ValidationError(
      'frames_required',
      'At least one frame is required.',
    )
  }

  if (rawFrames.length > maxFrames) {
    throw new ValidationError(
      'too_many_frames',
      `At most ${maxFrames} frames are accepted.`,
    )
  }

  const frames = rawFrames.map((frame, index) => {
    parseImageDataUrl(frame?.imageRef)

    return {
      height: Math.max(1, Number(frame?.height) || 1),
      imageRef: frame.imageRef,
      tsMs: Number.isFinite(Number(frame?.tsMs))
        ? Number(frame.tsMs)
        : tStartMs + index,
      width: Math.max(1, Number(frame?.width) || 1),
    } satisfies FrameInput
  })

  return {
    asrText,
    frames,
    sessionId,
    tEndMs,
    tStartMs,
  }
}

async function extractPerceptionWithOpenAI(input: {
  asrText: string
  frames: FrameInput[]
  model: string
}) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  const response = await client.responses.create({
    input: [
      {
        content:
          'You extract perception evidence only. Do not provide safety advice or action instructions.',
        role: 'system',
      },
      {
        content: [
          {
            text: [
              'Return Korean OCR-like visible text tokens, visible UI labels, and object hints.',
              'Focus on fire, smoke, exit signs, stairs, doors, tables, shaking, phones, emergency guidance.',
              `ASR transcript: ${input.asrText || '(none)'}`,
              'Use normalized bounding boxes [x,y,width,height] from 0 to 1.',
            ].join('\n'),
            type: 'input_text',
          },
          ...input.frames.map((frame) => ({
            detail: 'low' as const,
            image_url: frame.imageRef,
            type: 'input_image' as const,
          })),
        ],
        role: 'user',
      },
    ],
    model: input.model,
    text: {
      format: {
        name: 'perception_extraction',
        schema: perceptionSchema,
        strict: true,
        type: 'json_schema',
      },
    },
  } as any)

  const outputText =
    (response as any).output_text ??
    (response as any).output
      ?.flatMap((item: any) => item.content ?? [])
      .map((content: any) => content.text ?? '')
      .join('\n')

  if (!outputText) {
    throw new ValidationError(
      'model_output_empty',
      'The analysis model returned no perception output.',
    )
  }

  return parseModelJson(outputText) as {
    objectHints?: unknown[]
    ocrTokens?: unknown[]
    uiElements?: unknown[]
  }
}

function sanitizeTokens(tokens: unknown) {
  if (!Array.isArray(tokens)) {
    return []
  }

  const seen = new Set<string>()
  return tokens
    .map((token) => sanitizeLabel(token))
    .filter((token) => token.length > 0)
    .filter((token) => {
      if (seen.has(token)) {
        return false
      }

      seen.add(token)
      return true
    })
    .slice(0, 12)
}

function sanitizeVisualEntries(entries: unknown) {
  if (!Array.isArray(entries)) {
    return []
  }

  return entries
    .map((entry: any) => ({
      bbox: sanitizeBbox(entry?.bbox),
      conf: sanitizeConfidence(entry?.conf),
      label: sanitizeLabel(entry?.label),
    }))
    .filter((entry) => entry.label.length > 0)
    .slice(0, 8)
}
