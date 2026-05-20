import { describe, expect, it } from 'vitest'

import type { CaptureFrameSample } from '@ansimtrack/shared-types'

import {
  buildPerceptionCacheKey,
  buildPerceptionFoundation,
  buildPerceptionPacket,
  deriveObjectHints,
  normalizeEvidenceBundleFromPacket,
  selectFrameSamplingPlan,
} from './index'

describe('selectFrameSamplingPlan', () => {
  it('switches to burst when hazard cues are present', () => {
    const plan = selectFrameSamplingPlan({
      asrText: '연기와 불꽃이 보여요',
      ocrTokens: ['비상구'],
    })

    expect(plan.mode).toBe('burst')
    expect(plan.fps).toBe(5)
  })
})

describe('deriveObjectHints', () => {
  it('extracts object hints from OCR and UI labels', () => {
    const hints = deriveObjectHints({
      ocrTokens: ['비상구', '계단'],
      uiElements: [
        { label: '비상구', bbox: [0, 0, 1, 1], conf: 0.8 },
        { label: '계단', bbox: [0, 0, 1, 1], conf: 0.8 },
      ],
    })

    expect(hints.map((hint) => hint.label)).toEqual(['비상구', '계단'])
  })
})

describe('buildPerceptionPacket', () => {
  it('creates a validated packet from sampled frames', () => {
    const packet = buildPerceptionPacket({
      asrText: '탁자 아래로 들어가요',
      frames: createFrames(['frame-a', 'frame-b']),
      ocrTokens: ['머리 보호'],
    })

    expect(packet.sessionId).toBe('session-1')
    expect(packet.keyframes).toEqual(['frame-a', 'frame-b'])
    expect(packet.objectHints.map((hint) => hint.label)).toContain('탁자')
  })
})

describe('buildPerceptionFoundation', () => {
  it('returns a cache key, plan, and packet together', () => {
    const result = buildPerceptionFoundation({
      asrText: '계단과 비상구를 따라 이동해요',
      frames: createFrames(['frame-a', 'frame-b', 'frame-c', 'frame-d']),
      ocrTokens: ['비상구', '계단'],
    })

    expect(result.cacheKey).toContain('session-1')
    expect(result.packet.keyframes.length).toBeGreaterThan(0)
    expect(result.plan.mode).toBe('base')
  })

  it('changes cache keys when frame refs change inside the same time window', () => {
    const first = buildPerceptionCacheKey({
      sessionId: 'session-1',
      tStartMs: 1_000,
      tEndMs: 2_000,
      keyframes: ['frame-a', 'frame-b'],
    })
    const second = buildPerceptionCacheKey({
      sessionId: 'session-1',
      tStartMs: 1_000,
      tEndMs: 2_000,
      keyframes: ['frame-x', 'frame-y'],
    })

    expect(first).not.toBe(second)
  })
})

describe('normalizeEvidenceBundleFromPacket', () => {
  it('separates visual, OCR, ASR, and rule evidence', () => {
    const packet = buildPerceptionPacket({
      asrText: '현관문을 닫고 계단으로 대피합니다.',
      frames: createFrames(['frame-a']),
      objectHints: [
        { label: '현관문', bbox: [0.1, 0.2, 0.2, 0.3], conf: 0.88 },
      ],
      ocrTokens: ['현관문', '계단'],
      uiElements: [
        { label: '대피 안내', bbox: [0.5, 0.1, 0.3, 0.1], conf: 0.9 },
      ],
    })
    const bundle = normalizeEvidenceBundleFromPacket({
      packet,
      ruleEvidence: [
        {
          matchedText: '나갈 때 출입문을 닫아 연기와 불길의 확산을 늦춥니다.',
          ruleId: 'KR_FIRE_04',
          sourceName: '국민재난안전포털',
          title: 'door_control',
        },
      ],
    })

    expect(bundle.visualEvidence[0]?.observation).toBe('현관문')
    expect(bundle.ocrEvidence.map((item) => item.text)).toContain('계단')
    expect(bundle.asrEvidence[0]?.text).toContain('현관문')
    expect(bundle.ruleEvidence[0]?.ruleId).toBe('KR_FIRE_04')
  })
})

function createFrames(imageRefs: string[]): CaptureFrameSample[] {
  return imageRefs.map((imageRef, index) => ({
    sessionId: 'session-1',
    tsMs: (index + 1) * 1_000,
    width: 960,
    height: 540,
    imageRef,
    origin: 'browser',
  }))
}
