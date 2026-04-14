import type {
  CaptureSession,
  Segment,
  SegmentExplanation,
} from '@ansimtrack/shared-types'

export type SessionLogEntryPayload = {
  endedAt?: number
  selectedSourceId?: string | null
  selectedTrack?: string | null
  session: CaptureSession
  voiceEnabled?: boolean
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

export type LiveAnalysisPlanSummary = {
  fps: number
  holdMs: number
  mode: string
  reason: string
}

export type LiveAnalysisSnapshotInput = {
  createdAt: number
  explanation: SegmentExplanation
  packetSummary: LiveAnalysisPacketSummary
  plan: LiveAnalysisPlanSummary
  segment: Segment
  session: SessionLogEntryPayload
  sourceId?: string | null
}
