import type { ReactNode } from 'react'

import {
  Flame,
  PanelRightOpen,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  SkipBack,
  Waves,
} from 'lucide-react'

import type { HazardType } from '@ansimtrack/shared-types'

import {
  shadowDemoDefaults,
  useShadowDemoPlayer,
} from '../lib/useShadowDemoPlayer'
import { cn, formatClock } from '../lib/utils'

type ShadowStageScenario = {
  id: string
  overlaySummary: string
  overlayTargets: Array<{ label: string }>
  segment: {
    endMs: number
    hazard: HazardType
    startMs: number
    title: string
  }
  videoCaption: string
}

export function ShadowVideoStage({
  onToggleEvidence,
  onTogglePanic,
  panicMode,
  scenario,
}: {
  onToggleEvidence: () => void
  onTogglePanic: () => void
  panicMode: boolean
  scenario: ShadowStageScenario
}) {
  const player = useShadowDemoPlayer({
    segmentStartMs: scenario.segment.startMs,
    segmentEndMs: scenario.segment.endMs,
  })

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

  return (
    <div className="relative overflow-hidden rounded-md border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(210,34,63,0.28),_transparent_28%),linear-gradient(180deg,#1a1c20_0%,#101215_100%)]">
      <div className="absolute inset-x-0 top-0 flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm text-white/75">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'size-2 rounded-full',
              player.state.isUnderrun ? 'bg-amber-300' : 'bg-emerald-400',
            )}
          />
          {player.state.isUnderrun ? 'buffer underrun' : 'live edge - 4초'}
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
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div className="max-w-[420px] rounded-md border border-white/10 bg-black/22 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/55">
              현재 장면
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {scenario.segment.title}
            </p>
            <p className="mt-2 text-sm leading-6 text-white/75">
              {scenario.videoCaption}
            </p>
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
            <StageMetric
              label="Replay"
              value={formatClock(player.state.replayCursorMs)}
            />
            <StageMetric
              label="Live"
              value={formatClock(player.state.liveEdgeMs)}
            />
            <StageMetric
              label="Delay"
              value={`${((player.state.liveEdgeMs - player.state.replayCursorMs) / 1000).toFixed(1)}초`}
            />
            <StageMetric
              label="Analysis"
              value={
                player.state.analysisMode === 'burst'
                  ? 'burst 4-6fps'
                  : 'base 1fps'
              }
            />
          </div>

          <div className="rounded-md border border-white/10 bg-black/28 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.12em] text-white/55">
              <span>세그먼트 마커</span>
              <span>{player.state.lastEvent}</span>
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
              <span>buffer {shadowDemoDefaults.capacityMs / 1000}초 유지</span>
              <span>
                auto-pause {player.state.autoPauseEnabled ? 'on' : 'off'} ·{' '}
                {player.state.isPaused ? 'paused' : 'playing'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-black/24 px-4 py-3 text-white">
            <div className="flex flex-wrap items-center gap-2 text-sm text-white/75">
              <button
                className="icon-button"
                type="button"
                aria-label="재생"
                onClick={player.controls.resume}
              >
                <Play className="size-4" />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="일시정지"
                onClick={player.controls.pause}
              >
                <Pause className="size-4" />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="5초 되감기"
                onClick={player.controls.seekBackFiveSeconds}
              >
                <SkipBack className="size-4" />
              </button>
              <button
                className="icon-button"
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
