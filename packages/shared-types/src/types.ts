export type HazardType = 'fire' | 'earthquake' | 'unknown'

export type CaptureSourceType =
  | 'monitor'
  | 'window'
  | 'browser_tab'
  | 'video_element'

export type SafetyMode = 'grounded' | 'review_official'

export type VoiceIntent = 'repeat' | 'easy' | 'why' | 'action' | 'report'

export type CapturePlatform = 'mac' | 'windows' | 'web'

export type CaptureSession = {
  id: string
  sourceType: CaptureSourceType
  platform: CapturePlatform
  startedAt: number
  hasAudio: boolean
  displayName?: string
}

export type OverlayTarget = {
  label: string
  bbox: [number, number, number, number]
  frameRange: [number, number]
}

export type Segment = {
  id: string
  sessionId: string
  hazard: HazardType
  phase: string
  startMs: number
  endMs: number
  confidence: number
  officialRuleIds: string[]
}

export type TrackSet = {
  basic: string
  easy: string
  action?: string
  reason: string
  caregiver?: string
  report?: string
}

export type SegmentExplanation = {
  segmentId: string
  safetyMode: SafetyMode
  doNot?: string
  tracks: TrackSet
  overlayTargets: OverlayTarget[]
}

export type PerceptionPacket = {
  sessionId: string
  tStartMs: number
  tEndMs: number
  asrText: string
  ocrTokens: string[]
  uiElements: Array<{ label: string; bbox: number[]; conf: number }>
  objectHints: Array<{ label: string; bbox: number[]; conf: number }>
  keyframes: string[]
}

export type RuleRecord = {
  rule_id: string
  hazard: Exclude<HazardType, 'unknown'>
  phase: string
  when: string[]
  action: string
  do_not?: string
  why: string
  caregiver?: string
  report_script?: string
  source_title: string
  source_url: string
  updated_at: string
}

export type MacCaptureEvent =
  | {
      type: 'session-started'
      sessionId: string
      width: number
      height: number
      hasAudio: boolean
    }
  | {
      type: 'frame'
      sessionId: string
      tsMs: number
      width: number
      height: number
      pixelBufferRef: string
    }
  | {
      type: 'audio'
      sessionId: string
      tsMs: number
      pcmRef: string
      sampleRate: number
      channels: number
    }
  | {
      type: 'error'
      sessionId: string
      code: string
      message: string
    }
  | {
      type: 'session-stopped'
      sessionId: string
    }

export type VoiceReply = {
  text: string
  audioRef?: string
}
