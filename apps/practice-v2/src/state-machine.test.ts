import { describe, expect, it } from 'vitest'

import {
  advanceGuidedSegment,
  answerCurrentQuiz,
  completeFullPlayback,
  continueFromScenarioComplete,
  createInitialPracticeState,
  type PracticeScenario,
} from './state-machine'

const scenarios: PracticeScenario[] = [
  {
    id: 'fire-grounded-flow',
    note: 'fire',
    posterSrc: '/fire.jpg',
    title: 'fire',
    videoSrc: '/fire.mp4',
    segments: [segment('fire-1'), segment('fire-2')],
  },
  {
    id: 'earthquake-protect-flow',
    note: 'earthquake',
    posterSrc: '/earthquake.jpg',
    title: 'earthquake',
    videoSrc: '/earthquake.mp4',
    segments: [segment('earthquake-1')],
  },
]

describe('practice-v2 state machine', () => {
  it('starts with segmented practice before full replay', () => {
    const initial = createInitialPracticeState()

    expect(initial.phase).toBe('segment_practice')
    expect(initial.segmentIndex).toBe(0)
  })

  it('keeps the same guided segment when the learner is wrong', () => {
    const initial = createInitialPracticeState()
    const afterWrong = answerCurrentQuiz(initial, scenarios, 'wrong')

    expect(afterWrong.phase).toBe('segment_practice')
    expect(afterWrong.segmentIndex).toBe(0)
    expect(afterWrong.retryQueue).toEqual([])
  })

  it('runs every guided segment before replay_full', () => {
    const secondSegment = answerCurrentQuiz(
      createInitialPracticeState(),
      scenarios,
      'correct',
    )
    const replay = answerCurrentQuiz(secondSegment, scenarios, 'correct')

    expect(secondSegment.phase).toBe('segment_practice')
    expect(secondSegment.segmentIndex).toBe(1)
    expect(replay.phase).toBe('replay_full')
    expect(replay.segmentIndex).toBe(2)
  })

  it('can advance intro guided segments without a quiz answer', () => {
    const introScenarios: PracticeScenario[] = [
      {
        ...scenarios[0]!,
        segments: [
          {
            ...segment('intro'),
            options: [],
            practiceMode: 'intro',
            question: '',
          },
          segment('action'),
        ],
      },
    ]

    const next = advanceGuidedSegment(
      createInitialPracticeState(),
      introScenarios,
    )

    expect(next.phase).toBe('segment_practice')
    expect(next.segmentIndex).toBe(1)
  })

  it('moves from replay_full to quiz_batch', () => {
    const quiz = completeFullPlayback(enterReplay(), scenarios)

    expect(quiz.phase).toBe('quiz_batch')
    expect(quiz.scenarioIndex).toBe(0)
  })

  it('moves to the next first-round quiz even when the answer is wrong', () => {
    const state = enterQuiz()
    const next = answerCurrentQuiz(state, scenarios, 'wrong')

    expect(next.phase).toBe('quiz_batch')
    expect(next.quizIndex).toBe(1)
    expect(next.retryQueue).toEqual([
      { round: 1, scenarioId: 'fire-grounded-flow', segmentId: 'fire-1' },
    ])
  })

  it('keeps only wrong first-round segments in retry_wrong', () => {
    const state = enterQuiz()
    const afterWrong = answerCurrentQuiz(state, scenarios, 'wrong')
    const afterCorrect = answerCurrentQuiz(afterWrong, scenarios, 'correct')

    expect(afterCorrect.phase).toBe('retry_wrong')
    expect(afterCorrect.retryQueue.map((wrong) => wrong.segmentId)).toEqual([
      'fire-1',
    ])
  })

  it('removes a segment from retry when the learner answers correctly', () => {
    const state = enterRetry()
    const next = answerCurrentQuiz(state, scenarios, 'correct')

    expect(next.phase).toBe('scenario_complete')
    expect(next.retryQueue).toEqual([])
    expect(next.completedScenarioIds).toEqual(['fire-grounded-flow'])
  })

  it('keeps retrying inside the same scenario when wrong answers remain', () => {
    const state = enterRetry()
    const next = answerCurrentQuiz(state, scenarios, 'wrong')

    expect(next.phase).toBe('retry_wrong')
    expect(next.scenarioIndex).toBe(0)
    expect(next.retryRound).toBe(2)
    expect(next.retryQueue).toEqual([
      { round: 2, scenarioId: 'fire-grounded-flow', segmentId: 'fire-1' },
    ])
  })

  it('does not move to earthquake before fire is complete', () => {
    const state = enterQuiz()
    const next = answerCurrentQuiz(state, scenarios, 'correct')

    expect(next.scenarioIndex).toBe(0)
    expect(next.phase).toBe('quiz_batch')
  })

  it('moves to earthquake after fire completion and finishes after earthquake', () => {
    const fireComplete = answerCurrentQuiz(enterRetry(), scenarios, 'correct')
    const earthquakeStart = continueFromScenarioComplete(fireComplete, scenarios)
    const earthquakeReplay = answerCurrentQuiz(
      earthquakeStart,
      scenarios,
      'correct',
    )
    const earthquakeQuiz = completeFullPlayback(earthquakeReplay, scenarios)
    const earthquakeComplete = answerCurrentQuiz(
      earthquakeQuiz,
      scenarios,
      'correct',
    )
    const done = continueFromScenarioComplete(earthquakeComplete, scenarios)

    expect(earthquakeStart.scenarioIndex).toBe(1)
    expect(earthquakeStart.phase).toBe('segment_practice')
    expect(earthquakeReplay.phase).toBe('replay_full')
    expect(done.phase).toBe('scenario_complete')
    expect(done.isProgramComplete).toBe(true)
  })
})

function enterReplay() {
  const secondSegment = answerCurrentQuiz(
    createInitialPracticeState(),
    scenarios,
    'correct',
  )
  return answerCurrentQuiz(secondSegment, scenarios, 'correct')
}

function enterQuiz() {
  return completeFullPlayback(enterReplay(), scenarios)
}

function enterRetry() {
  const afterWrong = answerCurrentQuiz(enterQuiz(), scenarios, 'wrong')
  return answerCurrentQuiz(afterWrong, scenarios, 'correct')
}

function segment(id: string) {
  return {
    actionSteps: ['행동해요'],
    endMs: 10_000,
    id,
    label: id,
    learnerExplanation: `${id} explanation`,
    learnerPrompt: `${id} prompt`,
    options: [
      {
        correct: true,
        id: 'correct',
        label: '맞는 선택',
      },
      {
        correct: false,
        id: 'wrong',
        label: '틀린 선택',
      },
    ],
    question: `${id} question`,
    startMs: 0,
  }
}
