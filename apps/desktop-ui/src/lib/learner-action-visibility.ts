import type { TheaterSegment } from './demo-theater-content'

export type LearnerActionCard = {
  label: string
  officialRuleIds: string[]
  order: number
  reason?: string
}

export function getLearnerActionCards(
  segment: TheaterSegment,
): LearnerActionCard[] {
  if (segment.practiceMode !== 'action') {
    return []
  }

  const structured = segment.structuredExplanation

  if (
    structured.segment.status !== 'validated' ||
    structured.validation.requiresHumanReview ||
    !structured.validation.learnerSafe ||
    !structured.validation.hasGroundedAction
  ) {
    return []
  }

  return (structured.tracks.action?.cards ?? []).slice(0, 3).map((card) => ({
    ...card,
    reason: segment.actionReasons[card.order - 1],
  }))
}
