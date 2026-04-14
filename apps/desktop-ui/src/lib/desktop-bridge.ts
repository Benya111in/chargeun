import { invoke, isTauri } from '@tauri-apps/api/core'

import {
  DEFAULT_CAPTURE_BOOTSTRAP_STATE,
  type CaptureBootstrapState,
  type NativeCaptureSessionRecord,
  type NativeCaptureSourceRecord,
} from './capture-contract'

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
