import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'

import {
  applySafetyGuardrails,
  buildGroundedExplanation,
  buildSegmentFromPerception,
  matchGroundedRules,
  type GroundedRuleMatch,
} from '@ansimtrack/llm-orchestrator'
import type {
  HazardType,
  PerceptionPacket,
  Segment,
  SegmentExplanation,
} from '@ansimtrack/shared-types'

import { demoScenarios } from './lib/mock-session'
import { cn, formatClock } from './lib/utils'

type TrackKey = 'basic' | 'easy' | 'action' | 'reason' | 'caregiver' | 'report'

type DemoScene = {
  accentClassName: string
  cues: DemoCue[]
  explanation: SegmentExplanation
  id: string
  note: string
  packet: PerceptionPacket
  posterSrc: string
  primarySourceTitle: string | null
  ruleMatches: GroundedRuleMatch[]
  safetyWarnings: string[]
  segment: Segment
  title: string
  videoSrc: string
}

type DemoCue = {
  text: string
  track: TrackKey
}

type TimedCue = DemoCue & {
  endMs: number
  startMs: number
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
      demoScenarios.flatMap((scenario) => {
        const media = mediaByScenarioId[scenario.id]
        if (!media) {
          return []
        }

        const segment = {
          ...buildSegmentFromPerception({
            packet: scenario.perceptionPacket,
            rules: scenario.rules,
          }),
          title: scenario.title,
        }
        const groundedExplanation = buildGroundedExplanation({
          evidence: scenario.perceptionPacket,
          rules: scenario.rules,
          segment,
        })
        const ruleMatches = matchGroundedRules({
          evidence: scenario.perceptionPacket,
          rules: scenario.rules,
          segment,
        })
        const safetyView = applySafetyGuardrails({
          evidenceVisible: true,
          explanation: groundedExplanation,
          panicMode: false,
          privacyConsent: true,
          segment,
        })

        return [
          {
            ...media,
            cues: buildCueList(safetyView.explanation),
            explanation: safetyView.explanation,
            id: scenario.id,
            packet: scenario.perceptionPacket,
            primarySourceTitle: ruleMatches[0]?.rule.source_title ?? null,
            ruleMatches,
            safetyWarnings: safetyView.warnings,
            segment,
            title: scenario.title,
          } satisfies DemoScene,
        ]
      }),
    [],
  )
  const [sceneId, setSceneId] = useState(scenes[0]?.id ?? '')
  const scene = scenes.find((item) => item.id === sceneId) ?? scenes[0]
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [playbackNotice, setPlaybackNotice] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const resumeAfterSwitchRef = useRef(false)

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

  const cueTimeline = buildCueTimeline(
    scene.cues,
    durationMs > 0 ? durationMs : Math.max(scene.cues.length * 4_500, 24_000),
  )
  const activeCue =
    cueTimeline.find(
      (cue) => currentTimeMs >= cue.startMs && currentTimeMs < cue.endMs,
    ) ??
    cueTimeline[cueTimeline.length - 1] ??
    null
  const progressPct =
    durationMs > 0 ? Math.min(100, (currentTimeMs / durationMs) * 100) : 0
  const selectedTrack = activeCue?.track ?? getPreferredTrack(scene.explanation)
  const selectedTrackText =
    activeCue?.text ??
    scene.explanation.tracks[selectedTrack] ??
    scene.explanation.tracks.easy ??
    scene.explanation.tracks.basic
  const visibleSignals = Array.from(
    new Set([
      ...scene.packet.ocrTokens,
      ...scene.packet.uiElements.map((item) => item.label),
      ...scene.packet.objectHints.map((item) => item.label),
    ]),
  ).slice(0, 8)
  const highlightedSignals = Array.from(
    new Set(
      scene.ruleMatches.flatMap((match) => match.matchedSignals).slice(0, 10),
    ),
  )

  const seekToCue = (cue: TimedCue) => {
    const video = videoRef.current
    if (!video) {
      return
    }

    video.currentTime = cue.startMs / 1000
    setCurrentTimeMs(cue.startMs)
  }

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
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-3 rounded-md border border-white/12 bg-black/28 px-3 py-2 text-sm text-white/85 backdrop-blur-sm">
                  <span
                    className={cn('size-2 rounded-full', scene.accentClassName)}
                  />
                  <span>{scene.title}</span>
                </div>
                <div className="rounded-md border border-white/12 bg-black/28 px-3 py-2 text-sm text-white/72 backdrop-blur-sm">
                  {getHazardLabel(scene.segment.hazard)}
                </div>
                <div className="rounded-md border border-white/12 bg-black/28 px-3 py-2 text-sm text-white/72 backdrop-blur-sm">
                  {scene.explanation.safetyMode === 'grounded'
                    ? 'grounded'
                    : '공식 확인 우선'}
                </div>
                {scene.segment.officialRuleIds[0] ? (
                  <div className="rounded-md border border-white/12 bg-black/28 px-3 py-2 text-sm text-white/72 backdrop-blur-sm">
                    {scene.segment.officialRuleIds[0]}
                  </div>
                ) : null}
              </div>
              <div className="rounded-md border border-white/12 bg-black/28 px-3 py-2 text-sm text-white/72 backdrop-blur-sm">
                {formatClock(currentTimeMs)} / {formatClock(durationMs)}
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
              <div className="rounded-md border border-white/12 bg-black/34 p-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-center gap-2 text-sm text-white/68">
                  <span className="rounded-md border border-white/12 px-2 py-1">
                    현재 설명
                  </span>
                  <span className="rounded-md border border-white/12 px-2 py-1">
                    {trackLabels[selectedTrack]}
                  </span>
                  {scene.primarySourceTitle ? (
                    <span className="rounded-md border border-white/12 px-2 py-1">
                      {scene.primarySourceTitle}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 max-w-4xl text-[clamp(1.4rem,2vw,2.4rem)] font-semibold leading-[1.2] tracking-tight text-white">
                  {selectedTrackText}
                </p>
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

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <section className="rounded-md border border-white/10 bg-[#101418] p-6 lg:p-8">
              <div className="flex flex-wrap items-center gap-2 text-sm text-white/55">
                <span className="rounded-md border border-white/10 px-3 py-1">
                  설명 흐름
                </span>
                <span className="rounded-md border border-white/10 px-3 py-1">
                  {scene.note}
                </span>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                {cueTimeline.map((cue) => (
                  <button
                    key={`${scene.id}-${cue.track}`}
                    className={cn(
                      'rounded-md border px-3 py-2 text-left transition',
                      cue.track === selectedTrack
                        ? 'border-white/24 bg-white text-[#07090c]'
                        : 'border-white/12 bg-transparent text-white/72 hover:bg-white/8',
                    )}
                    onClick={() => seekToCue(cue)}
                    type="button"
                  >
                    <p className="text-sm font-semibold">
                      {trackLabels[cue.track]}
                    </p>
                    <p className="mt-1 text-xs text-inherit/70">
                      {formatClock(cue.startMs)} - {formatClock(cue.endMs)}
                    </p>
                  </button>
                ))}
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-white/70 transition-[width]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="mt-3 flex gap-1">
                {cueTimeline.map((cue) => (
                  <button
                    key={`${scene.id}-marker-${cue.track}`}
                    aria-label={`${trackLabels[cue.track]} 구간으로 이동`}
                    className={cn(
                      'h-2 flex-1 rounded-full transition',
                      cue.track === selectedTrack
                        ? 'bg-white'
                        : 'bg-white/20 hover:bg-white/40',
                    )}
                    onClick={() => seekToCue(cue)}
                    type="button"
                  />
                ))}
              </div>
              <p className="mt-6 text-[clamp(2rem,3vw,3.75rem)] font-semibold leading-[1.15] tracking-tight text-white">
                {selectedTrackText}
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <InfoPanel label="이유">
                  {scene.explanation.tracks.reason}
                </InfoPanel>
                <InfoPanel label="핵심 근거">
                  {scene.primarySourceTitle
                    ? `${scene.primarySourceTitle} · ${scene.segment.officialRuleIds.join(', ')}`
                    : '근거가 부족해 공식 확인 우선 모드로 유지합니다.'}
                </InfoPanel>
                {scene.explanation.tracks.report ? (
                  <InfoPanel label="신고">
                    {scene.explanation.tracks.report}
                  </InfoPanel>
                ) : null}
                {scene.explanation.tracks.caregiver ? (
                  <InfoPanel label="보호자">
                    {scene.explanation.tracks.caregiver}
                  </InfoPanel>
                ) : null}
              </div>
              {scene.explanation.doNot ? (
                <p className="mt-5 text-base leading-7 text-rose-200/88">
                  하지 말 것: {scene.explanation.doNot}
                </p>
              ) : null}
              {scene.safetyWarnings.length > 0 ? (
                <div className="mt-5 rounded-md border border-amber-300/30 bg-amber-300/10 p-4">
                  <p className="text-sm font-semibold text-amber-100">
                    Safety fallback
                  </p>
                  <div className="mt-2 grid gap-2 text-sm leading-6 text-amber-50/88">
                    {scene.safetyWarnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <aside className="grid gap-4">
              <section className="rounded-md border border-white/10 bg-[#101418] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                  멀티트랙
                </p>
                <div className="mt-4 grid gap-2">
                  {cueTimeline.map((cue) => (
                    <button
                      key={`${scene.id}-track-${cue.track}`}
                      className={cn(
                        'rounded-md border px-4 py-3 text-left transition',
                        cue.track === selectedTrack
                          ? 'border-white/24 bg-white text-[#07090c]'
                          : 'border-white/12 bg-transparent text-white/78 hover:bg-white/8',
                      )}
                      onClick={() => seekToCue(cue)}
                      type="button"
                    >
                      <p className="text-sm font-semibold">
                        {trackLabels[cue.track]}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-inherit/78">
                        {cue.text}
                      </p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-md border border-white/10 bg-[#101418] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                  Grounded
                </p>
                <div className="mt-4 grid gap-3 text-sm leading-6 text-white/78">
                  <p>
                    {scene.primarySourceTitle ??
                      '현재 장면은 공식 확인 우선 모드입니다.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {scene.segment.officialRuleIds.length > 0 ? (
                      scene.segment.officialRuleIds.map((ruleId) => (
                        <InfoChip key={ruleId}>{ruleId}</InfoChip>
                      ))
                    ) : (
                      <InfoChip>rule id 없음</InfoChip>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {highlightedSignals.length > 0 ? (
                      highlightedSignals.map((signal) => (
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
                      {scene.packet.asrText || '음성 근거 없음'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {visibleSignals.length > 0 ? (
                      visibleSignals.map((signal) => (
                        <InfoChip key={signal}>{signal}</InfoChip>
                      ))
                    ) : (
                      <InfoChip>관찰 신호 없음</InfoChip>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-md border border-white/10 bg-[#101418] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                  Controls
                </p>
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
              </section>
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

function buildCueList(explanation: SegmentExplanation): DemoCue[] {
  return (
    ['basic', 'easy', 'action', 'reason', 'caregiver', 'report'] as TrackKey[]
  )
    .map((track) => {
      const text = explanation.tracks[track]

      if (!text) {
        return null
      }

      return {
        text,
        track,
      }
    })
    .filter((cue): cue is DemoCue => Boolean(cue))
}

function buildCueTimeline(cues: DemoCue[], totalMs: number): TimedCue[] {
  if (cues.length === 0) {
    return []
  }

  const cueDurationMs = Math.max(3_500, totalMs / cues.length)

  return cues.map((cue, index) => ({
    ...cue,
    endMs:
      index === cues.length - 1
        ? totalMs
        : Math.round((index + 1) * cueDurationMs),
    startMs: Math.round(index * cueDurationMs),
  }))
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

function InfoPanel({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-semibold text-white/70">{label}</p>
      <p className="mt-2 text-base leading-7 text-white/82">{children}</p>
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
