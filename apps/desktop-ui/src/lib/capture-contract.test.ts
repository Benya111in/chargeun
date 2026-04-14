import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CAPTURE_BOOTSTRAP_STATE,
  buildCaptureSources,
  captureSessionFromNativeRecord,
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

  it('uses native sources from the Tauri bridge when they are available', () => {
    const sources = buildCaptureSources({
      bootstrap: {
        ...DEFAULT_CAPTURE_BOOTSTRAP_STATE,
        capturePath: 'screen-capture-kit-command-ready',
      },
      browserCaptureSupported: true,
      nativeSources: [
        {
          id: 'display-primary',
          displayName: 'Primary Display',
          sourceType: 'monitor',
          width: 2560,
          height: 1440,
        },
      ],
    })

    expect(sources[0]?.id).toBe('display-primary')
    expect(sources[0]?.ready).toBe(true)
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

  it('converts native session records into shared capture sessions', () => {
    const session = captureSessionFromNativeRecord({
      sessionId: 'native-1',
      sourceId: 'display-primary',
      sourceType: 'monitor',
      displayName: 'Primary Display',
      hasAudio: true,
      platform: 'mac',
      startedAt: 1_234,
      outputWidth: 1920,
      outputHeight: 1080,
    })

    expect(session.id).toBe('native-1')
    expect(session.platform).toBe('mac')
    expect(session.hasAudio).toBe(true)
  })
})
