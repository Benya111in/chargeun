import { describe, expect, it } from 'vitest'

import { learningScenarios } from './demo-theater-content'

describe('learningScenarios', () => {
  it('keeps every segment ready for learner practice and teacher guidance', () => {
    expect(learningScenarios.length).toBeGreaterThan(0)

    for (const scenario of learningScenarios) {
      expect(scenario.segments.length).toBeGreaterThan(0)

      for (const segment of scenario.segments) {
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
      }
    }
  })
})
