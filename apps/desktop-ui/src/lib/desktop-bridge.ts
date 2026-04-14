import {
  captureEvents,
  macCaptureEventSchema,
  type MacCaptureEvent,
} from '@ansimtrack/shared-types'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import {
  DEFAULT_CAPTURE_BOOTSTRAP_STATE,
  type CaptureBootstrapState,
  type NativeCaptureSessionRecord,
  type NativeCaptureSourceRecord,
} from './capture-contract'

export type ClearLocalRuntimeResult = {
  cleared: boolean
  path: string
  status: 'browser-preview' | 'cleared' | 'error' | 'noop'
}

export async function getCaptureBootstrapState(): Promise<CaptureBootstrapState> {
  if (!isTauri()) {
    return DEFAULT_CAPTURE_BOOTSTRAP_STATE
  }

  try {
    return await invoke<CaptureBootstrapState>('get_bootstrap_state')
  } catch {
    return DEFAULT_CAPTURE_BOOTSTRAP_STATE
  }
}

export async function listNativeCaptureSources(): Promise<
  NativeCaptureSourceRecord[]
> {
  if (!isTauri()) {
    return []
  }

  try {
    return await invoke<NativeCaptureSourceRecord[]>(
      'list_native_capture_sources',
    )
  } catch {
    return []
  }
}

export async function startNativeCapture(input: {
  sourceId: string
  includeAudio: boolean
}): Promise<NativeCaptureSessionRecord> {
  return invoke<NativeCaptureSessionRecord>('start_native_capture', { input })
}

export async function stopNativeCapture(input: {
  sessionId: string
}): Promise<{ stopped: boolean }> {
  return invoke<{ stopped: boolean }>('stop_native_capture', { input })
}

export async function clearLocalRuntimeFiles(): Promise<ClearLocalRuntimeResult> {
  if (!isTauri()) {
    return {
      cleared: false,
      path: '.slowlearner',
      status: 'browser-preview',
    }
  }

  try {
    return await invoke<ClearLocalRuntimeResult>('clear_local_runtime')
  } catch {
    return {
      cleared: false,
      path: '.slowlearner',
      status: 'error',
    }
  }
}

export async function listenToNativeCaptureEvents(
  onEvent: (event: MacCaptureEvent) => void,
) {
  if (!isTauri()) {
    return () => {}
  }

  const eventNames = [
    captureEvents.sessionStarted,
    captureEvents.frame,
    captureEvents.audio,
    captureEvents.sessionStopped,
    captureEvents.systemError,
  ] as const

  const unlistenEntries = await Promise.all(
    eventNames.map((eventName) =>
      listen<unknown>(eventName, (event) => {
        const parsed = macCaptureEventSchema.safeParse(event.payload)

        if (parsed.success) {
          onEvent(parsed.data)
        }
      }),
    ),
  )

  return () => {
    for (const unlisten of unlistenEntries) {
      void unlisten()
    }
  }
}
