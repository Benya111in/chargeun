import { useRef, useState } from 'react'

import {
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'

import type { HazardType, SegmentExplanation } from '@ansimtrack/shared-types'

import { theaterShows, type TheaterSegment } from './lib/demo-theater-content'
import { cn, formatClock } from './lib/utils'

type TrackKey = 'basic' | 'easy' | 'action' | 'reason' | 'caregiver' | 'report'
type TheaterStage = 'explanation' | 'playback' | 'ready'

const trackLabels: Record<TrackKey, string> = {
  basic: '기본',
  easy: '쉬운말',
  action: '지금 할 일',
  reason: '이유',
  caregiver: '보호자',
  report: '신고',
}

export default function DemoTheaterPage() {
  const [showId, setShowId] = useState(theaterShows[0]?.id ?? '')
  const show =
    theaterShows.find((item) => item.id === showId) ?? theaterShows[0]
  const [segmentIndex, setSegmentIndex] = useState(0)
  const segment = show.segments[segmentIndex]
  const [stage, setStage] = useState<TheaterStage>('ready')
  const [isMuted, setIsMuted] = useState(false)
  const [currentTimeMs, setCurrentTimeMs] = useState(segment.startMs)
  const [durationMs, setDurationMs] = useState(0)
  const [playbackNotice, setPlaybackNotice] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const autoPauseSegmentRef = useRef<string | null>(null)

  const mainTrack = getPrimaryTrack(segment.explanation)
  const trackEntries = getTrackEntries(segment.explanation)
  const segmentProgressPct = getSegmentProgressPct(currentTimeMs, segment)
  const observedSignals = Array.from(
    new Set([
      ...segment.packet.ocrTokens,
      ...segment.packet.uiElements.map((item) => item.label),
      ...segment.packet.objectHints.map((item) => item.label),
    ]),
  ).slice(0, 8)
  const matchedSignals = Array.from(
    new Set(segment.ruleMatches.flatMap((match) => match.matchedSignals)),
  ).slice(0, 10)

  const playSegment = async (nextIndex: number) => {
    const targetSegment = show.segments[nextIndex]
    const video = videoRef.current

    setSegmentIndex(nextIndex)
    setStage('playback')
    setCurrentTimeMs(targetSegment.startMs)
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
      const message =
        error instanceof Error ? error.message : '재생을 시작하지 못했습니다.'
      setPlaybackNotice(message)
      setStage('ready')
    }
  }

  const loadSegmentForExplanation = (nextIndex: number) => {
    const targetSegment = show.segments[nextIndex]
    const video = videoRef.current

    setSegmentIndex(nextIndex)
    setStage('ready')
    setCurrentTimeMs(targetSegment.startMs)
    setPlaybackNotice('')
    autoPauseSegmentRef.current = null

    if (!video) {
      return
    }

    video.pause()
    video.currentTime = targetSegment.startMs / 1000
  }

  const restartCurrentSegment = () => {
    void playSegment(segmentIndex)
  }

  const handleSelectShow = (nextShowId: string) => {
    const nextShow = theaterShows.find((item) => item.id === nextShowId)
    if (!nextShow) {
      return
    }

    const video = videoRef.current
    video?.pause()
    autoPauseSegmentRef.current = null
    setShowId(nextShowId)
    setSegmentIndex(0)
    setCurrentTimeMs(nextShow.segments[0]?.startMs ?? 0)
    setStage('ready')
    setPlaybackNotice('')
  }

  const goToPreviousSegment = () => {
    if (segmentIndex === 0) {
      loadSegmentForExplanation(0)
      return
    }

    loadSegmentForExplanation(segmentIndex - 1)
  }

  const goToNextSegment = () => {
    if (segmentIndex >= show.segments.length - 1) {
      loadSegmentForExplanation(0)
      return
    }

    void playSegment(segmentIndex + 1)
  }

  const toggleMuted = () => {
    const video = videoRef.current
    if (!video) {
      return
    }

    const nextMuted = !video.muted
    video.muted = nextMuted
    setIsMuted(nextMuted)
  }

  const stageLabel =
    stage === 'playback'
      ? '장면 재생 중'
      : stage === 'explanation'
        ? '장면 설명'
        : '시연 준비'

  return (
    <main className="min-h-screen bg-[#07090c] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-4 lg:px-6 lg:py-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              SlowLearner Demo
            </p>
            <p className="mt-2 text-sm text-white/60">
              장면 재생 후 자동 정지하고, 현재 장면의 grounded 설명만 여는 발표
              화면
            </p>
          </div>
          <a
            className="inline-flex items-center rounded-md border border-white/14 px-3 py-2 text-sm text-white/78 transition hover:border-white/24 hover:bg-white/8"
            href="/"
          >
            검증 화면
          </a>
        </header>

        <div className="mt-4 flex flex-wrap gap-2">
          {theaterShows.map((item) => (
            <button
              key={item.id}
              className={cn(
                'rounded-md border px-4 py-3 text-left transition',
                item.id === show.id
                  ? 'border-white/26 bg-white text-[#07090c]'
                  : 'border-white/12 bg-white/4 text-white/78 hover:bg-white/10',
              )}
              onClick={() => handleSelectShow(item.id)}
              type="button"
            >
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="mt-1 text-xs text-inherit/70">{item.note}</p>
            </button>
          ))}
        </div>

        <section className="mt-4 flex flex-1 flex-col gap-4">
          <div className="relative min-h-[54svh] overflow-hidden rounded-md border border-white/10 bg-black">
            <video
              key={show.id}
              ref={videoRef}
              className="h-full min-h-[54svh] w-full object-cover"
              onEnded={() => {
                setStage('explanation')
              }}
              onLoadedMetadata={(event) => {
                event.currentTarget.currentTime = segment.startMs / 1000
                setCurrentTimeMs(segment.startMs)
                setDurationMs(event.currentTarget.duration * 1000)
                setIsMuted(event.currentTarget.muted)
              }}
              onPause={() => undefined}
              onPlay={() => undefined}
              onTimeUpdate={(event) => {
                const nextMs = event.currentTarget.currentTime * 1000
                setCurrentTimeMs(nextMs)

                if (
                  stage === 'playback' &&
                  autoPauseSegmentRef.current !== segment.id &&
                  nextMs >= segment.endMs - 120
                ) {
                  autoPauseSegmentRef.current = segment.id
                  event.currentTarget.pause()
                  event.currentTarget.currentTime = segment.endMs / 1000
                  setCurrentTimeMs(segment.endMs)
                  setStage('explanation')
                }
              }}
              playsInline
              poster={show.posterSrc}
              preload="auto"
            >
              <source src={show.videoSrc} type="video/mp4" />
            </video>

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/76 via-black/10 to-black/48" />

            <div className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-3 rounded-md border border-white/12 bg-black/28 px-3 py-2 text-sm text-white/85 backdrop-blur-sm">
                  <span
                    className={cn('size-2 rounded-full', show.accentClassName)}
                  />
                  <span>{show.title}</span>
                </div>
                <div className="rounded-md border border-white/12 bg-black/28 px-3 py-2 text-sm text-white/72 backdrop-blur-sm">
                  {getHazardLabel(segment.segment.hazard)}
                </div>
                <div className="rounded-md border border-white/12 bg-black/28 px-3 py-2 text-sm text-white/72 backdrop-blur-sm">
                  {stageLabel}
                </div>
                <div className="rounded-md border border-white/12 bg-black/28 px-3 py-2 text-sm text-white/72 backdrop-blur-sm">
                  {segment.label}
                </div>
              </div>
              <div className="rounded-md border border-white/12 bg-black/28 px-3 py-2 text-sm text-white/72 backdrop-blur-sm">
                {formatClock(currentTimeMs)} / {formatClock(durationMs)}
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
              <div className="rounded-md border border-white/12 bg-black/34 p-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-center gap-2 text-sm text-white/68">
                  <span className="rounded-md border border-white/12 px-2 py-1">
                    장면 {segmentIndex + 1} / {show.segments.length}
                  </span>
                  <span className="rounded-md border border-white/12 px-2 py-1">
                    {formatClock(segment.startMs)} -{' '}
                    {formatClock(segment.endMs)}
                  </span>
                  <span className="rounded-md border border-white/12 px-2 py-1">
                    {segment.primarySourceTitle ?? '공식 확인 우선'}
                  </span>
                </div>
                <p className="mt-3 max-w-4xl text-[clamp(1.4rem,2vw,2.4rem)] font-semibold leading-[1.2] tracking-tight text-white">
                  {stage === 'playback'
                    ? `${segment.label} 재생 중. 구간이 끝나면 자동 정지하고 설명으로 전환합니다.`
                    : segment.description}
                </p>
              </div>
            </div>

            {stage === 'ready' ? (
              <button
                aria-label="시연 시작"
                className="absolute inset-0 flex items-center justify-center"
                onClick={() => {
                  void playSegment(segmentIndex)
                }}
                type="button"
              >
                <span className="inline-flex items-center gap-3 rounded-md border border-white/14 bg-black/52 px-6 py-4 text-lg font-semibold text-white backdrop-blur-sm transition hover:bg-black/62">
                  <Play className="size-6" />
                  시연 시작
                </span>
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <section className="rounded-md border border-white/10 bg-[#101418] p-6 lg:p-8">
              <div className="flex flex-wrap items-center gap-2 text-sm text-white/55">
                <span className="rounded-md border border-white/10 px-3 py-1">
                  장면 설명
                </span>
                <span className="rounded-md border border-white/10 px-3 py-1">
                  {show.note}
                </span>
              </div>

              <div className="mt-6 grid gap-3">
                {show.segments.map((item, index) => (
                  <button
                    key={item.id}
                    className={cn(
                      'rounded-md border px-4 py-4 text-left transition',
                      index === segmentIndex
                        ? 'border-white/24 bg-white/[0.05]'
                        : 'border-white/10 bg-transparent hover:bg-white/[0.04]',
                    )}
                    onClick={() => loadSegmentForExplanation(index)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">
                        {item.label}
                      </p>
                      <p className="text-xs text-white/48">
                        {formatClock(item.startMs)} - {formatClock(item.endMs)}
                      </p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-white/70">
                      {item.description}
                    </p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width]',
                          index < segmentIndex
                            ? 'bg-emerald-300'
                            : index === segmentIndex
                              ? 'bg-white'
                              : 'bg-white/18',
                        )}
                        style={{
                          width:
                            index === segmentIndex
                              ? `${segmentProgressPct}%`
                              : index < segmentIndex
                                ? '100%'
                                : '0%',
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>

              {stage === 'explanation' ? (
                <>
                  <div className="mt-6 rounded-md border border-white/10 bg-white/[0.03] p-5">
                    <p className="text-sm font-semibold text-white/68">
                      현재 장면 핵심
                    </p>
                    <p className="mt-3 text-[clamp(1.7rem,2.8vw,3rem)] font-semibold leading-[1.18] tracking-tight text-white">
                      {mainTrack[1]}
                    </p>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {trackEntries.map(([track, text]) => (
                      <TrackCard
                        key={track}
                        label={trackLabels[track]}
                        text={text}
                        tone={track === mainTrack[0] ? 'active' : 'default'}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="mt-6 rounded-md border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-sm font-semibold text-white/68">
                    {stage === 'playback' ? '현재 상태' : '다음 단계'}
                  </p>
                  <p className="mt-3 text-xl font-semibold leading-8 text-white">
                    {stage === 'playback'
                      ? '이 장면이 끝나면 자동 정지하고 멀티트랙 설명을 엽니다.'
                      : '시연 시작을 누르면 현재 장면만 재생하고 자동으로 멈춥니다.'}
                  </p>
                </div>
              )}

              {segment.explanation.doNot ? (
                <p className="mt-5 text-base leading-7 text-rose-200/88">
                  하지 말 것: {segment.explanation.doNot}
                </p>
              ) : null}
            </section>

            <aside className="grid gap-4">
              <section className="rounded-md border border-white/10 bg-[#101418] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                  Grounded
                </p>
                <div className="mt-4 grid gap-3 text-sm leading-6 text-white/78">
                  <p>
                    {segment.primarySourceTitle ??
                      '현재 장면은 공식 확인 우선 모드입니다.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {segment.segment.officialRuleIds.length > 0 ? (
                      segment.segment.officialRuleIds.map((ruleId) => (
                        <InfoChip key={ruleId}>{ruleId}</InfoChip>
                      ))
                    ) : (
                      <InfoChip>rule id 없음</InfoChip>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {matchedSignals.length > 0 ? (
                      matchedSignals.map((signal) => (
                        <InfoChip key={signal}>{signal}</InfoChip>
                      ))
                    ) : (
                      <InfoChip>grounding signal 부족</InfoChip>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-md border border-white/10 bg-[#101418] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                  관찰 신호
                </p>
                <div className="mt-4 grid gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white/76">ASR</p>
                    <p className="mt-1 text-sm leading-6 text-white/68">
                      {segment.packet.asrText || '음성 근거 없음'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {observedSignals.length > 0 ? (
                      observedSignals.map((signal) => (
                        <InfoChip key={signal}>{signal}</InfoChip>
                      ))
                    ) : (
                      <InfoChip>관찰 신호 없음</InfoChip>
                    )}
                  </div>
                </div>
              </section>

              {segment.safetyWarnings.length > 0 ? (
                <section className="rounded-md border border-amber-300/30 bg-amber-300/10 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-100/78">
                    Safety Fallback
                  </p>
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-amber-50/88">
                    {segment.safetyWarnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="rounded-md border border-white/10 bg-[#101418] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                  Controls
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-white/14 bg-white/8 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/14"
                    onClick={() => {
                      void playSegment(segmentIndex)
                    }}
                    type="button"
                  >
                    <Play className="size-4" />
                    {stage === 'explanation' ? '다시 재생' : '현재 장면 재생'}
                  </button>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-white/14 bg-white/8 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/14"
                    onClick={restartCurrentSegment}
                    type="button"
                  >
                    <RotateCcw className="size-4" />
                    처음부터
                  </button>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-white/14 bg-white/8 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/14"
                    onClick={goToPreviousSegment}
                    type="button"
                  >
                    <SkipBack className="size-4" />
                    이전 장면
                  </button>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-white/14 bg-white/8 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/14"
                    onClick={goToNextSegment}
                    type="button"
                  >
                    <SkipForward className="size-4" />
                    {segmentIndex >= show.segments.length - 1
                      ? '처음 장면'
                      : '다음 장면 재생'}
                  </button>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-white/14 bg-white/8 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/14"
                    onClick={toggleMuted}
                    type="button"
                  >
                    {isMuted ? (
                      <>
                        <VolumeX className="size-4" />
                        음소거 해제
                      </>
                    ) : (
                      <>
                        <Volume2 className="size-4" />
                        음소거
                      </>
                    )}
                  </button>
                  <a
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-white/14 bg-transparent px-4 py-3 text-sm font-medium text-white/78 transition hover:bg-white/8"
                    href="/"
                  >
                    검증 화면
                  </a>
                </div>

                {playbackNotice ? (
                  <p className="mt-4 text-sm leading-6 text-amber-200">
                    {playbackNotice}
                  </p>
                ) : null}
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  )
}

function getPrimaryTrack(explanation: SegmentExplanation): [TrackKey, string] {
  if (explanation.tracks.action) {
    return ['action', explanation.tracks.action]
  }

  if (explanation.tracks.easy) {
    return ['easy', explanation.tracks.easy]
  }

  return ['basic', explanation.tracks.basic]
}

function getTrackEntries(
  explanation: SegmentExplanation,
): Array<[TrackKey, string]> {
  return (
    ['basic', 'easy', 'action', 'reason', 'caregiver', 'report'] as TrackKey[]
  )
    .map((track) => {
      const text = explanation.tracks[track]

      if (!text) {
        return null
      }

      return [track, text] as [TrackKey, string]
    })
    .filter((entry): entry is [TrackKey, string] => Boolean(entry))
}

function getHazardLabel(hazard: HazardType) {
  switch (hazard) {
    case 'fire':
      return '화재'
    case 'earthquake':
      return '지진'
    default:
      return '미확정'
  }
}

function getSegmentProgressPct(currentTimeMs: number, segment: TheaterSegment) {
  const rangeMs = Math.max(1, segment.endMs - segment.startMs)
  const progressMs = Math.min(
    Math.max(currentTimeMs - segment.startMs, 0),
    rangeMs,
  )

  return (progressMs / rangeMs) * 100
}

function TrackCard({
  label,
  text,
  tone,
}: {
  label: string
  text: string
  tone: 'active' | 'default'
}) {
  return (
    <div
      className={cn(
        'rounded-md border p-4',
        tone === 'active'
          ? 'border-white/22 bg-white text-[#07090c]'
          : 'border-white/10 bg-white/[0.03] text-white',
      )}
    >
      <p
        className={cn(
          'text-sm font-semibold',
          tone === 'active' ? 'text-[#07090c]/72' : 'text-white/68',
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'mt-2 text-base leading-7',
          tone === 'active' ? 'text-[#07090c]' : 'text-white/82',
        )}
      >
        {text}
      </p>
    </div>
  )
}

function InfoChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-white/12 px-3 py-1 text-sm text-white/76">
      {children}
    </span>
  )
}
