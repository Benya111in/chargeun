import { describe, expect, it } from 'vitest'

import {
  createBrowserFrameSample,
  initialCaptureInputState,
  pushCaptureFrame,
} from './capture-input'
import { buildLiveAnalysis } from './live-analysis'
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
})
