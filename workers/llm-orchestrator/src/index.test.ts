import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { RuleRecord } from '@ansimtrack/shared-types'

import {
  applySafetyGuardrails,
  buildStructuredLearningExplanation,
  buildSegmentFromPerception,
  buildGroundedExplanation,
  buildSuppressedCandidates,
  buildVoiceReply,
  classifyHazard,
  detectSegmentBoundary,
  matchGroundedRules,
  toLegacySegmentExplanation,
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

  it('does not ground a rule from caller-supplied rule ids alone', () => {
    const matches = matchGroundedRules({
      evidence: {
        asrText: '',
        ocrTokens: [],
        uiElements: [],
        objectHints: [],
      },
      rules: fireRules,
      segment: {
        confidence: 0.92,
        hazard: 'fire',
        phase: 'stair_evacuation',
        officialRuleIds: ['KR_FIRE_03'],
      },
    })

    expect(matches).toHaveLength(0)
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

describe('buildStructuredLearningExplanation', () => {
  it('builds validated structured explanations with separated evidence', () => {
    const packet = {
      asrText: '우리 집 화재 시 현관문을 닫고 계단으로 대피합니다.',
      keyframes: ['frame-a'],
      objectHints: [
        { label: '현관문', bbox: [0.1, 0.2, 0.2, 0.3], conf: 0.9 },
        { label: '엘리베이터', bbox: [0.4, 0.2, 0.2, 0.3], conf: 0.8 },
      ],
      ocrTokens: ['현관문', '계단', '대피'],
      sessionId: 'demo-fire',
      tEndMs: 7_800,
      tStartMs: 0,
      uiElements: [],
    }
    const segment = buildSegmentFromPerception({
      packet,
      rules: fireRules,
    })
    const structured = buildStructuredLearningExplanation({
      decisionPoint: '나갈 때 문을 닫아야 하는가',
      evidence: packet,
      learnerActionSteps: ['문을 닫아요', '문을 열어 두지 않아요'],
      rules: fireRules,
      segment,
      sourceId: 'fire-grounded-flow',
      teachBack: {
        correctOptionId: 'closed-door',
        options: [
          {
            evidenceRefs: ['rule:KR_FIRE_04'],
            feedback: '맞아요. 나갈 때 문을 닫으면 연기가 천천히 퍼져요.',
            id: 'closed-door',
            kind: 'state',
            label: '닫힌 문',
            officialRuleIds: ['KR_FIRE_04'],
            role: 'correct',
          },
          {
            evidenceRefs: ['contrast:open-door'],
            feedback: '괜찮아요. 이 장면에서는 문을 닫는 행동을 다시 봐요.',
            id: 'open-door',
            kind: 'state',
            label: '열린 문',
            role: 'contrast',
          },
        ],
        prompt: '나갈 때 문은 어떤 모습이어야 할까요?',
        reviewPrompt:
          '헷갈리면 이 장면을 다시 보고, 선생님이나 보호자와 같이 골라요.',
      },
    })

    expect(structured.version).toBe('slowlearner_multitrack_v1')
    expect(structured.segment.status).toBe('validated')
    expect(structured.tracks.action?.cards[0]?.officialRuleIds).toContain(
      'KR_FIRE_04',
    )
    expect(structured.tracks.action?.cards.map((card) => card.label)).toEqual([
      '문을 닫아요',
    ])
    expect(structured.tracks.teachBack?.correctOptionId).toBe('closed-door')
    expect(structured.tracks.teachBack?.options[0]?.officialRuleIds).toContain(
      'KR_FIRE_04',
    )
    expect(structured.evidence.visualEvidence.length).toBeGreaterThan(0)
    expect(structured.evidence.ocrEvidence.length).toBeGreaterThan(0)
    expect(structured.evidence.asrEvidence.length).toBe(1)
    expect(structured.evidence.ruleEvidence[0]?.ruleId).toBe('KR_FIRE_04')
    expect(
      structured.suppressedCandidates.some(
        (candidate) => candidate.candidate === '엘리베이터 타기',
      ),
    ).toBe(true)
    expect(
      structured.suppressedCandidates.some(
        (candidate) => candidate.candidate === '문을 열어 두지 않아요',
      ),
    ).toBe(true)
  })

  it('hides learner action when official rules are not grounded', () => {
    const packet = {
      asrText: '',
      keyframes: ['frame-a'],
      objectHints: [],
      ocrTokens: [],
      sessionId: 'demo-review',
      tEndMs: 3_000,
      tStartMs: 0,
      uiElements: [],
    }
    const structured = buildStructuredLearningExplanation({
      evidence: packet,
      rules: fireRules,
      segment: {
        confidence: 0.92,
        endMs: 3_000,
        hazard: 'fire',
        id: 'seg-review',
        officialRuleIds: ['KR_FIRE_03'],
        phase: 'stair_evacuation',
        sessionId: 'demo-review',
        startMs: 0,
      },
      sourceId: 'review',
    })
    const legacy = toLegacySegmentExplanation(structured)

    expect(structured.segment.status).toBe('needs_review')
    expect(structured.tracks.action).toBeUndefined()
    expect(legacy.safetyMode).toBe('review_official')
    expect(legacy.tracks.action).toBeUndefined()
  })
})

describe('buildSuppressedCandidates', () => {
  it('records unsafe and overflow candidates deterministically', () => {
    const candidates = buildSuppressedCandidates({
      actionRuleIds: ['KR_FIRE_03'],
      evidence: {
        asrText: '엘리베이터로 뛰어가요',
        objectHints: [],
        ocrTokens: [],
        uiElements: [],
      },
      ruleMatches: fireRules.slice(0, 4).map((rule, index) => ({
        matchedSignals: [`when:${rule.when[0]}`],
        rule,
        score: 10 - index,
      })),
      segment: {
        hazard: 'fire',
      },
    })

    expect(
      candidates.some((candidate) => candidate.category === 'unsafe_action'),
    ).toBe(true)
    expect(
      candidates.some((candidate) => candidate.category === 'too_many_actions'),
    ).toBe(true)
  })
})

describe('applySafetyGuardrails', () => {
  const groundedExplanation = {
    segmentId: 'seg-guarded',
    safetyMode: 'grounded' as const,
    doNot: '엘리베이터를 타지 마세요.',
    tracks: {
      basic: '화재 상황으로 보입니다.',
      easy: '연기가 보여서 공식 행동요령을 따라야 합니다.',
      action: '계단으로 이동하세요.',
      reason: '계단 대피가 더 안전합니다.',
      report: '119에 화재와 현재 위치를 알리세요.',
    },
    overlayTargets: [],
  }

  const groundedSegment = {
    confidence: 0.91,
    officialRuleIds: ['KR_FIRE_03'],
  }

  it('keeps grounded action when evidence is visible and consent exists', () => {
    const result = applySafetyGuardrails({
      evidenceVisible: true,
      explanation: groundedExplanation,
      panicMode: false,
      privacyConsent: true,
      segment: groundedSegment,
    })

    expect(result.explanation.safetyMode).toBe('grounded')
    expect(result.explanation.tracks.action).toBe('계단으로 이동하세요.')
    expect(result.warnings).toHaveLength(0)
  })

  it('downgrades low-confidence segments to review mode', () => {
    const result = applySafetyGuardrails({
      evidenceVisible: true,
      explanation: groundedExplanation,
      panicMode: false,
      privacyConsent: true,
      segment: {
        ...groundedSegment,
        confidence: 0.61,
      },
    })

    expect(result.explanation.safetyMode).toBe('review_official')
    expect(result.explanation.tracks.action).toBeUndefined()
    expect(result.explanation.doNot).toBeUndefined()
    expect(
      result.warnings.some((warning) => warning.includes('확신이 낮아')),
    ).toBe(true)
  })

  it('downgrades explanations without official rule ids', () => {
    const result = applySafetyGuardrails({
      evidenceVisible: true,
      explanation: groundedExplanation,
      panicMode: false,
      privacyConsent: true,
      segment: {
        ...groundedSegment,
        officialRuleIds: [],
      },
    })

    expect(result.explanation.safetyMode).toBe('review_official')
    expect(result.explanation.tracks.report).toBeUndefined()
    expect(
      result.warnings.some((warning) => warning.includes('공식 rule id')),
    ).toBe(true)
  })

  it('hides action/report until evidence is visible', () => {
    const result = applySafetyGuardrails({
      evidenceVisible: false,
      explanation: groundedExplanation,
      panicMode: false,
      privacyConsent: true,
      segment: groundedSegment,
    })

    expect(result.explanation.safetyMode).toBe('grounded')
    expect(result.explanation.tracks.action).toBeUndefined()
    expect(result.explanation.tracks.report).toBeUndefined()
    expect(
      result.warnings.some((warning) => warning.includes('근거 패널')),
    ).toBe(true)
  })

  it('holds behavior guidance when privacy consent is missing', () => {
    const result = applySafetyGuardrails({
      evidenceVisible: true,
      explanation: groundedExplanation,
      panicMode: true,
      privacyConsent: false,
      segment: groundedSegment,
    })

    expect(result.explanation.safetyMode).toBe('review_official')
    expect(result.explanation.tracks.action).toBeUndefined()
    expect(
      result.warnings.some((warning) => warning.includes('캡처 동의')),
    ).toBe(true)
    expect(
      result.warnings.some((warning) => warning.includes('Panic Mode')),
    ).toBe(true)
  })
})

describe('classifyHazard', () => {
  it('classifies fire corridor evidence into route_selection', () => {
    const classification = classifyHazard({
      asrText: '비상구를 보고 계단으로 이동해요 연기가 보여요',
      ocrTokens: ['비상구', '계단'],
      uiElements: [],
      objectHints: [{ label: '복도', bbox: [0, 0, 10, 10], conf: 0.8 }],
    })

    expect(classification.hazard).toBe('fire')
    expect(classification.phase).toBe('route_selection')
    expect(classification.confidence).toBeGreaterThan(0.72)
  })

  it('falls back to unknown when the evidence is too weak', () => {
    const classification = classifyHazard({
      asrText: '화면을 보고 있어요',
      ocrTokens: [],
      uiElements: [],
      objectHints: [],
    })

    expect(classification.hazard).toBe('unknown')
    expect(classification.confidence).toBeLessThan(0.72)
  })
})

describe('buildSegmentFromPerception', () => {
  it('creates a grounded earthquake protect segment from packet evidence', () => {
    const segment = buildSegmentFromPerception({
      packet: {
        sessionId: 'session-2',
        tStartMs: 1_000,
        tEndMs: 4_800,
        asrText: '흔들려요 탁자 아래로 들어가서 머리를 보호해요',
        ocrTokens: ['머리 보호'],
        uiElements: [],
        objectHints: [
          { label: '탁자', bbox: [0, 0, 10, 10], conf: 0.95 },
          { label: '머리 보호 자세', bbox: [20, 20, 10, 10], conf: 0.88 },
        ],
        keyframes: ['frame-a', 'frame-b'],
      },
      rules: earthquakeRules,
    })

    expect(segment.hazard).toBe('earthquake')
    expect(segment.phase).toBe('protect')
    expect(segment.officialRuleIds[0]).toBe('KR_EQ_03')
    expect(segment.confidence).toBeGreaterThan(0.72)
  })

  it('keeps the same segment id when the phase has not changed', () => {
    const packet = {
      sessionId: 'session-3',
      tStartMs: 4_000,
      tEndMs: 6_000,
      asrText: '계단으로 이동하고 문을 닫아요',
      ocrTokens: ['비상구', '계단'],
      uiElements: [],
      objectHints: [{ label: '출입문', bbox: [0, 0, 10, 10], conf: 0.8 }],
      keyframes: ['frame-a', 'frame-b'],
    }

    const previous = {
      id: 'seg-session-3-1000',
      sessionId: 'session-3',
      hazard: 'fire' as const,
      phase: 'route_selection',
      startMs: 1_000,
      endMs: 3_500,
      confidence: 0.9,
      officialRuleIds: ['KR_FIRE_04'],
    }

    const next = buildSegmentFromPerception({
      packet,
      previousRuleIds: previous.officialRuleIds,
      previousSegment: previous,
      rules: fireRules,
    })

    expect(next.id).toBe(previous.id)
    expect(next.startMs).toBe(previous.startMs)
  })
})

describe('detectSegmentBoundary', () => {
  it('opens a new segment when the phase changes', () => {
    expect(
      detectSegmentBoundary({
        previous: {
          hazard: 'earthquake',
          phase: 'protect',
          endMs: 2_000,
        },
        next: {
          hazard: 'earthquake',
          phase: 'after_shaking',
          startMs: 2_100,
          endMs: 4_000,
        },
      }),
    ).toBe(true)
  })
})

function loadRules(relativePath: string) {
  const file = new URL(relativePath, import.meta.url)
  return JSON.parse(readFileSync(file, 'utf8')) as RuleRecord[]
}
