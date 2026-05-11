import { useRef, useState } from 'react'
import {
  CheckCircle2,
  HelpCircle,
  PauseCircle,
  Play,
  RotateCcw,
} from 'lucide-react'

import {
  learningScenarios,
  type TheaterSegment,
  type TheaterShow,
} from './lib/demo-theater-content'
import { cn } from './lib/utils'

type PracticeStage = 'explanation' | 'playback' | 'ready' | 'rest'

const defaultScenarioId = 'fire-grounded-flow'

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
  const [showReason, setShowReason] = useState(false)
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null)
  const [playbackNotice, setPlaybackNotice] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const autoPauseSegmentRef = useRef<string | null>(null)
  const segment = scenario.segments[segmentIndex]
  const selectedAnswer = segment.answerOptions.find(
    (option) => option.id === selectedAnswerId,
  )

  const playSegment = async (nextIndex: number) => {
    const targetSegment = scenario.segments[nextIndex]
    const video = videoRef.current

    setSegmentIndex(nextIndex)
    setStage('playback')
    setShowReason(false)
    setSelectedAnswerId(null)
    setPlaybackNotice('')
    autoPauseSegmentRef.current = null

    if (!video) {
      return
    }

    video.pause()
    video.currentTime = targetSegment.startMs / 1000

    try {
      await video.play()
    } catch (error) {
      if (isExpectedPlaybackInterruption(error)) {
        return
      }

      setPlaybackNotice('영상을 바로 재생하지 못했습니다. 다시 눌러 주세요.')
      setStage('ready')
    }
  }

  const loadSegment = (nextIndex: number) => {
    const targetSegment = scenario.segments[nextIndex]
    const video = videoRef.current

    setSegmentIndex(nextIndex)
    setStage('ready')
    setShowReason(false)
    setSelectedAnswerId(null)
    setPlaybackNotice('')
    autoPauseSegmentRef.current = null

    if (!video) {
      return
    }

    video.pause()
    video.currentTime = targetSegment.startMs / 1000
  }

  const rest = () => {
    videoRef.current?.pause()
    setStage('rest')
    setPlaybackNotice('')
  }

  const nextSegment = () => {
    if (segmentIndex >= scenario.segments.length - 1) {
      void playSegment(0)
      return
    }

    void playSegment(segmentIndex + 1)
  }

  return (
    <main className="min-h-screen bg-[#f7f8f4] text-[#151713]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1240px] gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-6">
        <section className="flex min-w-0 flex-col gap-4">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe4da] pb-4">
            <a
              className="inline-flex rounded-md bg-[#151713] px-3 py-2 text-sm font-semibold text-white"
              href="/"
            >
              안심트랙 연습
            </a>
            <div className="flex flex-wrap gap-2">
              <a className="link-button" href="/teacher">
                선생님/보호자
              </a>
              <a className="link-button" href="/">
                다른 연습 고르기
              </a>
            </div>
          </header>

          <section className="overflow-hidden rounded-md border border-[#dfe4da] bg-black">
            <div className="relative min-h-[48svh]">
              <video
                key={scenario.id}
                ref={videoRef}
                className="h-full min-h-[48svh] w-full object-cover"
                onEnded={() => setStage('explanation')}
                onLoadedMetadata={(event) => {
                  event.currentTarget.currentTime = segment.startMs / 1000
                }}
                onTimeUpdate={(event) => {
                  const nextMs = event.currentTarget.currentTime * 1000

                  if (
                    stage === 'playback' &&
                    autoPauseSegmentRef.current !== segment.id &&
                    nextMs >= segment.endMs - 120
                  ) {
                    autoPauseSegmentRef.current = segment.id
                    event.currentTarget.pause()
                    event.currentTarget.currentTime = segment.endMs / 1000
                    setStage('explanation')
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
                    void playSegment(segmentIndex)
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
                className="flex min-h-10 flex-1 items-center rounded-md"
                onClick={() => loadSegment(index)}
                type="button"
              >
                <span
                  className={cn(
                    'h-2 w-full rounded-full transition',
                    index < segmentIndex
                      ? 'bg-emerald-500'
                      : index === segmentIndex
                        ? 'bg-[#151713]'
                        : 'bg-[#dfe4da]',
                  )}
                />
              </button>
            ))}
          </div>

          <PracticePanel
            onNext={nextSegment}
            onReplay={() => void playSegment(segmentIndex)}
            onRest={rest}
            onToggleReason={() => setShowReason((value) => !value)}
            playbackNotice={playbackNotice}
            segment={segment}
            selectedAnswerId={selectedAnswerId}
            selectedAnswer={selectedAnswer}
            setSelectedAnswerId={setSelectedAnswerId}
            showReason={showReason}
            stage={stage}
          />
        </section>

        <aside className="flex flex-col gap-4">
          <SafetyCard notice={segment.safetyNotice} />
          <section className="rounded-md border border-[#dfe4da] bg-white p-5">
            <h2 className="text-lg font-semibold">오늘 기억할 순서</h2>
            <ol className="mt-4 grid gap-3">
              {segment.actionSteps.map((step, index) => (
                <li
                  key={step}
                  className="flex items-center gap-3 rounded-md border border-[#dfe4da] bg-[#f7f8f4] px-4 py-3"
                >
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-[#151713] text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <span className="text-lg font-semibold">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </main>
  )
}

function PracticePanel({
  onNext,
  onReplay,
  onRest,
  onToggleReason,
  playbackNotice,
  segment,
  selectedAnswer,
  selectedAnswerId,
  setSelectedAnswerId,
  showReason,
  stage,
}: {
  onNext: () => void
  onReplay: () => void
  onRest: () => void
  onToggleReason: () => void
  playbackNotice: string
  segment: TheaterSegment
  selectedAnswer?: TheaterSegment['answerOptions'][number]
  selectedAnswerId: string | null
  setSelectedAnswerId: (value: string) => void
  showReason: boolean
  stage: PracticeStage
}) {
  const canContinue = selectedAnswer?.correct === true

  if (stage === 'rest') {
    return (
      <section className="rounded-md border border-[#dfe4da] bg-white p-6">
        <h1 className="text-4xl font-semibold leading-tight">
          잠깐 쉬어도 괜찮아요.
        </h1>
        <p className="mt-4 text-2xl font-semibold leading-9 text-[#596257]">
          선생님이나 보호자를 불러요. 준비되면 다시 볼 수 있어요.
        </p>
        <button className="link-button mt-5" onClick={onReplay} type="button">
          <Play className="size-4" />
          다시 보기
        </button>
      </section>
    )
  }

  if (stage !== 'explanation') {
    return (
      <section className="rounded-md border border-[#dfe4da] bg-white p-6">
        <p className="text-sm font-semibold text-[#596257]">
          {segment.learnerPrompt}
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight">
          영상을 보고 멈추면 같이 연습해요.
        </h1>
        <div className="mt-5 flex flex-wrap gap-2">
          {stage === 'playback' ? (
            <button className="link-button" onClick={onReplay} type="button">
              <Play className="size-4" />
              다시 보기
            </button>
          ) : null}
          <button className="link-button" onClick={onRest} type="button">
            <PauseCircle className="size-4" />
            쉬기
          </button>
        </div>
        {playbackNotice ? (
          <p className="mt-4 text-sm leading-6 text-amber-700">
            {playbackNotice}
          </p>
        ) : null}
      </section>
    )
  }

  return (
    <section className="rounded-md border border-[#dfe4da] bg-white p-6">
      <p className="text-sm font-semibold text-[#596257]">
        {segment.learnerPrompt}
      </p>
      <h1 className="mt-3 text-[clamp(2rem,5vw,4rem)] font-semibold leading-[1.08] tracking-tight">
        {segment.learnerExplanation}
      </h1>

      <div className="mt-6 grid gap-3">
        <h2 className="text-lg font-semibold">지금 할 일</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {segment.actionSteps.map((step, index) => (
            <div
              key={step}
              className="rounded-md border border-[#151713] bg-[#151713] px-4 py-4 text-white"
            >
              <p className="text-sm font-semibold text-white/70">
                {index + 1}번
              </p>
              <p className="mt-2 text-xl font-semibold leading-8">{step}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="mt-6 rounded-md border border-[#dfe4da] bg-[#f7f8f4] p-4">
        <h2 className="text-xl font-semibold">{segment.checkQuestion}</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {segment.answerOptions.map((option) => (
            <button
              key={option.id}
              className={cn(
                'rounded-md border px-4 py-4 text-left text-lg font-semibold transition',
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
          <p className="mt-3 flex items-center gap-2 text-lg font-semibold leading-8">
            <CheckCircle2 className="size-5" />
            {selectedAnswer.feedback}
          </p>
        ) : (
          <p className="mt-3 text-sm font-semibold leading-6 text-[#596257]">
            하나를 골라 보면 다음 장면으로 갈 수 있어요.
          </p>
        )}
      </section>

      {showReason ? (
        <div className="mt-5 rounded-md border border-[#dfe4da] bg-white px-4 py-4">
          <p className="text-sm font-semibold text-[#596257]">이유</p>
          <p className="mt-2 text-xl font-semibold leading-8">
            {segment.explanation.tracks.reason}
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <button className="link-button" onClick={onReplay} type="button">
          <RotateCcw className="size-4" />이 장면 다시 보기
        </button>
        <button
          aria-expanded={showReason}
          className="link-button"
          onClick={onToggleReason}
          type="button"
        >
          <HelpCircle className="size-4" />
          {showReason ? '이유 닫기' : '왜요?'}
        </button>
        <button className="link-button" onClick={onRest} type="button">
          <PauseCircle className="size-4" />
          쉬기
        </button>
        <button
          className={cn(
            'inline-flex items-center gap-2 rounded-md border border-[#151713] bg-[#151713] px-4 py-3 text-sm font-semibold text-white',
            !canContinue && 'cursor-not-allowed opacity-50',
          )}
          disabled={!canContinue}
          onClick={onNext}
          type="button"
        >
          다음 장면 보기
        </button>
      </div>
    </section>
  )
}

function SafetyCard({ notice }: { notice: string }) {
  return (
    <section className="rounded-md border border-amber-300 bg-amber-50 p-5 text-amber-950">
      <p className="text-sm font-semibold">연습 전에 기억해요</p>
      <p className="mt-3 text-xl font-semibold leading-8">{notice}</p>
    </section>
  )
}

function selectScenarioFromPath() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const id =
    pathname === '/demo'
      ? defaultScenarioId
      : pathname.startsWith('/scenario/')
        ? decodeURIComponent(pathname.replace('/scenario/', ''))
        : defaultScenarioId

  return learningScenarios.find((scenario) => scenario.id === id) ?? null
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
