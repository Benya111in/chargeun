import type { TheaterSegment } from './demo-theater-content'

export type LearnerActionCard = {
  label: string
  officialRuleIds: string[]
  order: number
}

export function getLearnerActionCards(
  segment: TheaterSegment,
): LearnerActionCard[] {
  const structured = segment.structuredExplanation

  if (
    structured.segment.status !== 'validated' ||
    structured.validation.requiresHumanReview ||
    !structured.validation.learnerSafe ||
    !structured.validation.hasGroundedAction
  ) {
    return []
  }

  return (structured.tracks.action?.cards ?? []).slice(0, 3)
}
