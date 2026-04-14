import {
  segmentExplanationSchema,
  type PerceptionPacket,
  type RuleRecord,
  type Segment,
  type SegmentExplanation,
  type VoiceIntent,
  type VoiceReply,
} from '@ansimtrack/shared-types'

const lowConfidenceThreshold = 0.72
const defaultRuleMatchLimit = 3
const defaultRuleMatchThreshold = 4.2
const fireCueWeights = {
  '119': 1.6,
  경보: 1.7,
  계단: 1.4,
  대피: 1.3,
  문손잡이: 1.5,
  복도: 1.1,
  불꽃: 2.4,
  비상구: 1.7,
  연기: 2.2,
  출구: 1.3,
  화염: 2.4,
  화재: 2.5,
} as const
const earthquakeCueWeights = {
  가스: 1.4,
  머리보호: 1.9,
  문열기: 1.3,
  밖으로: 1.1,
  여진: 1.8,
  전기: 1.2,
  지진: 2.5,
  출구: 1.2,
  탁자: 2.2,
  파편: 1.4,
  흔들: 2.3,
  흔들림: 2.4,
} as const
const stopKeywords = new Set([
  '합니다',
  '하세요',
  '합니다',
  '있음',
  '필요',
  '위해',
  '현재',
  '가장',
  '먼저',
  '같이',
  '함께',
  '즉시',
  '안전',
  '위험',
  '대피',
  '행동',
])

type MatchableSegment = Pick<
  Segment,
  'confidence' | 'hazard' | 'officialRuleIds' | 'phase'
>

type MatchableEvidence = Pick<
  PerceptionPacket,
  'asrText' | 'objectHints' | 'ocrTokens' | 'uiElements'
>

export type GroundedRuleMatch = {
  matchedSignals: string[]
  rule: RuleRecord
  score: number
}

export type HazardClassification = {
  confidence: number
  hazard: Segment['hazard']
  phase: string
  signals: string[]
}

export type SafetyGuardrailResult = {
  explanation: SegmentExplanation
  warnings: string[]
}

export const buildExplanation = (input: {
  segment: Segment
  matchedRules: RuleRecord[]
}): SegmentExplanation => {
  const primaryRule = input.matchedRules[0]
  const reviewMode =
    input.segment.confidence < lowConfidenceThreshold || !primaryRule

  const explanation: SegmentExplanation = {
    segmentId: input.segment.id,
    safetyMode: reviewMode ? 'review_official' : 'grounded',
    doNot: reviewMode ? undefined : primaryRule?.do_not,
    tracks: {
      basic: primaryRule
        ? `${humanizeHazard(input.segment.hazard)} 상황으로 보입니다.`
        : '현재 장면의 공식 행동요령을 먼저 확인해 주세요.',
      easy: primaryRule
        ? simplify(primaryRule.action)
        : '아직 근거가 부족해서 공식 안내를 먼저 보여 드릴게요.',
      action: reviewMode ? undefined : primaryRule.action,
      reason: primaryRule?.why ?? '행동 근거를 다시 확인하는 편이 안전합니다.',
      caregiver: primaryRule?.caregiver,
      report: reviewMode ? undefined : primaryRule?.report_script,
    },
    overlayTargets: [],
  }

  return segmentExplanationSchema.parse(explanation)
}

export const buildGroundedExplanation = (input: {
  evidence: MatchableEvidence
  previousRuleIds?: string[]
  rules: RuleRecord[]
  segment: Segment
}): SegmentExplanation => {
  const matchedRules = matchGroundedRules({
    evidence: input.evidence,
    previousRuleIds: input.previousRuleIds,
    rules: input.rules,
    segment: input.segment,
  }).map((candidate) => candidate.rule)

  return buildExplanation({
    segment: {
      ...input.segment,
      officialRuleIds:
        input.segment.officialRuleIds.length > 0
          ? input.segment.officialRuleIds
          : matchedRules.map((rule) => rule.rule_id),
    },
    matchedRules,
  })
}

export const applySafetyGuardrails = (input: {
  evidenceVisible: boolean
  explanation: SegmentExplanation
  panicMode: boolean
  privacyConsent: boolean
  segment: Pick<Segment, 'confidence' | 'officialRuleIds'>
}): SafetyGuardrailResult => {
  const warnings = new Set<string>()
  let nextExplanation: SegmentExplanation = {
    ...input.explanation,
    tracks: {
      ...input.explanation.tracks,
    },
  }

  const downgradeToReview = () => {
    nextExplanation = {
      ...nextExplanation,
      safetyMode: 'review_official',
      doNot: undefined,
      tracks: {
        ...nextExplanation.tracks,
        action: undefined,
        report: undefined,
      },
    }
  }

  const hideActionTracks = () => {
    nextExplanation = {
      ...nextExplanation,
      tracks: {
        ...nextExplanation.tracks,
        action: undefined,
        report: undefined,
      },
    }
  }

  if (!input.privacyConsent) {
    warnings.add('캡처 동의가 확인되기 전에는 행동 트랙을 잠급니다.')
    downgradeToReview()
  }

  if (input.segment.officialRuleIds.length === 0) {
    warnings.add('공식 rule id가 없어 공식 원문 확인을 먼저 안내합니다.')
    downgradeToReview()
  }

  if (
    input.explanation.safetyMode === 'review_official' ||
    input.segment.confidence < lowConfidenceThreshold
  ) {
    warnings.add('확신이 낮아 공식 행동요령 확인을 우선합니다.')
    downgradeToReview()
  }

  if (!input.evidenceVisible) {
    warnings.add('근거 패널을 열어야 action과 report 트랙을 볼 수 있습니다.')
    hideActionTracks()
  }

  if (input.panicMode && nextExplanation.safetyMode === 'review_official') {
    warnings.add('Panic Mode에서도 행동 확정보다 공식 확인을 먼저 안내합니다.')
  }

  return {
    explanation: segmentExplanationSchema.parse(nextExplanation),
    warnings: Array.from(warnings),
  }
}

export const classifyHazard = (
  packet: MatchableEvidence,
): HazardClassification => {
  const tokens = Array.from(collectEvidenceTokens(packet))
  const fireScore = scoreCueSet(tokens, fireCueWeights)
  const earthquakeScore = scoreCueSet(tokens, earthquakeCueWeights)
  const strongestScore = Math.max(fireScore, earthquakeScore)
  const delta = Math.abs(fireScore - earthquakeScore)

  if (strongestScore < 2.8 || delta < 0.7) {
    return {
      confidence: Math.min(0.69, 0.45 + strongestScore * 0.05),
      hazard: 'unknown',
      phase: 'review_official',
      signals: [],
    }
  }

  if (fireScore > earthquakeScore) {
    return {
      confidence: clampConfidence(0.58 + fireScore * 0.08 + delta * 0.03),
      hazard: 'fire',
      phase: classifyFirePhase(tokens),
      signals: collectCueSignals(tokens, fireCueWeights),
    }
  }

  return {
    confidence: clampConfidence(0.58 + earthquakeScore * 0.08 + delta * 0.03),
    hazard: 'earthquake',
    phase: classifyEarthquakePhase(tokens),
    signals: collectCueSignals(tokens, earthquakeCueWeights),
  }
}

export const detectSegmentBoundary = (input: {
  next: Pick<Segment, 'endMs' | 'hazard' | 'phase' | 'startMs'>
  previous?: Pick<Segment, 'endMs' | 'hazard' | 'phase'> | null
}) => {
  const previous = input.previous
  if (!previous) {
    return true
  }

  if (previous.hazard !== input.next.hazard) {
    return true
  }

  if (previous.phase !== input.next.phase) {
    return true
  }

  return input.next.startMs - previous.endMs > 1_500
}

export const buildSegmentFromPerception = (input: {
  packet: PerceptionPacket
  previousRuleIds?: string[]
  previousSegment?: Segment | null
  rules: RuleRecord[]
}): Segment => {
  const classification = classifyHazard(input.packet)
  const provisionalSegment: Segment = {
    id: `seg-${input.packet.sessionId}-${input.packet.tStartMs}`,
    sessionId: input.packet.sessionId,
    hazard: classification.hazard,
    phase: classification.phase,
    startMs: input.packet.tStartMs,
    endMs: input.packet.tEndMs,
    confidence: classification.confidence,
    officialRuleIds: [],
  }

  if (classification.hazard === 'unknown') {
    return provisionalSegment
  }

  const matches = matchGroundedRules({
    evidence: input.packet,
    previousRuleIds: input.previousRuleIds,
    rules: input.rules,
    segment: provisionalSegment,
  })

  const officialRuleIds = matches.map((match) => match.rule.rule_id)
  const boundary = detectSegmentBoundary({
    next: provisionalSegment,
    previous: input.previousSegment,
  })

  return {
    ...provisionalSegment,
    confidence:
      officialRuleIds.length > 0
        ? provisionalSegment.confidence
        : Math.min(
            provisionalSegment.confidence,
            lowConfidenceThreshold - 0.01,
          ),
    id: boundary
      ? provisionalSegment.id
      : (input.previousSegment?.id ?? provisionalSegment.id),
    officialRuleIds,
    startMs: boundary
      ? provisionalSegment.startMs
      : (input.previousSegment?.startMs ?? provisionalSegment.startMs),
  }
}

export const matchGroundedRules = (input: {
  evidence: MatchableEvidence
  limit?: number
  minScore?: number
  previousRuleIds?: string[]
  rules: RuleRecord[]
  segment: MatchableSegment
}): GroundedRuleMatch[] => {
  if (input.segment.hazard === 'unknown') {
    return []
  }

  const evidenceTokens = collectEvidenceTokens(input.evidence)
  const candidates = input.rules
    .filter((rule) => rule.hazard === input.segment.hazard)
    .map((rule) =>
      scoreGroundedRule({
        evidenceTokens,
        previousRuleIds: input.previousRuleIds ?? [],
        rule,
        segment: input.segment,
      }),
    )
    .filter(hasGroundingEvidence)
    .filter(
      (candidate) =>
        candidate.score >= (input.minScore ?? defaultRuleMatchThreshold),
    )
    .sort((left, right) => right.score - left.score)

  return candidates.slice(0, input.limit ?? defaultRuleMatchLimit)
}

export const buildVoiceReply = (input: {
  explanation: SegmentExplanation
  intent: VoiceIntent
}): VoiceReply => {
  const { explanation, intent } = input

  const text = selectIntentText(explanation, intent)
  return { text }
}

const scoreGroundedRule = (input: {
  evidenceTokens: Set<string>
  previousRuleIds: string[]
  rule: RuleRecord
  segment: MatchableSegment
}): GroundedRuleMatch => {
  const matchedSignals: string[] = []
  let score = 2

  if (input.segment.officialRuleIds.includes(input.rule.rule_id)) {
    score += 1.6
    matchedSignals.push(`segment:${input.rule.rule_id}`)
  }

  const phaseScore = scorePhase(input.segment.phase, input.rule.phase)
  if (phaseScore > 0) {
    score += phaseScore
    matchedSignals.push(`phase:${input.rule.phase}`)
  }

  const whenMatches = matchTokens(input.rule.when, input.evidenceTokens)
  if (whenMatches.length > 0) {
    score += Math.min(3.2, whenMatches.length * 0.85)
    matchedSignals.push(...whenMatches.map((token) => `when:${token}`))
  }

  const actionMatches = matchTokens(
    [input.rule.action, input.rule.do_not, input.rule.why]
      .filter(Boolean)
      .map(String),
    input.evidenceTokens,
  )
  if (actionMatches.length > 0) {
    score += Math.min(1.8, actionMatches.length * 0.35)
    matchedSignals.push(...actionMatches.map((token) => `evidence:${token}`))
  }

  if (input.previousRuleIds.includes(input.rule.rule_id)) {
    score += 0.8
    matchedSignals.push(`continuity:${input.rule.rule_id}`)
  }

  return {
    matchedSignals,
    rule: input.rule,
    score,
  }
}

const hasGroundingEvidence = (candidate: GroundedRuleMatch) =>
  candidate.matchedSignals.some(
    (signal) =>
      signal.startsWith('when:') ||
      signal.startsWith('evidence:') ||
      signal.startsWith('segment:') ||
      signal.startsWith('continuity:'),
  )

const collectEvidenceTokens = (evidence: MatchableEvidence) => {
  const tokens = new Set<string>()

  for (const source of [
    evidence.asrText,
    ...evidence.ocrTokens,
    ...evidence.uiElements.map((item) => item.label),
    ...evidence.objectHints.map((item) => item.label),
  ]) {
    for (const token of tokenize(source)) {
      tokens.add(token)
    }
  }

  return tokens
}

const matchTokens = (texts: string[], evidenceTokens: Set<string>) => {
  const matches = new Set<string>()

  for (const text of texts) {
    for (const token of tokenize(text)) {
      if (evidenceTokens.has(token)) {
        matches.add(token)
      }
    }
  }

  return Array.from(matches)
}

const scorePhase = (segmentPhase: string, rulePhase: string) => {
  if (segmentPhase === rulePhase) {
    return 3.5
  }

  if (expandPhaseAliases(segmentPhase).includes(rulePhase)) {
    return 2.2
  }

  return 0
}

const expandPhaseAliases = (phase: string) => {
  const aliases = new Set([phase])

  switch (phase) {
    case 'protect':
      aliases.add('during_shaking')
      break
    case 'during_shaking':
      aliases.add('protect')
      break
    case 'route_selection':
      aliases.add('stair_evacuation')
      aliases.add('door_control')
      aliases.add('refuge_space')
      break
    case 'stair_evacuation':
      aliases.add('route_selection')
      break
    case 'door_control':
      aliases.add('route_selection')
      break
    case 'after_shaking':
      aliases.add('after_shaking')
      aliases.add('evacuation')
      break
    default:
      break
  }

  return Array.from(aliases)
}

const selectIntentText = (
  explanation: SegmentExplanation,
  intent: VoiceIntent,
) => {
  switch (intent) {
    case 'repeat':
      return explanation.tracks.basic
    case 'easy':
      return explanation.tracks.easy
    case 'why':
      return explanation.tracks.reason
    case 'action':
      return (
        explanation.tracks.action ??
        '지금은 공식 행동요령을 먼저 확인해 주세요.'
      )
    case 'report':
      return (
        explanation.tracks.report ??
        '근거가 충분하지 않아 신고 문장을 바로 안내하지 않습니다.'
      )
  }
}

const humanizeHazard = (hazard: Segment['hazard']) => {
  switch (hazard) {
    case 'fire':
      return '화재'
    case 'earthquake':
      return '지진'
    default:
      return '재난'
  }
}

const simplify = (text: string) =>
  text.replaceAll('합니다.', '하세요.').replaceAll('하십시오.', '하세요.')

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .split(/[^0-9a-z가-힣]+/i)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 2 && !stopKeywords.has(token) && !/^\d+$/.test(token),
    )

const scoreCueSet = (tokens: string[], cueWeights: Record<string, number>) =>
  Object.entries(cueWeights).reduce((score, [cue, weight]) => {
    if (tokens.some((token) => token.includes(cue))) {
      return score + weight
    }

    return score
  }, 0)

const collectCueSignals = (
  tokens: string[],
  cueWeights: Record<string, number>,
) =>
  Object.keys(cueWeights).filter((cue) =>
    tokens.some((token) => token.includes(cue)),
  )

const classifyFirePhase = (tokens: string[]) => {
  if (hasAnyToken(tokens, ['119', '신고'])) {
    return 'report'
  }

  if (hasAnyToken(tokens, ['손잡이', '문손잡이', '뜨거운문'])) {
    return 'door_assessment'
  }

  if (hasAnyToken(tokens, ['계단', '비상구', '출구', '복도', '문닫', '닫고'])) {
    return 'route_selection'
  }

  if (hasAnyToken(tokens, ['경보', '연기', '불꽃', '화염', '화재'])) {
    return 'alert_and_wake'
  }

  return 'route_selection'
}

const classifyEarthquakePhase = (tokens: string[]) => {
  if (hasAnyToken(tokens, ['119', '신고'])) {
    return 'report'
  }

  if (hasAnyToken(tokens, ['가스', '전기', '문열', '출구'])) {
    return 'after_shaking'
  }

  if (hasAnyToken(tokens, ['탁자', '흔들', '머리보호', '방석'])) {
    return 'protect'
  }

  if (hasAnyToken(tokens, ['대피소', '신발', '밖으로'])) {
    return 'evacuation'
  }

  return 'protect'
}

const hasAnyToken = (tokens: string[], candidates: string[]) =>
  candidates.some((candidate) =>
    tokens.some((token) => token.includes(candidate)),
  )

const clampConfidence = (value: number) => Math.min(0.99, Math.max(0, value))
