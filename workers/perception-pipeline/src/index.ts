import {
  perceptionPacketSchema,
  type CaptureFrameSample,
  type PerceptionPacket,
} from '@ansimtrack/shared-types'

export type SamplingMode = 'base' | 'burst'

export type FrameSamplingPlan = {
  fps: number
  holdMs: number
  mode: SamplingMode
  reason: string
}

export type PerceptionFoundationResult = {
  cacheKey: string
  packet: PerceptionPacket
  plan: FrameSamplingPlan
}

type VisualElement = PerceptionPacket['uiElements'][number]
type ObjectHint = PerceptionPacket['objectHints'][number]

const burstKeywords = ['불꽃', '화염', '연기', '흔들', '탁자', '머리보호']
const hintLexicon = [
  { label: '비상구', synonyms: ['비상구', '출구', 'exit'] },
  { label: '계단', synonyms: ['계단', 'stairs'] },
  { label: '연기', synonyms: ['연기', 'smoke'] },
  { label: '불꽃', synonyms: ['불꽃', '화염', '불'] },
  { label: '문손잡이', synonyms: ['문손잡이', '손잡이'] },
  { label: '탁자', synonyms: ['탁자', '책상', 'table'] },
  {
    label: '전화기',
    synonyms: ['전화기', '전화', '휴대폰', '핸드폰', 'phone'],
  },
] as const

export const selectFrameSamplingPlan = (input: {
  asrText?: string
  ocrTokens?: string[]
  objectLabels?: string[]
}) => {
  const evidence = normalizeTokens([
    input.asrText ?? '',
    ...(input.ocrTokens ?? []),
    ...(input.objectLabels ?? []),
  ]).join(' ')

  const shouldBurst = burstKeywords.some((keyword) =>
    evidence.includes(keyword),
  )

  if (shouldBurst) {
    return {
      fps: 5,
      holdMs: 2_000,
      mode: 'burst',
      reason: 'event-suspected',
    } satisfies FrameSamplingPlan
  }

  return {
    fps: 1,
    holdMs: 1_000,
    mode: 'base',
    reason: 'steady-scan',
  } satisfies FrameSamplingPlan
}

export const sampleAnalysisFrames = (input: {
  frames: CaptureFrameSample[]
  plan: FrameSamplingPlan
}) => {
  if (input.frames.length <= 1) {
    return input.frames
  }

  if (input.plan.mode === 'burst') {
    return input.frames.slice(-6)
  }

  return input.frames.filter((_, index, frames) => {
    const lastIndex = frames.length - 1
    return index === lastIndex || index % 2 === 0
  })
}

export const deriveUiElements = (ocrTokens: string[]): VisualElement[] =>
  dedupeByLabel(
    ocrTokens.map((token) => ({
      label: token,
      bbox: [0.05, 0.05, 0.3, 0.12],
      conf: 0.62,
    })),
  )

export const deriveObjectHints = (input: {
  asrText?: string
  ocrTokens: string[]
  uiElements: VisualElement[]
  upstreamHints?: ObjectHint[]
}) => {
  const knownHints = [...(input.upstreamHints ?? [])]
  const textPool = normalizeTokens([
    input.asrText ?? '',
    ...input.ocrTokens,
    ...input.uiElements.map((item) => item.label),
  ])

  for (const entry of hintLexicon) {
    if (
      entry.synonyms.some((candidate) =>
        textPool.some((token) => token.includes(candidate)),
      )
    ) {
      knownHints.push({
        label: entry.label,
        bbox: [0.15, 0.15, 0.4, 0.3],
        conf: 0.58,
      })
    }
  }

  return dedupeByLabel(knownHints)
}

export const buildPerceptionPacket = (input: {
  asrText?: string
  frames: CaptureFrameSample[]
  objectHints?: ObjectHint[]
  ocrTokens?: string[]
  sessionId?: string
  uiElements?: VisualElement[]
}) => {
  const frames = input.frames
  if (frames.length === 0) {
    throw new Error(
      'At least one capture frame is required to build a perception packet.',
    )
  }

  const sessionId = input.sessionId ?? frames[0]?.sessionId
  if (!sessionId) {
    throw new Error('A session id is required to build a perception packet.')
  }

  const ocrTokens = input.ocrTokens ?? []
  const uiElements = input.uiElements ?? deriveUiElements(ocrTokens)
  const objectHints =
    input.objectHints ??
    deriveObjectHints({
      asrText: input.asrText,
      ocrTokens,
      uiElements,
    })

  return perceptionPacketSchema.parse({
    sessionId,
    tStartMs: frames[0]?.tsMs ?? 0,
    tEndMs: frames[frames.length - 1]?.tsMs ?? 0,
    asrText: input.asrText ?? '',
    ocrTokens,
    uiElements,
    objectHints,
    keyframes: frames.map((frame) => frame.imageRef),
  })
}

export const buildPerceptionFoundation = (input: {
  asrText?: string
  frames: CaptureFrameSample[]
  ocrTokens?: string[]
  upstreamHints?: ObjectHint[]
}) => {
  const plan = selectFrameSamplingPlan({
    asrText: input.asrText,
    ocrTokens: input.ocrTokens,
    objectLabels: input.upstreamHints?.map((hint) => hint.label),
  })
  const sampledFrames = sampleAnalysisFrames({
    frames: input.frames,
    plan,
  })
  const packet = buildPerceptionPacket({
    asrText: input.asrText,
    frames: sampledFrames,
    objectHints: deriveObjectHints({
      asrText: input.asrText,
      ocrTokens: input.ocrTokens ?? [],
      uiElements: deriveUiElements(input.ocrTokens ?? []),
      upstreamHints: input.upstreamHints,
    }),
    ocrTokens: input.ocrTokens,
  })

  return {
    cacheKey: buildPerceptionCacheKey(packet),
    packet,
    plan,
  } satisfies PerceptionFoundationResult
}

export const buildPerceptionCacheKey = (
  packet: Pick<
    PerceptionPacket,
    'keyframes' | 'sessionId' | 'tEndMs' | 'tStartMs'
  >,
) =>
  [
    packet.sessionId,
    packet.tStartMs,
    packet.tEndMs,
    packet.keyframes.length,
  ].join(':')

const normalizeTokens = (values: string[]) =>
  values
    .flatMap((value) => value.toLowerCase().split(/[^0-9a-z가-힣]+/i))
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)

const dedupeByLabel = <T extends { label: string }>(items: T[]) => {
  const seen = new Set<string>()

  return items.filter((item) => {
    if (seen.has(item.label)) {
      return false
    }

    seen.add(item.label)
    return true
  })
}
