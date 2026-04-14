import { describe, expect, it } from 'vitest'

import {
  captureFrameSampleSchema,
  macCaptureEventSchema,
  segmentExplanationSchema,
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
