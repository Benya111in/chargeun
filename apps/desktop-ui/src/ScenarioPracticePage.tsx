import { useEffect, useRef, useState, type RefObject } from 'react'
import {
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
import { getLearnerActionCards } from './lib/learner-action-visibility'
import { cn } from './lib/utils'

type PracticeStage = 'explanation' | 'playback' | 'ready' | 'rest'

const defaultScenarioId = 'fire-grounded-flow'
const scenarioAliases: Record<string, string> = {
  'earthquake-review-flow': 'earthquake-protect-flow',
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
  const [showReason, setShowReason] = useState(false)
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null)
  const [playbackNotice, setPlaybackNotice] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const explanationHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const autoPauseSegmentRef = useRef<string | null>(null)
  const pendingPlaybackIndexRef = useRef<number | null>(null)
  const [playRequestId, setPlayRequestId] = useState(0)
  const segment = scenario.segments[segmentIndex]
  const learnerActionCards = getLearnerActionCards(segment)
  const nextPractice = getNextScenario(scenario)
  const isFinalSegment = segmentIndex === scenario.segments.length - 1
  const selectedAnswer = segment.answerOptions.find(
    (option) => option.id === selectedAnswerId,
  )

  useEffect(() => {
    if (
      stage !== 'playback' ||
      pendingPlaybackIndexRef.current !== segmentIndex
    ) {
      return
    }

    const targetSegment = scenario.segments[segmentIndex]
    const video = videoRef.current
    let cancelled = false

    if (!video) {
      return
    }

    video.pause()
    video.currentTime = targetSegment.startMs / 1000

    void video.play().catch((error: unknown) => {
      if (cancelled || isExpectedPlaybackInterruption(error)) {
        return
      }

      setPlaybackNotice('영상을 바로 재생하지 못했습니다. 다시 눌러 주세요.')
      setStage('ready')
    })

    return () => {
      cancelled = true
    }
  }, [playRequestId, scenario.segments, segmentIndex, stage])

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
    video.currentTime = targetSegment.startMs / 1000
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

  const playSegment = (nextIndex: number) => {
    setSegmentIndex(nextIndex)
    setStage('playback')
    setShowReason(false)
    setSelectedAnswerId(null)
    setPlaybackNotice('')
    pendingPlaybackIndexRef.current = nextIndex
    autoPauseSegmentRef.current = null
    setPlayRequestId((current) => current + 1)
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
    if (!isFinalSegment) {
      playSegment(segmentIndex + 1)
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8f4] text-[#151713]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1240px] gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-6">
        <section className="flex min-w-0 flex-col gap-4">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe4da] pb-4">
            <a
              className="inline-flex min-h-11 items-center rounded-md bg-[#151713] px-3 py-2 text-sm font-semibold text-white"
              href="/"
            >
              안심트랙 연습
            </a>
            <div className="flex flex-wrap gap-2">
              <a className="link-button" href="/">
                다른 연습 고르기
              </a>
            </div>
          </header>

          <section className="overflow-hidden rounded-md border border-[#dfe4da] bg-black">
            <div className="relative aspect-video bg-black">
              <video
                key={scenario.id}
                ref={videoRef}
                className="h-full w-full object-contain"
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
                className="flex min-h-11 flex-1 items-center gap-2 rounded-md border border-[#dfe4da] bg-white px-2"
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

          <PracticePanel
            isFinalSegment={isFinalSegment}
            nextPractice={nextPractice}
            onNext={nextSegment}
            onReplay={() => playSegment(segmentIndex)}
            onRestart={() => playSegment(0)}
            onRest={rest}
            onToggleReason={() => setShowReason((value) => !value)}
            playbackNotice={playbackNotice}
            headingRef={explanationHeadingRef}
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
            {learnerActionCards.length > 0 ? (
              <ol className="mt-4 grid gap-3">
                {learnerActionCards.map((card) => (
                  <li
                    key={`${card.order}-${card.label}`}
                    className="flex items-center gap-3 rounded-md border border-[#dfe4da] bg-[#f7f8f4] px-4 py-3"
                  >
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-[#151713] text-sm font-semibold text-white">
                      {card.order}
                    </span>
                    <span className="text-lg font-semibold">{card.label}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 rounded-md border border-[#dfe4da] bg-[#f7f8f4] px-4 py-3 text-lg font-semibold leading-8 text-[#596257]">
                이 장면은 선생님이나 보호자와 공식 안내를 확인해요.
              </p>
            )}
          </section>
          <a className="link-button justify-center" href="/teacher">
            어른용 안내
          </a>
        </aside>
      </div>
    </main>
  )
}

function PracticePanel({
  isFinalSegment,
  nextPractice,
  onNext,
  onReplay,
  onRestart,
  onRest,
  onToggleReason,
  playbackNotice,
  headingRef,
  segment,
  selectedAnswer,
  selectedAnswerId,
  setSelectedAnswerId,
  showReason,
  stage,
}: {
  isFinalSegment: boolean
  nextPractice: TheaterShow | null
  onNext: () => void
  onReplay: () => void
  onRestart: () => void
  onRest: () => void
  onToggleReason: () => void
  playbackNotice: string
  headingRef: RefObject<HTMLHeadingElement | null>
  segment: TheaterSegment
  selectedAnswer?: TheaterSegment['answerOptions'][number]
  selectedAnswerId: string | null
  setSelectedAnswerId: (value: string) => void
  showReason: boolean
  stage: PracticeStage
}) {
  const learnerActionCards = getLearnerActionCards(segment)
  const canAskQuestion = learnerActionCards.length > 0
  const canContinue = canAskQuestion ? selectedAnswer?.correct === true : true

  if (stage === 'rest') {
    return (
      <section className="rounded-md border border-[#dfe4da] bg-white p-6">
        <h1 className="text-4xl font-semibold leading-tight">
          잠깐 쉬어도 괜찮아요.
        </h1>
        <p className="mt-4 text-2xl font-semibold leading-9 text-[#596257]">
          필요하면 선생님이나 보호자를 불러요. 준비되면 다시 볼 수 있어요.
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
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-3 text-[clamp(2rem,5vw,4rem)] font-semibold leading-[1.08] tracking-tight outline-none"
      >
        {segment.learnerExplanation}
      </h1>
      <LearningTrackSummary segment={segment} />

      <div className="mt-6 grid gap-3">
        <h2 className="text-lg font-semibold">지금 할 일</h2>
        {canAskQuestion ? (
          <div className="grid gap-3 md:grid-cols-3">
            {learnerActionCards.map((card) => (
              <div
                key={`${card.order}-${card.label}`}
                className="rounded-md border border-[#151713] bg-[#151713] px-4 py-4 text-white"
              >
                <p className="text-sm font-semibold text-white/70">
                  {card.order}번
                </p>
                <p className="mt-2 text-xl font-semibold leading-8">
                  {card.label}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-[#dfe4da] bg-[#f7f8f4] px-4 py-4 text-xl font-semibold leading-8 text-[#596257]">
            확실하지 않아요. 선생님이나 보호자와 공식 안내를 확인해요.
          </p>
        )}
      </div>

      {canAskQuestion ? (
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
              {selectedAnswer.correct ? (
                <CheckCircle2 className="size-5" />
              ) : (
                <HelpCircle className="size-5" />
              )}
              {selectedAnswer.feedback}
            </p>
          ) : (
            <p className="mt-3 text-sm font-semibold leading-6 text-[#596257]">
              헷갈리면 다시 볼 수 있어요. 맞는 답을 고르면 다음 장면으로 가요.
            </p>
          )}
        </section>
      ) : null}

      {showReason ? (
        <div className="mt-5 rounded-md border border-[#dfe4da] bg-white px-4 py-4">
          <p className="text-sm font-semibold text-[#596257]">이유</p>
          <p className="mt-2 text-xl font-semibold leading-8">
            {getLearnerReasonText(segment.explanation.tracks.reason)}
          </p>
        </div>
      ) : null}

      <PreservedCandidatePanel segment={segment} />

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
          {showReason ? '이유 닫기' : '이유 보기'}
        </button>
        <button className="link-button" onClick={onRest} type="button">
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
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-md border border-[#151713] bg-[#151713] px-4 py-3 text-sm font-semibold text-white',
              !canContinue && 'cursor-not-allowed opacity-50',
            )}
            disabled={!canContinue}
            onClick={onNext}
            type="button"
          >
            다음 장면 보기
          </button>
        )}
      </div>
    </section>
  )
}

function LearningTrackSummary({ segment }: { segment: TheaterSegment }) {
  const structured = segment.structuredExplanation
  const actionCount = structured.tracks.action?.cards.length ?? 0
  const preservedCount = getLearnerPreservedCandidates(segment).length

  return (
    <section
      aria-label="이 장면을 나누어 보는 방법"
      className="mt-5 hidden gap-2 sm:grid sm:grid-cols-4"
    >
      <TrackBadge label="쉬운말" value="지금 장면" />
      <TrackBadge label="할 일" value={`${actionCount}개 카드`} />
      <TrackBadge
        label="확인"
        value={structured.tracks.teachBack ? '질문 1개' : '어른과 확인'}
      />
      <TrackBadge
        label="헷갈림"
        value={preservedCount ? `${preservedCount}개 보관` : '없음'}
      />
    </section>
  )
}

function TrackBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#dfe4da] bg-[#f7f8f4] px-3 py-3">
      <p className="text-xs font-semibold text-[#596257]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#151713]">{value}</p>
    </div>
  )
}

function PreservedCandidatePanel({ segment }: { segment: TheaterSegment }) {
  const candidates = getLearnerPreservedCandidates(segment)

  if (candidates.length === 0) {
    return null
  }

  return (
    <section className="mt-5 rounded-md border border-[#dfe4da] bg-[#f7f8f4] p-4">
      <h2 className="text-lg font-semibold">헷갈릴 수 있어요</h2>
      <p className="mt-2 text-sm leading-6 text-[#596257]">
        보일 수 있어요. 하지만 지금은 고르지 않아요.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {candidates.map((candidate) => (
          <div
            key={`${candidate.category}-${candidate.candidate}`}
            className="rounded-md border border-[#dfe4da] bg-white px-4 py-3"
          >
            <p className="text-sm font-semibold text-[#151713]">
              {getLearnerCandidateText(candidate.candidate)}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#596257]">
              지금은 고르지 않아요.
            </p>
          </div>
        ))}
      </div>
    </section>
  )
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

  return (
    <>
      {canContinue ? (
        <a
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#151713] bg-[#151713] px-4 py-3 text-sm font-semibold text-white"
          href={nextHref}
        >
          {nextPractice ? '다음 연습으로 가기' : '오늘 연습 끝내기'}
        </a>
      ) : (
        <button
          className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-md border border-[#151713] bg-[#151713] px-4 py-3 text-sm font-semibold text-white opacity-50"
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
            ? `다음 연습 ${nextPractice.title} ${nextPractice.note}`
            : '처음 화면으로 가기'
        }
        className={cn(
          'inline-flex min-h-11 max-w-full flex-col items-start gap-1 rounded-md border border-[#dfe4da] bg-white px-4 py-3 text-left text-[#151713]',
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
            ? nextPractice.note
            : '다른 연습을 고르거나 처음부터 다시 볼 수 있어요.'}
        </span>
      </a>
      <button className="link-button" onClick={onRestart} type="button">
        <RotateCcw className="size-4" />
        처음부터 다시 보기
      </button>
    </>
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

function getLearnerReasonText(reason: string) {
  return reason
    .replace(
      '여진과 화재에 대비하면서 안전한 출구를 확보해야 합니다.',
      '또 흔들릴 수 있어요. 나갈 길을 먼저 봐요.',
    )
    .replace(
      '여진과 2차 피해가 있을 수 있어 공식 안내 확인이 필요합니다.',
      '위험이 더 생길 수 있어요. 119나 어른에게 알려요.',
    )
    .replace('화염', '불길')
    .replace('연기와 불길의 확산을 늦춥니다', '불과 연기가 덜 퍼져요')
    .replace('낙하물', '떨어지는 물건')
    .replace('여진', '또 흔들림')
    .replace('확보', '찾기')
    .replace('대비', '준비')
}

function getLearnerPreservedCandidates(segment: TheaterSegment) {
  return segment.structuredExplanation.suppressedCandidates
    .filter((candidate) =>
      ['unsafe_action', 'unsupported_action', 'not_for_learner'].includes(
        candidate.category,
      ),
    )
    .slice(0, 2)
}

function getLearnerCandidateText(candidate: string) {
  if (candidate.includes('엘리베이터')) {
    return '엘리베이터'
  }

  if (candidate.includes('출입문') || candidate.includes('문을 열어')) {
    return '문 열어 두기'
  }

  if (candidate.includes('연기 흡입')) {
    return '그냥 서서 걷기'
  }

  if (candidate.includes('밖으로 뛰') || candidate.includes('무작정 이동')) {
    return '바로 밖으로 뛰기'
  }

  if (candidate.includes('유리창') || candidate.includes('무거운 가구')) {
    return '유리창 가까이 가기'
  }

  if (
    candidate.includes('가스') ||
    candidate.includes('전기') ||
    candidate.includes('전깃불')
  ) {
    return '혼자 만지기'
  }

  return candidate
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
