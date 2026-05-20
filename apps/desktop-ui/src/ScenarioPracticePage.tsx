import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  TriangleAlert,
  CheckCircle2,
  HelpCircle,
  PauseCircle,
  Play,
  RotateCcw,
} from 'lucide-react'

import {
  learningScenarios,
  practiceSequenceScenarios,
  type TheaterSegment,
  type TheaterShow,
} from './lib/demo-theater-content'
import {
  simplifyLearnerCopy,
  simplifyLearnerReason,
  simplifyLearnerWarning,
} from './lib/learner-copy'
import { getLearnerActionCards } from './lib/learner-action-visibility'
import { cn } from './lib/utils'

type PracticeStage = 'explanation' | 'playback' | 'ready' | 'rest'

const defaultScenarioId = 'fire-grounded-flow'
const framePrecisionSec = 0.1
const segmentStartGuardSec = 0.02
const scenarioAliases: Record<string, string> = {
  'earthquake-review-flow': 'earthquake-protect-flow',
}

type PlaybackWindow = {
  clampSec: number
  index: number
  requestId: number
  segmentId: string
  startSec: number
}

type ScenarioReviewGroup = {
  doNotText: string | null
  segmentId: string
  steps: string[]
  title: string
}

export default function ScenarioPracticePage() {
  const scenario = selectScenarioFromPath()

  if (!scenario) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8f4] px-4 text-[#151713]">
        <section className="max-w-lg rounded-md border border-[#dfe4da] bg-white p-6">
          <h1 className="text-2xl font-semibold">연습 장면을 찾지 못했어요.</h1>
          <p className="mt-3 text-sm leading-6 text-[#596257]">
            다시 홈으로 가서 연습할 장면을 골라 주세요.
          </p>
          <a className="link-button mt-4" href="/">
            홈으로 가기
          </a>
        </section>
      </main>
    )
  }

  return <ScenarioPractice scenario={scenario} />
}

function ScenarioPractice({ scenario }: { scenario: TheaterShow }) {
  const [segmentIndex, setSegmentIndex] = useState(0)
  const [stage, setStage] = useState<PracticeStage>('ready')
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null)
  const [playbackNotice, setPlaybackNotice] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const explanationHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const autoPauseSegmentRef = useRef<string | null>(null)
  const pendingPlaybackIndexRef = useRef<number | null>(null)
  const playbackRequestIdRef = useRef(0)
  const playbackWindowRef = useRef<PlaybackWindow | null>(null)
  const stageRef = useRef<PracticeStage>('ready')
  const boundaryMonitorRef = useRef<number | null>(null)
  const [playRequestId, setPlayRequestId] = useState(0)
  const segment = scenario.segments[segmentIndex]
  const nextPractice = getNextScenario(scenario)
  const isFinalSegment = segmentIndex === scenario.segments.length - 1
  const reviewGroups = isFinalSegment
    ? buildScenarioReviewGroups(scenario, segmentIndex)
    : []
  const selectedAnswer = segment.answerOptions.find(
    (option) => option.id === selectedAnswerId,
  )

  const clearBoundaryMonitor = useCallback(() => {
    if (boundaryMonitorRef.current === null) {
      return
    }

    window.cancelAnimationFrame(boundaryMonitorRef.current)
    boundaryMonitorRef.current = null
  }, [])

  const clampSegmentPlayback = useCallback((video: HTMLVideoElement) => {
    const playbackWindow = playbackWindowRef.current

    if (!playbackWindow || stageRef.current !== 'playback') {
      return false
    }

    if (video.currentTime < playbackWindow.clampSec) {
      return false
    }

    video.pause()
    video.currentTime = playbackWindow.clampSec
    autoPauseSegmentRef.current = playbackWindow.segmentId
    pendingPlaybackIndexRef.current = null
    playbackWindowRef.current = null
    setStage('explanation')

    return true
  }, [])

  const startBoundaryMonitor = useCallback(() => {
    clearBoundaryMonitor()

    const tick = () => {
      const video = videoRef.current

      if (
        !video ||
        stageRef.current !== 'playback' ||
        !playbackWindowRef.current
      ) {
        boundaryMonitorRef.current = null
        return
      }

      if (clampSegmentPlayback(video)) {
        boundaryMonitorRef.current = null
        return
      }

      boundaryMonitorRef.current = window.requestAnimationFrame(tick)
    }

    boundaryMonitorRef.current = window.requestAnimationFrame(tick)
  }, [clampSegmentPlayback, clearBoundaryMonitor])

  useEffect(() => {
    stageRef.current = stage
  }, [stage])

  useEffect(() => {
    if (
      stage !== 'playback' ||
      pendingPlaybackIndexRef.current !== segmentIndex
    ) {
      return
    }

    const targetSegment = scenario.segments[segmentIndex]
    const playbackWindow = playbackWindowRef.current
    const video = videoRef.current
    let cancelled = false

    if (
      !video ||
      !playbackWindow ||
      playbackWindow.index !== segmentIndex ||
      playbackWindow.requestId !== playRequestId ||
      playbackWindow.segmentId !== targetSegment.id
    ) {
      return
    }

    video.pause()
    video.currentTime = playbackWindow.startSec

    void video
      .play()
      .then(() => {
        if (!cancelled) {
          startBoundaryMonitor()
        }
      })
      .catch((error: unknown) => {
        if (cancelled || isExpectedPlaybackInterruption(error)) {
          return
        }

        playbackWindowRef.current = null
        setPlaybackNotice('영상을 바로 재생하지 못했습니다. 다시 눌러 주세요.')
        setStage('ready')
      })

    return () => {
      cancelled = true
    }
  }, [
    playRequestId,
    scenario.segments,
    segmentIndex,
    stage,
    startBoundaryMonitor,
  ])

  useEffect(() => {
    if (stage !== 'ready') {
      return
    }

    const targetSegment = scenario.segments[segmentIndex]
    const video = videoRef.current

    if (!video) {
      return
    }

    video.pause()
    video.currentTime = getSegmentStartSec(targetSegment)
  }, [scenario.segments, segmentIndex, stage])

  useEffect(() => {
    if (stage !== 'explanation') {
      return
    }

    const focusTimer = window.setTimeout(() => {
      explanationHeadingRef.current?.focus()
    }, 0)

    return () => window.clearTimeout(focusTimer)
  }, [segment.id, stage])

  useEffect(() => {
    return () => clearBoundaryMonitor()
  }, [clearBoundaryMonitor])

  const playSegment = (nextIndex: number) => {
    const targetSegment = scenario.segments[nextIndex]
    const nextRequestId = playbackRequestIdRef.current + 1

    playbackRequestIdRef.current = nextRequestId
    playbackWindowRef.current = buildPlaybackWindow({
      index: nextIndex,
      requestId: nextRequestId,
      segment: targetSegment,
    })
    setSegmentIndex(nextIndex)
    setStage('playback')
    setSelectedAnswerId(null)
    setPlaybackNotice('')
    pendingPlaybackIndexRef.current = nextIndex
    autoPauseSegmentRef.current = null
    setPlayRequestId(nextRequestId)
  }

  const loadSegment = (nextIndex: number) => {
    const targetSegment = scenario.segments[nextIndex]
    const video = videoRef.current

    clearBoundaryMonitor()
    setSegmentIndex(nextIndex)
    setStage('ready')
    setSelectedAnswerId(null)
    setPlaybackNotice('')
    autoPauseSegmentRef.current = null
    pendingPlaybackIndexRef.current = null
    playbackWindowRef.current = null

    if (!video) {
      return
    }

    video.pause()
    video.currentTime = getSegmentStartSec(targetSegment)
  }

  const rest = () => {
    clearBoundaryMonitor()
    videoRef.current?.pause()
    playbackWindowRef.current = null
    pendingPlaybackIndexRef.current = null
    setStage('rest')
    setPlaybackNotice('')
  }

  const nextSegment = () => {
    if (!isFinalSegment) {
      playSegment(segmentIndex + 1)
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8f4] text-[#151713]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-2 px-4 py-1.5 lg:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe4da] pb-2">
          <a
            className="inline-flex min-h-9 items-center rounded-md bg-[#151713] px-3 py-1 text-sm font-semibold text-white"
            href="/"
          >
            안심트랙 연습
          </a>
          <a
            className="inline-flex min-h-9 items-center rounded-md border border-[#dfe4da] bg-white px-3 py-1 text-sm font-semibold text-[#151713]"
            href="/"
          >
            다른 연습 고르기
          </a>
        </header>

        <SafetyBanner notice={segment.safetyNotice} />

        <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,0.98fr)_minmax(440px,0.58fr)]">
          <section className="flex min-w-0 flex-col gap-3">
            <section className="overflow-hidden rounded-md border border-[#dfe4da] bg-black">
              <div className="relative h-[clamp(280px,39vh,520px)] bg-black">
                <video
                  key={scenario.id}
                  ref={videoRef}
                  className="h-full w-full object-contain"
                  onEnded={(event) => {
                    if (!clampSegmentPlayback(event.currentTarget)) {
                      playbackWindowRef.current = null
                      pendingPlaybackIndexRef.current = null
                      setStage('explanation')
                    }
                  }}
                  onLoadedMetadata={(event) => {
                    event.currentTarget.currentTime =
                      getSegmentStartSec(segment)
                  }}
                  onTimeUpdate={(event) => {
                    if (
                      stage === 'playback' &&
                      autoPauseSegmentRef.current !==
                        playbackWindowRef.current?.segmentId
                    ) {
                      clampSegmentPlayback(event.currentTarget)
                    }
                  }}
                  playsInline
                  poster={scenario.posterSrc}
                  preload="auto"
                >
                  <source src={scenario.videoSrc} type="video/mp4" />
                </video>

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/76 via-black/10 to-black/44" />

                <div className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                  <div className="rounded-md border border-white/12 bg-black/42 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm">
                    {scenario.title}
                  </div>
                  <div className="rounded-md border border-white/12 bg-black/42 px-3 py-2 text-sm text-white/86 backdrop-blur-sm">
                    {segmentIndex + 1} / {scenario.segments.length}
                  </div>
                </div>

                {stage === 'ready' ? (
                  <button
                    aria-label="영상 시작하기"
                    className="absolute inset-0 flex items-center justify-center"
                    onClick={() => {
                      playSegment(segmentIndex)
                    }}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-3 rounded-md border border-white/16 bg-black/58 px-7 py-4 text-xl font-semibold text-white backdrop-blur-sm">
                      <Play className="size-6" />
                      시작하기
                    </span>
                  </button>
                ) : null}
              </div>
            </section>

            <div className="flex gap-2">
              {scenario.segments.map((item, index) => (
                <button
                  key={item.id}
                  aria-label={`${index + 1}번째 장면`}
                  className="flex min-h-10 flex-1 items-center gap-2 rounded-md border border-[#dfe4da] bg-white px-2"
                  onClick={() => loadSegment(index)}
                  type="button"
                >
                  <span
                    className={cn(
                      'h-2 flex-1 rounded-full transition',
                      index < segmentIndex
                        ? 'bg-emerald-500'
                        : index === segmentIndex
                          ? 'bg-[#151713]'
                          : 'bg-[#dfe4da]',
                    )}
                  />
                  <span className="text-xs font-semibold text-[#596257]">
                    {index + 1}번
                  </span>
                </button>
              ))}
            </div>

            <PracticeHero
              headingRef={explanationHeadingRef}
              playbackNotice={playbackNotice}
              segment={segment}
              stage={stage}
            />
          </section>

          <PracticePanel
            isFinalSegment={isFinalSegment}
            nextPractice={nextPractice}
            onNext={nextSegment}
            onReplay={() => playSegment(segmentIndex)}
            onRestart={() => playSegment(0)}
            onRest={rest}
            reviewGroups={reviewGroups}
            segment={segment}
            selectedAnswerId={selectedAnswerId}
            selectedAnswer={selectedAnswer}
            setSelectedAnswerId={setSelectedAnswerId}
            stage={stage}
          />
        </div>
      </div>
    </main>
  )
}

function PracticeHero({
  headingRef,
  playbackNotice,
  segment,
  stage,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  playbackNotice: string
  segment: TheaterSegment
  stage: PracticeStage
}) {
  const isResting = stage === 'rest'
  const isExplaining = stage === 'explanation'

  return (
    <section className="rounded-md border border-[#dfe4da] bg-white p-4 [container-type:inline-size]">
      <p className="text-sm font-semibold text-[#596257]">
        {isResting ? '잠깐 멈췄어요.' : segment.learnerPrompt}
      </p>
      <h1
        ref={isExplaining ? headingRef : undefined}
        tabIndex={isExplaining ? -1 : undefined}
        className="mt-1 whitespace-nowrap text-[clamp(2rem,5cqw,4rem)] font-semibold leading-[1.03] tracking-tight outline-none"
      >
        {isResting
          ? '잠깐 쉬어도 괜찮아요.'
          : isExplaining
            ? segment.learnerExplanation
            : '영상을 보고 멈추면 같이 연습해요.'}
      </h1>
      {isResting ? (
        <p className="mt-2 text-lg font-semibold leading-7 text-[#596257]">
          필요하면 선생님이나 보호자를 불러요.
        </p>
      ) : null}
      {playbackNotice ? (
        <p className="mt-4 text-sm leading-6 text-amber-700">
          {playbackNotice}
        </p>
      ) : null}
    </section>
  )
}

function PracticePanel({
  isFinalSegment,
  nextPractice,
  onNext,
  onReplay,
  onRestart,
  onRest,
  reviewGroups,
  segment,
  selectedAnswer,
  selectedAnswerId,
  setSelectedAnswerId,
  stage,
}: {
  isFinalSegment: boolean
  nextPractice: TheaterShow | null
  onNext: () => void
  onReplay: () => void
  onRestart: () => void
  onRest: () => void
  reviewGroups: ScenarioReviewGroup[]
  segment: TheaterSegment
  selectedAnswer?: TheaterSegment['answerOptions'][number]
  selectedAnswerId: string | null
  setSelectedAnswerId: (value: string) => void
  stage: PracticeStage
}) {
  const [reviewIndex, setReviewIndex] = useState(0)
  const learnerActionCards = getLearnerActionCards(segment)
  const isIntroSegment = segment.practiceMode === 'intro'
  const isReviewSegment = isFinalSegment && reviewGroups.length > 0
  const canAskQuestion = !isIntroSegment && learnerActionCards.length > 0
  const canContinue = canAskQuestion ? selectedAnswer?.correct === true : true
  const learnerDoNotText = canAskQuestion ? getLearnerDoNotText(segment) : null
  const safeReviewIndex = Math.min(
    reviewIndex,
    Math.max(reviewGroups.length - 1, 0),
  )

  if (stage === 'rest') {
    return (
      <section className="rounded-md border border-[#dfe4da] bg-white p-4">
        <h2 className="text-xl font-semibold">쉬기</h2>
        <p className="mt-2 text-xl font-semibold leading-8 text-[#596257]">
          준비되면 같은 장면을 다시 볼 수 있어요.
        </p>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#dfe4da] bg-white px-4 py-2 text-base font-medium text-[#151713]"
          onClick={onReplay}
          type="button"
        >
          <Play className="size-4" />
          다시 보기
        </button>
      </section>
    )
  }

  if (stage !== 'explanation') {
    return (
      <section className="rounded-md border border-[#dfe4da] bg-white p-4">
        <h2 className="text-xl font-semibold">장면을 본 뒤 연습해요</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {stage === 'playback' ? (
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#dfe4da] bg-white px-4 py-2 text-base font-medium text-[#151713]"
              onClick={onReplay}
              type="button"
            >
              <Play className="size-4" />
              다시 보기
            </button>
          ) : null}
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#dfe4da] bg-white px-4 py-2 text-base font-medium text-[#151713]"
            onClick={onRest}
            type="button"
          >
            <PauseCircle className="size-4" />
            쉬기
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-md border border-[#dfe4da] bg-white p-3">
      {isReviewSegment ? (
        <ScenarioReviewCarousel
          groups={reviewGroups}
          reviewIndex={safeReviewIndex}
          setReviewIndex={setReviewIndex}
        />
      ) : (
        <SceneNarrationList segment={segment} />
      )}

      <div className="mt-3 grid gap-2">
        {isReviewSegment ? (
          <section className="rounded-md border border-[#dfe4da] bg-[#f7f8f4] px-3 py-2">
            <h2 className="text-lg font-semibold">전체 복습</h2>
            <p className="mt-2 text-lg font-semibold leading-7 text-[#596257]">
              오늘 배운 행동을 장면 순서대로 다시 봐요.
            </p>
          </section>
        ) : isIntroSegment ? (
          <section className="rounded-md border border-[#dfe4da] bg-[#f7f8f4] px-3 py-2">
            <h2 className="text-lg font-semibold">지금 장면</h2>
            <p className="mt-2 text-lg font-semibold leading-7 text-[#596257]">
              내용을 소개하는 부분이에요. 다음 장면에서 행동을 연습해요.
            </p>
          </section>
        ) : (
          <>
            <h2 className="text-lg font-semibold">지금 할 일</h2>
            {canAskQuestion ? (
              <div className="grid gap-2 sm:grid-cols-3">
                {learnerActionCards.map((card) => (
                  <div
                    key={`${card.order}-${card.label}`}
                    className="rounded-md border border-[#151713] bg-[#151713] px-3 py-2 text-white"
                  >
                    <p className="text-xs font-semibold text-white/70">
                      {getActionStepLabel(
                        card.order,
                        learnerActionCards.length,
                      )}
                    </p>
                    <p className="mt-1 text-base font-semibold leading-6">
                      {card.label}
                    </p>
                  </div>
                ))}
                {learnerDoNotText ? (
                  <DoNotCard text={learnerDoNotText} />
                ) : null}
              </div>
            ) : (
              <p className="rounded-md border border-[#dfe4da] bg-[#f7f8f4] px-4 py-4 text-xl font-semibold leading-8 text-[#596257]">
                확실하지 않아요. 선생님이나 보호자와 공식 안내를 확인해요.
              </p>
            )}
          </>
        )}
      </div>

      {canAskQuestion ? (
        <section
          className={cn(
            'mt-2 rounded-md border bg-[#f7f8f4] p-1.5 transition',
            selectedAnswer
              ? 'border-[#dfe4da]'
              : 'question-attention border-emerald-500',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{segment.checkQuestion}</h2>
            <span
              className={cn(
                'shrink-0 rounded-md px-2 py-1 text-xs font-semibold',
                selectedAnswer
                  ? 'bg-[#e9eee9] text-[#596257]'
                  : 'bg-emerald-700 text-white',
              )}
            >
              {selectedAnswer ? '답을 골랐어요' : '여기를 골라요'}
            </span>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {segment.answerOptions.map((option) => (
              <button
                key={option.id}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-left text-base font-semibold transition',
                  selectedAnswer?.correct &&
                    selectedAnswerId !== option.id &&
                    'cursor-not-allowed opacity-55',
                  selectedAnswerId === option.id
                    ? option.correct
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-amber-500 bg-amber-50 text-amber-950'
                    : 'border-[#dfe4da] bg-white text-[#151713] hover:border-[#151713]/40',
                )}
                disabled={
                  selectedAnswer?.correct && selectedAnswerId !== option.id
                }
                onClick={() => {
                  if (selectedAnswer?.correct) {
                    return
                  }

                  setSelectedAnswerId(option.id)
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {selectedAnswer ? (
            <div className="mt-2 grid gap-1.5">
              <p className="flex items-center gap-2 text-sm font-semibold leading-6">
                {selectedAnswer.correct ? (
                  <CheckCircle2 className="size-5" />
                ) : (
                  <HelpCircle className="size-5" />
                )}
                {selectedAnswer.feedback}
              </p>
              <div className="rounded-md border border-[#dfe4da] bg-white px-3 py-1">
                <p className="text-sm font-semibold leading-6">
                  <span className="mr-2 text-[#596257]">이유</span>
                  {getLearnerReasonText(segment.explanation.tracks.reason)}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm font-semibold leading-6 text-[#596257]">
              답을 하나 고르면 다음으로 갈 수 있어요.
            </p>
          )}
        </section>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#dfe4da] bg-white px-3 py-1 text-sm font-medium text-[#151713]"
          onClick={onReplay}
          type="button"
        >
          <RotateCcw className="size-4" />이 장면 다시 보기
        </button>
        <button
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#dfe4da] bg-white px-3 py-1 text-sm font-medium text-[#151713]"
          onClick={onRest}
          type="button"
        >
          <PauseCircle className="size-4" />
          쉬기
        </button>
        {isFinalSegment ? (
          <FinalPracticeActions
            canContinue={canContinue}
            nextPractice={nextPractice}
            onRestart={onRestart}
          />
        ) : (
          <button
            aria-label={
              canContinue ? '다음 장면 보기' : '답을 고르면 다음 장면으로 가요'
            }
            className={cn(
              'inline-flex min-h-9 items-center gap-2 rounded-md border border-[#151713] bg-[#151713] px-3 py-1 text-sm font-semibold text-white',
              canContinue && canAskQuestion && 'next-ready-attention',
              !canContinue && 'cursor-not-allowed opacity-50',
            )}
            disabled={!canContinue}
            onClick={onNext}
            type="button"
          >
            {canContinue && canAskQuestion ? (
              <span className="rounded bg-white/18 px-1.5 py-0.5 text-xs">
                이제 눌러요
              </span>
            ) : null}
            {canContinue ? '다음 장면 보기' : '답을 고르면 다음으로 가요'}
          </button>
        )}
      </div>
    </section>
  )
}

function DoNotCard({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-rose-400 bg-rose-50 px-3 py-2 text-rose-950">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <TriangleAlert className="size-4 shrink-0" />
        하지 말아요
      </div>
      <p className="mt-1 text-base font-semibold leading-6">{text}</p>
    </div>
  )
}

function ScenarioReviewCarousel({
  groups,
  reviewIndex,
  setReviewIndex,
}: {
  groups: ScenarioReviewGroup[]
  reviewIndex: number
  setReviewIndex: (value: number) => void
}) {
  const group = groups[reviewIndex]
  const canGoPrevious = reviewIndex > 0
  const canGoNext = reviewIndex < groups.length - 1

  if (!group) {
    return null
  }

  return (
    <section className="rounded-md border border-[#dfe4da] bg-[#f7f8f4] p-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">한 장씩 복습해요</h2>
          <p className="mt-1 text-sm leading-6 text-[#596257]">
            해야 할 일과 하지 말 일을 같이 봐요.
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-[#151713] px-2 py-1 text-sm font-semibold text-white">
          {reviewIndex + 1} / {groups.length}
        </span>
      </div>

      <article className="mt-2 rounded-md border border-[#dfe4da] bg-white p-3">
        <h3 className="text-2xl font-semibold leading-8">{group.title}</h3>

        <section className="mt-3">
          <p className="text-sm font-semibold text-emerald-900">해야 할 일</p>
          <ol className="mt-2 grid gap-2">
            {group.steps.map((step, stepIndex) => (
              <li
                key={`${group.segmentId}-${step}`}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2"
              >
                <span className="text-xs font-semibold text-emerald-900">
                  {stepIndex + 1}번
                </span>
                <p className="mt-1 text-lg font-semibold leading-7">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        {group.doNotText ? (
          <section className="mt-3 rounded-md border border-rose-400 bg-rose-50 px-3 py-2 text-rose-950">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <TriangleAlert className="size-4 shrink-0" />
              하지 말아요
            </div>
            <p className="mt-1 text-lg font-semibold leading-7">
              {group.doNotText}
            </p>
          </section>
        ) : null}
      </article>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          className="inline-flex min-h-9 items-center rounded-md border border-[#dfe4da] bg-white px-3 py-1 text-sm font-semibold text-[#151713] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!canGoPrevious}
          onClick={() => setReviewIndex(reviewIndex - 1)}
          type="button"
        >
          이전 복습
        </button>
        <div className="flex gap-1">
          {groups.map((item, index) => (
            <span
              key={item.segmentId}
              aria-label={`복습 ${index + 1}`}
              className={cn(
                'size-2 rounded-full',
                index === reviewIndex ? 'bg-[#151713]' : 'bg-[#cfd6cc]',
              )}
            />
          ))}
        </div>
        <button
          className="inline-flex min-h-9 items-center rounded-md border border-[#151713] bg-[#151713] px-3 py-1 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:border-[#dfe4da] disabled:bg-white disabled:text-[#596257]"
          disabled={!canGoNext}
          onClick={() => setReviewIndex(reviewIndex + 1)}
          type="button"
        >
          다음 복습
        </button>
      </div>
    </section>
  )
}

function SceneNarrationList({ segment }: { segment: TheaterSegment }) {
  const steps = segment.learnerSequence

  return (
    <section className="rounded-md border border-[#dfe4da] bg-[#f7f8f4] p-2">
      <h2 className="text-lg font-semibold">순서대로 읽어봐요</h2>
      <ol className="mt-2 grid gap-2">
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
  step: TheaterSegment['learnerSequence'][number]
}) {
  const tone = getLearnerSequenceTone(step.kind)

  return (
    <div className={cn('rounded-md border px-3 py-1', tone.cardClassName)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[#596257]">
          {index + 1}번
        </span>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-xs font-semibold',
            tone.badgeClassName,
          )}
        >
          {step.kind === 'situation' ? '상황' : '해야 할 일'}
        </span>
      </div>
      <p className="mt-1 text-base font-semibold leading-5 text-[#151713]">
        {step.text}
      </p>
    </div>
  )
}

function getLearnerSequenceTone(
  kind: TheaterSegment['learnerSequence'][number]['kind'],
) {
  if (kind === 'situation') {
    return {
      badgeClassName: 'bg-sky-100 text-sky-900',
      cardClassName: 'border-sky-200 bg-sky-50',
    }
  }

  return {
    badgeClassName: 'bg-emerald-100 text-emerald-900',
    cardClassName: 'border-emerald-200 bg-emerald-50',
  }
}

function FinalPracticeActions({
  canContinue,
  nextPractice,
  onRestart,
}: {
  canContinue: boolean
  nextPractice: TheaterShow | null
  onRestart: () => void
}) {
  const nextHref = nextPractice ? `/scenario/${nextPractice.id}` : '/'
  const nextPracticeNote = nextPractice
    ? simplifyLearnerCopy(nextPractice.homeNote ?? nextPractice.note)
    : null

  return (
    <>
      {canContinue ? (
        <a
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#151713] bg-[#151713] px-3 py-1.5 text-sm font-semibold text-white"
          href={nextHref}
        >
          {nextPractice ? '다음 연습으로 가기' : '오늘 연습 끝내기'}
        </a>
      ) : (
        <button
          className="inline-flex min-h-10 cursor-not-allowed items-center gap-2 rounded-md border border-[#151713] bg-[#151713] px-3 py-1.5 text-sm font-semibold text-white opacity-50"
          disabled
          type="button"
        >
          {nextPractice
            ? '맞는 답을 고르면 다음 연습으로 가요'
            : '맞는 답을 고르면 마칠 수 있어요'}
        </button>
      )}
      <a
        aria-label={
          nextPractice
            ? `다음 연습 ${nextPractice.title} ${nextPracticeNote}`
            : '처음 화면으로 가기'
        }
        className={cn(
          'inline-flex min-h-10 max-w-full flex-col items-start gap-0.5 rounded-md border border-[#dfe4da] bg-white px-3 py-1.5 text-left text-[#151713]',
          !canContinue && 'pointer-events-none opacity-55',
        )}
        href={nextHref}
      >
        <span className="text-xs font-semibold text-[#596257]">
          {nextPractice ? '다음 연습' : '연습 완료'}
        </span>
        <span className="text-sm font-semibold">
          {nextPractice ? nextPractice.title : '처음 화면으로 가요'}
        </span>
        <span className="text-xs leading-5 text-[#596257]">
          {nextPractice
            ? nextPracticeNote
            : '다른 연습을 고르거나 처음부터 다시 볼 수 있어요.'}
        </span>
      </a>
      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#dfe4da] bg-white px-3 py-1.5 text-sm font-medium text-[#151713]"
        onClick={onRestart}
        type="button"
      >
        <RotateCcw className="size-4" />
        처음부터 다시 보기
      </button>
    </>
  )
}

function SafetyBanner({ notice }: { notice: string }) {
  return (
    <section className="rounded-md border border-amber-300 bg-amber-50 px-4 py-1 text-amber-950">
      <p className="text-sm font-semibold leading-6">
        <span className="mr-3 text-sm">연습 전에 기억해요</span>
        {notice}
      </p>
    </section>
  )
}

function getLearnerDoNotText(segment: TheaterSegment) {
  const directWarning =
    segment.structuredExplanation.tracks.doNot?.text ??
    segment.explanation.doNot
  const suppressedWarning =
    segment.structuredExplanation.suppressedCandidates.find(
      (candidate) => candidate.category === 'unsafe_action',
    )?.candidate
  const warning = directWarning ?? suppressedWarning

  if (!warning) {
    return null
  }

  return simplifyLearnerWarning(warning)
}

function getLearnerReasonText(reason: string) {
  return simplifyLearnerReason(reason)
}

function buildPlaybackWindow({
  index,
  requestId,
  segment,
}: {
  index: number
  requestId: number
  segment: TheaterSegment
}): PlaybackWindow {
  const startSec = getSegmentStartSec(segment)
  const rawEndSec = segment.endMs / 1000
  const clampSec = Math.max(startSec, rawEndSec - framePrecisionSec)

  return {
    clampSec,
    index,
    requestId,
    segmentId: segment.id,
    startSec,
  }
}

function getSegmentStartSec(segment: TheaterSegment) {
  const rawStartSec = segment.startMs / 1000

  if (rawStartSec === 0) {
    return 0
  }

  return rawStartSec + segmentStartGuardSec
}

function getActionStepLabel(order: number, total: number) {
  void total
  return `${order}번`
}

function buildScenarioReviewGroups(
  scenario: TheaterShow,
  currentIndex: number,
): ScenarioReviewGroup[] {
  return scenario.segments
    .slice(0, currentIndex + 1)
    .map((item) => ({
      doNotText: getLearnerDoNotText(item),
      segmentId: item.id,
      steps: getLearnerActionCards(item).map((card) => card.label),
      title: item.label,
    }))
    .filter((group) => group.steps.length > 0)
}

function selectScenarioFromPath() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const id =
    pathname === '/demo'
      ? defaultScenarioId
      : pathname.startsWith('/scenario/')
        ? decodeURIComponent(pathname.replace('/scenario/', ''))
        : defaultScenarioId

  const canonicalId = scenarioAliases[id] ?? id

  return (
    learningScenarios.find((scenario) => scenario.id === canonicalId) ?? null
  )
}

function getNextScenario(currentScenario: TheaterShow) {
  const index = practiceSequenceScenarios.findIndex(
    (scenario) => scenario.id === currentScenario.id,
  )

  if (index === -1 || index >= practiceSequenceScenarios.length - 1) {
    return null
  }

  return practiceSequenceScenarios[index + 1]!
}

function isExpectedPlaybackInterruption(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  return (
    error.name === 'AbortError' ||
    error.message.includes('interrupted by a call to pause')
  )
}
