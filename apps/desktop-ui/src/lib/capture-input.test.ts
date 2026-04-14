import { describe, expect, it } from 'vitest'

import {
  buildPerceptionSeed,
  createBrowserFrameSample,
  initialCaptureInputState,
  pushCaptureFrame,
} from './capture-input'

describe('pushCaptureFrame', () => {
  it('keeps a bounded analysis frame window', () => {
    let state = initialCaptureInputState

    for (let index = 0; index < 10; index += 1) {
      state = pushCaptureFrame(
        state,
        createBrowserFrameSample({
          frameRef: `frame-${index}`,
          height: 540,
          sessionId: 'web-1',
          tsMs: index * 1_000,
          width: 960,
        }),
      )
    }

    expect(state.frameWindow).toHaveLength(8)
    expect(state.frameWindow[0]?.imageRef).toBe('frame-2')
    expect(state.shadowStatus).toBe('ready')
  })
})

describe('buildPerceptionSeed', () => {
  it('returns keyframes and time bounds for the next perception stage', () => {
    const state = pushCaptureFrame(
      pushCaptureFrame(
        initialCaptureInputState,
        createBrowserFrameSample({
          frameRef: 'frame-a',
          height: 540,
          sessionId: 'web-2',
          tsMs: 1_000,
          width: 960,
        }),
      ),
      createBrowserFrameSample({
        frameRef: 'frame-b',
        height: 540,
        sessionId: 'web-2',
        tsMs: 2_000,
        width: 960,
      }),
    )

    expect(buildPerceptionSeed(state)).toEqual({
      sessionId: 'web-2',
      tStartMs: 1_000,
      tEndMs: 2_000,
      keyframes: ['frame-a', 'frame-b'],
    })
  })
})
