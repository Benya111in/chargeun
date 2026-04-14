import type { CaptureFrameSample } from '@ansimtrack/shared-types'

import type {
  ShadowBuffer,
  ShadowFrame,
  ShadowMarker,
} from '@ansimtrack/shadow-buffer'

export type ShadowFramePayload = {
  height: number
  imageRef: string
  origin: CaptureFrameSample['origin']
  width: number
}

export type VisibleMarker = ShadowMarker & {
  positionPct: number
}

export function buildVisibleMarkers<TPayload>(
  buffer: ShadowBuffer<TPayload>,
  snapshot: {
    bufferStartMs: number
    liveEdgeMs: number
  },
) {
  const rangeMs = Math.max(1, snapshot.liveEdgeMs - snapshot.bufferStartMs)

  return buffer.getMarkers().map((marker) => ({
    ...marker,
    positionPct: clampPercent(
      ((marker.tsMs - snapshot.bufferStartMs) / rangeMs) * 100,
    ),
  }))
}

export function getAnalysisMode(
  replayCursorMs: number,
  segmentStartMs: number,
  segmentEndMs: number,
): 'baseline' | 'burst' {
  return replayCursorMs >= segmentStartMs - 1000 &&
    replayCursorMs <= segmentEndMs + 500
    ? 'burst'
    : 'baseline'
}

export function estimateFrameDurationMs(input: {
  fallbackMs: number
  previousTsMs: number | null
  tsMs: number
}) {
  if (input.previousTsMs === null) {
    return input.fallbackMs
  }

  return Math.max(125, Math.min(2000, input.tsMs - input.previousTsMs))
}

export function pickFrameAtOrBefore<TPayload>(
  frames: Array<ShadowFrame<TPayload>>,
  cursorMs: number,
) {
  if (frames.length === 0) {
    return null
  }

  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index]

    if (frame.tsMs <= cursorMs) {
      return frame
    }
  }

  return frames[0] ?? null
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value))
}
