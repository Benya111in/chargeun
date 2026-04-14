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

  it('stores metadata when a native audio event arrives', () => {
    const started = reduceNativePreviewState(initialNativePreviewState, {
      type: 'session-started',
      sessionId: 'native-voice',
      width: 1280,
      height: 720,
      hasAudio: true,
    })

    const next = reduceNativePreviewState(started, {
      type: 'audio',
      sessionId: 'native-voice',
      tsMs: 3_400,
      pcmRef: 'native-audio://native-voice/3400',
      sampleRate: 48_000,
      channels: 2,
    })

    expect(next.audioState).toBe('live')
    expect(next.lastAudioAtMs).toBe(3_400)
    expect(next.lastAudioSampleRate).toBe(48_000)
    expect(next.lastAudioChannels).toBe(2)
    expect(next.lastAudioPcmRef).toBe('native-audio://native-voice/3400')
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
