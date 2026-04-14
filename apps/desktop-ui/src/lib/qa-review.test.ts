import { describe, expect, it } from 'vitest'

import {
  getLatestManualReviewRun,
  getManualReviewCoverage,
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

  it('counts passed rehearsals', () => {
    expect(getRehearsalPassCount(state)).toBe(1)
  })
})
