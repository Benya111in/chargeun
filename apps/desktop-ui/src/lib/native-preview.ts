import type { MacCaptureEvent } from '@ansimtrack/shared-types'

export type NativePreviewFrame = {
  sessionId: string
  tsMs: number
  width: number
  height: number
  src: string
}

export type NativePreviewAudioState = 'idle' | 'requested' | 'live' | 'fallback'

export type NativePreviewState = {
  audioState: NativePreviewAudioState
  frameCount: number
  isLive: boolean
  lastAudioAtMs: number | null
  lastAudioChannels: number | null
  lastAudioPcmRef: string | null
  lastAudioSampleRate: number | null
  lastError: string | null
  lastFrame: NativePreviewFrame | null
  lastFrameAtMs: number | null
  sessionId: string | null
}

export const initialNativePreviewState: NativePreviewState = {
  audioState: 'idle',
  frameCount: 0,
  isLive: false,
  lastAudioAtMs: null,
  lastAudioChannels: null,
  lastAudioPcmRef: null,
  lastAudioSampleRate: null,
  lastError: null,
  lastFrame: null,
  lastFrameAtMs: null,
  sessionId: null,
}

export function reduceNativePreviewState(
  state: NativePreviewState,
  event: MacCaptureEvent,
): NativePreviewState {
  switch (event.type) {
    case 'session-started':
      return {
        audioState: event.hasAudio ? 'requested' : 'idle',
        frameCount: 0,
        isLive: true,
        lastAudioAtMs: null,
        lastAudioChannels: null,
        lastAudioPcmRef: null,
        lastAudioSampleRate: null,
        lastError: null,
        lastFrame: null,
        lastFrameAtMs: null,
        sessionId: event.sessionId,
      }
    case 'frame':
      if (state.sessionId && state.sessionId !== event.sessionId) {
        return state
      }

      return {
        ...state,
        frameCount: state.frameCount + 1,
        isLive: true,
        lastError: null,
        lastFrame: {
          sessionId: event.sessionId,
          tsMs: event.tsMs,
          width: event.width,
          height: event.height,
          src: event.pixelBufferRef,
        },
        lastFrameAtMs: event.tsMs,
        sessionId: event.sessionId,
      }
    case 'audio':
      if (state.sessionId && state.sessionId !== event.sessionId) {
        return state
      }

      return {
        ...state,
        audioState: 'live',
        isLive: true,
        lastAudioAtMs: event.tsMs,
        lastAudioChannels: event.channels,
        lastAudioPcmRef: event.pcmRef,
        lastAudioSampleRate: event.sampleRate,
        lastError: null,
        sessionId: event.sessionId,
      }
    case 'error':
      if (state.sessionId && state.sessionId !== event.sessionId) {
        return state
      }

      return {
        ...state,
        audioState:
          event.code === 'audio-preview-fallback'
            ? 'fallback'
            : state.audioState,
        lastError: event.message,
        sessionId: event.sessionId,
      }
    case 'session-stopped':
      if (state.sessionId && state.sessionId !== event.sessionId) {
        return state
      }

      return initialNativePreviewState
  }
}
