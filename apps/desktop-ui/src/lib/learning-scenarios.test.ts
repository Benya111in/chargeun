import { describe, expect, it } from 'vitest'

import { structuredLearningExplanationSchema } from '@ansimtrack/shared-types'

import { learningScenarios } from './demo-theater-content'

describe('learningScenarios', () => {
  it('keeps every segment ready for learner practice and teacher guidance', () => {
    expect(learningScenarios.length).toBeGreaterThan(0)

    for (const scenario of learningScenarios) {
      expect(scenario.segments.length).toBeGreaterThan(0)

      for (const segment of scenario.segments) {
        expect(segment.learnerExplanation).toBeTruthy()
        expect(segment.learnerExplanation.length).toBeLessThanOrEqual(35)
        expect(segment.learnerPrompt).toBeTruthy()
        expect(segment.actionSteps.length).toBeGreaterThanOrEqual(1)
        expect(segment.actionSteps.length).toBeLessThanOrEqual(3)
        expect(segment.checkQuestion).toBeTruthy()
        expect(segment.answerOptions.length).toBeGreaterThanOrEqual(2)
        expect(
          segment.answerOptions.some((option) => option.correct),
        ).toBeTruthy()
        expect(segment.teacherGuide.script).toBeTruthy()
        expect(segment.teacherGuide.correction).toBeTruthy()
        expect(segment.teacherGuide.observe).toBeTruthy()
        expect(segment.safetyNotice).toContain('연습용')
        expect(segment.safetyNotice).toContain('119')
        expect(
          structuredLearningExplanationSchema.safeParse(
            segment.structuredExplanation,
          ).success,
        ).toBe(true)
      }
    }
  })

  it('keeps key fire and earthquake scenarios grounded with rule evidence', () => {
    const requiredSegments = [
      'fire-grounded-door-control',
      'fire-grounded-stairs',
      'earthquake-review-office-desk',
      'earthquake-after-exit',
    ]

    for (const segmentId of requiredSegments) {
      const segment = learningScenarios
        .flatMap((scenario) => scenario.segments)
        .find((item) => item.id === segmentId)

      expect(
        segment?.structuredExplanation.evidence.ruleEvidence.length,
      ).toBeGreaterThan(0)
    }
  })
})
