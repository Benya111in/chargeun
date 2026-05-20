import { describe, expect, it } from 'vitest'

import { structuredLearningExplanationSchema } from '@ansimtrack/shared-types'

import { learningScenarios } from './demo-theater-content'
import { getLearnerActionCards } from './learner-action-visibility'

describe('learningScenarios', () => {
  it('keeps every segment ready for learner practice and teacher guidance', () => {
    expect(learningScenarios.length).toBeGreaterThan(0)

    for (const scenario of learningScenarios) {
      expect(scenario.segments.length).toBeGreaterThan(0)

      for (const segment of scenario.segments) {
        expect(segment.learnerExplanation).toBeTruthy()
        expect(segment.learnerExplanation.length).toBeLessThanOrEqual(35)
        expect(segment.learnerPrompt).toBeTruthy()
        expect(segment.narration.length).toBeGreaterThan(0)
        for (const cue of segment.narration) {
          expect(cue.startMs).toBeGreaterThanOrEqual(segment.startMs)
          expect(cue.endMs).toBeLessThanOrEqual(segment.endMs)
          expect(cue.endMs).toBeGreaterThan(cue.startMs)
          expect(cue.text.trim()).toBeTruthy()
        }
        expect(segment.teachBack).toEqual(
          segment.structuredExplanation.tracks.teachBack,
        )

        if (segment.practiceMode === 'intro') {
          expect(segment.actionSteps).toHaveLength(0)
          expect(getLearnerActionCards(segment)).toEqual([])
          expect(segment.checkQuestion).toBe('')
          expect(segment.answerOptions).toHaveLength(0)
        } else {
          expect(segment.actionSteps.length).toBeGreaterThanOrEqual(1)
          expect(segment.actionSteps.length).toBeLessThanOrEqual(3)
          expect(
            getLearnerActionCards(segment).map((card) => card.label),
          ).toEqual(segment.actionSteps)
          expect(segment.checkQuestion).toBeTruthy()
          expect(segment.checkQuestion).toBe(segment.teachBack?.prompt)
          expect(segment.answerOptions.length).toBeGreaterThanOrEqual(2)
          expect(
            segment.answerOptions.some((option) => option.correct),
          ).toBeTruthy()
          expect(
            segment.answerOptions.filter((option) => option.correct),
          ).toHaveLength(1)
          const optionLabels = segment.answerOptions.map(
            (option) => option.label,
          )
          expect(new Set(optionLabels).size).toBe(optionLabels.length)
          expect(optionLabels).not.toContain('잘 모르겠어요')
          expect(
            segment.answerOptions.find((option) => option.correct)?.id,
          ).toBe(segment.teachBack?.correctOptionId)
        }

        const learnerActionLabels = getLearnerActionCards(segment).map(
          (card) => card.label,
        )
        for (const actionLabel of learnerActionLabels) {
          expect(actionLabel).not.toMatch(
            /않아요|않습니다|말아요|말고|피해요|금지|하지|만지지|무리해서/,
          )
        }
        for (const option of segment.answerOptions.filter(
          (item) => !item.correct,
        )) {
          expect(learnerActionLabels).not.toContain(option.label)
          expect(option.label).not.toMatch(
            /않아요|피해요|해요$|가요$|봐요$|두어요$/,
          )
          expect(option.feedback).toContain('다시 봐요')
        }
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
      'fire-full-door-control',
      'earthquake-full-table-protect',
      'earthquake-full-door-gas',
    ]

    for (const segmentId of requiredSegments) {
      const segment = learningScenarios
        .flatMap((scenario) => scenario.segments)
        .find((item) => item.id === segmentId)

      expect(
        segment?.structuredExplanation.evidence.ruleEvidence.length,
      ).toBeGreaterThan(0)
      expect(
        segment?.structuredExplanation.evidence.ruleEvidence.some(
          (item) => item.sourceChunkId,
        ),
      ).toBe(true)
    }
  })

  it('hides learner action cards when structured status requires review', () => {
    const [segment] = learningScenarios[0]!.segments
    const reviewSegment = {
      ...segment,
      structuredExplanation: {
        ...segment.structuredExplanation,
        segment: {
          ...segment.structuredExplanation.segment,
          status: 'needs_review' as const,
        },
        validation: {
          ...segment.structuredExplanation.validation,
          learnerSafe: false,
          requiresHumanReview: true,
        },
      },
    }

    expect(getLearnerActionCards(reviewSegment)).toEqual([])
  })
})
