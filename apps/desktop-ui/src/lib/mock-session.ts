import type {
  CaptureSession,
  RuleRecord,
  Segment,
} from '@ansimtrack/shared-types'

import earthquakeRules from '../../../../data/rules/earthquake_rules.json'
import fireRules from '../../../../data/rules/fire_rules.json'

export type DemoScenario = {
  id: string
  session: CaptureSession
  segment: Segment & {
    title: string
    phaseLabel: string
  }
  matchedRules: RuleRecord[]
  overlayTargets: Array<{ label: string }>
  overlaySummary: string
  videoCaption: string
}

const fireRule = (fireRules as RuleRecord[]).find(
  (rule) => rule.rule_id === 'KR_FIRE_04',
)
const earthquakeRule = (earthquakeRules as RuleRecord[]).find(
  (rule) => rule.rule_id === 'KR_EQ_02',
)

if (!fireRule || !earthquakeRule) {
  throw new Error(
    'Required demo rules are missing from the local rules bundle.',
  )
}

export const demoScenarios: DemoScenario[] = [
  {
    id: 'grounded-fire',
    session: {
      id: 'session-fire-demo',
      sourceType: 'monitor',
      platform: 'mac',
      startedAt: Date.now() - 42_000,
      hasAudio: true,
      displayName: '화재 국민행동요령 영상',
    },
    segment: {
      id: 'segment-fire-route',
      sessionId: 'session-fire-demo',
      hazard: 'fire',
      phase: 'route_selection',
      startMs: 34_000,
      endMs: 41_000,
      confidence: 0.91,
      officialRuleIds: [fireRule.rule_id],
      title: '연기를 보고 대피 경로를 고르는 장면',
      phaseLabel: '세그먼트 04 | 대피 경로 선택',
    },
    matchedRules: [fireRule],
    overlayTargets: [{ label: '비상구 표지' }, { label: '계단 방향' }],
    overlaySummary: '연기, 비상구, 계단 방향',
    videoCaption:
      '복도에 연기가 차고 있고, 화면 오른쪽 위에 비상구 표지가 보입니다. 내레이션은 엘리베이터 대신 계단을 찾으라고 안내합니다.',
  },
  {
    id: 'review-earthquake',
    session: {
      id: 'session-earthquake-demo',
      sourceType: 'monitor',
      platform: 'mac',
      startedAt: Date.now() - 18_000,
      hasAudio: false,
      displayName: '지진 행동요령 데모 영상',
    },
    segment: {
      id: 'segment-earthquake-review',
      sessionId: 'session-earthquake-demo',
      hazard: 'earthquake',
      phase: 'protect',
      startMs: 6_000,
      endMs: 12_000,
      confidence: 0.48,
      officialRuleIds: [],
      title: '흔들림은 보이지만 보호 행동 근거가 약한 장면',
      phaseLabel: '세그먼트 02 | 공식 확인 우선',
    },
    matchedRules: [],
    overlayTargets: [{ label: '책상 후보' }, { label: '흔들림 의심' }],
    overlaySummary: '탁자 후보, 흔들림 감지',
    videoCaption:
      '카메라가 흔들리고 탁자 비슷한 객체가 보이지만 OCR과 음성 근거가 부족해서 공식 원문 확인이 먼저 필요합니다.',
  },
]
