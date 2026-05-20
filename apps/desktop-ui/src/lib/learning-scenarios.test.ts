import { describe, expect, it } from 'vitest'

import { structuredLearningExplanationSchema } from '@ansimtrack/shared-types'

import { learningScenarios } from './demo-theater-content'
import { getLearnerActionCards } from './learner-action-visibility'
import {
  simplifyLearnerCopy,
  simplifyLearnerReason,
  simplifyLearnerWarning,
} from './learner-copy'

const hardLearnerCopyPattern =
  /상황|위험|안내|확인|비상구|표지|방향|스위치|유입|확보|찾기해야|해야합니다|합니다|습니다|하십시오|이용|요청|차단|화염|생존|대피공간|행동요령|대피소|공식|기관|통신|낙하물|붕괴물|공동주택|무작정|차량|혼잡|2차 피해|발생/u

function getLearnerVisibleTexts(
  segment: (typeof learningScenarios)[number]['segments'][number],
  scenario: (typeof learningScenarios)[number],
) {
  return [
    scenario.homeTitle ?? scenario.title,
    simplifyLearnerCopy(scenario.homeNote ?? scenario.note),
    segment.label,
    segment.description,
    segment.learnerPrompt,
    segment.learnerExplanation,
    ...segment.actionSteps,
    ...segment.actionReasons,
    ...segment.learnerSequence.map((step) => step.text),
    segment.checkQuestion,
    ...segment.answerOptions.flatMap((option) => [
      option.label,
      option.feedback,
    ]),
    simplifyLearnerWarning(
      segment.structuredExplanation.tracks.doNot?.text ??
        segment.explanation.doNot ??
        '',
    ),
    simplifyLearnerReason(segment.explanation.tracks.reason),
  ].filter((text): text is string => Boolean(text))
}

describe('learningScenarios', () => {
  it('keeps every segment ready for learner practice and teacher guidance', () => {
    expect(learningScenarios.length).toBeGreaterThan(0)

    for (const scenario of learningScenarios) {
      expect(scenario.segments.length).toBeGreaterThan(0)

      for (const segment of scenario.segments) {
        expect(segment.learnerExplanation).toBeTruthy()
        expect(segment.learnerExplanation.length).toBeLessThanOrEqual(35)
        expect(segment.learnerPrompt).toBeTruthy()
        expect(segment.learnerSequence.length).toBeGreaterThan(0)
        expect(segment.learnerSequence.length).toBeLessThanOrEqual(4)
        for (const learnerStep of segment.learnerSequence) {
          expect(learnerStep.text.length).toBeLessThanOrEqual(35)
          expect(learnerStep.kind).toMatch(/^(action|situation)$/)
          expect(learnerStep.text).not.toMatch(
            /차단|화염|반드시|이용해|외부로 빠져나와야|발생했습니다|사상자/,
          )
        }
        expect(segment.narration.length).toBeGreaterThan(0)
        expect(segment.narration[0]?.startMs).toBe(segment.startMs)
        expect(segment.narration.at(-1)?.endMs).toBe(segment.endMs)
        for (const cue of segment.narration) {
          expect(cue.startMs).toBeGreaterThanOrEqual(segment.startMs)
          expect(cue.endMs).toBeLessThanOrEqual(segment.endMs)
          expect(cue.endMs).toBeGreaterThan(cue.startMs)
          expect(cue.text.trim()).toBeTruthy()
        }
        expect(segment.teachBack).toEqual(
          segment.structuredExplanation.tracks.teachBack,
        )
        for (const text of getLearnerVisibleTexts(segment, scenario)) {
          expect(text).not.toMatch(hardLearnerCopyPattern)
          expect(text).not.toMatch(
            /어디로 어디로|말를|보기하기|때을|찾기해야|가기해야|계단으로 안전한 곳|다친 사람과 방송/,
          )
        }

        if (segment.practiceMode === 'intro') {
          expect(segment.actionSteps).toHaveLength(0)
          expect(getLearnerActionCards(segment)).toEqual([])
          expect(segment.checkQuestion).toBe('')
          expect(segment.answerOptions).toHaveLength(0)
        } else {
          expect(segment.learnerSequence[0]?.kind).toBe('situation')
          expect(
            segment.learnerSequence.slice(1).map((step) => step.kind),
          ).toEqual(segment.actionSteps.map(() => 'action'))
          expect(segment.actionSteps.length).toBeGreaterThanOrEqual(1)
          expect(segment.actionSteps.length).toBeLessThanOrEqual(3)
          expect(segment.actionReasons.length).toBeLessThanOrEqual(
            segment.actionSteps.length,
          )
          for (const actionReason of segment.actionReasons) {
            expect(actionReason.length).toBeLessThanOrEqual(35)
          }
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

  it('simplifies hard learner copy and prevents replacement artifacts', () => {
    expect(
      simplifyLearnerWarning('연기 유입 방향으로 창문을 무작정 열지 않습니다.'),
    ).toBe('연기가 들어오는 쪽 창문은 바로 열지 않아요.')
    expect(
      simplifyLearnerReason(
        '실내로 들어오는 연기량을 줄여 생존 시간을 확보해야 합니다.',
      ),
    ).toBe('방 안으로 연기가 덜 들어오게 해야 해요.')
    expect(
      simplifyLearnerCopy('전기 이상은 어른에게 말하고 공식 안내를 기다려요.'),
    ).toBe('전기가 고장 난 것 같으면 어른에게 말하고 방송을 기다려요.')
    expect(simplifyLearnerCopy('어디로 대피할까요?')).toBe('어디로 갈까요?')
    expect(simplifyLearnerCopy('차례대로 이동해야 합니다.')).toBe(
      '차례대로 가야 해요.',
    )
  })

  it('keeps core spoken and onscreen education points in narration coverage', () => {
    const narrationText = (scenarioId: string) =>
      learningScenarios
        .find((scenario) => scenario.id === scenarioId)!
        .segments.flatMap((segment) => segment.narration)
        .map((cue) => cue.text)
        .join(' ')

    expect(narrationText('fire-grounded-flow')).toEqual(
      expect.stringContaining('매년 약 2,800건'),
    )
    expect(narrationText('fire-grounded-flow')).toEqual(
      expect.stringContaining('현관문을 닫고 계단'),
    )
    expect(narrationText('fire-grounded-flow')).toEqual(
      expect.stringContaining('엘리베이터는 이용하면 안 됩니다'),
    )
    expect(narrationText('fire-grounded-flow')).toEqual(
      expect.stringContaining('대피공간'),
    )
    expect(narrationText('fire-grounded-flow')).toEqual(
      expect.stringContaining('젖은 수건'),
    )
    expect(narrationText('fire-grounded-flow')).toEqual(
      expect.stringContaining('안내 방송'),
    )
    expect(narrationText('fire-grounded-flow')).toEqual(
      expect.stringContaining('무조건 대피보다 상황별'),
    )

    expect(narrationText('earthquake-protect-flow')).toEqual(
      expect.stringContaining('1, 2분'),
    )
    expect(narrationText('earthquake-protect-flow')).toEqual(
      expect.stringContaining('탁자 다리'),
    )
    expect(narrationText('earthquake-protect-flow')).toEqual(
      expect.stringContaining('방석'),
    )
    expect(narrationText('earthquake-protect-flow')).toEqual(
      expect.stringContaining('가스 중간 밸브'),
    )
    expect(narrationText('earthquake-protect-flow')).toEqual(
      expect.stringContaining('안전디딤돌'),
    )
    expect(narrationText('earthquake-protect-flow')).toEqual(
      expect.stringContaining('차량을 이용하지 않고'),
    )
    expect(narrationText('earthquake-protect-flow')).toEqual(
      expect.stringContaining('선생님의 안내'),
    )
    expect(narrationText('earthquake-protect-flow')).toEqual(
      expect.stringContaining('라디오 및 공공기관'),
    )
    expect(narrationText('earthquake-protect-flow')).toEqual(
      expect.stringContaining('수도꼭지나 화장실'),
    )
    expect(narrationText('earthquake-protect-flow')).toEqual(
      expect.stringContaining('여진이 발생할 수 있으므로'),
    )
  })

  it('keeps concrete earthquake details visible in learner cards', () => {
    const earthquakeScenario = learningScenarios.find(
      (scenario) => scenario.id === 'earthquake-protect-flow',
    )!
    const visibleText = (segmentId: string) =>
      getLearnerVisibleTexts(
        earthquakeScenario.segments.find(
          (segment) => segment.id === segmentId,
        )!,
        earthquakeScenario,
      ).join(' ')

    expect(visibleText('earthquake-full-table-protect')).toEqual(
      expect.stringContaining('탁자 다리'),
    )
    expect(visibleText('earthquake-full-cushion-glass')).toEqual(
      expect.stringContaining('방석'),
    )
    expect(visibleText('earthquake-full-cushion-glass')).toEqual(
      expect.stringContaining('유리에 등을 돌려요'),
    )
    expect(visibleText('earthquake-full-outside-head')).toEqual(
      expect.stringContaining('유리와 간판'),
    )
    expect(visibleText('earthquake-full-outside-head')).toEqual(
      expect.stringContaining('가방'),
    )
    expect(visibleText('earthquake-full-open-space')).toEqual(
      expect.stringContaining('안전디딤돌'),
    )
    expect(visibleText('earthquake-full-open-space')).toEqual(
      expect.stringContaining('넓은 공원'),
    )
    expect(visibleText('earthquake-full-open-space')).toEqual(
      expect.stringContaining('넓은 운동장'),
    )
    expect(visibleText('earthquake-full-open-space')).toEqual(
      expect.stringContaining('넓어서 건물에서 떨어져요'),
    )
    expect(visibleText('earthquake-full-sturdy-building')).toEqual(
      expect.stringContaining('튼튼한 건물'),
    )
    expect(visibleText('earthquake-full-electric-water')).toEqual(
      expect.stringContaining('손전등'),
    )
    expect(visibleText('earthquake-full-electric-water')).toEqual(
      expect.stringContaining('전선'),
    )
    expect(visibleText('earthquake-full-water-report')).toEqual(
      expect.stringContaining('수도관'),
    )
    expect(visibleText('earthquake-full-water-report')).toEqual(
      expect.stringContaining('물 쓰기'),
    )
  })

  it('uses the situation card for the main setting, not a stray detail', () => {
    const earthquakeScenario = learningScenarios.find(
      (scenario) => scenario.id === 'earthquake-protect-flow',
    )!

    expect(
      earthquakeScenario.segments.find(
        (segment) => segment.id === 'earthquake-full-office-desk',
      )?.learnerPrompt,
    ).toBe('사무실에서 지진이 났어요.')
    expect(
      earthquakeScenario.segments.find(
        (segment) => segment.id === 'earthquake-full-school-evacuation',
      )?.learnerPrompt,
    ).toBe('학교에서 지진이 났어요.')
  })

  it('keeps the earthquake elevator clip isolated from nearby scenes', () => {
    const earthquakeScenario = learningScenarios.find(
      (scenario) => scenario.id === 'earthquake-protect-flow',
    )!

    const school = earthquakeScenario.segments.find(
      (segment) => segment.id === 'earthquake-full-school-evacuation',
    )
    const elevator = earthquakeScenario.segments.find(
      (segment) => segment.id === 'earthquake-full-elevator-wait',
    )
    const afterReport = earthquakeScenario.segments.find(
      (segment) => segment.id === 'earthquake-full-after-report',
    )

    expect(school?.endMs).toBe(177_000)
    expect(elevator?.startMs).toBe(177_000)
    expect(elevator?.endMs).toBe(185_600)
    expect(afterReport?.startMs).toBe(194_500)
  })

  it('does not pause the outdoor earthquake narration before the sentence ends', () => {
    const earthquakeScenario = learningScenarios.find(
      (scenario) => scenario.id === 'earthquake-protect-flow',
    )!
    const outdoor = earthquakeScenario.segments.find(
      (segment) => segment.id === 'earthquake-full-outside-head',
    )!

    expect(outdoor.pauseMs).toBe(outdoor.endMs)
    expect(outdoor.pauseMs).toBe(outdoor.narration.at(-1)?.endMs)
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
