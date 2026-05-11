import {
  buildGroundedExplanation,
  buildSegmentFromPerception,
  matchGroundedRules,
  type GroundedRuleMatch,
} from '@ansimtrack/llm-orchestrator'
import {
  buildPerceptionCacheKey,
  buildPerceptionFoundation,
  selectFrameSamplingPlan,
  type FrameSamplingPlan,
} from '@ansimtrack/perception-pipeline'
import type {
  CaptureSession,
  PerceptionPacket,
  RuleRecord,
  Segment,
  SegmentExplanation,
} from '@ansimtrack/shared-types'

import type { CaptureInputState } from './capture-input'
import type {
  LiveAnalysisPlanSummary,
  LiveAnalysisPacketSummary,
  LiveAnalysisSnapshotInput,
} from './live-analysis-contract'

export type LiveAnalysisSignals = {
  asrText?: string
  ocrTokens?: string[]
  upstreamHints?: PerceptionPacket['objectHints']
}

export type LiveAnalysisResult = {
  cacheKey: string
  explanation: SegmentExplanation
  overlaySummary: string
  overlayTargets: Array<{ label: string }>
  packet: PerceptionPacket
  packetSummary: LiveAnalysisPacketSummary
  phaseLabel: string
  plan: FrameSamplingPlan
  ruleMatches: GroundedRuleMatch[]
  segment: Segment & {
    phaseLabel: string
    title: string
  }
  videoCaption: string
}

export function buildLiveAnalysis(input: {
  captureInput: CaptureInputState
  rules: RuleRecord[]
  session: CaptureSession | null
  signals?: LiveAnalysisSignals
}): LiveAnalysisResult | null {
  if (!input.session || input.captureInput.frameWindow.length === 0) {
    return null
  }

  const foundation = buildPerceptionFoundation({
    asrText: input.signals?.asrText,
    frames: input.captureInput.frameWindow,
    ocrTokens: input.signals?.ocrTokens,
    upstreamHints: input.signals?.upstreamHints,
  })
  const segment = buildSegmentFromPerception({
    packet: foundation.packet,
    rules: input.rules,
  })
  const ruleMatches = matchGroundedRules({
    evidence: foundation.packet,
    rules: input.rules,
    segment,
  })
  const explanation = buildGroundedExplanation({
    evidence: foundation.packet,
    rules: input.rules,
    segment,
  })
  const overlayLabels = collectOverlayLabels(foundation.packet)
  const title = buildLiveSegmentTitle(segment)
  const phaseLabel = buildLivePhaseLabel(segment)

  return {
    cacheKey: foundation.cacheKey,
    explanation,
    overlaySummary:
      overlayLabels.join(', ') || 'OCR/ASR 단서 수집 중, 공식 확인 우선',
    overlayTargets: overlayLabels.map((label) => ({ label })),
    packet: foundation.packet,
    packetSummary: summarizePacket(foundation.packet),
    phaseLabel,
    plan: foundation.plan,
    ruleMatches,
    segment: {
      ...segment,
      phaseLabel,
      title,
    },
    videoCaption: buildLiveVideoCaption({
      overlayLabels,
      plan: foundation.plan,
      segment,
      session: input.session,
    }),
  }
}

export function buildLiveAnalysisFromPacket(input: {
  packet: PerceptionPacket
  plan?: FrameSamplingPlan
  rules: RuleRecord[]
  session: CaptureSession
}): LiveAnalysisResult {
  const segment = buildSegmentFromPerception({
    packet: input.packet,
    rules: input.rules,
  })
  const ruleMatches = matchGroundedRules({
    evidence: input.packet,
    rules: input.rules,
    segment,
  })
  const explanation = buildGroundedExplanation({
    evidence: input.packet,
    rules: input.rules,
    segment,
  })
  const overlayLabels = collectOverlayLabels(input.packet)
  const title = buildLiveSegmentTitle(segment)
  const phaseLabel = buildLivePhaseLabel(segment)
  const plan =
    input.plan ??
    selectFrameSamplingPlan({
      asrText: input.packet.asrText,
      objectLabels: input.packet.objectHints.map((hint) => hint.label),
      ocrTokens: input.packet.ocrTokens,
    })

  return {
    cacheKey: buildPerceptionCacheKey(input.packet),
    explanation,
    overlaySummary:
      overlayLabels.join(', ') || '화면 단서 수집 중, 공식 확인 우선',
    overlayTargets: overlayLabels.map((label) => ({ label })),
    packet: input.packet,
    packetSummary: summarizePacket(input.packet),
    phaseLabel,
    plan,
    ruleMatches,
    segment: {
      ...segment,
      phaseLabel,
      title,
    },
    videoCaption: buildLiveVideoCaption({
      overlayLabels,
      plan,
      segment,
      session: input.session,
    }),
  }
}

export function summarizePacket(
  packet: PerceptionPacket,
): LiveAnalysisPacketSummary {
  return {
    asrText: packet.asrText,
    keyframeCount: packet.keyframes.length,
    objectHintLabels: packet.objectHints.map((hint) => hint.label),
    ocrTokens: packet.ocrTokens,
    sessionId: packet.sessionId,
    tEndMs: packet.tEndMs,
    tStartMs: packet.tStartMs,
    uiElementLabels: packet.uiElements.map((element) => element.label),
  }
}

export function buildLiveAnalysisFromSnapshot(input: {
  rules: RuleRecord[]
  snapshot: LiveAnalysisSnapshotInput
}): LiveAnalysisResult {
  const packet = hydratePacketFromSummary(input.snapshot.packetSummary)
  const overlayLabels = collectOverlayLabels(packet)
  const ruleMatches = matchGroundedRules({
    evidence: packet,
    rules: input.rules,
    segment: input.snapshot.segment,
  })
  const title = buildLiveSegmentTitle(input.snapshot.segment)
  const phaseLabel = buildLivePhaseLabel(input.snapshot.segment)

  return {
    cacheKey: [
      input.snapshot.packetSummary.sessionId,
      input.snapshot.packetSummary.tStartMs,
      input.snapshot.packetSummary.tEndMs,
      'restored',
    ].join(':'),
    explanation: input.snapshot.explanation,
    overlaySummary:
      overlayLabels.join(', ') || '복원된 라이브 분석 요약을 표시하는 중',
    overlayTargets: overlayLabels.map((label) => ({ label })),
    packet,
    packetSummary: input.snapshot.packetSummary,
    phaseLabel,
    plan: normalizePlan(input.snapshot.plan),
    ruleMatches,
    segment: {
      ...input.snapshot.segment,
      phaseLabel,
      title,
    },
    videoCaption: buildLiveVideoCaption({
      overlayLabels,
      plan: normalizePlan(input.snapshot.plan),
      segment: input.snapshot.segment,
      session: input.snapshot.session.session,
    }),
  }
}

function hydratePacketFromSummary(
  summary: LiveAnalysisPacketSummary,
): PerceptionPacket {
  const uiElements = summary.uiElementLabels.map((label, index) => ({
    label,
    bbox: buildGenericBox(index),
    conf: 0.5,
  }))
  const objectHints = summary.objectHintLabels.map((label, index) => ({
    label,
    bbox: buildGenericBox(index + uiElements.length),
    conf: 0.5,
  }))

  return {
    sessionId: summary.sessionId,
    tStartMs: summary.tStartMs,
    tEndMs: summary.tEndMs,
    asrText: summary.asrText,
    ocrTokens: summary.ocrTokens,
    uiElements,
    objectHints,
    keyframes: Array.from(
      { length: Math.max(1, summary.keyframeCount) },
      (_, index) => `restore://frame-${index + 1}`,
    ),
  }
}

function buildGenericBox(index: number): [number, number, number, number] {
  const col = index % 3
  const row = Math.floor(index / 3)
  const x = 0.08 + col * 0.22
  const y = 0.08 + row * 0.14

  return [x, y, 0.18, 0.1]
}

function normalizePlan(plan: LiveAnalysisPlanSummary): FrameSamplingPlan {
  return {
    fps: plan.fps,
    holdMs: plan.holdMs,
    mode: plan.mode === 'burst' ? 'burst' : 'base',
    reason: plan.reason,
  }
}

function collectOverlayLabels(packet: PerceptionPacket) {
  const seen = new Set<string>()
  const labels = [
    ...packet.objectHints.map((item) => item.label),
    ...packet.uiElements.map((item) => item.label),
    ...packet.ocrTokens,
  ]

  return labels
    .map((label) => label.trim())
    .filter((label) => label.length > 0)
    .filter((label) => {
      if (seen.has(label)) {
        return false
      }

      seen.add(label)
      return true
    })
    .slice(0, 3)
}

function buildLiveSegmentTitle(
  segment: Pick<Segment, 'hazard' | 'officialRuleIds'>,
) {
  if (segment.hazard === 'fire' && segment.officialRuleIds.length > 0) {
    return '화재 대응 판단을 읽는 라이브 장면'
  }

  if (segment.hazard === 'earthquake' && segment.officialRuleIds.length > 0) {
    return '지진 대응 판단을 읽는 라이브 장면'
  }

  return '공식 근거를 더 모으는 라이브 장면'
}

function buildLivePhaseLabel(segment: Pick<Segment, 'phase'>) {
  const phaseLabel =
    phaseLabelMap[segment.phase] ?? segment.phase.replaceAll('_', ' ').trim()

  return `라이브 세그먼트 | ${phaseLabel || '공식 확인 우선'}`
}

function buildLiveVideoCaption(input: {
  overlayLabels: string[]
  plan: FrameSamplingPlan
  segment: Pick<Segment, 'officialRuleIds'>
  session: Pick<CaptureSession, 'hasAudio'>
}) {
  const evidenceSummary =
    input.overlayLabels.join(', ') || '시각 단서를 아직 모으는 중'
  const audioLabel = input.session.hasAudio ? '오디오 포함' : '영상 전용'
  const groundingLabel =
    input.segment.officialRuleIds.length > 0
      ? `공식 rule ${input.segment.officialRuleIds.join(', ')}`
      : '공식 확인 우선'

  return `${audioLabel} live capture에서 ${evidenceSummary}를 기준으로 ${groundingLabel} 판단을 갱신합니다. sampling mode는 ${input.plan.mode}입니다.`
}

const phaseLabelMap: Record<string, string> = {
  after_shaking: '흔들림 종료 후 조치',
  alert_and_wake: '경보 확인',
  door_assessment: '출입문 확인',
  door_control: '문 닫기',
  during_shaking: '흔들림 중 보호',
  protect: '흔들림 중 보호',
  refuge_space: '피난 공간 선택',
  route_selection: '대피 경로 선택',
  seal_room: '실내 대기',
  smoke_low_posture: '낮은 자세 이동',
  stair_evacuation: '계단 대피',
}
