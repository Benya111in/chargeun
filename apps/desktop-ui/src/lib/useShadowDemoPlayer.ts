import { useEffect, useState } from 'react'

import { ShadowBuffer } from '@ansimtrack/shadow-buffer'

import {
  buildVisibleMarkers,
  getAnalysisMode,
  type VisibleMarker,
} from './shadow-player-utils'

type ShadowDemoPlayerOptions = {
  enabled?: boolean
  segmentStartMs: number
  segmentEndMs: number
}

type ShadowDemoPlayerState = {
  autoPauseEnabled: boolean
  analysisMode: 'baseline' | 'burst'
  bufferStartMs: number
  delayedCursorMs: number
  isPaused: boolean
  isUnderrun: boolean
  lastEvent: string
  liveEdgeMs: number
  liveFrameOrigin: null
  liveFrameRef: null
  markerWindow: {
    segmentStartMs: number
    segmentEndMs: number
  }
  markers: VisibleMarker[]
  mode: 'demo'
  replayCursorMs: number
  replayFrameOrigin: null
  replayFrameRef: null
}

const capacityMs = 8000
const delayMs = 4000
const frameIntervalMs = 250
const seededLiveEdgeMs = 12000

export function useShadowDemoPlayer(options: ShadowDemoPlayerOptions) {
  const enabled = options.enabled ?? true
  const [seeded] = useState(() => createSeededBuffer(options))
  const { buffer, markerWindow } = seeded
  const [state, setState] = useState<ShadowDemoPlayerState>(() =>
    createInitialState(buffer, markerWindow),
  )

  useEffect(() => {
    if (!enabled) {
      return
    }

    const interval = window.setInterval(() => {
      setState((previous) => {
        const nextTsMs = buffer.getLiveEdgeMs() + frameIntervalMs

        buffer.appendFrame({
          id: `frame-${nextTsMs}`,
          tsMs: nextTsMs,
          durationMs: frameIntervalMs,
        })

        const snapshot = buffer.getSnapshot()
        let replayCursorMs = previous.replayCursorMs
        let isPaused = previous.isPaused
        let lastEvent = previous.lastEvent

        if (!previous.isPaused) {
          const nextCursorMs = Math.min(
            snapshot.delayedCursorMs,
            previous.replayCursorMs + frameIntervalMs,
          )
          const crossedMarker = buffer.getMarkerCrossing(
            previous.replayCursorMs,
            nextCursorMs,
          )

          replayCursorMs = nextCursorMs

          if (
            crossedMarker?.autoPause &&
            previous.autoPauseEnabled &&
            nextCursorMs >= markerWindow.segmentEndMs
          ) {
            replayCursorMs = crossedMarker.tsMs
            isPaused = true
            lastEvent = '세그먼트 경계에서 자동 일시정지'
          }
        }

        return {
          ...previous,
          autoPauseEnabled: previous.autoPauseEnabled,
          analysisMode: getAnalysisMode(
            replayCursorMs,
            markerWindow.segmentStartMs,
            markerWindow.segmentEndMs,
          ),
          bufferStartMs: snapshot.bufferStartMs,
          delayedCursorMs: snapshot.delayedCursorMs,
          isPaused,
          isUnderrun: snapshot.isUnderrun,
          lastEvent,
          liveEdgeMs: snapshot.liveEdgeMs,
          markerWindow,
          markers: buildVisibleMarkers(buffer, snapshot),
          replayCursorMs,
        }
      })
    }, frameIntervalMs)

    return () => {
      window.clearInterval(interval)
    }
  }, [buffer, enabled, markerWindow])

  return {
    state,
    controls: {
      pause: () => {
        setState((previous) => ({
          ...previous,
          isPaused: true,
          lastEvent: '수동 일시정지',
        }))
      },
      replaySegment: () => {
        setState((previous) => ({
          ...previous,
          isPaused: false,
          lastEvent: '현재 세그먼트 다시 보기',
          replayCursorMs: buffer.replaySegment('segment-start'),
        }))
      },
      resume: () => {
        setState((previous) => ({
          ...previous,
          isPaused: false,
          lastEvent: '재생 재개',
          replayCursorMs: Math.min(
            previous.replayCursorMs,
            previous.delayedCursorMs,
          ),
        }))
      },
      seekBackFiveSeconds: () => {
        setState((previous) => ({
          ...previous,
          isPaused: true,
          lastEvent: '5초 되감기',
          replayCursorMs: buffer.seekBack(previous.replayCursorMs, 5000),
        }))
      },
      toggleAutoPause: () => {
        setState((previous) => ({
          ...previous,
          autoPauseEnabled: !previous.autoPauseEnabled,
          lastEvent: previous.autoPauseEnabled
            ? '자동 일시정지 끔'
            : '자동 일시정지 켬',
        }))
      },
    },
  }
}

function createSeededBuffer(options: ShadowDemoPlayerOptions) {
  const buffer = new ShadowBuffer({
    delayMs,
    capacityMs,
  })

  for (
    let tsMs = frameIntervalMs;
    tsMs <= seededLiveEdgeMs;
    tsMs += frameIntervalMs
  ) {
    buffer.appendFrame({
      id: `seed-${tsMs}`,
      tsMs,
      durationMs: frameIntervalMs,
    })
  }

  const markerWindow = createMarkerWindow(options)

  buffer.setMarkers([
    {
      id: 'segment-start',
      tsMs: markerWindow.segmentStartMs,
      label: '세그먼트 시작',
    },
    {
      id: 'segment-end',
      tsMs: markerWindow.segmentEndMs,
      label: '세그먼트 종료',
      autoPause: true,
    },
  ])

  return {
    buffer,
    markerWindow,
  }
}

function createInitialState(
  buffer: ShadowBuffer,
  markerWindow: { segmentStartMs: number; segmentEndMs: number },
): ShadowDemoPlayerState {
  const snapshot = buffer.getSnapshot()

  return {
    autoPauseEnabled: true,
    analysisMode: getAnalysisMode(
      snapshot.delayedCursorMs,
      markerWindow.segmentStartMs,
      markerWindow.segmentEndMs,
    ),
    bufferStartMs: snapshot.bufferStartMs,
    delayedCursorMs: snapshot.delayedCursorMs,
    isPaused: false,
    isUnderrun: snapshot.isUnderrun,
    lastEvent: '4초 Shadow buffer 준비 완료',
    liveEdgeMs: snapshot.liveEdgeMs,
    liveFrameOrigin: null,
    liveFrameRef: null,
    markerWindow,
    markers: buildVisibleMarkers(buffer, snapshot),
    mode: 'demo',
    replayCursorMs: snapshot.delayedCursorMs,
    replayFrameOrigin: null,
    replayFrameRef: null,
  }
}

function createMarkerWindow(options: ShadowDemoPlayerOptions) {
  const rawDurationMs = options.segmentEndMs - options.segmentStartMs
  const segmentDurationMs = Math.min(Math.max(rawDurationMs, 2500), 6500)
  const segmentEndMs = seededLiveEdgeMs - 1000
  const segmentStartMs = Math.max(1000, segmentEndMs - segmentDurationMs)

  return {
    segmentStartMs,
    segmentEndMs,
  }
}

export const shadowDemoDefaults = {
  capacityMs,
  delayMs,
}
