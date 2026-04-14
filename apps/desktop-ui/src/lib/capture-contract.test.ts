import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CAPTURE_BOOTSTRAP_STATE,
  buildCaptureSources,
  createCaptureSession,
} from './capture-contract'

describe('buildCaptureSources', () => {
  it('keeps the native monitor path first and browser fallback second', () => {
    const sources = buildCaptureSources({
      bootstrap: DEFAULT_CAPTURE_BOOTSTRAP_STATE,
      browserCaptureSupported: true,
    })

    expect(sources.map((source) => source.id)).toEqual([
      'native-current-monitor',
      'browser-screen-share',
    ])
    expect(sources[0]?.priority).toBe('primary')
    expect(sources[1]?.priority).toBe('fallback')
  })

  it('marks browser fallback unavailable when getDisplayMedia is missing', () => {
    const sources = buildCaptureSources({
      bootstrap: DEFAULT_CAPTURE_BOOTSTRAP_STATE,
      browserCaptureSupported: false,
    })

    expect(sources[1]?.ready).toBe(false)
  })
})

describe('createCaptureSession', () => {
  it('creates a session that matches the selected source', () => {
    const [, source] = buildCaptureSources({
      bootstrap: DEFAULT_CAPTURE_BOOTSTRAP_STATE,
      browserCaptureSupported: true,
    })

    const session = createCaptureSession(source, {
      displayName: '현재 브라우저 탭',
      hasAudio: true,
      platform: 'web',
    })

    expect(session.sourceType).toBe('browser_tab')
    expect(session.platform).toBe('web')
    expect(session.displayName).toBe('현재 브라우저 탭')
    expect(session.hasAudio).toBe(true)
  })
})
