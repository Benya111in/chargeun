import { describe, expect, it } from 'vitest'

import {
  buildPersistedSessionMeta,
  defaultAppRuntimeState,
  mergeRuntimeState,
  slugifyArtifactName,
} from './demo-runtime'

describe('buildPersistedSessionMeta', () => {
  it('returns a stable snapshot of a capture session', () => {
    expect(
      buildPersistedSessionMeta({
        id: 'session-1',
        sourceType: 'monitor',
        platform: 'mac',
        startedAt: 1234,
        hasAudio: true,
        displayName: 'demo monitor',
      }),
    ).toEqual({
      id: 'session-1',
      sourceType: 'monitor',
      platform: 'mac',
      startedAt: 1234,
      hasAudio: true,
      displayName: 'demo monitor',
    })
  })

  it('returns null when no session exists', () => {
    expect(buildPersistedSessionMeta(null)).toBeNull()
  })
})

describe('mergeRuntimeState', () => {
  it('fills missing fields from defaults', () => {
    expect(
      mergeRuntimeState({
        scenarioId: 'review-earthquake',
        selectedTrack: 'easy',
      }),
    ).toEqual({
      ...defaultAppRuntimeState,
      scenarioId: 'review-earthquake',
      selectedTrack: 'easy',
    })
  })
})

describe('slugifyArtifactName', () => {
  it('normalizes export names into safe slugs', () => {
    expect(slugifyArtifactName('Fire Demo / Step 01')).toBe('fire-demo-step-01')
    expect(slugifyArtifactName('   ')).toBe('ansimtrack-demo')
  })
})
