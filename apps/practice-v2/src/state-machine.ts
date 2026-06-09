export type PracticePhase =
  | 'segment_practice'
  | 'replay_full'
  | 'quiz_batch'
  | 'retry_wrong'
  | 'scenario_complete'

export type QuizMode = 'guided' | 'initial' | 'retry'

export type PracticeOption = {
  correct: boolean
  feedback?: string
  id: string
  label: string
}

export type PracticeSegment = {
  actionSteps: string[]
  endMs: number
  id: string
  label: string
  learnerExplanation: string
  learnerPrompt: string
  options: PracticeOption[]
  practiceMode?: 'action' | 'intro'
  previewMs?: number
  question: string
  startMs: number
}

export type PracticeScenario = {
  id: string
  note: string
  posterSrc: string
  segments: PracticeSegment[]
  title: string
  videoSrc: string
}

export type QuizAttempt = {
  correct: boolean
  mode: QuizMode
  round: number
  scenarioId: string
  segmentId: string
  selectedOptionId: string
}

export type WrongSegment = {
  round: number
  scenarioId: string
  segmentId: string
}

export type PracticeSessionState = {
  attempts: QuizAttempt[]
  completedScenarioIds: string[]
  isProgramComplete: boolean
  phase: PracticePhase
  quizIndex: number
  retryCursor: number
  retryNextQueue: WrongSegment[]
  retryQueue: WrongSegment[]
  retryRound: number
  segmentIndex: number
  scenarioIndex: number
}

export function createInitialPracticeState(): PracticeSessionState {
  return {
    attempts: [],
    completedScenarioIds: [],
    isProgramComplete: false,
    phase: 'segment_practice',
    quizIndex: 0,
    retryCursor: 0,
    retryNextQueue: [],
    retryQueue: [],
    retryRound: 0,
    segmentIndex: 0,
    scenarioIndex: 0,
  }
}

export function getCurrentScenario(
  state: PracticeSessionState,
  scenarios: PracticeScenario[],
) {
  return scenarios[state.scenarioIndex] ?? null
}

export function getCurrentQuizSegment(
  state: PracticeSessionState,
  scenarios: PracticeScenario[],
) {
  const scenario = getCurrentScenario(state, scenarios)

  if (!scenario) {
    return null
  }

  if (state.phase === 'segment_practice') {
    return scenario.segments[state.segmentIndex] ?? null
  }

  if (state.phase !== 'quiz_batch') {
    return null
  }

  return getQuizSegments(scenario)[state.quizIndex] ?? null
}

export function getQuizSegments(scenario: PracticeScenario) {
  return scenario.segments.filter(
    (segment) =>
      segment.practiceMode !== 'intro' &&
      segment.question.trim().length > 0 &&
      segment.options.length > 0,
  )
}

export function getCurrentRetrySegment(
  state: PracticeSessionState,
  scenarios: PracticeScenario[],
) {
  const scenario = getCurrentScenario(state, scenarios)
  const wrong = state.retryQueue[state.retryCursor]

  if (!scenario || !wrong || state.phase !== 'retry_wrong') {
    return null
  }

  return scenario.segments.find((segment) => segment.id === wrong.segmentId) ?? null
}

export function completeFullPlayback(
  state: PracticeSessionState,
  scenarios: PracticeScenario[],
): PracticeSessionState {
  const scenario = getCurrentScenario(state, scenarios)

  if (!scenario || state.isProgramComplete) {
    return state
  }

  if (state.phase === 'replay_full') {
    return getQuizSegments(scenario).length > 0
      ? {
          ...state,
          phase: 'quiz_batch',
          quizIndex: 0,
          retryCursor: 0,
          retryNextQueue: [],
          retryQueue: [],
          retryRound: 0,
          segmentIndex: scenario.segments.length,
        }
      : completeScenario(state, scenarios)
  }

  return state
}

export function advanceGuidedSegment(
  state: PracticeSessionState,
  scenarios: PracticeScenario[],
): PracticeSessionState {
  const scenario = getCurrentScenario(state, scenarios)

  if (!scenario || state.phase !== 'segment_practice') {
    return state
  }

  if (state.segmentIndex < scenario.segments.length - 1) {
    return {
      ...state,
      segmentIndex: state.segmentIndex + 1,
    }
  }

  return {
    ...state,
    phase: 'replay_full',
    segmentIndex: scenario.segments.length,
  }
}

export function answerCurrentQuiz(
  state: PracticeSessionState,
  scenarios: PracticeScenario[],
  selectedOptionId: string,
): PracticeSessionState {
  if (state.isProgramComplete) {
    return state
  }

  if (state.phase === 'quiz_batch') {
    return answerInitialQuiz(state, scenarios, selectedOptionId)
  }

  if (state.phase === 'segment_practice') {
    return answerGuidedQuiz(state, scenarios, selectedOptionId)
  }

  if (state.phase === 'retry_wrong') {
    return answerRetryQuiz(state, scenarios, selectedOptionId)
  }

  return state
}

export function continueFromScenarioComplete(
  state: PracticeSessionState,
  scenarios: PracticeScenario[],
): PracticeSessionState {
  if (state.phase !== 'scenario_complete' || state.isProgramComplete) {
    return state
  }

  if (state.scenarioIndex >= scenarios.length - 1) {
    return {
      ...state,
      isProgramComplete: true,
    }
  }

  return {
    ...state,
    phase: 'segment_practice',
    quizIndex: 0,
    retryCursor: 0,
    retryNextQueue: [],
    retryQueue: [],
    retryRound: 0,
    segmentIndex: 0,
    scenarioIndex: state.scenarioIndex + 1,
  }
}

export function getScenarioCorrectCount(
  state: PracticeSessionState,
  scenarioId: string,
) {
  return state.attempts.filter(
    (attempt) => attempt.scenarioId === scenarioId && attempt.correct,
  ).length
}

export function getScenarioWrongCount(
  state: PracticeSessionState,
  scenarioId: string,
) {
  return state.attempts.filter(
    (attempt) => attempt.scenarioId === scenarioId && !attempt.correct,
  ).length
}

function answerInitialQuiz(
  state: PracticeSessionState,
  scenarios: PracticeScenario[],
  selectedOptionId: string,
): PracticeSessionState {
  const scenario = getCurrentScenario(state, scenarios)
  const segment = getCurrentQuizSegment(state, scenarios)
  const option = segment?.options.find((item) => item.id === selectedOptionId)
  const quizSegments = scenario ? getQuizSegments(scenario) : []

  if (!scenario || !segment || !option) {
    return state
  }

  const attempt = createAttempt({
    correct: option.correct,
    mode: 'initial',
    round: 0,
    scenarioId: scenario.id,
    segmentId: segment.id,
    selectedOptionId,
  })
  const nextAttempts = [...state.attempts, attempt]
  const nextRetryQueue = option.correct
    ? state.retryQueue
    : [
        ...state.retryQueue,
        {
          round: 1,
          scenarioId: scenario.id,
          segmentId: segment.id,
        },
      ]

  if (state.quizIndex < quizSegments.length - 1) {
    return {
      ...state,
      attempts: nextAttempts,
      quizIndex: state.quizIndex + 1,
      retryQueue: nextRetryQueue,
    }
  }

  if (nextRetryQueue.length > 0) {
    return {
      ...state,
      attempts: nextAttempts,
      phase: 'retry_wrong',
      quizIndex: quizSegments.length,
      retryCursor: 0,
      retryNextQueue: [],
      retryQueue: nextRetryQueue,
      retryRound: 1,
    }
  }

  return completeScenario(
    {
      ...state,
      attempts: nextAttempts,
      quizIndex: quizSegments.length,
      retryQueue: [],
    },
    scenarios,
  )
}

function answerGuidedQuiz(
  state: PracticeSessionState,
  scenarios: PracticeScenario[],
  selectedOptionId: string,
): PracticeSessionState {
  const scenario = getCurrentScenario(state, scenarios)
  const segment = getCurrentQuizSegment(state, scenarios)
  const option = segment?.options.find((item) => item.id === selectedOptionId)

  if (!scenario || !segment || !option) {
    return state
  }

  const attempt = createAttempt({
    correct: option.correct,
    mode: 'guided',
    round: 0,
    scenarioId: scenario.id,
    segmentId: segment.id,
    selectedOptionId,
  })

  if (!option.correct) {
    return {
      ...state,
      attempts: [...state.attempts, attempt],
    }
  }

  return advanceGuidedSegment(
    {
      ...state,
      attempts: [...state.attempts, attempt],
    },
    scenarios,
  )
}

function answerRetryQuiz(
  state: PracticeSessionState,
  scenarios: PracticeScenario[],
  selectedOptionId: string,
): PracticeSessionState {
  const scenario = getCurrentScenario(state, scenarios)
  const wrong = state.retryQueue[state.retryCursor]
  const segment = getCurrentRetrySegment(state, scenarios)
  const option = segment?.options.find((item) => item.id === selectedOptionId)

  if (!scenario || !wrong || !segment || !option) {
    return state
  }

  const attempt = createAttempt({
    correct: option.correct,
    mode: 'retry',
    round: state.retryRound,
    scenarioId: scenario.id,
    segmentId: segment.id,
    selectedOptionId,
  })
  const nextAttempts = [...state.attempts, attempt]
  const nextRetryNextQueue = option.correct
    ? state.retryNextQueue
    : [
        ...state.retryNextQueue,
        {
          ...wrong,
          round: state.retryRound + 1,
        },
      ]

  if (state.retryCursor < state.retryQueue.length - 1) {
    return {
      ...state,
      attempts: nextAttempts,
      retryCursor: state.retryCursor + 1,
      retryNextQueue: nextRetryNextQueue,
    }
  }

  if (nextRetryNextQueue.length > 0) {
    return {
      ...state,
      attempts: nextAttempts,
      retryCursor: 0,
      retryNextQueue: [],
      retryQueue: nextRetryNextQueue,
      retryRound: state.retryRound + 1,
    }
  }

  return completeScenario(
    {
      ...state,
      attempts: nextAttempts,
      retryCursor: 0,
      retryNextQueue: [],
      retryQueue: [],
    },
    scenarios,
  )
}

function completeScenario(
  state: PracticeSessionState,
  scenarios: PracticeScenario[],
): PracticeSessionState {
  const scenario = getCurrentScenario(state, scenarios)

  if (!scenario) {
    return state
  }

  const completedScenarioIds = state.completedScenarioIds.includes(scenario.id)
    ? state.completedScenarioIds
    : [...state.completedScenarioIds, scenario.id]

  return {
    ...state,
    completedScenarioIds,
    phase: 'scenario_complete',
  }
}

function createAttempt(attempt: QuizAttempt): QuizAttempt {
  return attempt
}
