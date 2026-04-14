import type {
  CaptureFrameSample,
  CaptureSession,
  PerceptionPacket,
} from '@ansimtrack/shared-types'

import type { NativePreviewFrame } from './native-preview'

export type CaptureInputRuntime = 'browser' | 'native'
export type CaptureInputShadowStatus = 'idle' | 'preview-only' | 'ready'

export type CaptureInputState = {
  frameWindow: CaptureFrameSample[]
  latestFrame: CaptureFrameSample | null
  lastUpdatedAtMs: number | null
  runtime: CaptureInputRuntime | null
  sessionId: string | null
  shadowStatus: CaptureInputShadowStatus
}

const maxFrameWindowSize = 8

export const initialCaptureInputState: CaptureInputState = {
  frameWindow: [],
  latestFrame: null,
  lastUpdatedAtMs: null,
  runtime: null,
  sessionId: null,
  shadowStatus: 'idle',
}

export function createBrowserFrameSample(input: {
  frameRef: string
  height: number
  sessionId: string
  tsMs: number
  width: number
}): CaptureFrameSample {
  return {
    sessionId: input.sessionId,
    tsMs: input.tsMs,
    width: input.width,
    height: input.height,
    imageRef: input.frameRef,
    origin: 'browser',
  }
}

export function createNativeFrameSample(
  frame: NativePreviewFrame,
): CaptureFrameSample {
  return {
    sessionId: frame.sessionId,
    tsMs: frame.tsMs,
    width: frame.width,
    height: frame.height,
    imageRef: frame.src,
    origin: 'native',
  }
}

export function pushCaptureFrame(
  state: CaptureInputState,
  frame: CaptureFrameSample,
): CaptureInputState {
  const nextWindow = [...state.frameWindow, frame].slice(-maxFrameWindowSize)

  return {
    frameWindow: nextWindow,
    latestFrame: frame,
    lastUpdatedAtMs: frame.tsMs,
    runtime: frame.origin,
    sessionId: frame.sessionId,
    shadowStatus: nextWindow.length >= 2 ? 'ready' : 'preview-only',
  }
}

export function syncCaptureInputWithSession(
  session: CaptureSession | null,
): CaptureInputState {
  if (!session) {
    return initialCaptureInputState
  }

  return {
    ...initialCaptureInputState,
    runtime: session.platform === 'web' ? 'browser' : 'native',
    sessionId: session.id,
    shadowStatus: 'preview-only',
  }
}

export function syncCaptureInputWithNativeFrame(
  state: CaptureInputState,
  nativeFrame: NativePreviewFrame | null,
): CaptureInputState {
  if (!nativeFrame) {
    return state
  }

  return pushCaptureFrame(state, createNativeFrameSample(nativeFrame))
}

export function buildPerceptionSeed(
  state: CaptureInputState,
): Pick<
  PerceptionPacket,
  'keyframes' | 'sessionId' | 'tEndMs' | 'tStartMs'
> | null {
  if (!state.sessionId || state.frameWindow.length === 0) {
    return null
  }

  return {
    sessionId: state.sessionId,
    tStartMs: state.frameWindow[0]?.tsMs ?? state.lastUpdatedAtMs ?? 0,
    tEndMs:
      state.frameWindow[state.frameWindow.length - 1]?.tsMs ??
      state.lastUpdatedAtMs ??
      0,
    keyframes: state.frameWindow.map((frame) => frame.imageRef),
  }
}
