import type { ReactNode } from 'react'

import {
  Flame,
  MonitorPlay,
  PanelRightOpen,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  SkipBack,
  Waves,
} from 'lucide-react'

import type { HazardType } from '@ansimtrack/shared-types'

import type { CaptureInputState } from '../lib/capture-input'
import {
  shadowDemoDefaults,
  useShadowDemoPlayer,
} from '../lib/useShadowDemoPlayer'
import { useShadowLivePlayer } from '../lib/useShadowLivePlayer'
import { cn, formatClock } from '../lib/utils'

type ShadowStageScenario = {
  demoFrames?: Array<{ imageRef: string; tsMs: number }>
  id: string
  overlaySummary: string
  overlayTargets: Array<{ label: string }>
  playbackMode?: 'demo' | 'live' | 'restored'
  restoredSessionLabel?: string | null
  segment: {
    endMs: number
    hazard: HazardType
    startMs: number
    title: string
  }
  videoCaption: string
}

export function ShadowVideoStage({
  captureInput,
  onToggleEvidence,
  onTogglePanic,
  panicMode,
  scenario,
}: {
  captureInput: CaptureInputState
  onToggleEvidence: () => void
  onTogglePanic: () => void
  panicMode: boolean
  scenario: ShadowStageScenario
}) {
  const isRestoredSnapshot = scenario.playbackMode === 'restored'
  const liveShadowEnabled =
    !isRestoredSnapshot &&
    captureInput.shadowStatus === 'ready' &&
    captureInput.frameWindow.length > 0

  const livePlayer = useShadowLivePlayer({
    captureInput,
    enabled: liveShadowEnabled,
    segmentStartMs: scenario.segment.startMs,
    segmentEndMs: scenario.segment.endMs,
  })
  const demoPlayer = useShadowDemoPlayer({
    enabled: !liveShadowEnabled && !isRestoredSnapshot,
    segmentStartMs: scenario.segment.startMs,
    segmentEndMs: scenario.segment.endMs,
  })
  const player =
    liveShadowEnabled && livePlayer.state.liveEdgeMs > 0
      ? livePlayer
      : demoPlayer
  const isLiveReplay = player.state.mode === 'live'
  const replayFrameRef =
    player.state.replayFrameRef ??
    (!isLiveReplay
      ? pickDemoFrameAtOrBefore(
          scenario.demoFrames ?? [],
          player.state.replayCursorMs,
        )
      : null)
  const liveFrameRef =
    player.state.liveFrameRef ??
    (!isLiveReplay
      ? pickDemoFrameAtOrBefore(
          scenario.demoFrames ?? [],
          player.state.liveEdgeMs,
        )
      : null)

  const replayProgressPct = getPercent(
    player.state.replayCursorMs,
    player.state.bufferStartMs,
    player.state.liveEdgeMs,
  )

  const delayedEdgePct = getPercent(
    player.state.delayedCursorMs,
    player.state.bufferStartMs,
    player.state.liveEdgeMs,
  )
  const statusLabel = isRestoredSnapshot
    ? '복원된 분석 · 새 캡처 대기'
    : player.state.isUnderrun
      ? isLiveReplay
        ? 'shadow buffer warming up'
        : 'buffer underrun'
      : isLiveReplay
        ? '실제 live 입력 · 4초 shadow'
        : 'demo shadow · 4초'
  const statusDotClass = isRestoredSnapshot
    ? 'bg-sky-300'
    : player.state.isUnderrun
      ? 'bg-amber-300'
      : 'bg-emerald-400'
  const replayBadgeLabel = isRestoredSnapshot
    ? '복원된 분석'
    : isLiveReplay
      ? 'Shadow Replay'
      : 'Demo Replay'
  const framePlaceholder = isRestoredSnapshot
    ? `이전 분석을 복원했습니다${
        scenario.restoredSessionLabel
          ? `: ${scenario.restoredSessionLabel}`
          : ''
      }. 새 캡처를 시작하면 Shadow 영상이 다시 들어옵니다.`
    : 'replay frame을 아직 받지 못했습니다. capture를 시작하거나 demo preset을 선택해 주세요.'
  const controlsDisabled = isRestoredSnapshot
  const metricValues = isRestoredSnapshot
    ? {
        analysis: '복원된 근거',
        delay: '대기 중',
        live: '새 캡처 대기',
        replay: `${formatClock(scenario.segment.startMs)} - ${formatClock(
          scenario.segment.endMs,
        )}`,
      }
    : {
        analysis:
          player.state.analysisMode === 'burst' ? 'burst 4-6fps' : 'base 1fps',
        delay: `${(
          (player.state.liveEdgeMs - player.state.replayCursorMs) /
          1000
        ).toFixed(1)}초`,
        live: formatClock(player.state.liveEdgeMs),
        replay: formatClock(player.state.replayCursorMs),
      }

  return (
    <div className="relative overflow-hidden rounded-md border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(210,34,63,0.28),_transparent_28%),linear-gradient(180deg,#1a1c20_0%,#101215_100%)]">
      <div className="absolute inset-x-0 top-0 flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm text-white/75">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', statusDotClass)} />
          {statusLabel}
        </div>
        <div className="flex items-center gap-2">
          {scenario.segment.hazard === 'fire' ? (
            <Flame className="size-4 text-rose-300" />
          ) : (
            <Waves className="size-4 text-teal-300" />
          )}
          {scenario.overlaySummary}
        </div>
      </div>

      <div className="flex h-full min-h-[380px] flex-col justify-between px-5 pb-5 pt-18">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative overflow-hidden rounded-md border border-white/10 bg-black/40">
            {replayFrameRef ? (
              <img
                alt="Shadow replay frame"
                className="aspect-video w-full object-cover"
                src={replayFrameRef}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_36%),linear-gradient(180deg,rgba(13,16,20,0.82),rgba(4,6,9,0.98))] px-6 text-center text-sm leading-6 text-white/70">
                {framePlaceholder}
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/30 to-transparent" />
            <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-black/42 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
                <MonitorPlay className="size-4" />
                {replayBadgeLabel}
              </span>
              {player.state.replayFrameOrigin ? (
                <span className="rounded-md border border-white/12 bg-black/32 px-3 py-2 text-xs text-white/65">
                  {player.state.replayFrameOrigin === 'native'
                    ? 'native snapshot'
                    : 'browser sample'}
                </span>
              ) : null}
            </div>
            {liveFrameRef ? (
              <div className="absolute bottom-4 right-4 w-36 overflow-hidden rounded-md border border-white/12 bg-black/42 shadow-[0_20px_40px_rgba(0,0,0,0.28)]">
                <img
                  alt="Live edge frame"
                  className="aspect-video w-full object-cover"
                  src={liveFrameRef}
                />
                <div className="border-t border-white/12 px-2 py-1 text-[11px] text-white/70">
                  live edge
                </div>
              </div>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/55">
                현재 장면
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {scenario.segment.title}
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/78">
                {scenario.videoCaption}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {scenario.overlayTargets.map((target) => (
              <div
                key={target.label}
                className="rounded-md border border-white/12 bg-black/28 px-3 py-2 text-sm text-white/85"
              >
                {target.label}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <StageMetric label="Replay" value={metricValues.replay} />
            <StageMetric label="Live" value={metricValues.live} />
            <StageMetric label="Delay" value={metricValues.delay} />
            <StageMetric label="Analysis" value={metricValues.analysis} />
          </div>

          <div className="rounded-md border border-white/10 bg-black/28 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.12em] text-white/55">
              <span>
                {isRestoredSnapshot
                  ? '복원된 세그먼트'
                  : isLiveReplay
                    ? '실시간 세그먼트 마커'
                    : '세그먼트 마커'}
              </span>
              <span>
                {isRestoredSnapshot
                  ? '이전 분석을 복원했습니다.'
                  : player.state.lastEvent}
              </span>
            </div>
            <div className="relative mt-3 h-3 rounded-full bg-white/8">
              <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-white/6" />
              <div
                className="absolute inset-y-0 rounded-full bg-white/12"
                style={{ width: `${delayedEdgePct}%` }}
              />
              {player.state.markers.map((marker) => (
                <div
                  key={marker.id}
                  className={cn(
                    'absolute inset-y-[-4px] w-1 rounded-full',
                    marker.id === 'segment-start'
                      ? 'bg-rose-300'
                      : 'bg-teal-300',
                  )}
                  style={{ left: `${marker.positionPct}%` }}
                  title={marker.label}
                />
              ))}
              <div
                className="absolute inset-y-[-5px] w-3 rounded-full border border-white/70 bg-[var(--ink)]"
                style={{ left: `${replayProgressPct}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
              <span>
                {isRestoredSnapshot
                  ? '이전 분석 결과 유지 · 새 캡처 대기'
                  : `buffer ${shadowDemoDefaults.capacityMs / 1000}초 유지 · ${
                      isLiveReplay ? 'live lane 직결' : 'demo seed'
                    }`}
              </span>
              <span>
                {isRestoredSnapshot
                  ? '재생 제어는 새 캡처 후 사용할 수 있습니다.'
                  : `auto-pause ${
                      player.state.autoPauseEnabled ? 'on' : 'off'
                    } · ${player.state.isPaused ? 'paused' : 'playing'}`}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-black/24 px-4 py-3 text-white">
            <div className="flex flex-wrap items-center gap-2 text-sm text-white/75">
              <button
                className="icon-button"
                disabled={controlsDisabled}
                type="button"
                aria-label="재생"
                onClick={player.controls.resume}
              >
                <Play className="size-4" />
              </button>
              <button
                className="icon-button"
                disabled={controlsDisabled}
                type="button"
                aria-label="일시정지"
                onClick={player.controls.pause}
              >
                <Pause className="size-4" />
              </button>
              <button
                className="icon-button"
                disabled={controlsDisabled}
                type="button"
                aria-label="5초 되감기"
                onClick={player.controls.seekBackFiveSeconds}
              >
                <SkipBack className="size-4" />
              </button>
              <button
                className="icon-button"
                disabled={controlsDisabled}
                type="button"
                aria-label="현재 세그먼트 다시 보기"
                onClick={player.controls.replaySegment}
              >
                <RotateCcw className="size-4" />
              </button>
              <button
                className={cn(
                  'rounded-md border px-3 py-2 text-xs font-medium transition',
                  player.state.autoPauseEnabled
                    ? 'border-white/18 bg-white/12 text-white'
                    : 'border-white/10 bg-transparent text-white/70 hover:bg-white/8',
                )}
                disabled={controlsDisabled}
                onClick={player.controls.toggleAutoPause}
                type="button"
              >
                auto-pause
              </button>
            </div>
            <div className="flex gap-2">
              <StageActionButton
                icon={<ShieldAlert className="size-4" />}
                onClick={onTogglePanic}
                variant={panicMode ? 'active' : 'default'}
              >
                Panic Mode
              </StageActionButton>
              <StageActionButton
                icon={<PanelRightOpen className="size-4" />}
                onClick={onToggleEvidence}
              >
                근거 패널
              </StageActionButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/24 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}

function StageActionButton({
  children,
  icon,
  onClick,
  variant = 'default',
}: {
  children: ReactNode
  icon: ReactNode
  onClick: () => void
  variant?: 'active' | 'default'
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition',
        variant === 'active'
          ? 'border-white/24 bg-white text-[var(--ink)]'
          : 'border-white/14 bg-white/8 text-white hover:bg-white/14',
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      {children}
    </button>
  )
}

function getPercent(valueMs: number, startMs: number, endMs: number) {
  const rangeMs = Math.max(1, endMs - startMs)
  const rawPct = ((valueMs - startMs) / rangeMs) * 100

  return Math.min(100, Math.max(0, rawPct))
}

function pickDemoFrameAtOrBefore(
  frames: Array<{ imageRef: string; tsMs: number }>,
  cursorMs: number,
) {
  if (frames.length === 0) {
    return null
  }

  for (let index = frames.length - 1; index >= 0; index -= 1) {
    if (frames[index].tsMs <= cursorMs) {
      return frames[index].imageRef
    }
  }

  return frames[0]?.imageRef ?? null
}
