import { describe, expect, it } from 'vitest'

import { ShadowBuffer } from '@ansimtrack/shadow-buffer'

import {
  buildVisibleMarkers,
  estimateFrameDurationMs,
  pickFrameAtOrBefore,
} from './shadow-player-utils'

describe('shadow-player-utils', () => {
  it('estimates live frame duration from timestamp deltas', () => {
    expect(
      estimateFrameDurationMs({
        fallbackMs: 1000,
        previousTsMs: null,
        tsMs: 1000,
      }),
    ).toBe(1000)

    expect(
      estimateFrameDurationMs({
        fallbackMs: 1000,
        previousTsMs: 1000,
        tsMs: 1375,
      }),
    ).toBe(375)
  })

  it('selects the latest buffered frame at or before the replay cursor', () => {
    const frames = [
      {
        durationMs: 1000,
        id: 'frame-1',
        payload: { imageRef: 'a' },
        tsMs: 1000,
      },
      {
        durationMs: 1000,
        id: 'frame-2',
        payload: { imageRef: 'b' },
        tsMs: 2000,
      },
      {
        durationMs: 1000,
        id: 'frame-3',
        payload: { imageRef: 'c' },
        tsMs: 3000,
      },
    ]

    expect(pickFrameAtOrBefore(frames, 2500)?.payload?.imageRef).toBe('b')
    expect(pickFrameAtOrBefore(frames, 500)?.payload?.imageRef).toBe('a')
  })

  it('clamps marker positions to the buffered timeline', () => {
    const buffer = new ShadowBuffer({
      capacityMs: 8000,
      delayMs: 4000,
    })

    buffer.appendFrame({ durationMs: 1000, id: 'frame-1', tsMs: 1000 })
    buffer.appendFrame({ durationMs: 1000, id: 'frame-2', tsMs: 5000 })
    buffer.setMarkers([
      { id: 'before', label: 'before', tsMs: 500 },
      { id: 'inside', label: 'inside', tsMs: 3000 },
      { id: 'after', label: 'after', tsMs: 7000 },
    ])

    const markers = buildVisibleMarkers(buffer, {
      bufferStartMs: 1000,
      liveEdgeMs: 5000,
    })

    expect(markers.find((marker) => marker.id === 'before')?.positionPct).toBe(
      0,
    )
    expect(markers.find((marker) => marker.id === 'inside')?.positionPct).toBe(
      50,
    )
    expect(markers.find((marker) => marker.id === 'after')?.positionPct).toBe(
      100,
    )
  })
})
