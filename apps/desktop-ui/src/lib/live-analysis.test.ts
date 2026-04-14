import { describe, expect, it } from 'vitest'

import {
  createBrowserFrameSample,
  initialCaptureInputState,
  pushCaptureFrame,
} from './capture-input'
import {
  buildLiveAnalysis,
  buildLiveAnalysisFromSnapshot,
} from './live-analysis'
import { liveRuleCatalog } from './rule-catalog'

const session = {
  id: 'live-session-1',
  sourceType: 'monitor',
  platform: 'mac',
  startedAt: 1_000,
  hasAudio: true,
  displayName: 'live demo',
} as const

describe('buildLiveAnalysis', () => {
  it('returns null when no live frame window is available', () => {
    const result = buildLiveAnalysis({
      captureInput: initialCaptureInputState,
      rules: liveRuleCatalog,
      session,
    })

    expect(result).toBeNull()
  })

  it('builds a grounded fire analysis when OCR and ASR evidence are present', () => {
    let captureInput = initialCaptureInputState

    captureInput = pushCaptureFrame(
      captureInput,
      createBrowserFrameSample({
        frameRef: 'demo://frame-1',
        height: 540,
        sessionId: session.id,
        tsMs: 10_000,
        width: 960,
      }),
    )
    captureInput = pushCaptureFrame(
      captureInput,
      createBrowserFrameSample({
        frameRef: 'demo://frame-2',
        height: 540,
        sessionId: session.id,
        tsMs: 11_000,
        width: 960,
      }),
    )

    const result = buildLiveAnalysis({
      captureInput,
      rules: liveRuleCatalog,
      session,
      signals: {
        asrText:
          '연기가 보이면 비상구 표지를 따라 계단으로 이동하고 엘리베이터를 타지 마세요.',
        ocrTokens: ['연기', '비상구', '계단', '대피'],
      },
    })

    expect(result?.segment.hazard).toBe('fire')
    expect(result?.segment.officialRuleIds).toContain('KR_FIRE_03')
    expect(result?.packetSummary.keyframeCount).toBe(2)
    expect(result?.overlaySummary).toContain('비상구')
    expect(result?.phaseLabel).toContain('대피 경로 선택')
  })

  it('reconstructs a restored live snapshot into an analysis view', () => {
    const restored = buildLiveAnalysisFromSnapshot({
      rules: liveRuleCatalog,
      snapshot: {
        createdAt: 22_000,
        explanation: {
          segmentId: 'segment-restored',
          safetyMode: 'grounded',
          tracks: {
            action: '계단으로 이동하세요.',
            basic: '화재 상황으로 보입니다.',
            easy: '비상구를 보고 계단으로 가세요.',
            reason: '엘리베이터는 위험할 수 있습니다.',
            report: '대피 후 119에 연락하세요.',
          },
          overlayTargets: [],
        },
        packetSummary: {
          asrText: '비상구 표지를 따라 계단으로 이동하세요.',
          keyframeCount: 3,
          objectHintLabels: ['계단으로 대피 가능함', '비상구'],
          ocrTokens: ['비상구', '계단'],
          sessionId: session.id,
          tEndMs: 21_500,
          tStartMs: 18_000,
          uiElementLabels: ['비상구'],
        },
        plan: {
          fps: 1,
          holdMs: 1_000,
          mode: 'base',
          reason: 'steady-scan',
        },
        segment: {
          confidence: 0.91,
          endMs: 21_500,
          hazard: 'fire',
          id: 'segment-restored',
          officialRuleIds: ['KR_FIRE_03'],
          phase: 'route_selection',
          sessionId: session.id,
          startMs: 18_000,
        },
        session: {
          selectedTrack: 'action',
          session,
          voiceEnabled: true,
        },
        sourceId: 'native-monitor',
      },
    })

    expect(restored.packet.keyframes).toHaveLength(3)
    expect(restored.ruleMatches[0]?.rule.rule_id).toBe('KR_FIRE_03')
    expect(restored.segment.title).toContain('화재 대응')
  })
})
