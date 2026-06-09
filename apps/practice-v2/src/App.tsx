import {
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  PauseCircle,
  Play,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { scenarios } from './content'
import {
  advanceGuidedSegment,
  answerCurrentQuiz,
  completeFullPlayback,
  continueFromScenarioComplete,
  createInitialPracticeState,
  getCurrentQuizSegment,
  getCurrentRetrySegment,
  getCurrentScenario,
  getQuizSegments,
  type PracticePhase,
  type PracticeSegment,
} from './state-machine'

type GuidedStage = 'ready' | 'playback' | 'explanation'

const safetyNotice =
  '이 앱은 연습용입니다. 실제로 위험할 때는 119·112, 주변 어른, 현장 안내를 우선 따르세요.'
const segmentStartGuardSec = 0.02

export default function App() {
  const [session, setSession] = useState(createInitialPracticeState)
  const [guidedStage, setGuidedStage] = useState<GuidedStage>('ready')
  const [guidedAnswerId, setGuidedAnswerId] = useState<string | null>(null)
  const [showQuiz, setShowQuiz] = useState(false)
  const [playbackError, setPlaybackError] = useState('')
  const [mutedFallback, setMutedFallback] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const autoStartSegmentRef = useRef<PracticeSegment | null>(null)
  const autoStartedSegmentIdRef = useRef<string | null>(null)
  const isQaMode =
    import.meta.env.DEV && new URLSearchParams(window.location.search).has('qa')

  const scenario = getCurrentScenario(session, scenarios) ?? scenarios[0]!
  const segment = scenario.segments[session.segmentIndex] ?? null
  const retrySegment = getCurrentRetrySegment(session, scenarios)
  const batchSegment = getCurrentQuizSegment(session, scenarios)
  const quizSegment = session.phase === 'retry_wrong' ? retrySegment : batchSegment
  const clipSegment =
    session.phase === 'retry_wrong'
      ? retrySegment
      : session.phase === 'segment_practice'
        ? segment
        : null
  const quizSegments = useMemo(() => getQuizSegments(scenario), [scenario])
  const guidedAnswer = segment?.options.find(
    (option) => option.id === guidedAnswerId,
  )

  useEffect(() => {
    if (!videoRef.current || !segment || session.phase !== 'segment_practice') {
      return
    }

    const video = videoRef.current
    const previewSec = getSegmentPreviewSec(segment)

    const seekPreview = () => {
      if (video.paused) {
        video.currentTime = previewSec
      }
    }

    if (video.readyState >= 1) {
      seekPreview()
      return
    }

    video.addEventListener('loadedmetadata', seekPreview, { once: true })

    return () => {
      video.removeEventListener('loadedmetadata', seekPreview)
    }
  }, [scenario.id, segment, session.phase])

  const playFrom = useCallback(async (startMs: number, immediatePlay = false) => {
    const video = videoRef.current

    if (!video) {
      return
    }

    setShowQuiz(false)
    setPlaybackError('')

    try {
      if (immediatePlay) {
        if (video.readyState >= 1) {
          video.currentTime = Math.max(0, startMs / 1000)
        } else {
          video.addEventListener(
            'loadedmetadata',
            () => {
              video.currentTime = Math.max(0, startMs / 1000)
            },
            { once: true },
          )
        }
        setMutedFallback(await requestPlayback(video))
        return
      }

      await waitForMetadata(video)
      video.currentTime = Math.max(0, startMs / 1000)
      setMutedFallback(await requestPlayback(video))
    } catch (error) {
      setPlaybackError(
        error instanceof Error
          ? error.message
          : '영상을 바로 재생하지 못했습니다. 다시 눌러 주세요.',
      )
    }
  }, [])

  useEffect(() => {
    if (session.phase === 'segment_practice') {
      setGuidedAnswerId(null)
      setShowQuiz(false)

      const pendingSegment = autoStartSegmentRef.current

      if (pendingSegment && pendingSegment.id === segment?.id) {
        autoStartSegmentRef.current = null
        autoStartedSegmentIdRef.current = segment.id
        setGuidedStage('playback')
        void playFrom(pendingSegment.startMs, true)
        return
      }

      if (autoStartedSegmentIdRef.current === segment?.id) {
        return
      }

      autoStartSegmentRef.current = null
      autoStartedSegmentIdRef.current = null
      setGuidedStage('ready')
    }
  }, [
    playFrom,
    segment,
    session.phase,
    session.scenarioIndex,
    session.segmentIndex,
  ])

  useEffect(() => {
    if (session.phase === 'replay_full') {
      setGuidedStage('playback')
      void playFrom(0)
      return
    }

    if (session.phase === 'quiz_batch') {
      videoRef.current?.pause()
      setShowQuiz(true)
      return
    }

    if (session.phase === 'retry_wrong' && retrySegment) {
      setGuidedStage('playback')
      void playFrom(retrySegment.startMs)
      return
    }

    if (session.phase === 'scenario_complete') {
      videoRef.current?.pause()
      setShowQuiz(false)

      if (session.isProgramComplete) {
        return
      }

      const timer = window.setTimeout(() => {
        setSession((current) => continueFromScenarioComplete(current, scenarios))
      }, 1200)

      return () => window.clearTimeout(timer)
    }
  }, [
    playFrom,
    retrySegment,
    session.isProgramComplete,
    session.phase,
    session.quizIndex,
    session.retryCursor,
    session.retryRound,
    session.scenarioIndex,
  ])

  const startSegmentPlayback = (targetSegment = segment, immediatePlay = true) => {
    if (!targetSegment) {
      return
    }

    autoStartSegmentRef.current = null
    autoStartedSegmentIdRef.current = targetSegment.id
    setGuidedAnswerId(null)
    setGuidedStage('playback')
    void playFrom(targetSegment.startMs, immediatePlay)
  }

  const replayCurrentClip = () => {
    if (session.phase === 'retry_wrong' && retrySegment) {
      startSegmentPlayback(retrySegment)
      return
    }

    if (session.phase === 'replay_full') {
      void playFrom(0, true)
      return
    }

    startSegmentPlayback(segment)
  }

  const handleVideoEnded = () => {
    if (session.phase === 'segment_practice') {
      autoStartedSegmentIdRef.current = null
      setGuidedStage('explanation')
      return
    }

    if (session.phase === 'replay_full') {
      setSession((current) => completeFullPlayback(current, scenarios))
      return
    }

    if (session.phase === 'retry_wrong') {
      setShowQuiz(true)
    }
  }

  const handleTimeUpdate = () => {
    const video = videoRef.current

    if (
      !video ||
      !clipSegment ||
      showQuiz ||
      (session.phase !== 'segment_practice' && session.phase !== 'retry_wrong')
    ) {
      return
    }

    if (video.currentTime * 1000 >= clipSegment.endMs - 80) {
      video.pause()
      video.currentTime = clipSegment.endMs / 1000
      if (session.phase === 'segment_practice') {
        autoStartedSegmentIdRef.current = null
        setGuidedStage('explanation')
      } else {
        setShowQuiz(true)
      }
    }
  }

  const handleGuidedNext = () => {
    if (!segment) {
      return
    }

    const shouldAdvanceWithoutAnswer =
      segment.practiceMode === 'intro' || segment.options.length === 0
    if (!shouldAdvanceWithoutAnswer && !guidedAnswer?.correct) {
      return
    }

    setSession((current) => {
      const next = shouldAdvanceWithoutAnswer
        ? advanceGuidedSegment(current, scenarios)
        : answerCurrentQuiz(current, scenarios, guidedAnswer!.id)
      const nextScenario = scenarios[next.scenarioIndex]
      const nextSegment =
        next.phase === 'segment_practice'
          ? (nextScenario?.segments[next.segmentIndex] ?? null)
          : null

      autoStartSegmentRef.current = nextSegment
      autoStartedSegmentIdRef.current = null

      return next
    })
  }

  const handleBatchAnswer = (selectedOptionId: string) => {
    setShowQuiz(false)
    setSession((current) =>
      answerCurrentQuiz(current, scenarios, selectedOptionId),
    )
  }

  const handleRestart = () => {
    videoRef.current?.pause()
    if (videoRef.current) {
      videoRef.current.currentTime = 0
    }
    setSession(createInitialPracticeState())
    setGuidedAnswerId(null)
    setGuidedStage('ready')
    setShowQuiz(false)
    setPlaybackError('')
    setMutedFallback(false)
  }

  const handleQaCompletePlayback = () => {
    if (session.phase === 'segment_practice') {
      videoRef.current?.pause()
      setGuidedStage('explanation')
      return
    }

    if (session.phase === 'retry_wrong') {
      videoRef.current?.pause()
      setShowQuiz(true)
      return
    }

    setSession((current) => completeFullPlayback(current, scenarios))
  }

  const handleQaAnswer = (correct: boolean) => {
    if (session.phase === 'segment_practice') {
      const option = segment?.options.find((item) => item.correct === correct)
      if (option) {
        setGuidedAnswerId(option.id)
      }
      return
    }

    const option = quizSegment?.options.find((item) => item.correct === correct)
    if (option) {
      handleBatchAnswer(option.id)
    }
  }

  const handleUnmute = () => {
    const video = videoRef.current

    if (!video) {
      return
    }

    video.muted = false
    setMutedFallback(false)

    if (video.paused) {
      void requestPlayback(video).then(setMutedFallback).catch((error: unknown) => {
        setPlaybackError(
          error instanceof Error
            ? error.message
            : '영상을 바로 재생하지 못했습니다. 다시 눌러 주세요.',
        )
      })
    }
  }

  return (
    <main className="experience-shell">
      <div className="experience-wrap">
        <section className="safety-banner">
          <p>
            <span>연습 전에 기억해요</span>
            {safetyNotice}
          </p>
        </section>

        <div className="experience-grid">
          <section className="left-column">
            <section className="video-card">
              <div className="video-frame-original">
                <video
                  key={scenario.id}
                  ref={videoRef}
                  className="practice-video"
                  controls={false}
                  onEnded={handleVideoEnded}
                  onTimeUpdate={handleTimeUpdate}
                  playsInline
                  poster={scenario.posterSrc}
                  preload="auto"
                  src={scenario.videoSrc}
                />
                <div className="video-shade" />
                <div className="video-topline">
                  <span>{scenario.title}</span>
                  <span>
                    {session.phase === 'segment_practice'
                      ? `${session.segmentIndex + 1} / ${scenario.segments.length}`
                      : session.phase === 'retry_wrong'
                        ? `다시 ${session.retryCursor + 1} / ${session.retryQueue.length}`
                        : '전체'}
                  </span>
                </div>

                {guidedStage === 'ready' && session.phase === 'segment_practice' ? (
                  <button
                    aria-label="영상 시작하기"
                    className="video-start-button"
                    onClick={() => startSegmentPlayback(segment)}
                    type="button"
                  >
                    <span>
                      <Play size={24} />
                      시작하기
                    </span>
                  </button>
                ) : null}

                {mutedFallback ? (
                  <button className="sound-button" type="button" onClick={handleUnmute}>
                    소리 켜기
                  </button>
                ) : null}

                {session.isProgramComplete ? (
                  <div className="complete-layer">
                    <CheckCircle2 size={42} />
                    <strong>화재와 지진 연습을 모두 마쳤어요.</strong>
                    <span>틀린 장면까지 다시 확인했어요.</span>
                  </div>
                ) : null}
              </div>
            </section>

            <div className="segment-dots">
              {scenario.segments.map((item, index) => (
                <button
                  className={[
                    'segment-dot',
                    index < session.segmentIndex ? 'done' : '',
                    index === session.segmentIndex &&
                    session.phase === 'segment_practice'
                      ? 'active'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={session.phase !== 'segment_practice'}
                  key={item.id}
                  onClick={() => {
                    setSession((current) => ({
                      ...current,
                      segmentIndex: index,
                    }))
                  }}
                  type="button"
                >
                  {index + 1}
                </button>
              ))}
            </div>

            <PracticeHero
              guidedStage={guidedStage}
              playbackError={playbackError}
              phase={session.phase}
              segment={segment}
            />
          </section>

          <PracticePanel
            guidedAnswer={guidedAnswer}
            guidedAnswerId={guidedAnswerId}
            guidedStage={guidedStage}
            isQaMode={isQaMode}
            onGuidedAnswer={setGuidedAnswerId}
            onGuidedNext={handleGuidedNext}
            onQaAnswer={handleQaAnswer}
            onQaCompletePlayback={handleQaCompletePlayback}
            onReplay={replayCurrentClip}
            onRestart={handleRestart}
            phase={session.phase}
            quizSegments={quizSegments}
            retrySegment={retrySegment}
            scenario={scenario}
            segment={segment}
            session={session}
          />
        </div>
      </div>

      {showQuiz && quizSegment ? (
        <QuizModal
          currentIndex={
            session.phase === 'retry_wrong'
              ? session.retryCursor + 1
              : session.quizIndex + 1
          }
          mode={session.phase}
          onAnswer={handleBatchAnswer}
          retryRound={session.retryRound}
          segment={quizSegment}
          totalCount={
            session.phase === 'retry_wrong'
              ? session.retryQueue.length
              : quizSegments.length
          }
        />
      ) : null}
    </main>
  )
}

function PracticeHero({
  guidedStage,
  phase,
  playbackError,
  segment,
}: {
  guidedStage: GuidedStage
  phase: PracticePhase
  playbackError: string
  segment: PracticeSegment | null
}) {
  const prompt =
    phase === 'replay_full'
      ? '전체 영상을 다시 보고 있어요.'
      : phase === 'quiz_batch'
        ? '이제 문제를 다시 풀어요.'
        : phase === 'retry_wrong'
          ? '틀린 장면만 다시 보고 있어요.'
          : guidedStage === 'explanation'
            ? (segment?.learnerPrompt ?? '')
            : (segment?.learnerPrompt ?? '영상을 보고 멈추면 같이 연습해요.')
  const heading =
    phase === 'replay_full'
      ? '처음부터 끝까지 다시 봐요.'
      : phase === 'quiz_batch'
        ? '정답을 가리고 다시 풀어요.'
        : phase === 'retry_wrong'
          ? '틀린 장면을 다시 확인해요.'
          : guidedStage === 'explanation'
            ? (segment?.learnerExplanation ?? '')
            : '영상을 보고 멈추면 같이 연습해요.'

  return (
    <section className="hero-card">
      <p>{prompt}</p>
      <h1>{heading}</h1>
      {playbackError ? <span className="playback-error">{playbackError}</span> : null}
    </section>
  )
}

function PracticePanel({
  guidedAnswer,
  guidedAnswerId,
  guidedStage,
  isQaMode,
  onGuidedAnswer,
  onGuidedNext,
  onQaAnswer,
  onQaCompletePlayback,
  onReplay,
  onRestart,
  phase,
  quizSegments,
  retrySegment,
  scenario,
  segment,
  session,
}: {
  guidedAnswer: PracticeSegment['options'][number] | undefined
  guidedAnswerId: string | null
  guidedStage: GuidedStage
  isQaMode: boolean
  onGuidedAnswer: (optionId: string) => void
  onGuidedNext: () => void
  onQaAnswer: (correct: boolean) => void
  onQaCompletePlayback: () => void
  onReplay: () => void
  onRestart: () => void
  phase: PracticePhase
  quizSegments: PracticeSegment[]
  retrySegment: PracticeSegment | null
  scenario: ReturnType<typeof getCurrentScenario> extends infer T
    ? NonNullable<T>
    : never
  segment: PracticeSegment | null
  session: ReturnType<typeof createInitialPracticeState>
}) {
  if (session.isProgramComplete) {
    return (
      <aside className="practice-panel">
        <h2>모든 연습을 마쳤어요</h2>
        <p className="panel-copy">처음부터 다시 보려면 아래 버튼을 눌러요.</p>
        <button className="outline-button" onClick={onRestart} type="button">
          <RotateCcw size={16} />
          처음부터 다시 보기
        </button>
      </aside>
    )
  }

  if (phase === 'replay_full') {
    return (
      <aside className="practice-panel">
        <h2>같은 영상을 다시 봐요</h2>
        <p className="panel-copy">
          세그먼트별 연습을 끝냈어요. 이제 {scenario.title} 영상을 처음부터 끝까지
          다시 봐요.
        </p>
        <button className="outline-button" onClick={onReplay} type="button">
          <Play size={16} />
          다시 보기
        </button>
        <QaPanel
          enabled={isQaMode}
          onCorrect={() => onQaAnswer(true)}
          onEnd={onQaCompletePlayback}
          onWrong={() => onQaAnswer(false)}
        />
      </aside>
    )
  }

  if (phase === 'quiz_batch') {
    return (
      <aside className="practice-panel">
        <h2>정답을 가리고 다시 풀어요</h2>
        <p className="panel-copy">
          문제 {quizSegments.length}개를 한 번에 풀어요. 틀려도 바로 다음 문제로
          넘어가요.
        </p>
        <QaPanel
          enabled={isQaMode}
          onCorrect={() => onQaAnswer(true)}
          onEnd={onQaCompletePlayback}
          onWrong={() => onQaAnswer(false)}
        />
      </aside>
    )
  }

  if (phase === 'retry_wrong') {
    return (
      <aside className="practice-panel">
        <h2>틀린 장면만 다시 봐요</h2>
        <p className="panel-copy">
          {retrySegment?.label ?? '틀린 장면'}을 다시 본 뒤 같은 문제를 풀어요.
        </p>
        <button className="outline-button" onClick={onReplay} type="button">
          <RotateCcw size={16} />
          이 장면 다시 보기
        </button>
        <QaPanel
          enabled={isQaMode}
          onCorrect={() => onQaAnswer(true)}
          onEnd={onQaCompletePlayback}
          onWrong={() => onQaAnswer(false)}
        />
      </aside>
    )
  }

  if (!segment || guidedStage !== 'explanation') {
    return (
      <aside className="practice-panel">
        <h2>장면을 본 뒤 연습해요</h2>
        <button className="outline-button" onClick={onReplay} type="button">
          <PauseCircle size={16} />
          쉬기
        </button>
        <QaPanel
          enabled={isQaMode}
          onCorrect={() => onQaAnswer(true)}
          onEnd={onQaCompletePlayback}
          onWrong={() => onQaAnswer(false)}
        />
      </aside>
    )
  }

  const canAskQuestion =
    segment.practiceMode !== 'intro' &&
    segment.question.trim().length > 0 &&
    segment.options.length > 0
  const canContinue = canAskQuestion ? guidedAnswer?.correct === true : true
  const shouldEmphasizeNextButton = canContinue && canAskQuestion

  return (
    <aside className="practice-panel practice-panel-active">
      <SceneNarration segment={segment} />

      {canAskQuestion ? (
        <>
          <div className="practice-guidance-grid">
            <DoNotCard text={segment.options.find((option) => !option.correct)?.label ?? ''} />
            <ReasonCard text={segment.learnerExplanation} />
          </div>
          <section
            className={[
              'question-card',
              guidedAnswer ? '' : 'question-attention',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="question-topline">
              <h2>{segment.question}</h2>
              <span className={guidedAnswer ? 'answered' : ''}>
                {guidedAnswer ? '답을 골랐어요' : '여기를 골라요'}
              </span>
            </div>
            <div className="option-grid">
              {segment.options.map((option) => (
                <button
                  className={[
                    'option-button',
                    guidedAnswerId === option.id
                      ? option.correct
                        ? 'correct'
                        : 'wrong'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={guidedAnswer?.correct && guidedAnswerId !== option.id}
                  key={option.id}
                  onClick={() => onGuidedAnswer(option.id)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            {guidedAnswer ? (
              <p className="feedback">
                {guidedAnswer.correct ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <HelpCircle size={18} />
                )}
                {guidedAnswer.correct
                  ? '맞아요. 다음 장면으로 갈 수 있어요.'
                  : '괜찮아요. 이 장면을 다시 보고 맞는 답을 골라요.'}
              </p>
            ) : (
              <p className="feedback muted">답을 하나 고르면 다음으로 갈 수 있어요.</p>
            )}
          </section>
        </>
      ) : (
        <section className="intro-card">
          <h2>지금 장면</h2>
          <p>내용을 소개하는 부분이에요. 다음 장면에서 행동을 연습해요.</p>
        </section>
      )}

      <div className="panel-actions">
        <button className="outline-button" onClick={onReplay} type="button">
          <RotateCcw size={16} />이 장면 다시 보기
        </button>
        <button
          className={[
            'next-button',
            shouldEmphasizeNextButton ? 'next-ready-attention' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={!canContinue}
          onClick={onGuidedNext}
          type="button"
        >
          {shouldEmphasizeNextButton ? <span>이제 눌러요</span> : null}
          {canContinue ? '다음 장면 보기' : '답을 고르면 다음으로 가요'}
        </button>
      </div>

      <QaPanel
        enabled={isQaMode}
        onCorrect={() => onQaAnswer(true)}
        onEnd={onQaCompletePlayback}
        onWrong={() => onQaAnswer(false)}
      />
    </aside>
  )
}

function SceneNarration({ segment }: { segment: PracticeSegment }) {
  const steps =
    segment.actionSteps.length > 0
      ? [
          { kind: 'situation' as const, text: segment.learnerPrompt },
          ...segment.actionSteps.map((text) => ({ kind: 'action' as const, text })),
        ]
      : [{ kind: 'situation' as const, text: segment.learnerPrompt }]

  return (
    <section className="narration-card">
      <h2>순서대로 읽어봐요</h2>
      <ol>
        {steps.map((step, index) => (
          <li key={`${index}-${step.kind}-${step.text}`}>
            <LearnerSequenceCard index={index} step={step} />
          </li>
        ))}
      </ol>
    </section>
  )
}

function LearnerSequenceCard({
  index,
  step,
}: {
  index: number
  step: { kind: 'action' | 'situation'; text: string }
}) {
  const isSituation = step.kind === 'situation'

  return (
    <div
      className={[
        'sequence-card',
        isSituation ? 'sequence-card-situation' : 'sequence-card-action',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="sequence-meta">
        <span>{index + 1}번</span>
        <span className={isSituation ? 'badge-situation' : 'badge-action'}>
          {isSituation ? '상황' : '해야 할 일'}
        </span>
      </div>
      <p>{step.text}</p>
    </div>
  )
}

function DoNotCard({ text }: { text: string }) {
  return (
    <div className="do-not-card">
      <span>
        <TriangleAlert size={16} />
        하지 말아요
      </span>
      <strong>{text}</strong>
    </div>
  )
}

function ReasonCard({ text }: { text: string }) {
  return (
    <div className="reason-card">
      <h2>왜 이렇게 해야 할까요?</h2>
      <p>{text}</p>
    </div>
  )
}

function QuizModal({
  currentIndex,
  mode,
  onAnswer,
  retryRound,
  segment,
  totalCount,
}: {
  currentIndex: number
  mode: PracticePhase
  onAnswer: (selectedOptionId: string) => void
  retryRound: number
  segment: PracticeSegment
  totalCount: number
}) {
  const isRetry = mode === 'retry_wrong'

  return (
    <div className="quiz-backdrop" role="presentation">
      <section className="quiz-modal" aria-modal="true" role="dialog">
        <div className="quiz-topline">
          <span>
            {isRetry
              ? `${retryRound}번째 다시 풀기 ${currentIndex}/${totalCount}`
              : `문제 ${currentIndex}/${totalCount}`}
          </span>
          <span>{formatMs(segment.startMs)} 장면</span>
        </div>
        <p>{segment.learnerPrompt}</p>
        <h2>{segment.question}</h2>
        <strong>{segment.learnerExplanation}</strong>
        <div className="answer-list">
          {segment.options.map((option) => (
            <button
              className="answer-button"
              key={option.id}
              onClick={() => onAnswer(option.id)}
              type="button"
            >
              <span>{option.label}</span>
              <ArrowRight size={18} />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function QaPanel({
  enabled,
  onCorrect,
  onEnd,
  onWrong,
}: {
  enabled: boolean
  onCorrect: () => void
  onEnd: () => void
  onWrong: () => void
}) {
  if (!enabled) {
    return null
  }

  return (
    <div className="qa-panel" aria-label="QA controls">
      <strong>QA</strong>
      <button onClick={onEnd} type="button">
        영상 종료
      </button>
      <button onClick={onWrong} type="button">
        오답 선택
      </button>
      <button onClick={onCorrect} type="button">
        맞는 선택
      </button>
    </div>
  )
}

function waitForMetadata(video: HTMLVideoElement) {
  if (video.readyState >= 1) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('영상 정보를 불러오는 데 시간이 오래 걸립니다.'))
    }, 8000)

    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener('loadedmetadata', handleLoaded)
      video.removeEventListener('error', handleError)
    }

    const handleLoaded = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error('영상 파일을 불러오지 못했습니다.'))
    }

    video.addEventListener('loadedmetadata', handleLoaded, { once: true })
    video.addEventListener('error', handleError, { once: true })
  })
}

async function requestPlayback(video: HTMLVideoElement) {
  try {
    video.muted = false
    await video.play()
    return false
  } catch (error) {
    if (!isGesturePlaybackError(error)) {
      throw error
    }

    video.muted = true
    await video.play()
    return true
  }
}

function isGesturePlaybackError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' ||
      error.message.includes("user didn't interact"))
  )
}

function getSegmentStartSec(segment: PracticeSegment) {
  const rawStartSec = segment.startMs / 1000

  if (rawStartSec === 0) {
    return 0
  }

  return rawStartSec + segmentStartGuardSec
}

function getSegmentPreviewSec(segment: PracticeSegment) {
  if (segment.previewMs === undefined) {
    return getSegmentStartSec(segment)
  }

  return Math.min(segment.endMs / 1000, segment.previewMs / 1000)
}

function formatMs(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}
