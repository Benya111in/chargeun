import {
  captureEvents,
  macCaptureEventSchema,
  type CaptureSession,
  type MacCaptureEvent,
  type Segment,
  type SegmentExplanation,
} from '@ansimtrack/shared-types'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import {
  DEFAULT_CAPTURE_BOOTSTRAP_STATE,
  type CaptureBootstrapState,
  type NativeCaptureSessionRecord,
  type NativeCaptureSourceRecord,
} from './capture-contract'
import {
  defaultAppRuntimeState,
  mergeRuntimeState,
  slugifyArtifactName,
  type AppRuntimeState,
} from './demo-runtime'

export type ClearLocalRuntimeResult = {
  cleared: boolean
  path: string
  status: 'browser-preview' | 'cleared' | 'error' | 'noop'
}

export type ExportDemoArtifactResult = {
  artifactName: string
  jsonPath: string
  screenshotPath?: string | null
  status: 'browser-download' | 'exported'
}

export type PersistLocalRecordResult = {
  path: string
  status: 'browser-preview' | 'saved'
}

export type SessionLogEntryPayload = {
  endedAt?: number
  selectedSourceId?: string | null
  selectedTrack?: string | null
  session: CaptureSession
  voiceEnabled?: boolean
}

export type LiveAnalysisPacketSummary = {
  asrText: string
  keyframeCount: number
  objectHintLabels: string[]
  ocrTokens: string[]
  sessionId: string
  tEndMs: number
  tStartMs: number
  uiElementLabels: string[]
}

export type LiveAnalysisPlanSummary = {
  fps: number
  holdMs: number
  mode: string
  reason: string
}

export type LiveAnalysisSnapshotInput = {
  createdAt: number
  explanation: SegmentExplanation
  packetSummary: LiveAnalysisPacketSummary
  plan: LiveAnalysisPlanSummary
  segment: Segment
  session: SessionLogEntryPayload
  sourceId?: string | null
}

const runtimeStateStorageKey = 'ansimtrack.runtime-state'
const liveAnalysisSnapshotStorageKey = 'ansimtrack.live-analysis.latest'
const sessionLogStorageKey = 'ansimtrack.session-log'

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

export async function loadAppRuntimeState(): Promise<AppRuntimeState> {
  if (!isTauri()) {
    return loadRuntimeStateFromBrowser()
  }

  try {
    return mergeRuntimeState(
      await invoke<AppRuntimeState>('load_app_runtime_state'),
    )
  } catch {
    return defaultAppRuntimeState
  }
}

export async function saveAppRuntimeState(
  state: AppRuntimeState,
): Promise<AppRuntimeState> {
  if (!isTauri()) {
    return saveRuntimeStateToBrowser(state)
  }

  try {
    return mergeRuntimeState(
      await invoke<AppRuntimeState>('save_app_runtime_state', {
        input: {
          state,
        },
      }),
    )
  } catch {
    return state
  }
}

export async function exportDemoArtifact(input: {
  artifactName: string
  payload: Record<string, unknown>
  screenshotDataUrl?: string
}): Promise<ExportDemoArtifactResult> {
  if (!isTauri()) {
    return exportDemoArtifactInBrowser(input)
  }

  return invoke<ExportDemoArtifactResult>('export_demo_artifact', { input })
}

export async function appendSessionLogEntry(
  input: SessionLogEntryPayload,
): Promise<PersistLocalRecordResult> {
  if (!isTauri()) {
    return appendSessionLogEntryInBrowser(input)
  }

  return invoke<PersistLocalRecordResult>('append_session_log_entry', { input })
}

export async function saveLiveAnalysisSnapshot(
  input: LiveAnalysisSnapshotInput,
): Promise<PersistLocalRecordResult> {
  if (!isTauri()) {
    return saveLiveAnalysisSnapshotInBrowser(input)
  }

  return invoke<PersistLocalRecordResult>('save_live_analysis_snapshot', {
    input,
  })
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

function loadRuntimeStateFromBrowser() {
  if (typeof window === 'undefined') {
    return defaultAppRuntimeState
  }

  try {
    const raw = window.localStorage.getItem(runtimeStateStorageKey)
    if (!raw) {
      return defaultAppRuntimeState
    }

    return mergeRuntimeState(JSON.parse(raw) as Partial<AppRuntimeState>)
  } catch {
    return defaultAppRuntimeState
  }
}

function saveRuntimeStateToBrowser(state: AppRuntimeState) {
  if (typeof window === 'undefined') {
    return state
  }

  try {
    window.localStorage.setItem(runtimeStateStorageKey, JSON.stringify(state))
  } catch {
    // Ignore storage errors in browser preview mode.
  }

  return state
}

function appendSessionLogEntryInBrowser(
  input: SessionLogEntryPayload,
): PersistLocalRecordResult {
  if (typeof window !== 'undefined') {
    try {
      const current = window.localStorage.getItem(sessionLogStorageKey)
      const parsed = current
        ? (JSON.parse(current) as SessionLogEntryPayload[])
        : []
      const next = [...parsed, input].slice(-25)
      window.localStorage.setItem(sessionLogStorageKey, JSON.stringify(next))
    } catch {
      // Ignore browser preview storage errors.
    }
  }

  return {
    path: sessionLogStorageKey,
    status: 'browser-preview',
  }
}

function saveLiveAnalysisSnapshotInBrowser(
  input: LiveAnalysisSnapshotInput,
): PersistLocalRecordResult {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        liveAnalysisSnapshotStorageKey,
        JSON.stringify(input),
      )
    } catch {
      // Ignore browser preview storage errors.
    }
  }

  return {
    path: liveAnalysisSnapshotStorageKey,
    status: 'browser-preview',
  }
}

async function exportDemoArtifactInBrowser(input: {
  artifactName: string
  payload: Record<string, unknown>
  screenshotDataUrl?: string
}): Promise<ExportDemoArtifactResult> {
  const slug = slugifyArtifactName(input.artifactName)
  const timestamp = Date.now()
  const jsonFileName = `${slug}-${timestamp}.json`
  const screenshotFileName = `${slug}-${timestamp}.png`

  downloadBlob(
    new Blob([`${JSON.stringify(input.payload, null, 2)}\n`], {
      type: 'application/json',
    }),
    jsonFileName,
  )

  if (input.screenshotDataUrl) {
    downloadDataUrl(input.screenshotDataUrl, screenshotFileName)
  }

  return {
    artifactName: slug,
    jsonPath: jsonFileName,
    screenshotPath: input.screenshotDataUrl ? screenshotFileName : null,
    status: 'browser-download',
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  if (typeof document === 'undefined') {
    return
  }

  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.URL.revokeObjectURL(url)
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  if (typeof document === 'undefined') {
    return
  }

  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  link.click()
}
