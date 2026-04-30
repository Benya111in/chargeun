import { describe, expect, it } from 'vitest'

import { ShadowBuffer } from './index'

describe('ShadowBuffer', () => {
  it('keeps a delayed cursor and prunes old frames by capacity', () => {
    const buffer = new ShadowBuffer({ delayMs: 4000, capacityMs: 8000 })

    for (let tsMs = 1000; tsMs <= 12000; tsMs += 1000) {
      buffer.appendFrame({
        id: `f-${tsMs}`,
        tsMs,
        durationMs: 1000,
      })
    }

    const snapshot = buffer.getSnapshot()

    expect(snapshot.liveEdgeMs).toBe(12000)
    expect(snapshot.bufferStartMs).toBe(4000)
    expect(snapshot.delayedCursorMs).toBe(8000)
    expect(snapshot.isUnderrun).toBe(false)
  })

  it('clamps seek-back to the buffered range', () => {
    const buffer = new ShadowBuffer({ delayMs: 4000, capacityMs: 8000 })

    for (let tsMs = 1000; tsMs <= 10000; tsMs += 1000) {
      buffer.appendFrame({
        id: `f-${tsMs}`,
        tsMs,
        durationMs: 1000,
      })
    }

    expect(buffer.seekBack(7000, 5000)).toBe(2000)
  })

  it('finds segment marker crossings and replays from the selected segment', () => {
    const buffer = new ShadowBuffer({ delayMs: 4000, capacityMs: 8000 })

    buffer.setMarkers([
      { id: 'segment-start', tsMs: 5000, label: 'Segment Start' },
      { id: 'segment-end', tsMs: 8500, label: 'Segment End', autoPause: true },
    ])

    expect(buffer.getMarkerCrossing(4000, 5200)?.id).toBe('segment-start')
    expect(buffer.replaySegment('segment-start')).toBe(5000)
  })

  it('keeps the live edge stable when frames arrive out of order', () => {
    const buffer = new ShadowBuffer({ delayMs: 4000, capacityMs: 8000 })

    buffer.appendFrame({ id: 'late', tsMs: 10000, durationMs: 1000 })
    buffer.appendFrame({ id: 'early', tsMs: 5000, durationMs: 1000 })

    expect(buffer.getFrames().map((frame) => frame.id)).toEqual([
      'early',
      'late',
    ])
    expect(buffer.getLiveEdgeMs()).toBe(10000)
    expect(buffer.getBufferStartMs()).toBe(5000)
  })
})
