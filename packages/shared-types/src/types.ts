export type HazardType =
  | 'fire'
  | 'earthquake'
  | 'heavy_rain'
  | 'typhoon'
  | 'heatwave'
  | 'coldwave'
  | 'heavy_snow'
  | 'unknown'

export type CaptureSourceType =
  | 'monitor'
  | 'window'
  | 'browser_tab'
  | 'video_element'

export type SafetyMode = 'grounded' | 'review_official'

export type VoiceIntent = 'repeat' | 'easy' | 'why' | 'action' | 'report'

export type CapturePlatform = 'mac' | 'windows' | 'web'
export type CaptureSampleOrigin = 'browser' | 'native'

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

export type LearningSegmentStatus =
  | 'draft'
  | 'validated'
  | 'needs_review'
  | 'blocked'

export type LearningReadingLevel = 'very_easy' | 'easy' | 'standard'

export type LearningSegment = {
  segmentId: string
  sessionId: string
  sourceId: string
  hazard: HazardType
  phase: string
  decisionPoint: string
  startMs: number
  endMs: number
  confidence: number
  status: LearningSegmentStatus
}

export type LearningActionCard = {
  label: string
  order: number
  officialRuleIds: string[]
}

export type LearningTeachBackOptionRole = 'correct' | 'contrast'

export type LearningTeachBackOptionKind =
  | 'object'
  | 'person'
  | 'place'
  | 'signal'
  | 'state'

export type LearningTeachBackOption = {
  id: string
  label: string
  role: LearningTeachBackOptionRole
  kind: LearningTeachBackOptionKind
  feedback: string
  officialRuleIds?: string[]
  evidenceRefs: string[]
}

export type LearningTeachBack = {
  prompt: string
  correctOptionId: string
  options: LearningTeachBackOption[]
  reviewPrompt: string
}

export type LearningTrackSet = {
  easy: {
    text: string
    maxReadingLevel: LearningReadingLevel
  }
  action?: {
    cards: LearningActionCard[]
  }
  teachBack?: LearningTeachBack
  reason: {
    text: string
    officialRuleIds: string[]
  }
  doNot?: {
    text: string
    officialRuleIds: string[]
  }
  caregiver?: {
    script: string
    correctionHint: string
  }
  report?: {
    text: string
    emergencyNumbers: string[]
    condition: string
  }
}

export type OfficialSourceRecord = {
  sourceId: string
  kind: 'html' | 'pdf' | 'video' | 'video_transcript' | 'poster' | 'guidebook'
  title: string
  agency: string
  publisher: string
  canonicalUrl: string
  originalUrl?: string
  licenseLabel: string
  rightsNotes: string
  rawStoragePolicy: 'metadata_only' | 'local_manual_only' | 'cache_ignored'
  hazards: Array<Exclude<HazardType, 'unknown'>>
  retrievedAt: string
  updatedAt?: string
}

export type OfficialSourceChunk = {
  chunkId: string
  sourceId: string
  hazard: Exclude<HazardType, 'unknown'>
  phase: string
  ruleIds: string[]
  heading: string
  paraphraseKo: string
  easyKo: string
  keywords: string[]
  canonicalUrl: string
  sourceAnchor?: string
  audience: 'learner' | 'teacher' | 'caregiver' | 'operator'
  reviewStatus: 'approved' | 'needs_human_review'
  updatedAt: string
}

export type OfficialSourceMatch = {
  chunk: OfficialSourceChunk
  matchedRuleIds: string[]
  matchedKeywords: string[]
  score: number
}

export type OfficialRetrievalRequest = {
  hazard: HazardType
  phase?: string
  ruleIds?: string[]
  queryText?: string
  limit?: number
}

export type OfficialRetrievalResult = {
  matches: OfficialSourceMatch[]
}

export type EvidenceBundle = {
  visualEvidence: Array<{
    frameTimeMs: number
    observation: string
    bbox?: [number, number, number, number]
  }>
  ocrEvidence: Array<{
    text: string
    timeMs: number
    confidence: number
  }>
  asrEvidence: Array<{
    text: string
    startMs: number
    endMs: number
    confidence: number
  }>
  ruleEvidence: Array<{
    ruleId: string
    title: string
    matchedText: string
    sourceName: string
    sourceUrl?: string
    sourceChunkId?: string
    sourceHeading?: string
    easyText?: string
    retrievalScore?: number
  }>
  modelInference: Array<{
    claim: string
    basedOn: Array<'visual' | 'ocr' | 'asr' | 'rule'>
  }>
}

export type SuppressedCandidate = {
  candidate: string
  category:
    | 'unsafe_action'
    | 'unsupported_action'
    | 'too_many_actions'
    | 'unclear_evidence'
    | 'not_for_learner'
  reason: string
  evidenceRefs: string[]
}

export type StructuredLearningExplanation = {
  version: 'slowlearner_multitrack_v1'
  segment: LearningSegment
  tracks: LearningTrackSet
  evidence: EvidenceBundle
  suppressedCandidates: SuppressedCandidate[]
  validation: {
    schemaValid: boolean
    hasGroundedAction: boolean
    learnerSafe: boolean
    requiresHumanReview: boolean
    warnings: string[]
  }
}

export type LearningReviewSubmission = {
  reviewerId: string
  segmentId: string
  submittedAt: string
  lrsAnswers: Record<string, 'yes' | 'no' | 'na'>
  learnerSimulationNotes?: string
  blockedReason?: string
  approvedForLearner: boolean
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

export type CaptureFrameSample = {
  sessionId: string
  tsMs: number
  width: number
  height: number
  imageRef: string
  origin: CaptureSampleOrigin
}

export type CaptureAudioSample = {
  sessionId: string
  tsMs: number
  pcmRef: string
  sampleRate: number
  channels: number
  origin: CaptureSampleOrigin
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
