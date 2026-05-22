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
import { isLocalSeasonalEnabled } from './lib/local-seasonal'
import { appHref, getAppRoute, publicAssetSrc } from './lib/routes'
import { cn } from './lib/utils'
import {
  loadGeneratedScenario,
  saveGeneratedScenario,
  toGeneratedTheaterShow,
  type GeneratedScenarioRecord,
} from './lib/generated-scenario'
import { getGeneratorApiConfig } from './lib/url-generator-api'

type PracticeStage = 'explanation' | 'playback' | 'ready' | 'rest'

const defaultScenarioId = 'fire-grounded-flow'
const framePrecisionSec = 0.45
const segmentStartGuardSec = 0.02
const scenarioAliases: Record<string, string> = {
  'earthquake-review-flow': 'earthquake-protect-flow',
}
const defaultSurveyFormUrl = 'https://forms.gle/nzCofnS9KosQ3X566'
const surveyFormUrl =
  import.meta.env.VITE_SURVEY_FORM_URL?.trim() || defaultSurveyFormUrl

type PlaybackWindow = {
  freezeSec: number
  index: number
  pauseAtSec: number
  requestId: number
  segmentId: string
  startSec: number
}

type ScenarioReviewGroup = {
  doNotText: string | null
  segmentId: string
  situationText: string
  steps: string[]
  title: string
}

export default function ScenarioPracticePage() {
  const [remoteGeneratedScenario, setRemoteGeneratedScenario] =
    useState<TheaterShow | null>(null)
  const [isLoadingGeneratedScenario, setIsLoadingGeneratedScenario] =
    useState(false)
  const scenario = selectScenarioFromPath() ?? remoteGeneratedScenario

  useEffect(() => {
    if (scenario) {
      return
    }

    const id = getScenarioIdFromPath()
    if (!id.startsWith('generated-')) {
      return
    }

    let isActive = true
    setIsLoadingGeneratedScenario(true)

    loadGeneratedScenarioFromAsset(id)
      .then((loadedScenario) => {
        if (isActive) {
          setRemoteGeneratedScenario(loadedScenario)
        }
      })
      .catch(() => {
        if (isActive) {
          setRemoteGeneratedScenario(null)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingGeneratedScenario(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [scenario])

  if (!scenario) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8f4] px-4 text-[#151713]">
        <section className="max-w-lg rounded-md border border-[#dfe4da] bg-white p-6">
          <h1 className="text-2xl font-semibold">
            {isLoadingGeneratedScenario
              ? '연습 장면을 불러오고 있어요.'
              : '연습 장면을 찾지 못했어요.'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#596257]">
            {isLoadingGeneratedScenario
              ? '생성된 학습 화면을 서버에서 확인하고 있습니다.'
              : '다시 홈으로 가서 연습할 장면을 골라 주세요.'}
          </p>
          <a className="link-button mt-4" href={appHref('/')}>
            홈으로 가기
          </a>
        </section>
      </main>
    )
  }

  return <ScenarioPractice key={scenario.id} scenario={scenario} />
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
  const youtubePlaybackTimerRef = useRef<number | null>(null)
  const [playRequestId, setPlayRequestId] = useState(0)
  const [youtubePlaybackRequestId, setYoutubePlaybackRequestId] = useState(0)
  const [showSurveyDialog, setShowSurveyDialog] = useState(false)
  const segment = scenario.segments[segmentIndex]
  const nextPractice = getNextScenario(scenario)
  const usesYouTubePlayback = isYouTubePlaybackScenario(scenario)
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

  const clearYoutubePlaybackTimer = useCallback(() => {
    if (youtubePlaybackTimerRef.current === null) {
      return
    }

    window.clearTimeout(youtubePlaybackTimerRef.current)
    youtubePlaybackTimerRef.current = null
  }, [])

  const clampSegmentPlayback = useCallback((video: HTMLVideoElement) => {
    const playbackWindow = playbackWindowRef.current

    if (!playbackWindow || stageRef.current !== 'playback') {
      return false
    }

    if (video.currentTime < playbackWindow.pauseAtSec) {
      return false
    }

    video.pause()
    video.currentTime = playbackWindow.freezeSec
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
      usesYouTubePlayback ||
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
    usesYouTubePlayback,
  ])

  useEffect(() => {
    if (usesYouTubePlayback || stage !== 'ready') {
      return
    }

    const targetSegment = scenario.segments[segmentIndex]
    const video = videoRef.current

    if (!video) {
      return
    }

    video.pause()
    video.currentTime = getSegmentPreviewSec(targetSegment)
  }, [scenario.segments, segmentIndex, stage, usesYouTubePlayback])

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
    return () => {
      clearBoundaryMonitor()
      clearYoutubePlaybackTimer()
    }
  }, [clearBoundaryMonitor, clearYoutubePlaybackTimer])

  const playSegment = (nextIndex: number) => {
    const targetSegment = scenario.segments[nextIndex]
    const nextRequestId = playbackRequestIdRef.current + 1

    clearBoundaryMonitor()
    clearYoutubePlaybackTimer()
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

    if (usesYouTubePlayback) {
      setYoutubePlaybackRequestId(nextRequestId)
      const playbackWindow = playbackWindowRef.current
      const durationMs = playbackWindow
        ? Math.max(
            2200,
            (playbackWindow.pauseAtSec - playbackWindow.startSec) * 1000 + 650,
          )
        : 5000

      youtubePlaybackTimerRef.current = window.setTimeout(() => {
        pendingPlaybackIndexRef.current = null
        playbackWindowRef.current = null
        setStage('explanation')
      }, durationMs)
      return
    }

    setPlayRequestId(nextRequestId)
  }

  const loadSegment = (nextIndex: number) => {
    const targetSegment = scenario.segments[nextIndex]
    const video = videoRef.current

    clearBoundaryMonitor()
    clearYoutubePlaybackTimer()
    setSegmentIndex(nextIndex)
    setStage('ready')
    setSelectedAnswerId(null)
    setPlaybackNotice('')
    autoPauseSegmentRef.current = null
    pendingPlaybackIndexRef.current = null
    playbackWindowRef.current = null

    if (usesYouTubePlayback || !video) {
      return
    }

    video.pause()
    video.currentTime = getSegmentPreviewSec(targetSegment)
  }

  const rest = () => {
    clearBoundaryMonitor()
    clearYoutubePlaybackTimer()
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
        <SafetyBanner notice={segment.safetyNotice} />
        {scenario.generatedSourceUrl ? (
          <GeneratedSourceBanner scenario={scenario} />
        ) : null}

        <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,0.98fr)_minmax(440px,0.58fr)]">
          <section className="flex min-w-0 flex-col gap-3">
            <section className="overflow-hidden rounded-md border border-[#dfe4da] bg-black">
              <div className="relative h-[clamp(280px,39vh,520px)] bg-black">
                {usesYouTubePlayback ? (
                  <iframe
                    key={`${scenario.id}-${segment.id}-${stage}-${youtubePlaybackRequestId}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="h-full w-full"
                    referrerPolicy="strict-origin-when-cross-origin"
                    src={buildYouTubeFrameSrc({
                      requestId: youtubePlaybackRequestId,
                      scenario,
                      segment,
                      stage,
                    })}
                    title={scenario.generatedSourceTitle ?? scenario.title}
                  />
                ) : (
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
                        getSegmentPreviewSec(segment)
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
                    poster={publicAssetSrc(scenario.posterSrc)}
                    preload="auto"
                  >
                    <source
                      src={publicAssetSrc(scenario.videoSrc)}
                      type="video/mp4"
                    />
                  </video>
                )}

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

            <div className="grid grid-cols-[repeat(auto-fit,minmax(2.35rem,1fr))] gap-2">
              {scenario.segments.map((item, index) => (
                <button
                  key={item.id}
                  aria-label={`${index + 1}번째 장면`}
                  className={cn(
                    'flex min-h-10 items-center justify-center rounded-md border px-2 text-sm font-semibold transition',
                    index < segmentIndex
                      ? 'border-emerald-300 bg-emerald-100 text-emerald-950'
                      : index === segmentIndex
                        ? 'border-[#151713] bg-[#151713] text-white'
                        : 'border-[#dfe4da] bg-white text-[#596257] hover:border-[#151713]/40',
                  )}
                  onClick={() => loadSegment(index)}
                  type="button"
                >
                  {index + 1}
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
            key={segment.id}
            nextPractice={nextPractice}
            onNext={nextSegment}
            onReplay={() => playSegment(segmentIndex)}
            onRestart={() => playSegment(0)}
            onRest={rest}
            onShowSurvey={() => setShowSurveyDialog(true)}
            reviewGroups={reviewGroups}
            segment={segment}
            selectedAnswerId={selectedAnswerId}
            selectedAnswer={selectedAnswer}
            setSelectedAnswerId={setSelectedAnswerId}
            stage={stage}
          />
        </div>
      </div>
      {showSurveyDialog ? (
        <SurveyDialog onClose={() => setShowSurveyDialog(false)} />
      ) : null}
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
  const headingText = isResting
    ? '잠깐 쉬어도 괜찮아요.'
    : isExplaining
      ? segment.learnerExplanation
      : '영상을 보고 멈추면 같이 연습해요.'
  const headingLengthClassName =
    headingText.length > 56
      ? 'text-[clamp(1.35rem,2.1cqw,2.25rem)] leading-[1.12]'
      : headingText.length > 40
        ? 'text-[clamp(1.6rem,2.75cqw,2.85rem)] leading-[1.1]'
        : headingText.length > 26
          ? 'text-[clamp(1.85rem,3.6cqw,3.35rem)] leading-[1.08]'
          : 'text-[clamp(2rem,5cqw,4rem)] leading-[1.03]'

  return (
    <section className="rounded-md border border-[#dfe4da] bg-white p-4 [container-type:inline-size]">
      <p className="text-sm font-semibold text-[#596257]">
        {isResting ? '잠깐 멈췄어요.' : segment.learnerPrompt}
      </p>
      <h1
        ref={isExplaining ? headingRef : undefined}
        tabIndex={isExplaining ? -1 : undefined}
        className={cn(
          'mt-1 max-w-full break-keep font-semibold tracking-tight outline-none',
          headingLengthClassName,
        )}
      >
        {headingText}
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
  onShowSurvey,
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
  onShowSurvey: () => void
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
  const safeReviewIndex = Math.min(
    reviewIndex,
    Math.max(reviewGroups.length - 1, 0),
  )
  const reviewComplete =
    !isReviewSegment || safeReviewIndex >= reviewGroups.length - 1
  const canAskQuestion = !isIntroSegment && learnerActionCards.length > 0
  const canContinue = canAskQuestion ? selectedAnswer?.correct === true : true
  const shouldEmphasizeNextButton =
    canContinue && (canAskQuestion || isIntroSegment)
  const learnerDoNotText = canAskQuestion ? getLearnerDoNotText(segment) : null
  const learnerReasonText = canAskQuestion
    ? getLearnerReasonText(segment.explanation.tracks.reason)
    : null
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
            {canAskQuestion ? (
              <div className="grid gap-2">
                {learnerDoNotText ? (
                  <DoNotCard text={learnerDoNotText} />
                ) : null}
                {learnerReasonText ? (
                  <ReasonCard text={learnerReasonText} />
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
            onShowSurvey={onShowSurvey}
            reviewComplete={reviewComplete}
          />
        ) : (
          <button
            aria-label={
              canContinue ? '다음 장면 보기' : '답을 고르면 다음 장면으로 가요'
            }
            className={cn(
              'inline-flex min-h-9 items-center gap-2 rounded-md border border-[#151713] bg-[#151713] px-3 py-1 text-sm font-semibold text-white',
              shouldEmphasizeNextButton && 'next-ready-attention',
              !canContinue && 'cursor-not-allowed opacity-50',
            )}
            disabled={!canContinue}
            onClick={onNext}
            type="button"
          >
            {shouldEmphasizeNextButton ? (
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
    <div className="rounded-md border border-rose-400 bg-rose-50 px-4 py-3 text-rose-950">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <TriangleAlert className="size-4 shrink-0" />
        하지 말아요
      </div>
      <p className="mt-1 text-lg font-semibold leading-7">{text}</p>
    </div>
  )
}

function ReasonCard({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
      <h2 className="text-base font-semibold">왜 이렇게 해야 할까요?</h2>
      <p className="mt-1 text-lg font-semibold leading-7">{text}</p>
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

        <section className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2">
          <p className="text-sm font-semibold text-sky-900">상황</p>
          <p className="mt-1 text-lg font-semibold leading-7">
            {group.situationText}
          </p>
        </section>

        <section className="mt-2">
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
          className={cn(
            'inline-flex min-h-9 items-center gap-2 rounded-md border border-[#151713] bg-[#151713] px-3 py-1 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:border-[#dfe4da] disabled:bg-white disabled:text-[#596257]',
            canGoNext && 'next-ready-attention',
          )}
          disabled={!canGoNext}
          onClick={() => setReviewIndex(reviewIndex + 1)}
          type="button"
        >
          {canGoNext ? (
            <span className="rounded bg-white/18 px-1.5 py-0.5 text-xs">
              이어서 봐요
            </span>
          ) : null}
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
  onShowSurvey,
  reviewComplete,
}: {
  canContinue: boolean
  nextPractice: TheaterShow | null
  onRestart: () => void
  onShowSurvey: () => void
  reviewComplete: boolean
}) {
  const nextHref = nextPractice
    ? appHref(`/scenario/${nextPractice.id}`)
    : appHref('/')
  const nextPracticeNote = nextPractice
    ? simplifyLearnerCopy(nextPractice.homeNote ?? nextPractice.note)
    : null
  const canAdvance = canContinue && reviewComplete

  return (
    <>
      {canAdvance && nextPractice ? (
        <a
          className="next-ready-attention inline-flex min-h-10 items-center gap-2 rounded-md border border-[#151713] bg-[#151713] px-3 py-1.5 text-sm font-semibold text-white"
          href={nextHref}
        >
          <span className="rounded bg-white/18 px-1.5 py-0.5 text-xs">
            이제 눌러요
          </span>
          다음 연습으로 가기
        </a>
      ) : canAdvance ? (
        <button
          className="next-ready-attention inline-flex min-h-10 items-center gap-2 rounded-md border border-[#151713] bg-[#151713] px-3 py-1.5 text-sm font-semibold text-white"
          onClick={onShowSurvey}
          type="button"
        >
          <span className="rounded bg-white/18 px-1.5 py-0.5 text-xs">
            이제 눌러요
          </span>
          연습 끝내기
        </button>
      ) : (
        <button
          className="inline-flex min-h-10 cursor-not-allowed items-center gap-2 rounded-md border border-[#151713] bg-[#151713] px-3 py-1.5 text-sm font-semibold text-white opacity-50"
          disabled
          type="button"
        >
          {!reviewComplete
            ? nextPractice
              ? '복습을 끝까지 보면 다음 연습으로 가요'
              : '복습을 끝까지 보면 마칠 수 있어요'
            : nextPractice
              ? '맞는 답을 고르면 다음 연습으로 가요'
              : '맞는 답을 고르면 마칠 수 있어요'}
        </button>
      )}
      {nextPractice && canAdvance ? (
        <a
          aria-label={`다음 연습 ${nextPractice.title} ${nextPracticeNote}`}
          className="inline-flex min-h-10 max-w-full flex-col items-start gap-0.5 rounded-md border border-[#dfe4da] bg-white px-3 py-1.5 text-left text-[#151713]"
          href={nextHref}
        >
          <span className="text-xs font-semibold text-[#596257]">
            다음 연습
          </span>
          <span className="text-sm font-semibold">{nextPractice.title}</span>
          <span className="text-xs leading-5 text-[#596257]">
            {nextPracticeNote}
          </span>
        </a>
      ) : nextPractice ? (
        <div
          aria-disabled="true"
          className="inline-flex min-h-10 max-w-full flex-col items-start gap-0.5 rounded-md border border-[#dfe4da] bg-white px-3 py-1.5 text-left text-[#151713] opacity-55"
        >
          <span className="text-xs font-semibold text-[#596257]">
            다음 연습
          </span>
          <span className="text-sm font-semibold">{nextPractice.title}</span>
          <span className="text-xs leading-5 text-[#596257]">
            {nextPracticeNote}
          </span>
        </div>
      ) : null}
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

function SurveyDialog({ onClose }: { onClose: () => void }) {
  const hasSurveyLink = surveyFormUrl.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/42 px-4 py-6">
      <section
        aria-labelledby="survey-dialog-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-md border border-[#dfe4da] bg-white p-6 text-[#151713] shadow-[0_24px_80px_rgba(0,0,0,0.22)]"
        role="dialog"
      >
        <p className="text-sm font-semibold text-[#596257]">연습 완료</p>
        <h2
          className="mt-2 text-3xl font-semibold tracking-tight"
          id="survey-dialog-title"
        >
          끝까지 연습해 주셔서 고맙습니다.
        </h2>
        <p className="mt-4 text-lg font-semibold leading-8 text-[#596257]">
          더 좋은 학습 화면을 만들 수 있도록 짧은 설문 조사를 부탁드립니다.
          답변은 화면을 고치는 데 사용하겠습니다.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {hasSurveyLink ? (
            <a
              className="inline-flex min-h-11 items-center rounded-md border border-[#151713] bg-[#151713] px-4 py-2 text-base font-semibold text-white"
              href={surveyFormUrl}
              rel="noreferrer"
              target="_blank"
            >
              설문 조사 하러 가기
            </a>
          ) : (
            <button
              className="inline-flex min-h-11 cursor-not-allowed items-center rounded-md border border-[#dfe4da] bg-[#eef1ee] px-4 py-2 text-base font-semibold text-[#596257]"
              disabled
              type="button"
            >
              설문 링크 준비 중
            </button>
          )}
          <a
            className="inline-flex min-h-11 items-center rounded-md border border-[#dfe4da] bg-white px-4 py-2 text-base font-semibold text-[#151713]"
            href={appHref('/')}
          >
            처음 화면으로 가기
          </a>
          <button
            className="inline-flex min-h-11 items-center rounded-md border border-[#dfe4da] bg-white px-4 py-2 text-base font-semibold text-[#151713]"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </div>
      </section>
    </div>
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

function GeneratedSourceBanner({ scenario }: { scenario: TheaterShow }) {
  return (
    <section className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-emerald-950">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
        <span className="rounded-md bg-emerald-700 px-2 py-1 text-white">
          URL로 만든 연습
        </span>
        <span>{scenario.generatedTopicLabel ?? '재난안전 연습'}</span>
        {scenario.generatedSourceTitle ? (
          <span className="text-emerald-900">
            입력한 영상: {scenario.generatedSourceTitle}
          </span>
        ) : null}
      </div>
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
  const hasExplicitPause = segment.pauseMs !== undefined
  const rawEndSec = (segment.pauseMs ?? segment.endMs) / 1000
  const freezeSec = Math.max(
    startSec,
    rawEndSec - (hasExplicitPause ? 0 : framePrecisionSec),
  )

  return {
    freezeSec,
    index,
    pauseAtSec: rawEndSec,
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

function getSegmentPreviewSec(segment: TheaterSegment) {
  const previewMs = segment.previewMs

  if (previewMs === undefined) {
    return getSegmentStartSec(segment)
  }

  return Math.min(segment.endMs / 1000, previewMs / 1000)
}

function isYouTubePlaybackScenario(scenario: TheaterShow) {
  return Boolean(
    scenario.videoPlaybackKind === 'youtube' ||
    scenario.youtubeVideoId ||
    extractYouTubeEmbedId(scenario.videoSrc),
  )
}

function buildYouTubeFrameSrc({
  scenario,
  segment,
  stage,
}: {
  requestId: number
  scenario: TheaterShow
  segment: TheaterSegment
  stage: PracticeStage
}) {
  const videoId =
    scenario.youtubeVideoId ?? extractYouTubeEmbedId(scenario.videoSrc)
  if (!videoId) {
    return scenario.videoSrc
  }

  const params = new URLSearchParams({
    controls: '1',
    end: String(
      Math.max(1, Math.ceil((segment.pauseMs ?? segment.endMs) / 1000)),
    ),
    modestbranding: '1',
    playsinline: '1',
    rel: '0',
    start: String(Math.max(0, Math.floor(getSegmentStartSec(segment)))),
  })

  if (stage === 'playback') {
    params.set('autoplay', '1')
  }

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
}

function extractYouTubeEmbedId(src: string) {
  try {
    const url = new URL(src)
    const host = url.hostname.toLowerCase().replace(/^www\./u, '')

    if (host === 'youtu.be') {
      return normalizeYouTubeVideoId(url.pathname.split('/').filter(Boolean)[0])
    }

    if (host !== 'youtube.com') {
      return null
    }

    const pathParts = url.pathname.split('/').filter(Boolean)
    const embeddedId = ['embed', 'shorts', 'live'].includes(pathParts[0] ?? '')
      ? pathParts[1]
      : url.searchParams.get('v')

    return normalizeYouTubeVideoId(embeddedId)
  } catch {
    return null
  }
}

function normalizeYouTubeVideoId(value: string | null | undefined) {
  return value && /^[a-zA-Z0-9_-]{11}$/u.test(value) ? value : null
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
      situationText: getReviewSituationText(item),
      steps: getLearnerActionCards(item).map((card) => card.label),
      title: item.label,
    }))
    .filter((group) => group.steps.length > 0)
}

function getReviewSituationText(segment: TheaterSegment) {
  return (
    segment.learnerSequence.find((step) => step.kind === 'situation')?.text ??
    segment.learnerPrompt
  )
}

function selectScenarioFromPath() {
  const id = getScenarioIdFromPath()

  const canonicalId = scenarioAliases[id] ?? id

  const scenario =
    learningScenarios.find((item) => item.id === canonicalId) ??
    loadGeneratedScenarioFromId(canonicalId)

  if (scenario?.localOnly && !isLocalSeasonalEnabled()) {
    return null
  }

  return scenario
}

function getScenarioIdFromPath() {
  const pathname = getAppRoute()

  return pathname === '/demo'
    ? defaultScenarioId
    : pathname.startsWith('/scenario/')
      ? decodeURIComponent(pathname.replace('/scenario/', ''))
      : defaultScenarioId
}

function loadGeneratedScenarioFromId(id: string) {
  if (!id.startsWith('generated-')) {
    return null
  }

  const record = loadGeneratedScenario(id)

  if (!record) {
    return null
  }

  return toGeneratedTheaterShow(record)
}

async function loadGeneratedScenarioFromAsset(id: string) {
  const config = getGeneratorApiConfig()
  const apiBase = config.apiBase.replace(/\/+$/u, '')
  const response = await fetch(
    `${apiBase}/generated/${encodeURIComponent(id)}/scenario.json`,
  )

  if (!response.ok) {
    return null
  }

  const customScenario = (await response.json()) as TheaterShow
  const record: GeneratedScenarioRecord = {
    baseScenarioId: 'local-generated-video',
    createdAt: new Date().toISOString(),
    customScenario,
    id,
    matchBasis: 'metadata',
    sourceTitle: customScenario.generatedSourceTitle,
    sourceUrl: customScenario.generatedSourceUrl ?? '',
    thumbnailUrl: customScenario.generatedThumbnailUrl,
    topicLabel: customScenario.generatedTopicLabel ?? '재난안전 영상 학습',
    version: 1,
  }
  saveGeneratedScenario(record)

  return toGeneratedTheaterShow(record)
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
