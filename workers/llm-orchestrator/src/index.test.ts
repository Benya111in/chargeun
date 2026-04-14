import { describe, expect, it } from 'vitest'

import { buildExplanation, buildVoiceReply } from './index'

describe('buildExplanation', () => {
  it('suppresses action when confidence is low', () => {
    const explanation = buildExplanation({
      segment: {
        id: 'seg-low',
        sessionId: 'session-1',
        hazard: 'fire',
        phase: 'route_selection',
        startMs: 0,
        endMs: 3000,
        confidence: 0.45,
        officialRuleIds: [],
      },
      matchedRules: [],
    })

    expect(explanation.safetyMode).toBe('review_official')
    expect(explanation.tracks.action).toBeUndefined()
  })

  it('returns voice reply for selected intent', () => {
    const explanation = buildExplanation({
      segment: {
        id: 'seg-grounded',
        sessionId: 'session-1',
        hazard: 'earthquake',
        phase: 'protect',
        startMs: 0,
        endMs: 3000,
        confidence: 0.92,
        officialRuleIds: ['KR_EQ_02'],
      },
      matchedRules: [
        {
          rule_id: 'KR_EQ_02',
          hazard: 'earthquake',
          phase: 'protect',
          when: ['흔들림 시작'],
          action: '탁자 아래로 들어가 몸을 보호합니다.',
          why: '떨어지는 물건으로부터 머리와 몸을 지키는 데 도움이 됩니다.',
          source_title: '국민행동요령 지진',
          source_url: 'https://www.safekorea.go.kr',
          updated_at: '2026-04-14',
        },
      ],
    })

    const reply = buildVoiceReply({
      explanation,
      intent: 'action',
    })

    expect(reply.text).toContain('탁자')
  })
})
