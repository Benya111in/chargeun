import {
  segmentExplanationSchema,
  type RuleRecord,
  type Segment,
  type SegmentExplanation,
  type VoiceIntent,
  type VoiceReply,
} from '@ansimtrack/shared-types'

const lowConfidenceThreshold = 0.72

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

export const buildVoiceReply = (input: {
  explanation: SegmentExplanation
  intent: VoiceIntent
}): VoiceReply => {
  const { explanation, intent } = input

  const text = selectIntentText(explanation, intent)
  return { text }
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
