export type QaFixtureRecord = {
  clipId: string
  description: string
  expectedRuleIds: string[]
  hasAudio: boolean
  hazard: string
  phase: string
}

export type ManualReviewStatus = 'blocked' | 'fail' | 'pass' | 'pending'

export type ManualReviewRunRecord = {
  clipId: string
  date: string
  notes: string
  operator: string
  path: string
  status: ManualReviewStatus
}

export type RehearsalResult = 'blocked' | 'fail' | 'in_progress' | 'pass'

export type RehearsalRunRecord = {
  backupReady: boolean
  date: string
  evidenceAndCacheWorks: boolean
  fallbackWorks: boolean
  fullMonitorCaptureWorks: boolean
  lowConfidenceFallbackWorks: boolean
  noAudioFallbackWorks: boolean
  notes: string
  operator: string
  path: string
  permissionsRetryWorks: boolean
  result: RehearsalResult
  shadowPlayerPrimary: boolean
  startupUnder10s: boolean
  voiceOffWorks: boolean
  windowCaptureWorks: boolean
}

export type QaReviewState = {
  fixtures: QaFixtureRecord[]
  manualReviewRuns: ManualReviewRunRecord[]
  rehearsalRuns: RehearsalRunRecord[]
}

export const defaultQaReviewState: QaReviewState = {
  fixtures: [],
  manualReviewRuns: [],
  rehearsalRuns: [],
}

export function getLatestManualReviewRun(
  runs: ManualReviewRunRecord[],
  clipId: string,
) {
  return (
    runs.filter((run) => run.clipId === clipId).sort(compareDateDesc)[0] ?? null
  )
}

export function getManualReviewCoverage(state: QaReviewState) {
  const passedClipIds = new Set(
    state.manualReviewRuns
      .filter((run) => run.status === 'pass')
      .map((run) => run.clipId),
  )

  return {
    passed: passedClipIds.size,
    total: state.fixtures.length,
  }
}

export function getRehearsalPassCount(state: QaReviewState) {
  return state.rehearsalRuns.filter((run) => run.result === 'pass').length
}

export function getLatestRehearsalRun(state: QaReviewState) {
  return state.rehearsalRuns.sort(compareDateDesc)[0] ?? null
}

function compareDateDesc<T extends { date: string }>(left: T, right: T) {
  return right.date.localeCompare(left.date)
}
