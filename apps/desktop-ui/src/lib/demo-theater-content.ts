import {
  applySafetyGuardrails,
  buildGroundedExplanation,
  buildSegmentFromPerception,
  matchGroundedRules,
  type GroundedRuleMatch,
} from '@ansimtrack/llm-orchestrator'
import type {
  PerceptionPacket,
  RuleRecord,
  Segment,
  SegmentExplanation,
} from '@ansimtrack/shared-types'

import { earthquakeRuleCatalog, fireRuleCatalog } from './rule-catalog'

export type TheaterSegment = {
  description: string
  endMs: number
  explanation: SegmentExplanation
  id: string
  label: string
  packet: PerceptionPacket
  primarySourceTitle: string | null
  ruleMatches: GroundedRuleMatch[]
  safetyWarnings: string[]
  segment: Segment
  startMs: number
}

export type TheaterShow = {
  accentClassName: string
  id: string
  note: string
  posterSrc: string
  segments: TheaterSegment[]
  title: string
  videoSrc: string
}

type SegmentSeed = {
  description: string
  endMs: number
  id: string
  label: string
  packet: PerceptionPacket
  rules: RuleRecord[]
  segmentOverrides?: Partial<Segment>
  startMs: number
}

export const theaterShows: TheaterShow[] = [
  {
    accentClassName: 'bg-rose-400',
    id: 'fire-grounded-flow',
    note: '문 닫기 -> 계단 대피 -> 대피공간 전환',
    posterSrc: '/demo/fire-grounded-02.jpg',
    segments: [
      createSegment({
        description: '문을 닫고 밖으로 나가요.',
        endMs: 7_800,
        id: 'fire-grounded-door-control',
        label: '문을 닫고 나가요',
        packet: createPacket({
          asrText: '우리 집 화재 시 현관문을 닫고 계단으로 대피합니다.',
          objectHints: ['출입문', '현관문', '연기', '복도', '계단 방향'],
          ocrTokens: ['현관문', '계단', '대피'],
          sessionId: 'demo-fire-grounded-door-control',
          startMs: 0,
          endMs: 7_800,
          uiElements: ['우리 집 화재 시'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_04'],
          phase: 'door_control',
        },
        startMs: 0,
      }),
      createSegment({
        description: '계단으로 가요.',
        endMs: 16_000,
        id: 'fire-grounded-stairs',
        label: '계단으로 가요',
        packet: createPacket({
          asrText: '계단을 이용해 낮은 자세로 안전한 곳으로 이동합니다.',
          objectHints: ['계단으로 대피 가능함', '복도', '출구가 보임'],
          ocrTokens: ['계단', '출구', '대피'],
          sessionId: 'demo-fire-grounded-stairs',
          startMs: 7_800,
          endMs: 16_000,
          uiElements: ['계단으로 대피'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_03'],
          phase: 'stair_evacuation',
        },
        startMs: 7_800,
      }),
      createSegment({
        description: '못 나가면 다른 대피공간으로 가요.',
        endMs: 28_028,
        id: 'fire-grounded-refuge',
        label: '다른 대피공간으로 가요',
        packet: createPacket({
          asrText:
            '대피가 어렵다면 집 안 대피공간이나 피난 수단으로 이동합니다.',
          objectHints: ['대피가 어려움', '대피공간', '현관 쪽이 막힘'],
          ocrTokens: ['대피가 어렵다면', '집 안 대피공간'],
          sessionId: 'demo-fire-grounded-refuge',
          startMs: 16_000,
          endMs: 28_028,
          uiElements: ['대피가 어렵다면'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.9,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_05'],
          phase: 'refuge_space',
        },
        startMs: 16_000,
      }),
    ],
    title: '화재가 났을 때',
    videoSrc: '/demo-video/fire-door-control-001.mp4',
  },
  {
    accentClassName: 'bg-sky-400',
    id: 'earthquake-protect-flow',
    note: 'review -> 책상 아래 보호 -> 방석 머리 보호',
    posterSrc: '/demo/earthquake-review-02.jpg',
    segments: [
      createSegment({
        description: '책상 아래로 들어가요.',
        endMs: 14_000,
        id: 'earthquake-review-office-desk',
        label: '책상 아래로 들어가요',
        packet: createPacket({
          asrText:
            '지진으로 흔들릴 때는 책상이나 탁자 아래로 들어가 머리를 보호합니다.',
          objectHints: ['탁자', '책상', '머리 보호 자세', '사무실'],
          ocrTokens: ['탁자 아래', '책상 아래', '머리 보호'],
          sessionId: 'demo-earthquake-review-office-desk',
          startMs: 6_000,
          endMs: 14_000,
          uiElements: ['사무실에 있을 때는 책상 아래로 피하기'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_03'],
          phase: 'during_shaking',
        },
        startMs: 6_000,
      }),
      createSegment({
        description: '학교에서도 책상 아래로 가요.',
        endMs: 22_000,
        id: 'earthquake-review-school-desk',
        label: '학교에서도 책상 아래로 가요',
        packet: createPacket({
          asrText:
            '지진으로 흔들릴 때 학교에서도 책상이나 탁자 아래로 피해서 머리를 보호합니다.',
          objectHints: ['학생', '탁자', '책상', '머리 보호 자세', '교실'],
          ocrTokens: ['탁자 아래', '책상 아래', '머리 보호'],
          sessionId: 'demo-earthquake-review-school-desk',
          startMs: 14_000,
          endMs: 22_000,
          uiElements: ['학교에 있을 때는 책상 아래로 피하기'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_03'],
          phase: 'during_shaking',
        },
        startMs: 14_000,
      }),
      createSegment({
        description: '책상이 없으면 머리를 감싸요.',
        endMs: 28_028,
        id: 'earthquake-review-cushion',
        label: '머리를 감싸요',
        packet: createPacket({
          asrText:
            '지진으로 흔들릴 때 탁자가 없으면 방석이나 가방으로 머리를 보호하고 낮게 자세를 유지합니다.',
          objectHints: ['방석', '머리 보호 자세', '몸을 낮춤', '탁자가 없음'],
          ocrTokens: ['방석', '머리 보호'],
          sessionId: 'demo-earthquake-review-cushion',
          startMs: 22_000,
          endMs: 28_028,
          uiElements: ['머리 보호'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_04'],
          phase: 'during_shaking',
        },
        startMs: 22_000,
      }),
    ],
    title: '지진이 흔들릴 때',
    videoSrc: '/demo-video/earthquake-desk-001.mp4',
  },
  {
    accentClassName: 'bg-orange-400',
    id: 'fire-visual-flow',
    note: '무음에서도 장면 단위 grounded 전환 유지',
    posterSrc: '/demo/fire-visual-02.jpg',
    segments: [
      createSegment({
        description: '소리가 없어도 문을 닫고 나가요.',
        endMs: 8_000,
        id: 'fire-visual-door-control',
        label: '문을 닫고 나가요',
        packet: createPacket({
          asrText: '',
          objectHints: ['출입문', '복도', '계단 방향'],
          ocrTokens: ['현관문', '계단', '대피'],
          sessionId: 'demo-fire-visual-door-control',
          startMs: 0,
          endMs: 8_000,
          uiElements: ['우리 집 화재 시'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.91,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_04'],
          phase: 'door_control',
        },
        startMs: 0,
      }),
      createSegment({
        description: '소리가 없어도 계단으로 가요.',
        endMs: 15_500,
        id: 'fire-visual-stairs',
        label: '계단으로 가요',
        packet: createPacket({
          asrText: '',
          objectHints: ['계단으로 대피 가능함', '출구가 보임', '복도'],
          ocrTokens: ['계단', '출구', '대피'],
          sessionId: 'demo-fire-visual-stairs',
          startMs: 8_000,
          endMs: 15_500,
          uiElements: ['현관문 닫고 계단으로 대피'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_03'],
          phase: 'stair_evacuation',
        },
        startMs: 8_000,
      }),
      createSegment({
        description: '못 나가면 다른 대피공간으로 가요.',
        endMs: 24_023,
        id: 'fire-visual-refuge',
        label: '다른 대피공간으로 가요',
        packet: createPacket({
          asrText: '',
          objectHints: ['대피가 어려움', '대피공간', '실내 대기'],
          ocrTokens: ['대피가 어렵다면', '집 안 대피공간'],
          sessionId: 'demo-fire-visual-refuge',
          startMs: 15_500,
          endMs: 24_023,
          uiElements: ['대피가 어렵다면'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.9,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_05'],
          phase: 'refuge_space',
        },
        startMs: 15_500,
      }),
    ],
    title: '소리가 없어도 볼 수 있어요',
    videoSrc: '/demo-video/fire-stair-no-audio-001.mp4',
  },
  {
    accentClassName: 'bg-teal-400',
    id: 'earthquake-after-flow',
    note: '출구 확보 -> 가스/전기 확인 -> 신고 전환',
    posterSrc: '/demo/earthquake-after-02.jpg',
    segments: [
      createSegment({
        description: '문을 열어 나갈 길을 만들어요.',
        endMs: 9_500,
        id: 'earthquake-after-exit',
        label: '문을 열어요',
        packet: createPacket({
          asrText: '흔들림이 멈추면 문을 열어 출구를 확보합니다.',
          objectHints: ['출입문', '출구 확보', '실내 이동'],
          ocrTokens: ['출구 확보'],
          sessionId: 'demo-earthquake-after-exit',
          startMs: 0,
          endMs: 9_500,
          uiElements: ['대피 후 행동요령'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_05'],
          phase: 'after_shaking',
        },
        startMs: 0,
      }),
      createSegment({
        description: '가스와 전기를 살펴요.',
        endMs: 19_500,
        id: 'earthquake-after-gas',
        label: '가스와 전기를 살펴요',
        packet: createPacket({
          asrText: '가스와 전깃불을 확인하고 위험이 있으면 바로 차단합니다.',
          objectHints: ['가스 밸브', '전기 차단기', '주방'],
          ocrTokens: ['가스', '전기', '출구'],
          sessionId: 'demo-earthquake-after-gas',
          startMs: 9_500,
          endMs: 19_500,
          uiElements: ['가스가 샐 경우'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_05'],
          phase: 'after_shaking',
        },
        startMs: 9_500,
      }),
      createSegment({
        description: '위험하면 바로 알려요.',
        endMs: 30_030,
        id: 'earthquake-after-report',
        label: '위험하면 바로 알려요',
        packet: createPacket({
          asrText:
            '흔들림이 멈춘 뒤 가족과 부상자를 확인하고 가스 냄새나 화재가 있으면 119에 알립니다.',
          objectHints: ['출입문', '안전 확인', '부상자 확인', '흔들림이 멈춤'],
          ocrTokens: ['안전 확인', '출구', '119 신고'],
          sessionId: 'demo-earthquake-after-report',
          startMs: 19_500,
          endMs: 30_030,
          uiElements: ['대피 후 행동요령'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_12'],
          phase: 'post_quake_report',
        },
        startMs: 19_500,
      }),
    ],
    title: '흔들림이 멈춘 뒤',
    videoSrc: '/demo-video/earthquake-after-shaking-001.mp4',
  },
]

function createSegment(seed: SegmentSeed): TheaterSegment {
  const detectedSegment = buildSegmentFromPerception({
    packet: seed.packet,
    rules: seed.rules,
  })
  const segment: Segment = {
    ...detectedSegment,
    ...seed.segmentOverrides,
    endMs: seed.endMs,
    id: seed.id,
    startMs: seed.startMs,
  }
  const ruleMatches = matchGroundedRules({
    evidence: seed.packet,
    rules: seed.rules,
    segment,
  })
  const explanation = buildGroundedExplanation({
    evidence: seed.packet,
    rules: seed.rules,
    segment,
  })
  const safetyView = applySafetyGuardrails({
    evidenceVisible: true,
    explanation,
    panicMode: false,
    privacyConsent: true,
    segment,
  })

  return {
    description: seed.description,
    endMs: seed.endMs,
    explanation: safetyView.explanation,
    id: seed.id,
    label: seed.label,
    packet: seed.packet,
    primarySourceTitle: ruleMatches[0]?.rule.source_title ?? null,
    ruleMatches,
    safetyWarnings: safetyView.warnings,
    segment,
    startMs: seed.startMs,
  }
}

function createPacket(input: {
  asrText: string
  endMs: number
  objectHints: string[]
  ocrTokens: string[]
  sessionId: string
  startMs: number
  uiElements: string[]
}): PerceptionPacket {
  return {
    asrText: input.asrText,
    keyframes: [`${input.sessionId}-a`, `${input.sessionId}-b`],
    objectHints: input.objectHints.map((label, index) => ({
      bbox: [0.12 + index * 0.04, 0.18, 0.28, 0.22],
      conf: 0.74 + index * 0.03,
      label,
    })),
    ocrTokens: input.ocrTokens,
    sessionId: input.sessionId,
    tEndMs: input.endMs,
    tStartMs: input.startMs,
    uiElements: input.uiElements.map((label, index) => ({
      bbox: [0.58, 0.1 + index * 0.08, 0.22, 0.08],
      conf: 0.8,
      label,
    })),
  }
}
