import type { CaptureSession } from '@ansimtrack/shared-types'

export type DemoMode = 'backup-replay' | 'live-priority'

export type PrivacyPrefsState = {
  captureConsent: boolean
  clearOnStop: boolean
  retainCapturedMedia: boolean
}

export type PersistedSessionMeta = Pick<
  CaptureSession,
  'displayName' | 'hasAudio' | 'id' | 'platform' | 'sourceType' | 'startedAt'
>

export type AppRuntimeState = {
  demoMode: DemoMode
  lastSession: PersistedSessionMeta | null
  panicMode: boolean
  privacyPrefs: PrivacyPrefsState
  scenarioId: string
  selectedSourceId: string | null
  selectedTrack: string
  showEvidence: boolean
  updatedAt: number
}

export const defaultPrivacyPrefs: PrivacyPrefsState = {
  captureConsent: false,
  clearOnStop: true,
  retainCapturedMedia: false,
}

export const defaultAppRuntimeState: AppRuntimeState = {
  demoMode: 'live-priority',
  lastSession: null,
  panicMode: false,
  privacyPrefs: defaultPrivacyPrefs,
  scenarioId: 'grounded-fire',
  selectedSourceId: null,
  selectedTrack: 'action',
  showEvidence: true,
  updatedAt: 0,
}

export function buildPersistedSessionMeta(
  session: CaptureSession | null | undefined,
): PersistedSessionMeta | null {
  if (!session) {
    return null
  }

  return {
    displayName: session.displayName,
    hasAudio: session.hasAudio,
    id: session.id,
    platform: session.platform,
    sourceType: session.sourceType,
    startedAt: session.startedAt,
  }
}

export function mergeRuntimeState(
  stored: Partial<AppRuntimeState> | null | undefined,
): AppRuntimeState {
  return {
    ...defaultAppRuntimeState,
    ...stored,
    privacyPrefs: {
      ...defaultPrivacyPrefs,
      ...(stored?.privacyPrefs ?? {}),
    },
    lastSession: stored?.lastSession ?? null,
  }
}

export function slugifyArtifactName(input: string) {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, '-')
    .replace(/^-+|-+$/g, '')

  return slug.length > 0 ? slug : 'ansimtrack-demo'
}
