import {
  segmentExplanationSchema,
  structuredLearningExplanationSchema,
  type PerceptionPacket,
  type RuleRecord,
  type Segment,
  type SegmentExplanation,
  type StructuredLearningExplanation,
  type SuppressedCandidate,
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

export type BuildStructuredLearningExplanationInput = {
  decisionPoint?: string
  evidence: PerceptionPacket
  explanation?: SegmentExplanation
  ruleMatches?: GroundedRuleMatch[]
  rules: RuleRecord[]
  segment: Segment
  sourceId?: string
  teacherGuide?: {
    correctionHint?: string
    script?: string
  }
}

export const validateLearningExplanation = (input: unknown) =>
  structuredLearningExplanationSchema.safeParse(input)

export const buildStructuredLearningExplanation = (
  input: BuildStructuredLearningExplanationInput,
): StructuredLearningExplanation => {
  const ruleMatches =
    input.ruleMatches ??
    matchGroundedRules({
      evidence: input.evidence,
      rules: input.rules,
      segment: input.segment,
    })
  const groundedRules = selectGroundedActionRules({
    ruleMatches,
    segment: input.segment,
  })
  const status = getLearningSegmentStatus({
    groundedRules,
    segment: input.segment,
  })
  const legacyExplanation =
    input.explanation ??
    buildGroundedExplanation({
      evidence: input.evidence,
      rules: input.rules,
      segment: input.segment,
    })
  const primaryRule = groundedRules[0]
  const actionCards =
    status === 'validated'
      ? groundedRules.slice(0, 3).map((rule, index) => ({
          label: toLearnerActionLabel(rule.action),
          officialRuleIds: [rule.rule_id],
          order: index + 1,
        }))
      : undefined
  const hasGroundedAction = Boolean(actionCards?.length)
  const requiresHumanReview = status !== 'validated'
  const structured: StructuredLearningExplanation = {
    version: 'slowlearner_multitrack_v1',
    segment: {
      confidence: input.segment.confidence,
      decisionPoint:
        input.decisionPoint ??
        buildDecisionPoint(primaryRule, input.segment.hazard),
      endMs: input.segment.endMs,
      hazard: input.segment.hazard,
      phase: input.segment.phase,
      segmentId: input.segment.id,
      sessionId: input.segment.sessionId,
      sourceId: input.sourceId ?? input.evidence.sessionId,
      startMs: input.segment.startMs,
      status,
    },
    tracks: {
      easy: {
        maxReadingLevel: 'very_easy',
        text: limitText(legacyExplanation.tracks.easy, 140),
      },
      ...(actionCards
        ? {
            action: {
              cards: actionCards,
            },
          }
        : {}),
      reason: {
        officialRuleIds: groundedRules.map((rule) => rule.rule_id),
        text: limitText(legacyExplanation.tracks.reason, 180),
      },
      ...(status === 'validated' && primaryRule?.do_not
        ? {
            doNot: {
              officialRuleIds: [primaryRule.rule_id],
              text: limitText(primaryRule.do_not, 180),
            },
          }
        : {}),
      ...(primaryRule?.caregiver || input.teacherGuide?.script
        ? {
            caregiver: {
              correctionHint:
                input.teacherGuide?.correctionHint ??
                primaryRule?.caregiver ??
                '오답이 나오면 장면을 다시 보고 쉬운말로 한 번 더 확인합니다.',
              script:
                input.teacherGuide?.script ??
                primaryRule?.caregiver ??
                '장면을 짧게 멈추고 행동 카드를 함께 확인합니다.',
            },
          }
        : {}),
      ...(status === 'validated' && primaryRule?.report_script
        ? {
            report: {
              condition: '실제 위험하거나 도움이 필요할 때',
              emergencyNumbers: ['119', '112'],
              text: limitText(primaryRule.report_script, 180),
            },
          }
        : {}),
    },
    evidence: buildEvidenceBundle({
      packet: input.evidence,
      ruleMatches,
    }),
    suppressedCandidates: buildSuppressedCandidates({
      actionRuleIds: groundedRules.map((rule) => rule.rule_id),
      evidence: input.evidence,
      ruleMatches,
      segment: input.segment,
    }),
    validation: {
      hasGroundedAction,
      learnerSafe: status === 'validated',
      requiresHumanReview,
      schemaValid: true,
      warnings:
        status === 'validated'
          ? []
          : ['공식 근거가 충분하지 않아 학습자 행동 카드를 숨깁니다.'],
    },
  }

  return structuredLearningExplanationSchema.parse(structured)
}

export const toLegacySegmentExplanation = (
  structured: StructuredLearningExplanation,
): SegmentExplanation => {
  const canExposeAction =
    structured.segment.status === 'validated' &&
    Boolean(structured.tracks.action?.cards.length)

  return segmentExplanationSchema.parse({
    segmentId: structured.segment.segmentId,
    safetyMode: canExposeAction ? 'grounded' : 'review_official',
    doNot: canExposeAction ? structured.tracks.doNot?.text : undefined,
    tracks: {
      basic: structured.tracks.easy.text,
      easy: structured.tracks.easy.text,
      action: canExposeAction
        ? structured.tracks.action?.cards.map((card) => card.label).join('. ')
        : undefined,
      reason: structured.tracks.reason.text,
      caregiver: structured.tracks.caregiver?.script,
      report: canExposeAction ? structured.tracks.report?.text : undefined,
    },
    overlayTargets: structured.evidence.visualEvidence
      .slice(0, 8)
      .map((item) => ({
        bbox: item.bbox ?? [0.08, 0.08, 0.2, 0.12],
        frameRange: [structured.segment.startMs, structured.segment.endMs] as [
          number,
          number,
        ],
        label: item.observation,
      })),
  })
}

export const buildSuppressedCandidates = (input: {
  actionRuleIds: string[]
  evidence: MatchableEvidence
  ruleMatches: GroundedRuleMatch[]
  segment: Pick<Segment, 'hazard'>
}): SuppressedCandidate[] => {
  const candidates: SuppressedCandidate[] = []
  const actionRuleIds = new Set(input.actionRuleIds)

  for (const [index, match] of input.ruleMatches.entries()) {
    const rule = match.rule

    if (rule.do_not) {
      candidates.push({
        candidate: rule.do_not,
        category: 'unsafe_action',
        evidenceRefs: [rule.rule_id],
        reason:
          '공식 행동요령의 금지 또는 주의 문장이므로 행동 카드에서 제외합니다.',
      })
    }

    if (index >= 3) {
      candidates.push({
        candidate: rule.action,
        category: 'too_many_actions',
        evidenceRefs: [rule.rule_id],
        reason: '한 세그먼트에는 최대 3개 행동 카드만 보여 줍니다.',
      })
    } else if (!actionRuleIds.has(rule.rule_id)) {
      candidates.push({
        candidate: rule.action,
        category: 'unsupported_action',
        evidenceRefs: [rule.rule_id],
        reason: '현재 세그먼트의 핵심 판단 지점으로 선택되지 않았습니다.',
      })
    }
  }

  const evidenceTokens = Array.from(collectEvidenceTokens(input.evidence))

  if (
    input.segment.hazard === 'fire' &&
    hasAnyToken(evidenceTokens, ['엘리베이터', 'elevator'])
  ) {
    candidates.push({
      candidate: '엘리베이터 타기',
      category: 'unsafe_action',
      evidenceRefs: ['KR_FIRE_03'],
      reason: '화재 상황에서는 엘리베이터 이용이 공식 행동요령과 충돌합니다.',
    })
  }

  if (hasAnyToken(evidenceTokens, ['뛰기', '뛰어', '달리기'])) {
    candidates.push({
      candidate: '뛰어서 이동하기',
      category: 'not_for_learner',
      evidenceRefs: [],
      reason:
        '따라 하라고 지시하지 않고 천천히 안전하게 이동하도록 교정합니다.',
    })
  }

  if (input.ruleMatches.length === 0 && evidenceTokens.length > 0) {
    candidates.push({
      candidate: evidenceTokens.slice(0, 3).join(', '),
      category: 'unclear_evidence',
      evidenceRefs: [],
      reason: '화면 단서는 있지만 공식 행동 카드로 연결할 근거가 부족합니다.',
    })
  }

  return dedupeSuppressedCandidates(candidates)
}

function selectGroundedActionRules(input: {
  ruleMatches: GroundedRuleMatch[]
  segment: Pick<Segment, 'officialRuleIds'>
}) {
  const segmentRuleIds = new Set(input.segment.officialRuleIds)

  if (segmentRuleIds.size === 0) {
    return input.ruleMatches.map((match) => match.rule)
  }

  return input.ruleMatches
    .filter((match) => segmentRuleIds.has(match.rule.rule_id))
    .map((match) => match.rule)
}

function getLearningSegmentStatus(input: {
  groundedRules: RuleRecord[]
  segment: Pick<Segment, 'confidence' | 'hazard'>
}): StructuredLearningExplanation['segment']['status'] {
  if (input.segment.hazard === 'unknown') {
    return 'needs_review'
  }

  if (
    input.groundedRules.length === 0 ||
    input.segment.confidence < lowConfidenceThreshold
  ) {
    return 'needs_review'
  }

  return 'validated'
}

function buildEvidenceBundle(input: {
  packet: PerceptionPacket
  ruleMatches: GroundedRuleMatch[]
}): StructuredLearningExplanation['evidence'] {
  const basedOn: Array<'visual' | 'ocr' | 'asr' | 'rule'> = []

  if (input.packet.objectHints.length > 0) {
    basedOn.push('visual')
  }

  if (input.packet.ocrTokens.length > 0 || input.packet.uiElements.length > 0) {
    basedOn.push('ocr')
  }

  if (input.packet.asrText.trim()) {
    basedOn.push('asr')
  }

  if (input.ruleMatches.length > 0) {
    basedOn.push('rule')
  }

  return {
    visualEvidence: input.packet.objectHints.map((hint) => ({
      bbox: toNormalizedBbox(hint.bbox),
      frameTimeMs: input.packet.tStartMs,
      observation: hint.label,
    })),
    ocrEvidence: [
      ...input.packet.ocrTokens.map((text) => ({
        confidence: 0.7,
        text,
        timeMs: input.packet.tStartMs,
      })),
      ...input.packet.uiElements.map((element) => ({
        confidence: element.conf,
        text: element.label,
        timeMs: input.packet.tStartMs,
      })),
    ],
    asrEvidence: input.packet.asrText.trim()
      ? [
          {
            confidence: 0.72,
            endMs: input.packet.tEndMs,
            startMs: input.packet.tStartMs,
            text: input.packet.asrText.trim(),
          },
        ]
      : [],
    ruleEvidence: input.ruleMatches.map((match) => ({
      matchedText: match.rule.action,
      ruleId: match.rule.rule_id,
      sourceName: match.rule.source_title,
      title: match.rule.phase,
    })),
    modelInference:
      input.ruleMatches.length > 0 && basedOn.length > 0
        ? [
            {
              basedOn,
              claim: `현재 세그먼트는 ${input.ruleMatches[0].rule.rule_id} 공식 규칙과 연결됩니다.`,
            },
          ]
        : [],
  }
}

function buildDecisionPoint(
  rule: RuleRecord | undefined,
  hazard: Segment['hazard'],
) {
  if (!rule) {
    return hazard === 'unknown'
      ? '공식 안내를 더 확인해야 하는가'
      : '지금 행동 카드를 보여도 되는가'
  }

  return `${toLearnerActionLabel(rule.action).replace(/[.!?。]+$/u, '')}?`
}

function toLearnerActionLabel(action: string) {
  if (action.includes('출입문') || action.includes('문을 닫')) {
    return '문을 닫아요'
  }

  if (action.includes('계단')) {
    return '계단으로 가요'
  }

  if (action.includes('탁자')) {
    return '탁자 아래로 들어가요'
  }

  if (action.includes('머리') || action.includes('몸을 보호')) {
    return '머리를 보호해요'
  }

  if (action.includes('대피공간') || action.includes('피난')) {
    return '대피공간으로 가요'
  }

  if (action.includes('가스') || action.includes('전깃불')) {
    return '가스와 전기를 확인해요'
  }

  return (
    simplify(action).split(/[.。]/u)[0]?.slice(0, 24) || action.slice(0, 24)
  )
}

function toNormalizedBbox(bbox: number[]): [number, number, number, number] {
  return [
    clampNumber(bbox[0] ?? 0.08, 0, 1),
    clampNumber(bbox[1] ?? 0.08, 0, 1),
    clampNumber(bbox[2] ?? 0.2, 0.01, 1),
    clampNumber(bbox[3] ?? 0.12, 0.01, 1),
  ]
}

function dedupeSuppressedCandidates(candidates: SuppressedCandidate[]) {
  const seen = new Set<string>()

  return candidates.filter((candidate) => {
    const key = `${candidate.category}:${candidate.candidate}`

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export const buildExplanation = (input: {
  segment: Segment
  matchedRules: RuleRecord[]
  overlayTargets?: SegmentExplanation['overlayTargets']
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
        : '지금은 확실히 말하기 어려워요.',
      easy: primaryRule
        ? simplify(primaryRule.action)
        : '잠깐 멈추고 주변 어른이나 공식 안내를 확인해요.',
      action: reviewMode ? undefined : primaryRule.action,
      reason: primaryRule?.why ?? '잘못 말하지 않기 위해 한 번 더 확인해요.',
      caregiver: primaryRule?.caregiver,
      report: reviewMode ? undefined : primaryRule?.report_script,
    },
    overlayTargets: input.overlayTargets ?? [],
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
    overlayTargets: buildOverlayTargets(input.evidence, input.segment),
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

const buildOverlayTargets = (
  evidence: MatchableEvidence,
  segment: Segment,
): SegmentExplanation['overlayTargets'] => {
  const targets = [
    ...evidence.objectHints.map((item) => ({
      bbox: toBboxTuple(item.bbox),
      label: item.label,
    })),
    ...evidence.uiElements.map((item) => ({
      bbox: toBboxTuple(item.bbox),
      label: item.label,
    })),
    ...evidence.ocrTokens.map((label, index) => ({
      bbox: [index * 2, 0, 1, 1] as [number, number, number, number],
      label,
    })),
  ]

  const seen = new Set<string>()
  return targets
    .filter((target) => {
      if (seen.has(target.label)) {
        return false
      }

      seen.add(target.label)
      return true
    })
    .slice(0, 8)
    .map((target) => ({
      ...target,
      frameRange: [segment.startMs, segment.endMs] as [number, number],
    }))
}

const toBboxTuple = (bbox: number[]): [number, number, number, number] => [
  bbox[0] ?? 0,
  bbox[1] ?? 0,
  Math.max(1, bbox[2] ?? 1),
  Math.max(1, bbox[3] ?? 1),
]

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

  const officialRuleIds = matches.slice(0, 1).map((match) => match.rule.rule_id)
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

  if (
    input.rule.rule_id === 'KR_EQ_03' &&
    hasAnyToken(Array.from(input.evidenceTokens), ['탁자', '책상'])
  ) {
    score += 0.7
    matchedSignals.push('evidence:탁자')
  }

  if (
    input.rule.rule_id === 'KR_EQ_04' &&
    hasAnyToken(Array.from(input.evidenceTokens), ['탁자', '책상']) &&
    !hasAnyToken(Array.from(input.evidenceTokens), [
      '방석',
      '가방',
      '없음',
      '없으면',
      '없어서',
    ])
  ) {
    score -= 1.2
  }

  return {
    matchedSignals,
    rule: input.rule,
    score,
  }
}

const hasGroundingEvidence = (candidate: GroundedRuleMatch) =>
  candidate.matchedSignals.some(
    (signal) => signal.startsWith('when:') || signal.startsWith('evidence:'),
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
  const evidence = Array.from(evidenceTokens)

  for (const text of texts) {
    for (const token of tokenize(text)) {
      if (
        evidenceTokens.has(token) ||
        evidence.some(
          (evidenceToken) =>
            evidenceToken.includes(token) || token.includes(evidenceToken),
        )
      ) {
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

const limitText = (text: string, maxLength: number) =>
  text.length <= maxLength
    ? text
    : `${text.slice(0, Math.max(1, maxLength - 1))}…`

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

  if (hasAnyToken(tokens, ['현관문', '문닫', '닫고'])) {
    return 'door_control'
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

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const clampConfidence = (value: number) => Math.min(0.99, Math.max(0, value))
