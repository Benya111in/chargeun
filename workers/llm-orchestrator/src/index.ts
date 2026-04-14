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
    doNot: primaryRule?.do_not,
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
