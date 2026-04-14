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

export type QaQueuedFixture = QaFixtureRecord & {
  latestRun: ManualReviewRunRecord | null
}

export type QaChecklistItem = {
  detail: string
  id: string
  label: string
  status: 'pending' | 'ready'
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
  return state.rehearsalRuns.slice().sort(compareDateDesc)[0] ?? null
}

export function getManualReviewQueue(state: QaReviewState): QaQueuedFixture[] {
  return state.fixtures
    .map((fixture) => ({
      ...fixture,
      latestRun: getLatestManualReviewRun(
        state.manualReviewRuns,
        fixture.clipId,
      ),
    }))
    .sort((left, right) => {
      const statusDiff =
        getManualReviewPriority(left.latestRun) -
        getManualReviewPriority(right.latestRun)

      if (statusDiff !== 0) {
        return statusDiff
      }

      const dateDiff = (right.latestRun?.date ?? '').localeCompare(
        left.latestRun?.date ?? '',
      )

      if (dateDiff !== 0) {
        return dateDiff
      }

      return left.clipId.localeCompare(right.clipId)
    })
}

export function getReleaseChecklistItems(
  state: QaReviewState,
): QaChecklistItem[] {
  const latestRehearsal = getLatestRehearsalRun(state)
  const coverage = getManualReviewCoverage(state)
  const rehearsalPasses = getRehearsalPassCount(state)

  return [
    {
      detail: `${coverage.passed}/${coverage.total} fixtures passed`,
      id: 'manual-review',
      label: '실제 clip walkthrough',
      status:
        coverage.total > 0 && coverage.passed === coverage.total
          ? 'ready'
          : 'pending',
    },
    {
      detail: `${rehearsalPasses}/10 rehearsal passes`,
      id: 'rehearsal-count',
      label: '3분 rehearsal 누적',
      status: rehearsalPasses >= 10 ? 'ready' : 'pending',
    },
    buildRehearsalChecklistItem(
      'startup-under-10s',
      '앱 10초 안 진입',
      latestRehearsal?.startupUnder10s,
      '최근 rehearsal에서 통과',
      '최근 rehearsal에서 아직 미통과',
    ),
    buildRehearsalChecklistItem(
      'permissions-retry',
      '권한 요청/재시도',
      latestRehearsal?.permissionsRetryWorks,
      '최근 rehearsal에서 재시도 확인',
      '권한 재시도 확인 필요',
    ),
    buildRehearsalChecklistItem(
      'monitor-capture',
      '전체 모니터 캡처',
      latestRehearsal?.fullMonitorCaptureWorks,
      '최근 rehearsal에서 통과',
      '전체 모니터 캡처 확인 필요',
    ),
    buildRehearsalChecklistItem(
      'window-capture',
      '특정 창 캡처',
      latestRehearsal?.windowCaptureWorks,
      '최근 rehearsal에서 통과',
      '특정 창 캡처 확인 필요',
    ),
    buildRehearsalChecklistItem(
      'no-audio-fallback',
      '오디오 없는 영상 fallback',
      latestRehearsal?.noAudioFallbackWorks,
      '최근 rehearsal에서 통과',
      '무음 fallback 확인 필요',
    ),
    buildRehearsalChecklistItem(
      'voice-off',
      '음성 실패 시 버튼 대체',
      latestRehearsal?.voiceOffWorks,
      '최근 rehearsal에서 통과',
      'voice off 대체 경로 확인 필요',
    ),
    buildRehearsalChecklistItem(
      'evidence-and-cache',
      '근거 패널 / cache delete',
      latestRehearsal?.evidenceAndCacheWorks,
      '최근 rehearsal에서 통과',
      '근거/캐시 동작 확인 필요',
    ),
    buildRehearsalChecklistItem(
      'low-confidence',
      '저신뢰 fallback',
      latestRehearsal?.lowConfidenceFallbackWorks,
      '최근 rehearsal에서 통과',
      '저신뢰 fallback 확인 필요',
    ),
    buildRehearsalChecklistItem(
      'plan-b',
      '플랜 B 준비',
      latestRehearsal?.backupReady,
      '최근 rehearsal에서 백업 준비됨',
      'prerecorded/session backup 확인 필요',
    ),
  ]
}

function compareDateDesc<T extends { date: string }>(left: T, right: T) {
  return right.date.localeCompare(left.date)
}

function getManualReviewPriority(run: ManualReviewRunRecord | null) {
  const status = run?.status ?? 'pending'

  return {
    blocked: 0,
    fail: 1,
    pending: 2,
    pass: 3,
  }[status]
}

function buildRehearsalChecklistItem(
  id: string,
  label: string,
  value: boolean | undefined,
  readyDetail: string,
  pendingDetail: string,
): QaChecklistItem {
  return {
    detail:
      value === undefined
        ? 'rehearsal log가 아직 없습니다.'
        : value
          ? readyDetail
          : pendingDetail,
    id,
    label,
    status: value ? 'ready' : 'pending',
  }
}
