import { useEffect, useRef, useState } from 'react'

import { Play, RotateCcw } from 'lucide-react'

import type { SegmentExplanation } from '@ansimtrack/shared-types'

import { theaterShows } from './lib/demo-theater-content'
import { cn } from './lib/utils'

type TrackKey = 'basic' | 'easy' | 'action' | 'reason' | 'caregiver' | 'report'
type TheaterStage = 'explanation' | 'playback' | 'ready'

const trackLabels: Record<TrackKey, string> = {
  basic: '먼저',
  easy: '쉽게',
  action: '지금 할 일',
  reason: '왜',
  caregiver: '옆에서 도와줘요',
  report: '신고할 때',
}

export default function DemoTheaterPage() {
  const [showId, setShowId] = useState(theaterShows[0]?.id ?? '')
  const show =
    theaterShows.find((item) => item.id === showId) ?? theaterShows[0]
  const [segmentIndex, setSegmentIndex] = useState(0)
  const segment = show.segments[segmentIndex]
  const [stage, setStage] = useState<TheaterStage>('ready')
  const [playbackNotice, setPlaybackNotice] = useState('')
  const [trackOverrides, setTrackOverrides] = useState<
    Record<string, TrackKey>
  >({})
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const autoPauseSegmentRef = useRef<string | null>(null)
  const stageHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const didMountRef = useRef(false)
  const trackKey = `${show.id}:${segment.id}`
  const selectedTrack =
    trackOverrides[trackKey] ?? getDefaultTrack(segment.explanation)
  const selectedText =
    segment.explanation.tracks[selectedTrack] ??
    segment.explanation.tracks.easy ??
    segment.explanation.tracks.action ??
    segment.explanation.tracks.basic
  const trackEntries = getTrackEntries(segment.explanation).filter(
    ([track]) => !(track === 'basic' && segment.explanation.tracks.easy),
  )

  const playSegment = async (nextIndex: number) => {
    const targetSegment = show.segments[nextIndex]
    const video = videoRef.current

    setSegmentIndex(nextIndex)
    setStage('playback')
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

      const message =
        error instanceof Error && error.name === 'NotAllowedError'
          ? '브라우저가 자동 재생을 막았습니다. 시작하기를 다시 눌러 주세요.'
          : '영상을 바로 재생하지 못했습니다. 다시 눌러 주세요.'
      setPlaybackNotice(message)
      setStage('ready')
    }
  }

  const loadSegment = (nextIndex: number) => {
    const targetSegment = show.segments[nextIndex]
    const video = videoRef.current

    setSegmentIndex(nextIndex)
    setStage('ready')
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

  const goToNextSegment = () => {
    if (segmentIndex >= show.segments.length - 1) {
      void playSegment(0)
      return
    }

    void playSegment(segmentIndex + 1)
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
    setStage('ready')
    setPlaybackNotice('')
  }

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }

    stageHeadingRef.current?.focus()
  }, [segment.id, stage])

  return (
    <main className="min-h-screen bg-[#07090c] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col px-4 py-5 lg:px-6 lg:py-6">
        <h1 className="sr-only">안심트랙 재난 행동 안내</h1>
        <div className="flex flex-wrap gap-2">
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
            </button>
          ))}
        </div>

        <section className="mt-4 flex flex-1 flex-col gap-4">
          <div className="relative min-h-[58svh] overflow-hidden rounded-md border border-white/10 bg-black">
            <video
              key={show.id}
              ref={videoRef}
              className="h-full min-h-[58svh] w-full object-cover"
              onEnded={() => {
                setStage('explanation')
              }}
              onLoadedMetadata={(event) => {
                event.currentTarget.currentTime = segment.startMs / 1000
              }}
              onPause={() => undefined}
              onPlay={() => undefined}
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
              poster={show.posterSrc}
              preload="auto"
            >
              <source src={show.videoSrc} type="video/mp4" />
            </video>

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/76 via-black/10 to-black/48" />

            <div className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="inline-flex items-center gap-3 rounded-md border border-white/12 bg-black/30 px-3 py-2 text-sm text-white/88 backdrop-blur-sm">
                <span
                  className={cn('size-2 rounded-full', show.accentClassName)}
                />
                <span>{show.title}</span>
              </div>
              <div className="rounded-md border border-white/12 bg-black/30 px-3 py-2 text-sm text-white/78 backdrop-blur-sm">
                {segmentIndex + 1} / {show.segments.length}
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
              <div className="rounded-md border border-white/12 bg-black/34 p-4 backdrop-blur-sm">
                <p className="text-sm font-semibold text-white/78">
                  {segment.label}
                </p>
                <p className="mt-2 max-w-4xl text-xl font-semibold leading-8 text-white">
                  {segment.description}
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
                <span className="inline-flex items-center gap-3 rounded-md border border-white/14 bg-black/52 px-7 py-4 text-xl font-semibold text-white backdrop-blur-sm transition hover:bg-black/62">
                  <Play className="size-6" />
                  시작하기
                </span>
              </button>
            ) : null}
          </div>

          <div className="flex gap-2">
            {show.segments.map((item, index) => (
              <button
                key={item.id}
                aria-label={`${index + 1}번째 장면`}
                className="flex min-h-11 flex-1 items-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                onClick={() => loadSegment(index)}
                type="button"
              >
                <span
                  className={cn(
                    'h-2 w-full rounded-full transition',
                    index < segmentIndex
                      ? 'bg-emerald-300'
                      : index === segmentIndex
                        ? 'bg-white'
                        : 'bg-white/16',
                  )}
                />
              </button>
            ))}
          </div>

          <section className="rounded-md border border-white/10 bg-[#101418] p-6 lg:p-8">
            <h2
              ref={stageHeadingRef}
              className="text-sm font-semibold text-white/62 outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              tabIndex={-1}
            >
              {segment.label}
            </h2>

            {stage === 'explanation' ? (
              <>
                <div className="mt-5 flex flex-wrap gap-2">
                  {trackEntries.map(([track]) => (
                    <button
                      key={track}
                      className={cn(
                        'rounded-md border px-4 py-3 text-base transition',
                        track === selectedTrack
                          ? 'border-white/22 bg-white text-[#07090c]'
                          : 'border-white/12 bg-transparent text-white/78 hover:bg-white/8',
                      )}
                      onClick={() =>
                        setTrackOverrides((previous) => ({
                          ...previous,
                          [trackKey]: track,
                        }))
                      }
                      type="button"
                    >
                      {trackLabels[track]}
                    </button>
                  ))}
                </div>

                <p className="mt-6 max-w-4xl text-[clamp(2rem,3vw,3.8rem)] font-semibold leading-[1.18] tracking-tight text-white">
                  {selectedText}
                </p>

                {segment.explanation.doNot ? (
                  <div className="mt-6 rounded-md border border-rose-300/28 bg-rose-300/10 px-5 py-4">
                    <p className="text-base font-semibold text-rose-100">
                      하지 말 것
                    </p>
                    <p className="mt-2 text-lg leading-8 text-rose-50/92">
                      {segment.explanation.doNot}
                    </p>
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-white/18 bg-white px-5 py-4 text-lg font-semibold text-[#07090c] transition hover:bg-white/90"
                    onClick={restartCurrentSegment}
                    type="button"
                  >
                    <RotateCcw className="size-5" />이 장면 다시 보기
                  </button>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-white/14 bg-white/8 px-5 py-4 text-lg font-semibold text-white transition hover:bg-white/14"
                    onClick={goToNextSegment}
                    type="button"
                  >
                    <Play className="size-5" />
                    {segmentIndex >= show.segments.length - 1
                      ? '처음부터 다시 보기'
                      : '다음 장면 보기'}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/18 bg-white px-5 py-4 text-lg font-semibold text-[#07090c] transition hover:bg-white/90"
                  onClick={() => {
                    void playSegment(segmentIndex)
                  }}
                  type="button"
                >
                  <Play className="size-5" />
                  {stage === 'playback' ? '다시 보기' : '시작하기'}
                </button>
              </div>
            )}

            {playbackNotice ? (
              <p className="mt-4 text-sm leading-6 text-amber-200">
                {playbackNotice}
              </p>
            ) : null}
          </section>
        </section>
      </div>
    </main>
  )
}

function getDefaultTrack(explanation: SegmentExplanation): TrackKey {
  if (explanation.tracks.easy) {
    return 'easy'
  }

  if (explanation.tracks.action) {
    return 'action'
  }

  return 'basic'
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

function isExpectedPlaybackInterruption(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  return (
    error.name === 'AbortError' ||
    error.message.includes('interrupted by a call to pause')
  )
}
