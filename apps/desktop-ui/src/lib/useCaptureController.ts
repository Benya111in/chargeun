import { useEffect, useMemo, useRef, useState } from 'react'

import type { CaptureSession } from '@ansimtrack/shared-types'

import {
  BROWSER_FALLBACK_SOURCE_ID,
  DEFAULT_CAPTURE_BOOTSTRAP_STATE,
  NATIVE_MONITOR_SOURCE_ID,
  buildCaptureSources,
  createCaptureSession,
  type CaptureBootstrapState,
  type CaptureControllerStatus,
  type CapturePermissionState,
  type CaptureSourceOption,
} from './capture-contract'
import { getCaptureBootstrapState } from './desktop-bridge'

type CaptureControllerState = {
  activeSession: CaptureSession | null
  bootstrap: CaptureBootstrapState
  notice: string
  permission: CapturePermissionState
  previewStream: MediaStream | null
  selectedSource: CaptureSourceOption | null
  selectedSourceId: string
  sources: CaptureSourceOption[]
  status: CaptureControllerStatus
}

const browserCaptureSupported =
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getDisplayMedia)

export function useCaptureController() {
  const [bootstrap, setBootstrap] = useState(DEFAULT_CAPTURE_BOOTSTRAP_STATE)
  const [status, setStatus] = useState<CaptureControllerStatus>('bootstrapping')
  const [permission, setPermission] = useState<CapturePermissionState>(
    browserCaptureSupported ? 'unknown' : 'unsupported',
  )
  const [selectedSourceId, setSelectedSourceId] = useState(
    NATIVE_MONITOR_SOURCE_ID,
  )
  const [notice, setNotice] = useState('캡처 경로를 확인하는 중입니다.')
  const [activeSession, setActiveSession] = useState<CaptureSession | null>(
    null,
  )
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const previewStreamRef = useRef<MediaStream | null>(null)

  const sources = useMemo(
    () => buildCaptureSources({ bootstrap, browserCaptureSupported }),
    [bootstrap],
  )

  const selectedSource = useMemo(
    () =>
      sources.find((source) => source.id === selectedSourceId) ??
      sources[0] ??
      null,
    [selectedSourceId, sources],
  )

  useEffect(() => {
    let isActive = true

    void (async () => {
      const nextBootstrap = await getCaptureBootstrapState()

      if (!isActive) {
        return
      }

      setBootstrap(nextBootstrap)
      setStatus('idle')
      setNotice(
        nextBootstrap.capturePath === 'screen-capture-kit-ready'
          ? 'macOS 우선 경로가 준비되었습니다. 브라우저 fallback은 보조 경로로 유지됩니다.'
          : 'macOS 우선 경로는 준비 중입니다. live preview는 브라우저 fallback으로 먼저 검증할 수 있습니다.',
      )
    })()

    return () => {
      isActive = false
      stopMediaStream(previewStreamRef.current)
    }
  }, [])

  const stopCapture = (nextNotice = '캡처를 중지했습니다.') => {
    stopMediaStream(previewStreamRef.current)
    previewStreamRef.current = null
    setPreviewStream(null)
    setActiveSession(null)
    setStatus('idle')
    setNotice(nextNotice)
  }

  const startBrowserFallback = async () => {
    const source = sources.find(
      (candidate) => candidate.id === BROWSER_FALLBACK_SOURCE_ID,
    )

    setSelectedSourceId(BROWSER_FALLBACK_SOURCE_ID)

    if (!source?.ready || !navigator.mediaDevices?.getDisplayMedia) {
      setPermission('unsupported')
      setStatus('error')
      setNotice(
        '이 환경에서는 브라우저 화면 공유 fallback을 사용할 수 없습니다.',
      )
      return
    }

    setStatus('starting')
    setNotice('브라우저 화면 공유 권한을 요청하는 중입니다.')

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 30 },
        },
        audio: true,
      })

      stopMediaStream(previewStreamRef.current)

      previewStreamRef.current = stream
      setPreviewStream(stream)
      setPermission('granted')

      const [videoTrack] = stream.getVideoTracks()
      const session = createCaptureSession(source, {
        displayName: videoTrack?.label || source.displayName,
        hasAudio: stream.getAudioTracks().length > 0,
        platform: 'web',
      })

      for (const track of stream.getTracks()) {
        track.addEventListener(
          'ended',
          () => {
            stopCapture('화면 공유가 종료되어 캡처를 중지했습니다.')
          },
          { once: true },
        )
      }

      setActiveSession(session)
      setStatus('running')
      setNotice(
        '브라우저 fallback live preview가 켜졌습니다. Shadow Player replay lane은 mock buffer를 유지합니다.',
      )
    } catch (error) {
      const nextPermission =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'denied'
          : 'unknown'

      setPermission(nextPermission)
      setStatus('error')
      setNotice(
        nextPermission === 'denied'
          ? '사용자가 브라우저 화면 공유 권한을 취소했습니다.'
          : '브라우저 화면 공유를 시작하지 못했습니다.',
      )
    }
  }

  const startNativeMonitor = async () => {
    setSelectedSourceId(NATIVE_MONITOR_SOURCE_ID)
    setStatus('error')
    setNotice(
      'ScreenCaptureKit bridge는 다음 slice에서 Tauri/native 명령으로 연결합니다. 지금은 브라우저 fallback preview로 live path를 검증하세요.',
    )
  }

  const state: CaptureControllerState = {
    activeSession,
    bootstrap,
    notice,
    permission,
    previewStream,
    selectedSource,
    selectedSourceId,
    sources,
    status,
  }

  return {
    state,
    actions: {
      selectSource: setSelectedSourceId,
      startBrowserFallback,
      startNativeMonitor,
      stopCapture,
    },
  }
}

function stopMediaStream(stream: MediaStream | null) {
  if (!stream) {
    return
  }

  for (const track of stream.getTracks()) {
    track.stop()
  }
}
