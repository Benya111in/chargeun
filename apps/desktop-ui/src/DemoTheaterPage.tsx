import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'

import {
  buildGroundedExplanation,
  buildSegmentFromPerception,
} from '@ansimtrack/llm-orchestrator'
import type { SegmentExplanation } from '@ansimtrack/shared-types'

import { demoScenarios } from './lib/mock-session'
import { cn, formatClock } from './lib/utils'

type TrackKey = 'basic' | 'easy' | 'action' | 'reason' | 'caregiver' | 'report'

type DemoScene = {
  accentClassName: string
  explanation: SegmentExplanation
  id: string
  note: string
  posterSrc: string
  title: string
  videoSrc: string
}

const trackLabels: Record<TrackKey, string> = {
  basic: '기본',
  easy: '쉬운말',
  action: '지금 할 일',
  reason: '이유',
  caregiver: '보호자',
  report: '신고',
}

const mediaByScenarioId: Record<
  string,
  Pick<DemoScene, 'accentClassName' | 'note' | 'posterSrc' | 'videoSrc'>
> = {
  'backup-earthquake-after': {
    accentClassName: 'bg-teal-400',
    note: '흔들림 종료 후 가스 차단과 출구 확보를 바로 설명합니다.',
    posterSrc: '/demo/earthquake-after-02.jpg',
    videoSrc: '/demo-video/earthquake-after-shaking-001.mp4',
  },
  'backup-fire-visual': {
    accentClassName: 'bg-orange-400',
    note: '오디오가 없어도 화면 정보만으로 grounded 설명을 유지합니다.',
    posterSrc: '/demo/fire-visual-02.jpg',
    videoSrc: '/demo-video/fire-stair-no-audio-001.mp4',
  },
  'grounded-fire': {
    accentClassName: 'bg-rose-400',
    note: '비상구와 계단 근거를 붙인 화재 행동 설명입니다.',
    posterSrc: '/demo/fire-grounded-02.jpg',
    videoSrc: '/demo-video/fire-door-control-001.mp4',
  },
  'review-earthquake': {
    accentClassName: 'bg-sky-400',
    note: '흔들림은 보이지만 공식 확인 우선으로 떨어지는 장면입니다.',
    posterSrc: '/demo/earthquake-review-02.jpg',
    videoSrc: '/demo-video/earthquake-desk-001.mp4',
  },
}

export default function DemoTheaterPage() {
  const scenes = useMemo<DemoScene[]>(
    () =>
      demoScenarios
        .map((scenario) => {
          const media = mediaByScenarioId[scenario.id]
          if (!media) {
            return null
          }

          const segment = {
            ...buildSegmentFromPerception({
              packet: scenario.perceptionPacket,
              rules: scenario.rules,
            }),
            title: scenario.title,
          }

          return {
            ...media,
            explanation: buildGroundedExplanation({
              evidence: scenario.perceptionPacket,
              rules: scenario.rules,
              segment,
            }),
            id: scenario.id,
            title: scenario.title,
          }
        })
        .filter((scene): scene is DemoScene => Boolean(scene)),
    [],
  )
  const [sceneId, setSceneId] = useState(scenes[0]?.id ?? '')
  const scene = scenes.find((item) => item.id === sceneId) ?? scenes[0]
  const [selectedTrackOverrides, setSelectedTrackOverrides] = useState<
    Partial<Record<string, TrackKey>>
  >({})
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [playbackNotice, setPlaybackNotice] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const resumeAfterSwitchRef = useRef(false)
  const selectedTrack =
    selectedTrackOverrides[scene.id] ?? getPreferredTrack(scene.explanation)

  const selectedTrackText = scene
    ? (scene.explanation.tracks[selectedTrack] ??
      scene.explanation.tracks.easy ??
      scene.explanation.tracks.basic)
    : ''

  const availableTracks = scene
    ? ((
        Object.entries(scene.explanation.tracks) as Array<
          [TrackKey, string | undefined]
        >
      ).filter(([, value]) => Boolean(value)) as Array<[TrackKey, string]>)
    : []

  const playVideo = useCallback(async () => {
    const video = videoRef.current
    if (!video) {
      return
    }

    setPlaybackNotice('')

    try {
      await video.play()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '재생을 시작하지 못했습니다.'
      setPlaybackNotice(message)
      setIsPlaying(false)
    }
  }, [])

  const pauseVideo = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    video.pause()
    setPlaybackNotice('')
  }, [])

  const restartVideo = useCallback(async () => {
    const video = videoRef.current
    if (!video) {
      return
    }

    video.currentTime = 0
    await playVideo()
  }, [playVideo])

  const toggleMuted = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    const nextMuted = !video.muted
    video.muted = nextMuted
    setIsMuted(nextMuted)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !scene) {
      return
    }

    const shouldResume = resumeAfterSwitchRef.current
    resumeAfterSwitchRef.current = false

    if (!shouldResume) {
      return
    }

    const handleCanPlay = () => {
      void playVideo()
    }

    video.addEventListener('canplay', handleCanPlay, { once: true })

    return () => {
      video.removeEventListener('canplay', handleCanPlay)
    }
  }, [playVideo, scene])

  if (!scene) {
    return null
  }

  const progressPct =
    durationMs > 0 ? Math.min(100, (currentTimeMs / durationMs) * 100) : 0

  return (
    <main className="min-h-screen bg-[#07090c] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-4 lg:px-6 lg:py-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              SlowLearner Demo
            </p>
            <p className="mt-2 text-sm text-white/60">
              실제 클립과 행동 설명만 보여 주는 발표 화면
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
          {scenes.map((item) => (
            <button
              key={item.id}
              className={cn(
                'rounded-md border px-4 py-3 text-left transition',
                item.id === scene.id
                  ? 'border-white/26 bg-white text-[#07090c]'
                  : 'border-white/12 bg-white/4 text-white/78 hover:bg-white/10',
              )}
              onClick={() => {
                resumeAfterSwitchRef.current = isPlaying
                setIsPlaying(false)
                setCurrentTimeMs(0)
                setDurationMs(0)
                setPlaybackNotice('')
                setSceneId(item.id)
              }}
              type="button"
            >
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="mt-1 text-xs text-inherit/70">{item.note}</p>
            </button>
          ))}
        </div>

        <section className="mt-4 flex flex-1 flex-col gap-4">
          <div className="relative min-h-[52svh] overflow-hidden rounded-md border border-white/10 bg-black">
            <video
              ref={videoRef}
              className="h-full min-h-[52svh] w-full object-cover"
              onEnded={() => setIsPlaying(false)}
              onLoadedMetadata={(event) => {
                setDurationMs(event.currentTarget.duration * 1000)
                setIsMuted(event.currentTarget.muted)
              }}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onTimeUpdate={(event) => {
                setCurrentTimeMs(event.currentTarget.currentTime * 1000)
              }}
              playsInline
              poster={scene.posterSrc}
              preload="auto"
            >
              <source src={scene.videoSrc} type="video/mp4" />
            </video>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/72 via-black/12 to-black/42" />
            <div className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="inline-flex items-center gap-3 rounded-md border border-white/12 bg-black/28 px-3 py-2 text-sm text-white/85 backdrop-blur-sm">
                <span
                  className={cn('size-2 rounded-full', scene.accentClassName)}
                />
                <span>{scene.title}</span>
              </div>
              <div className="rounded-md border border-white/12 bg-black/28 px-3 py-2 text-sm text-white/72 backdrop-blur-sm">
                {formatClock(currentTimeMs)} / {formatClock(durationMs)}
              </div>
            </div>
            {!isPlaying ? (
              <button
                aria-label="영상 재생"
                className="absolute inset-0 flex items-center justify-center"
                onClick={() => {
                  void playVideo()
                }}
                type="button"
              >
                <span className="inline-flex items-center gap-3 rounded-md border border-white/14 bg-black/52 px-6 py-4 text-lg font-semibold text-white backdrop-blur-sm transition hover:bg-black/62">
                  <Play className="size-6" />
                  재생
                </span>
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="rounded-md border border-white/10 bg-[#101418] p-6 lg:p-8">
              <div className="flex flex-wrap items-center gap-2 text-sm text-white/55">
                <span className="rounded-md border border-white/10 px-3 py-1">
                  {trackLabels[selectedTrack]}
                </span>
                <span className="rounded-md border border-white/10 px-3 py-1">
                  {scene.note}
                </span>
              </div>
              <p className="mt-6 text-[clamp(2rem,3vw,3.75rem)] font-semibold leading-[1.15] tracking-tight text-white">
                {selectedTrackText}
              </p>
              <p className="mt-6 max-w-4xl text-lg leading-8 text-white/72">
                {scene.explanation.tracks.reason}
              </p>
              {scene.explanation.doNot ? (
                <p className="mt-5 text-base leading-7 text-rose-200/88">
                  하지 말 것: {scene.explanation.doNot}
                </p>
              ) : null}
            </section>

            <aside className="rounded-md border border-white/10 bg-[#101418] p-5">
              <div className="flex flex-wrap gap-2">
                {availableTracks.map(([track]) => (
                  <button
                    key={track}
                    className={cn(
                      'rounded-md border px-3 py-2 text-sm transition',
                      track === selectedTrack
                        ? 'border-white/24 bg-white text-[#07090c]'
                        : 'border-white/12 bg-transparent text-white/72 hover:bg-white/8',
                    )}
                    onClick={() =>
                      setSelectedTrackOverrides((previous) => ({
                        ...previous,
                        [scene.id]: track,
                      }))
                    }
                    type="button"
                  >
                    {trackLabels[track]}
                  </button>
                ))}
              </div>

              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-white/70 transition-[width]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/14 bg-white/8 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/14"
                  onClick={() => {
                    if (isPlaying) {
                      pauseVideo()
                      return
                    }

                    void playVideo()
                  }}
                  type="button"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="size-4" />
                      일시정지
                    </>
                  ) : (
                    <>
                      <Play className="size-4" />
                      재생
                    </>
                  )}
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/14 bg-white/8 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/14"
                  onClick={() => {
                    void restartVideo()
                  }}
                  type="button"
                >
                  <RotateCcw className="size-4" />
                  처음부터
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
            </aside>
          </div>
        </section>
      </div>
    </main>
  )
}

function getPreferredTrack(explanation: SegmentExplanation): TrackKey {
  if (explanation.tracks.action) {
    return 'action'
  }

  if (explanation.tracks.easy) {
    return 'easy'
  }

  return 'basic'
}
