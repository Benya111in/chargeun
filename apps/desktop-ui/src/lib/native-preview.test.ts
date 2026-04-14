import { describe, expect, it } from 'vitest'

import type { MacCaptureEvent } from '@ansimtrack/shared-types'

import {
  initialNativePreviewState,
  reduceNativePreviewState,
} from './native-preview'

describe('reduceNativePreviewState', () => {
  it('tracks session start and native frames', () => {
    const started = reduceNativePreviewState(initialNativePreviewState, {
      type: 'session-started',
      sessionId: 'native-1',
      width: 1280,
      height: 720,
      hasAudio: true,
    })

    const next = reduceNativePreviewState(started, {
      type: 'frame',
      sessionId: 'native-1',
      tsMs: 2_000,
      width: 1280,
      height: 720,
      pixelBufferRef: 'data:image/jpeg;base64,abc',
    })

    expect(next.isLive).toBe(true)
    expect(next.audioState).toBe('requested')
    expect(next.frameCount).toBe(1)
    expect(next.lastFrame?.src).toContain('data:image/jpeg')
  })

  it('switches audio state to fallback when native audio is unavailable', () => {
    const started = reduceNativePreviewState(initialNativePreviewState, {
      type: 'session-started',
      sessionId: 'native-2',
      width: 1920,
      height: 1080,
      hasAudio: true,
    })

    const next = reduceNativePreviewState(started, {
      type: 'error',
      sessionId: 'native-2',
      code: 'audio-preview-fallback',
      message: 'audio bridge unavailable',
    })

    expect(next.audioState).toBe('fallback')
    expect(next.lastError).toContain('audio')
  })

  it('ignores frames from another session after one is active', () => {
    const started = reduceNativePreviewState(initialNativePreviewState, {
      type: 'session-started',
      sessionId: 'native-3',
      width: 1280,
      height: 720,
      hasAudio: false,
    })

    const next = reduceNativePreviewState(started, {
      type: 'frame',
      sessionId: 'native-4',
      tsMs: 1_000,
      width: 640,
      height: 360,
      pixelBufferRef: 'data:image/jpeg;base64,other',
    } satisfies MacCaptureEvent)

    expect(next.frameCount).toBe(0)
    expect(next.lastFrame).toBeNull()
  })
})
