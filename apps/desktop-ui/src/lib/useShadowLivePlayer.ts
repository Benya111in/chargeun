import { useEffect, useMemo, useRef, useState } from 'react'

import type { CaptureFrameSample } from '@ansimtrack/shared-types'

import { ShadowBuffer } from '@ansimtrack/shadow-buffer'

import type { CaptureInputState } from './capture-input'
import {
  buildVisibleMarkers,
  estimateFrameDurationMs,
  getAnalysisMode,
  pickFrameAtOrBefore,
  type ShadowFramePayload,
  type VisibleMarker,
} from './shadow-player-utils'

const capacityMs = 8000
const delayMs = 4000
const fallbackFrameIntervalMs = 1000
const waitingNotice = '실제 live frame을 기다리는 중입니다.'

type ShadowLivePlayerOptions = {
  captureInput: CaptureInputState
  enabled: boolean
  segmentEndMs: number
  segmentStartMs: number
}

type ShadowLivePlayerState = {
  analysisMode: 'baseline' | 'burst'
  autoPauseEnabled: boolean
  bufferStartMs: number
  delayedCursorMs: number
  isPaused: boolean
  isUnderrun: boolean
  lastEvent: string
  liveEdgeMs: number
  liveFrameOrigin: CaptureFrameSample['origin'] | null
  liveFrameRef: string | null
  markerWindow: {
    segmentEndMs: number
    segmentStartMs: number
  }
  markers: VisibleMarker[]
  mode: 'live'
  replayCursorMs: number
  replayFrameOrigin: CaptureFrameSample['origin'] | null
  replayFrameRef: string | null
}

export function useShadowLivePlayer(options: ShadowLivePlayerOptions) {
  const { captureInput, enabled, segmentEndMs, segmentStartMs } = options
  const markerWindow = useMemo(
    () => ({
      segmentEndMs: Math.max(segmentStartMs, segmentEndMs),
      segmentStartMs,
    }),
    [segmentEndMs, segmentStartMs],
  )
  const bufferRef = useRef<ShadowBuffer<ShadowFramePayload> | null>(null)
  const lastAppendedFrameIdRef = useRef<string | null>(null)
  const lastAppendedTsMsRef = useRef<number | null>(null)
  const [state, setState] = useState<ShadowLivePlayerState>(() =>
    createInitialState(markerWindow),
  )

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = null
      lastAppendedFrameIdRef.current = null
      lastAppendedTsMsRef.current = null
      return
    }

    bufferRef.current = new ShadowBuffer<ShadowFramePayload>({
      delayMs,
      capacityMs,
    })
    lastAppendedFrameIdRef.current = null
    lastAppendedTsMsRef.current = null
  }, [enabled, captureInput.sessionId])

  useEffect(() => {
    if (!enabled || !bufferRef.current) {
      return
    }

    bufferRef.current.setMarkers(buildMarkers(markerWindow))
    setState((previous) =>
      syncState({
        buffer: bufferRef.current!,
        lastEvent:
          bufferRef.current!.getLiveEdgeMs() === 0
            ? waitingNotice
            : previous.lastEvent,
        markerWindow,
        previous,
      }),
    )
  }, [enabled, markerWindow])

  useEffect(() => {
    if (
      !enabled ||
      !bufferRef.current ||
      captureInput.frameWindow.length === 0
    ) {
      return
    }

    const buffer = bufferRef.current
    const nextFrames = captureInput.frameWindow.filter(
      (frame) => frame.sessionId === captureInput.sessionId,
    )

    let appended = false

    for (const frame of nextFrames) {
      const frameId = `${frame.sessionId}:${frame.tsMs}`

      if (
        lastAppendedFrameIdRef.current === frameId ||
        (lastAppendedTsMsRef.current !== null &&
          frame.tsMs <= lastAppendedTsMsRef.current)
      ) {
        continue
      }

      buffer.appendFrame({
        durationMs: estimateFrameDurationMs({
          fallbackMs: fallbackFrameIntervalMs,
          previousTsMs: lastAppendedTsMsRef.current,
          tsMs: frame.tsMs,
        }),
        id: frameId,
        payload: {
          height: frame.height,
          imageRef: frame.imageRef,
          origin: frame.origin,
          width: frame.width,
        },
        tsMs: frame.tsMs,
      })
      lastAppendedFrameIdRef.current = frameId
      lastAppendedTsMsRef.current = frame.tsMs
      appended = true
    }

    if (!appended) {
      return
    }

    setState((previous) =>
      syncState({
        buffer,
        lastEvent:
          previous.liveEdgeMs === 0
            ? '실제 live frame이 Shadow buffer로 들어왔습니다.'
            : previous.lastEvent,
        markerWindow,
        previous,
      }),
    )
  }, [captureInput.frameWindow, captureInput.sessionId, enabled, markerWindow])

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
        const buffer = bufferRef.current

        if (!buffer) {
          return
        }

        setState((previous) =>
          syncState({
            buffer,
            lastEvent: '현재 세그먼트 다시 보기',
            markerWindow,
            previous: {
              ...previous,
              isPaused: false,
              replayCursorMs: buffer.replaySegment('segment-start'),
            },
          }),
        )
      },
      resume: () => {
        const buffer = bufferRef.current

        if (!buffer) {
          return
        }

        setState((previous) =>
          syncState({
            buffer,
            lastEvent: '재생 재개',
            markerWindow,
            previous: {
              ...previous,
              isPaused: false,
              replayCursorMs: buffer.getSnapshot().delayedCursorMs,
            },
          }),
        )
      },
      seekBackFiveSeconds: () => {
        const buffer = bufferRef.current

        if (!buffer) {
          return
        }

        setState((previous) =>
          syncState({
            buffer,
            lastEvent: '5초 되감기',
            markerWindow,
            previous: {
              ...previous,
              isPaused: true,
              replayCursorMs: buffer.seekBack(previous.replayCursorMs, 5000),
            },
          }),
        )
      },
      toggleAutoPause: () => {
        const buffer = bufferRef.current

        if (!buffer) {
          return
        }

        setState((previous) =>
          syncState({
            buffer,
            lastEvent: previous.autoPauseEnabled
              ? '자동 일시정지 끔'
              : '자동 일시정지 켬',
            markerWindow,
            previous: {
              ...previous,
              autoPauseEnabled: !previous.autoPauseEnabled,
            },
          }),
        )
      },
    },
  }
}

function buildMarkers(markerWindow: {
  segmentEndMs: number
  segmentStartMs: number
}) {
  return [
    {
      id: 'segment-start',
      label: '세그먼트 시작',
      tsMs: markerWindow.segmentStartMs,
    },
    {
      autoPause: true,
      id: 'segment-end',
      label: '세그먼트 종료',
      tsMs: markerWindow.segmentEndMs,
    },
  ]
}

function createInitialState(markerWindow: {
  segmentEndMs: number
  segmentStartMs: number
}): ShadowLivePlayerState {
  return {
    analysisMode: 'baseline',
    autoPauseEnabled: true,
    bufferStartMs: 0,
    delayedCursorMs: 0,
    isPaused: false,
    isUnderrun: true,
    lastEvent: waitingNotice,
    liveEdgeMs: 0,
    liveFrameOrigin: null,
    liveFrameRef: null,
    markerWindow,
    markers: [],
    mode: 'live',
    replayCursorMs: 0,
    replayFrameOrigin: null,
    replayFrameRef: null,
  }
}

function syncState(input: {
  buffer: ShadowBuffer<ShadowFramePayload>
  lastEvent: string
  markerWindow: {
    segmentEndMs: number
    segmentStartMs: number
  }
  previous: ShadowLivePlayerState
}): ShadowLivePlayerState {
  const { buffer, markerWindow, previous } = input
  const snapshot = buffer.getSnapshot()
  let replayCursorMs = previous.replayCursorMs
  let isPaused = previous.isPaused
  let lastEvent = input.lastEvent

  if (previous.liveEdgeMs === 0 && snapshot.liveEdgeMs > 0) {
    replayCursorMs = snapshot.delayedCursorMs
    lastEvent = snapshot.isUnderrun
      ? '실제 live frame으로 Shadow buffer를 채우는 중입니다.'
      : input.lastEvent
  } else if (!previous.isPaused) {
    const nextCursorMs = Math.min(
      snapshot.delayedCursorMs,
      Math.max(previous.replayCursorMs, snapshot.bufferStartMs),
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
  } else {
    replayCursorMs = buffer.clampToBufferedRange(previous.replayCursorMs)
  }

  const frames = buffer.getFrames()
  const replayFrame = pickFrameAtOrBefore(frames, replayCursorMs)
  const liveFrame = pickFrameAtOrBefore(frames, snapshot.liveEdgeMs)

  return {
    analysisMode: getAnalysisMode(
      replayCursorMs,
      markerWindow.segmentStartMs,
      markerWindow.segmentEndMs,
    ),
    autoPauseEnabled: previous.autoPauseEnabled,
    bufferStartMs: snapshot.bufferStartMs,
    delayedCursorMs: snapshot.delayedCursorMs,
    isPaused,
    isUnderrun: snapshot.isUnderrun,
    lastEvent,
    liveEdgeMs: snapshot.liveEdgeMs,
    liveFrameOrigin: liveFrame?.payload?.origin ?? null,
    liveFrameRef: liveFrame?.payload?.imageRef ?? null,
    markerWindow,
    markers: buildVisibleMarkers(buffer, snapshot),
    mode: 'live' as const,
    replayCursorMs,
    replayFrameOrigin: replayFrame?.payload?.origin ?? null,
    replayFrameRef: replayFrame?.payload?.imageRef ?? null,
  }
}

export const shadowLiveDefaults = {
  capacityMs,
  delayMs,
}
