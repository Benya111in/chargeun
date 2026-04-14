import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { RuleRecord } from '@ansimtrack/shared-types'

import {
  buildGroundedExplanation,
  buildVoiceReply,
  matchGroundedRules,
} from './index'

const fireRules = loadRules('../../../data/rules/fire_rules.json')
const earthquakeRules = loadRules('../../../data/rules/earthquake_rules.json')

describe('matchGroundedRules', () => {
  it('matches the fire door-control rule from corridor evidence', () => {
    const matches = matchGroundedRules({
      evidence: {
        asrText: '계단으로 내려가고 나가면서 문을 닫아요',
        ocrTokens: ['비상구', '계단'],
        uiElements: [],
        objectHints: [
          { label: '출입문', bbox: [0, 0, 10, 10], conf: 0.9 },
          { label: '계단 표지', bbox: [20, 20, 10, 10], conf: 0.92 },
        ],
      },
      rules: fireRules,
      segment: {
        confidence: 0.91,
        hazard: 'fire',
        phase: 'route_selection',
        officialRuleIds: [],
      },
    })

    expect(matches[0]?.rule.rule_id).toBe('KR_FIRE_04')
    expect(matches[0]?.score).toBeGreaterThan(5)
  })

  it('matches the earthquake protect posture to during_shaking rules', () => {
    const matches = matchGroundedRules({
      evidence: {
        asrText: '흔들려요 탁자 아래로 들어가서 머리를 보호해요',
        ocrTokens: ['머리 보호'],
        uiElements: [],
        objectHints: [
          { label: '탁자', bbox: [0, 0, 10, 10], conf: 0.95 },
          { label: '머리 보호 자세', bbox: [20, 20, 10, 10], conf: 0.88 },
        ],
      },
      rules: earthquakeRules,
      segment: {
        confidence: 0.96,
        hazard: 'earthquake',
        phase: 'protect',
        officialRuleIds: [],
      },
    })

    expect(matches[0]?.rule.rule_id).toBe('KR_EQ_03')
    expect(
      matches[0]?.matchedSignals.some(
        (signal) => signal === 'phase:during_shaking',
      ),
    ).toBe(true)
  })

  it('applies continuity when the same rule stays relevant', () => {
    const matches = matchGroundedRules({
      evidence: {
        asrText: '계단 쪽으로 계속 이동해요',
        ocrTokens: ['계단'],
        uiElements: [],
        objectHints: [{ label: '계단', bbox: [0, 0, 10, 10], conf: 0.91 }],
      },
      previousRuleIds: ['KR_FIRE_03'],
      rules: fireRules,
      segment: {
        confidence: 0.88,
        hazard: 'fire',
        phase: 'route_selection',
        officialRuleIds: [],
      },
    })

    expect(matches[0]?.rule.rule_id).toBe('KR_FIRE_03')
  })
})

describe('buildGroundedExplanation', () => {
  it('keeps action hidden when no grounded rule crosses the threshold', () => {
    const explanation = buildGroundedExplanation({
      evidence: {
        asrText: '',
        ocrTokens: [],
        uiElements: [],
        objectHints: [],
      },
      rules: earthquakeRules,
      segment: {
        id: 'seg-low',
        sessionId: 'session-1',
        hazard: 'earthquake',
        phase: 'protect',
        startMs: 0,
        endMs: 3_000,
        confidence: 0.8,
        officialRuleIds: [],
      },
    })

    expect(explanation.safetyMode).toBe('review_official')
    expect(explanation.tracks.action).toBeUndefined()
  })

  it('returns voice reply for grounded action intent', () => {
    const explanation = buildGroundedExplanation({
      evidence: {
        asrText: '탁자 아래로 들어가 머리를 보호해요',
        ocrTokens: ['머리 보호'],
        uiElements: [],
        objectHints: [{ label: '탁자', bbox: [0, 0, 10, 10], conf: 0.95 }],
      },
      rules: earthquakeRules,
      segment: {
        id: 'seg-grounded',
        sessionId: 'session-1',
        hazard: 'earthquake',
        phase: 'protect',
        startMs: 0,
        endMs: 3_000,
        confidence: 0.92,
        officialRuleIds: [],
      },
    })

    const reply = buildVoiceReply({
      explanation,
      intent: 'action',
    })

    expect(reply.text).toContain('탁자')
  })
})

function loadRules(relativePath: string) {
  const file = new URL(relativePath, import.meta.url)
  return JSON.parse(readFileSync(file, 'utf8')) as RuleRecord[]
}
