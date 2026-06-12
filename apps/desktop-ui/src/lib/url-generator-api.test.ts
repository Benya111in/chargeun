import { describe, expect, it } from 'vitest'

import {
  getDefaultGenerationPollTimeoutMs,
  isPublishedGenerationStatus,
} from './url-generator-api'

describe('generator job publish status', () => {
  it('opens generated practice only after the published state', () => {
    expect(isPublishedGenerationStatus('published')).toBe(true)
    expect(isPublishedGenerationStatus('approved')).toBe(false)
    expect(isPublishedGenerationStatus('completed')).toBe(false)
    expect(isPublishedGenerationStatus('needs_repair')).toBe(false)
    expect(isPublishedGenerationStatus('blocked')).toBe(false)
  })

  it('does not time out active generation polling by default', () => {
    expect(getDefaultGenerationPollTimeoutMs()).toBeNull()
  })
})
