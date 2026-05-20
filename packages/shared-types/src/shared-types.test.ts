import { describe, expect, it } from 'vitest'

import {
  captureFrameSampleSchema,
  macCaptureEventSchema,
  perceptionPacketSchema,
  segmentSchema,
  segmentExplanationSchema,
  structuredLearningExplanationSchema,
} from './schemas'

describe('segmentExplanationSchema', () => {
  it('accepts grounded explanations with action text', () => {
    const result = segmentExplanationSchema.safeParse({
      segmentId: 'seg-1',
      safetyMode: 'grounded',
      doNot: '엘리베이터를 타지 마세요',
      tracks: {
        basic: '복도에 연기가 보입니다.',
        easy: '연기가 보여서 빨리 대피가 필요합니다.',
        action: '계단으로 이동하세요',
        reason: '연기는 위로 올라가서 몸을 낮추는 편이 안전합니다.',
      },
      overlayTargets: [],
    })

    expect(result.success).toBe(true)
  })

  it('rejects behavior guidance in review mode', () => {
    const result = segmentExplanationSchema.safeParse({
      segmentId: 'seg-2',
      safetyMode: 'review_official',
      doNot: '창문으로 뛰어내리지 마세요',
      tracks: {
        basic: '상황 판단이 더 필요합니다.',
        easy: '공식 행동요령을 먼저 확인해 주세요.',
        action: '밖으로 뛰어가세요',
        reason: '근거가 아직 충분하지 않습니다.',
        report: '119에 바로 신고하세요.',
      },
      overlayTargets: [],
    })

    expect(result.success).toBe(false)
  })
})

describe('macCaptureEventSchema', () => {
  it('accepts native frame payloads', () => {
    const result = macCaptureEventSchema.safeParse({
      type: 'frame',
      sessionId: 'native-1',
      tsMs: 1_234,
      width: 1280,
      height: 720,
      pixelBufferRef: 'data:image/jpeg;base64,abc123',
    })

    expect(result.success).toBe(true)
  })

  it('rejects malformed error payloads', () => {
    const result = macCaptureEventSchema.safeParse({
      type: 'error',
      sessionId: 'native-2',
      code: '',
    })

    expect(result.success).toBe(false)
  })
})

describe('captureFrameSampleSchema', () => {
  it('accepts normalized browser frames', () => {
    const result = captureFrameSampleSchema.safeParse({
      sessionId: 'web-1',
      tsMs: 2_400,
      width: 960,
      height: 540,
      imageRef: 'data:image/jpeg;base64,browser',
      origin: 'browser',
    })

    expect(result.success).toBe(true)
  })
})

describe('segmentSchema', () => {
  it('rejects inverted segment time windows', () => {
    const result = segmentSchema.safeParse({
      id: 'seg-bad',
      sessionId: 'session-1',
      hazard: 'fire',
      phase: 'route_selection',
      startMs: 5_000,
      endMs: 4_000,
      confidence: 0.9,
      officialRuleIds: [],
    })

    expect(result.success).toBe(false)
  })
})

describe('perceptionPacketSchema', () => {
  it('rejects inverted packet windows and invalid bounding boxes', () => {
    const result = perceptionPacketSchema.safeParse({
      sessionId: 'session-1',
      tStartMs: 5_000,
      tEndMs: 4_000,
      asrText: '',
      ocrTokens: [],
      uiElements: [{ label: 'bad', bbox: [-1, 0, 0, 1], conf: 0.8 }],
      objectHints: [],
      keyframes: ['frame-a'],
    })

    expect(result.success).toBe(false)
  })
})

describe('structuredLearningExplanationSchema', () => {
  it('accepts validated structured learning explanations', () => {
    const result = structuredLearningExplanationSchema.safeParse(
      validStructuredExplanation(),
    )

    expect(result.success).toBe(true)
  })

  it('rejects action cards without official rule ids', () => {
    const input = validStructuredExplanation()
    input.tracks.action!.cards[0].officialRuleIds = []

    const result = structuredLearningExplanationSchema.safeParse(input)

    expect(result.success).toBe(false)
  })

  it('rejects more than three action cards', () => {
    const input = validStructuredExplanation()
    input.tracks.action!.cards = [
      { label: '문을 닫아요', officialRuleIds: ['KR_FIRE_04'], order: 1 },
      { label: '계단으로 가요', officialRuleIds: ['KR_FIRE_03'], order: 2 },
      { label: '몸을 낮춰요', officialRuleIds: ['KR_FIRE_03'], order: 3 },
      { label: '도움을 불러요', officialRuleIds: ['KR_FIRE_05'], order: 4 },
    ]

    const result = structuredLearningExplanationSchema.safeParse(input)

    expect(result.success).toBe(false)
  })

  it('rejects validated segments without grounded action cards', () => {
    const input = validStructuredExplanation() as any
    delete input.tracks.action
    input.validation.hasGroundedAction = false

    const result = structuredLearningExplanationSchema.safeParse(input)

    expect(result.success).toBe(false)
  })

  it('rejects review segments that expose learner action cards', () => {
    const input = validStructuredExplanation()
    input.segment.status = 'needs_review'
    input.validation.requiresHumanReview = true

    const result = structuredLearningExplanationSchema.safeParse(input)

    expect(result.success).toBe(false)
  })
})

function validStructuredExplanation() {
  return {
    version: 'slowlearner_multitrack_v1',
    segment: {
      segmentId: 'fire-door-control',
      sessionId: 'demo-fire',
      sourceId: 'fire-grounded-flow',
      hazard: 'fire',
      phase: 'door_control',
      decisionPoint: '나갈 때 문을 닫아야 하는가',
      startMs: 0,
      endMs: 7_800,
      confidence: 0.93,
      status: 'validated',
    },
    tracks: {
      easy: {
        text: '나갈 때는 문을 닫아요.',
        maxReadingLevel: 'very_easy',
      },
      action: {
        cards: [
          {
            label: '문을 닫아요',
            order: 1,
            officialRuleIds: ['KR_FIRE_04'],
          },
        ],
      },
      reason: {
        text: '문을 닫으면 연기가 천천히 퍼져요.',
        officialRuleIds: ['KR_FIRE_04'],
      },
      doNot: {
        text: '문을 열어 둔 채 나가지 않아요.',
        officialRuleIds: ['KR_FIRE_04'],
      },
      caregiver: {
        script: '문 닫기는 연기 확산을 늦추기 위한 행동입니다.',
        correctionHint: '문을 열어 둔다고 답하면 짧게 다시 설명합니다.',
      },
    },
    evidence: {
      visualEvidence: [
        {
          frameTimeMs: 1_200,
          observation: '현관문과 대피 장면이 보임',
          bbox: [0.12, 0.18, 0.28, 0.22],
        },
      ],
      ocrEvidence: [
        {
          text: '현관문을 닫고 대피',
          timeMs: 900,
          confidence: 0.86,
        },
      ],
      asrEvidence: [
        {
          text: '현관문을 닫고 계단으로 대피합니다.',
          startMs: 0,
          endMs: 3_000,
          confidence: 0.9,
        },
      ],
      ruleEvidence: [
        {
          ruleId: 'KR_FIRE_04',
          title: '문을 닫고 대피',
          matchedText: '나갈 때 출입문을 닫아 연기와 불길의 확산을 늦춥니다.',
          sourceName: '국민재난안전포털 - 화재 발생시 행동요령',
        },
      ],
      modelInference: [
        {
          claim: '현재 세그먼트의 핵심 판단은 문을 닫고 대피하는 행동이다.',
          basedOn: ['ocr', 'asr', 'rule'],
        },
      ],
    },
    suppressedCandidates: [
      {
        candidate: '문을 열어 둔 채 나가기',
        category: 'unsafe_action',
        reason: '공식 행동요령의 금지 행동이므로 행동 카드에서 제외',
        evidenceRefs: ['KR_FIRE_04'],
      },
    ],
    validation: {
      schemaValid: true,
      hasGroundedAction: true,
      learnerSafe: true,
      requiresHumanReview: false,
      warnings: [],
    },
  }
}
