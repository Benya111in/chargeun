import { describe, expect, it } from 'vitest'

import {
  getLatestRehearsalRun,
  getLatestManualReviewRun,
  getManualReviewQueue,
  getManualReviewCoverage,
  getReleaseChecklistItems,
  getRehearsalPassCount,
  type QaReviewState,
} from './qa-review'

describe('qa-review helpers', () => {
  const state: QaReviewState = {
    fixtures: [
      {
        clipId: 'fire-1',
        description: 'fire clip',
        expectedRuleIds: ['KR_FIRE_01'],
        hasAudio: true,
        hazard: 'fire',
        phase: 'route_selection',
      },
      {
        clipId: 'eq-1',
        description: 'earthquake clip',
        expectedRuleIds: ['KR_EQ_03'],
        hasAudio: false,
        hazard: 'earthquake',
        phase: 'protect',
      },
    ],
    manualReviewRuns: [
      {
        clipId: 'fire-1',
        date: '2026-04-14',
        notes: 'pending',
        operator: 'A',
        path: 'demo-fixture',
        status: 'pending',
      },
      {
        clipId: 'fire-1',
        date: '2026-04-15',
        notes: 'pass',
        operator: 'A',
        path: 'actual',
        status: 'pass',
      },
    ],
    rehearsalRuns: [
      {
        backupReady: true,
        date: '2026-04-14',
        evidenceAndCacheWorks: true,
        fallbackWorks: true,
        fullMonitorCaptureWorks: false,
        lowConfidenceFallbackWorks: true,
        noAudioFallbackWorks: true,
        notes: 'in progress',
        operator: 'A',
        path: 'demo',
        permissionsRetryWorks: false,
        result: 'in_progress',
        shadowPlayerPrimary: true,
        startupUnder10s: true,
        voiceOffWorks: true,
        windowCaptureWorks: false,
      },
      {
        backupReady: true,
        date: '2026-04-15',
        evidenceAndCacheWorks: true,
        fallbackWorks: true,
        fullMonitorCaptureWorks: true,
        lowConfidenceFallbackWorks: true,
        noAudioFallbackWorks: true,
        notes: 'pass',
        operator: 'A',
        path: 'actual',
        permissionsRetryWorks: true,
        result: 'pass',
        shadowPlayerPrimary: true,
        startupUnder10s: true,
        voiceOffWorks: true,
        windowCaptureWorks: true,
      },
    ],
  }

  it('returns the latest manual review run for a clip', () => {
    expect(
      getLatestManualReviewRun(state.manualReviewRuns, 'fire-1')?.status,
    ).toBe('pass')
  })

  it('counts unique passed clips for coverage', () => {
    expect(getManualReviewCoverage(state)).toEqual({
      passed: 1,
      total: 2,
    })
  })

  it('uses the latest manual review status when a later run fails', () => {
    const nextState: QaReviewState = {
      ...state,
      manualReviewRuns: [
        ...state.manualReviewRuns,
        {
          clipId: 'fire-1',
          createdAt: '2026-04-15T12:00:00.000Z',
          date: '2026-04-15',
          notes: 'later fail',
          operator: 'A',
          path: 'actual',
          status: 'fail',
        },
      ],
    }

    expect(
      getLatestManualReviewRun(nextState.manualReviewRuns, 'fire-1')?.status,
    ).toBe('fail')
    expect(getManualReviewCoverage(nextState)).toEqual({
      passed: 0,
      total: 2,
    })
  })

  it('counts passed rehearsals', () => {
    expect(getRehearsalPassCount(state)).toBe(1)
  })

  it('sorts the manual review queue with unresolved fixtures first', () => {
    expect(
      getManualReviewQueue(state).map((fixture) => fixture.clipId),
    ).toEqual(['eq-1', 'fire-1'])
  })

  it('builds release checklist items from the latest rehearsal and coverage', () => {
    const checklist = getReleaseChecklistItems(state)

    expect(checklist.find((item) => item.id === 'manual-review')).toMatchObject(
      {
        detail: '1/2 fixtures passed',
        status: 'pending',
      },
    )
    expect(
      checklist.find((item) => item.id === 'monitor-capture'),
    ).toMatchObject({
      detail: '최근 rehearsal에서 통과',
      status: 'ready',
    })
  })

  it('does not mutate rehearsal order when reading the latest run', () => {
    const rehearsalRuns = [
      ...state.rehearsalRuns.map((run) => ({
        ...run,
      })),
    ]
    const stateCopy = {
      ...state,
      rehearsalRuns,
    }

    expect(getLatestRehearsalRun(stateCopy)?.date).toBe('2026-04-15')
    expect(stateCopy.rehearsalRuns.map((run) => run.date)).toEqual([
      '2026-04-14',
      '2026-04-15',
    ])
  })
})
