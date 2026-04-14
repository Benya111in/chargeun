import type {
  CaptureSession,
  PerceptionPacket,
  RuleRecord,
} from '@ansimtrack/shared-types'

import earthquakeRules from '../../../../data/rules/earthquake_rules.json'
import fireRules from '../../../../data/rules/fire_rules.json'

export type DemoScenario = {
  id: string
  overlaySummary: string
  overlayTargets: Array<{ label: string }>
  perceptionPacket: PerceptionPacket
  phaseLabel: string
  rules: RuleRecord[]
  session: CaptureSession
  title: string
  videoCaption: string
}

export const demoScenarios: DemoScenario[] = [
  {
    id: 'grounded-fire',
    title: '연기를 보고 대피 경로를 고르는 장면',
    phaseLabel: '세그먼트 04 | 대피 경로 선택',
    session: {
      id: 'session-fire-demo',
      sourceType: 'monitor',
      platform: 'mac',
      startedAt: Date.now() - 42_000,
      hasAudio: true,
      displayName: '화재 국민행동요령 영상',
    },
    perceptionPacket: {
      sessionId: 'session-fire-demo',
      tStartMs: 34_000,
      tEndMs: 41_000,
      asrText:
        '연기가 보이면 비상구 표지를 보고 계단으로 이동하고 나가면서 문을 닫으세요.',
      ocrTokens: ['비상구', '계단', '대피'],
      uiElements: [
        {
          label: '비상구',
          bbox: [0.82, 0.08, 0.12, 0.08],
          conf: 0.92,
        },
      ],
      objectHints: [
        { label: '복도', bbox: [0.22, 0.28, 0.44, 0.3], conf: 0.84 },
        { label: '출입문', bbox: [0.6, 0.24, 0.14, 0.34], conf: 0.78 },
        { label: '계단 표지', bbox: [0.78, 0.06, 0.12, 0.09], conf: 0.91 },
      ],
      keyframes: ['demo://fire/frame-1', 'demo://fire/frame-2'],
    },
    rules: fireRules as RuleRecord[],
    overlayTargets: [{ label: '비상구 표지' }, { label: '계단 방향' }],
    overlaySummary: '연기, 비상구, 계단 방향',
    videoCaption:
      '복도에 연기가 차고 있고, 화면 오른쪽 위에 비상구 표지가 보입니다. 내레이션은 엘리베이터 대신 계단을 찾으라고 안내합니다.',
  },
  {
    id: 'review-earthquake',
    title: '흔들림은 보이지만 보호 행동 근거가 약한 장면',
    phaseLabel: '세그먼트 02 | 공식 확인 우선',
    session: {
      id: 'session-earthquake-demo',
      sourceType: 'monitor',
      platform: 'mac',
      startedAt: Date.now() - 18_000,
      hasAudio: false,
      displayName: '지진 행동요령 데모 영상',
    },
    perceptionPacket: {
      sessionId: 'session-earthquake-demo',
      tStartMs: 6_000,
      tEndMs: 12_000,
      asrText: '',
      ocrTokens: [],
      uiElements: [],
      objectHints: [
        { label: '가구 후보', bbox: [0.34, 0.34, 0.26, 0.2], conf: 0.52 },
      ],
      keyframes: ['demo://earthquake/frame-1', 'demo://earthquake/frame-2'],
    },
    rules: earthquakeRules as RuleRecord[],
    overlayTargets: [{ label: '책상 후보' }, { label: '흔들림 의심' }],
    overlaySummary: '탁자 후보, 흔들림 감지',
    videoCaption:
      '카메라가 흔들리고 탁자 비슷한 객체가 보이지만 OCR과 음성 근거가 부족해서 공식 원문 확인이 먼저 필요합니다.',
  },
  {
    id: 'backup-fire-visual',
    title: '오디오 없이도 계단 대피를 판단할 수 있는 장면',
    phaseLabel: '세그먼트 05 | visual-only backup',
    session: {
      id: 'session-fire-visual-backup',
      sourceType: 'video_element',
      platform: 'mac',
      startedAt: Date.now() - 28_000,
      hasAudio: false,
      displayName: '화재 visual-only 백업 세션',
    },
    perceptionPacket: {
      sessionId: 'session-fire-visual-backup',
      tStartMs: 11_000,
      tEndMs: 16_500,
      asrText: '',
      ocrTokens: ['비상구', '계단', '대피'],
      uiElements: [
        {
          label: '출구가 보임',
          bbox: [0.72, 0.1, 0.14, 0.08],
          conf: 0.79,
        },
      ],
      objectHints: [
        {
          label: '계단으로 대피 가능함',
          bbox: [0.2, 0.2, 0.28, 0.46],
          conf: 0.9,
        },
        { label: '계단', bbox: [0.2, 0.24, 0.24, 0.42], conf: 0.94 },
        { label: '복도', bbox: [0.06, 0.2, 0.64, 0.26], conf: 0.84 },
      ],
      keyframes: ['demo://fire-visual/frame-1', 'demo://fire-visual/frame-2'],
    },
    rules: fireRules as RuleRecord[],
    overlayTargets: [{ label: '비상구 표지' }, { label: '계단 방향' }],
    overlaySummary: '비상구, 계단, 복도',
    videoCaption:
      '오디오가 꺼진 상태지만 비상구와 계단, 복도 정보만으로도 계단 대피 grounded 설명을 유지하는 백업 세션입니다.',
  },
  {
    id: 'backup-earthquake-after',
    title: '흔들림 종료 후 가스와 전기를 끄고 출구를 확보하는 장면',
    phaseLabel: '세그먼트 03 | 흔들림 종료 후 조치',
    session: {
      id: 'session-earthquake-after-backup',
      sourceType: 'video_element',
      platform: 'mac',
      startedAt: Date.now() - 24_000,
      hasAudio: true,
      displayName: '지진 after-shaking 백업 세션',
    },
    perceptionPacket: {
      sessionId: 'session-earthquake-after-backup',
      tStartMs: 15_000,
      tEndMs: 20_500,
      asrText: '흔들림이 멈췄어요 가스와 전기를 끄고 문을 열어요',
      ocrTokens: ['가스 차단', '출구'],
      uiElements: [
        {
          label: '전기 차단기',
          bbox: [0.78, 0.14, 0.12, 0.12],
          conf: 0.81,
        },
      ],
      objectHints: [
        { label: '출입문', bbox: [0.12, 0.12, 0.18, 0.54], conf: 0.91 },
        { label: '가스 밸브', bbox: [0.62, 0.42, 0.12, 0.12], conf: 0.87 },
      ],
      keyframes: [
        'demo://earthquake-after/frame-1',
        'demo://earthquake-after/frame-2',
      ],
    },
    rules: earthquakeRules as RuleRecord[],
    overlayTargets: [{ label: '가스 밸브' }, { label: '출입문' }],
    overlaySummary: '가스 차단, 출입문, after shaking',
    videoCaption:
      '흔들림이 멈춘 뒤 가스와 전기를 끄고 출구를 확보하는 지진 대응 장면을 백업 세션으로 준비했습니다.',
  },
]
