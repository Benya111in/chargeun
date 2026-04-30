import {
  captureEvents,
  macCaptureEventSchema,
  type MacCaptureEvent,
} from '@ansimtrack/shared-types'
import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import {
  DEFAULT_CAPTURE_BOOTSTRAP_STATE,
  type CaptureBootstrapState,
  type NativeCaptureSessionRecord,
  type NativeCaptureSourceRecord,
} from './capture-contract'
import annotatedSegmentsSeed from '../../../../data/eval/annotated_segments.json'
import manualReviewRunsSeed from '../../../../data/eval/manual_review_runs.json'
import rehearsalRunsSeed from '../../../../data/eval/rehearsal_runs.json'
import {
  defaultAppRuntimeState,
  mergeRuntimeState,
  slugifyArtifactName,
  type AppRuntimeState,
} from './demo-runtime'
import type {
  LiveAnalysisSnapshotInput,
  SessionLogEntryPayload,
} from './live-analysis-contract'
import type {
  ManualReviewRunRecord,
  QaFixtureRecord,
  QaSourceReference,
  QaReviewState,
  QaSourceClipPlan,
  RehearsalRunRecord,
} from './qa-review'

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

export type ExtractOcrTokensResult = {
  status: 'browser-preview' | 'recognized'
  tokens: string[]
}

export type TranscribeAudioSampleResult = {
  status:
    | 'browser-preview'
    | 'recognized'
    | 'no-match'
    | 'unavailable'
    | 'missing-file'
    | 'error'
  transcript: string
  locale?: string | null
  source: string
  message?: string | null
}

const runtimeStateStorageKey = 'ansimtrack.runtime-state'
const liveAnalysisSnapshotStorageKey = 'ansimtrack.live-analysis.latest'
const sessionLogStorageKey = 'ansimtrack.session-log'
const qaReviewStateStorageKey = 'ansimtrack.qa-review'

export type VoiceRuntimeStatus = {
  nativeTtsAvailable: boolean
  nativeSttAvailable: boolean
  preferredVoiceIdentifier: string | null
  preferredVoiceName: string | null
}

export type SpeakVoiceReplyResult = {
  mode: 'native'
  requestId: number
  started: boolean
}

export type StopVoiceReplyResult = {
  stopped: boolean
}

export type VoiceIntentRecognitionResult = {
  status: 'recognized' | 'timeout' | 'unavailable' | 'error' | 'no-match'
  intent?: string | null
  transcript?: string | null
  source: 'native-stt' | 'browser-stt' | 'text'
  message?: string | null
}

export type VoiceRuntimeEvent = {
  type: 'tts-started' | 'tts-finished' | 'tts-stopped' | 'tts-error'
  mode: 'native'
  requestId: number
  text?: string
  message?: string
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

export async function extractOcrTokens(input: {
  imageRef: string
}): Promise<ExtractOcrTokensResult> {
  if (!isTauri()) {
    return {
      status: 'browser-preview',
      tokens: [],
    }
  }

  try {
    return await invoke<ExtractOcrTokensResult>('extract_ocr_tokens', { input })
  } catch {
    return {
      status: 'browser-preview',
      tokens: [],
    }
  }
}

export async function transcribeAudioSample(input: {
  pcmRef: string
  locale?: string
}): Promise<TranscribeAudioSampleResult> {
  if (!isTauri()) {
    return {
      status: 'browser-preview',
      transcript: '',
      source: 'browser-preview',
    }
  }

  try {
    return await invoke<TranscribeAudioSampleResult>(
      'transcribe_audio_sample',
      {
        input,
      },
    )
  } catch (error) {
    return {
      status: 'error',
      transcript: '',
      source: 'speech',
      message:
        error instanceof Error ? error.message : 'audio transcription failed',
    }
  }
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

export async function loadLastLiveAnalysisSnapshot(): Promise<LiveAnalysisSnapshotInput | null> {
  if (!isTauri()) {
    return loadLiveAnalysisSnapshotFromBrowser()
  }

  try {
    return await invoke<LiveAnalysisSnapshotInput | null>(
      'load_last_live_analysis_snapshot',
    )
  } catch {
    return null
  }
}

export async function getVoiceRuntimeStatus(): Promise<VoiceRuntimeStatus> {
  if (!isTauri()) {
    return {
      nativeSttAvailable: false,
      nativeTtsAvailable: false,
      preferredVoiceIdentifier: null,
      preferredVoiceName: null,
    }
  }

  try {
    return await invoke<VoiceRuntimeStatus>('get_voice_runtime_status')
  } catch {
    return {
      nativeSttAvailable: false,
      nativeTtsAvailable: false,
      preferredVoiceIdentifier: null,
      preferredVoiceName: null,
    }
  }
}

export async function speakVoiceReply(input: {
  text: string
}): Promise<SpeakVoiceReplyResult> {
  return invoke<SpeakVoiceReplyResult>('speak_voice_reply', { input })
}

export async function stopVoiceReply(): Promise<StopVoiceReplyResult> {
  return invoke<StopVoiceReplyResult>('stop_voice_reply')
}

export async function listenForVoiceIntent(input?: {
  timeoutMs?: number
}): Promise<VoiceIntentRecognitionResult> {
  return invoke<VoiceIntentRecognitionResult>('listen_for_voice_intent', {
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

export async function listenToVoiceRuntimeEvents(
  onEvent: (event: VoiceRuntimeEvent) => void,
) {
  if (!isTauri()) {
    return () => {}
  }

  const unlisten = await listen<unknown>(captureEvents.voiceReply, (event) => {
    const payload = event.payload as VoiceRuntimeEvent
    if (payload?.type && payload?.mode === 'native') {
      onEvent(payload)
    }
  })

  return () => {
    void unlisten()
  }
}

export async function loadQaReviewState(): Promise<QaReviewState> {
  if (!isTauri()) {
    return loadQaReviewStateFromBrowser()
  }

  try {
    return await invoke<QaReviewState>('load_qa_review_state')
  } catch {
    return {
      fixtures: [],
      manualReviewRuns: [],
      rehearsalRuns: [],
    }
  }
}

export async function appendManualReviewRun(
  input: ManualReviewRunRecord,
): Promise<QaReviewState> {
  if (!isTauri()) {
    return appendManualReviewRunInBrowser(input)
  }

  return invoke<QaReviewState>('append_manual_review_run', { input })
}

export async function appendRehearsalRun(
  input: RehearsalRunRecord,
): Promise<QaReviewState> {
  if (!isTauri()) {
    return appendRehearsalRunInBrowser(input)
  }

  return invoke<QaReviewState>('append_rehearsal_run', { input })
}

export function resolveLocalMediaSrc(path: string) {
  if (!path) {
    return null
  }

  if (/^(https?:|data:|blob:|asset:)/.test(path)) {
    return path
  }

  return isTauri() ? convertFileSrc(path) : null
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

function loadLiveAnalysisSnapshotFromBrowser() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(liveAnalysisSnapshotStorageKey)
    return raw ? (JSON.parse(raw) as LiveAnalysisSnapshotInput) : null
  } catch {
    return null
  }
}

function loadQaReviewStateFromBrowser(): QaReviewState {
  if (typeof window === 'undefined') {
    return buildBrowserQaSeed()
  }

  try {
    const raw = window.localStorage.getItem(qaReviewStateStorageKey)
    if (!raw) {
      const seed = buildBrowserQaSeed()
      saveQaReviewStateToBrowser(seed)
      return seed
    }

    return JSON.parse(raw) as QaReviewState
  } catch {
    return buildBrowserQaSeed()
  }
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

function appendManualReviewRunInBrowser(
  input: ManualReviewRunRecord,
): QaReviewState {
  const current = loadQaReviewStateFromBrowser()
  const next = {
    ...current,
    manualReviewRuns: [...current.manualReviewRuns, input],
  }
  saveQaReviewStateToBrowser(next)
  return next
}

function buildBrowserQaSeed(): QaReviewState {
  return {
    fixtures: annotatedSegmentsSeed.map((fixture) => {
      const sourceClipPlan =
        (fixture.sourceClipPlan as QaSourceClipPlan | undefined) ?? null
      const outputRelativePath = sourceClipPlan?.outputRelativePath ?? null
      return {
        clipId: fixture.clipId,
        description: fixture.description,
        expectedRuleIds: fixture.expectedRuleIds,
        hasAudio: fixture.hasAudio,
        hazard: fixture.hazard,
        localClipPath: outputRelativePath,
        phase: fixture.phase,
        sourceClipPlan,
        sourceReference:
          (fixture.sourceReference as QaSourceReference | undefined) ?? null,
      } satisfies QaFixtureRecord
    }),
    manualReviewRuns: manualReviewRunsSeed as ManualReviewRunRecord[],
    rehearsalRuns: rehearsalRunsSeed as RehearsalRunRecord[],
  }
}

function appendRehearsalRunInBrowser(input: RehearsalRunRecord): QaReviewState {
  const current = loadQaReviewStateFromBrowser()
  const next = {
    ...current,
    rehearsalRuns: [...current.rehearsalRuns, input],
  }
  saveQaReviewStateToBrowser(next)
  return next
}

function saveQaReviewStateToBrowser(state: QaReviewState) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(qaReviewStateStorageKey, JSON.stringify(state))
  } catch {
    // Ignore preview-mode storage failures.
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
