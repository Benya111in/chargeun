import {
  buildGroundedExplanation,
  buildSegmentFromPerception,
  matchGroundedRules,
  type GroundedRuleMatch,
} from '@ansimtrack/llm-orchestrator'
import {
  buildPerceptionFoundation,
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

export type LiveAnalysisSignals = {
  asrText?: string
  ocrTokens?: string[]
  upstreamHints?: PerceptionPacket['objectHints']
}

export type LiveAnalysisPacketSummary = {
  asrText: string
  keyframeCount: number
  objectHintLabels: string[]
  ocrTokens: string[]
  sessionId: string
  tEndMs: number
  tStartMs: number
  uiElementLabels: string[]
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
