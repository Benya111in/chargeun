import { useEffect, useMemo, useRef, useState } from 'react'

import type { CaptureSession } from '@ansimtrack/shared-types'

import {
  BROWSER_FALLBACK_SOURCE_ID,
  DEFAULT_CAPTURE_BOOTSTRAP_STATE,
  NATIVE_MONITOR_SOURCE_ID,
  buildCaptureSources,
  captureSessionFromNativeRecord,
  createCaptureSession,
  type CaptureBootstrapState,
  type CaptureControllerStatus,
  type CapturePermissionState,
  type CaptureSourceOption,
  type NativeCaptureSourceRecord,
} from './capture-contract'
import {
  getCaptureBootstrapState,
  listNativeCaptureSources,
  startNativeCapture,
  stopNativeCapture,
} from './desktop-bridge'

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
  const [nativeSources, setNativeSources] = useState<
    NativeCaptureSourceRecord[]
  >([])
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const previewStreamRef = useRef<MediaStream | null>(null)

  const sources = useMemo(
    () =>
      buildCaptureSources({
        bootstrap,
        browserCaptureSupported,
        nativeSources,
      }),
    [bootstrap, nativeSources],
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
      const nextNativeSources = await listNativeCaptureSources()

      if (!isActive) {
        return
      }

      setNativeSources(nextNativeSources)
      setPermission(
        browserCaptureSupported
          ? nextBootstrap.permissionState
          : nextBootstrap.permissionState === 'unknown'
            ? 'unsupported'
            : nextBootstrap.permissionState,
      )
      setStatus('idle')
      setNotice(
        nextBootstrap.capturePath === 'screen-capture-kit-ready' ||
          nextBootstrap.capturePath === 'screen-capture-kit-command-ready' ||
          nextBootstrap.capturePath === 'screen-capture-kit-swift-bridge-ready'
          ? 'macOS 우선 경로가 준비되었습니다. 브라우저 fallback은 보조 경로로 유지됩니다.'
          : 'macOS 우선 경로는 준비 중입니다. live preview는 브라우저 fallback으로 먼저 검증할 수 있습니다.',
      )

      if (nextNativeSources[0]) {
        setSelectedSourceId((current) =>
          current === '' || current === NATIVE_MONITOR_SOURCE_ID
            ? nextNativeSources[0]?.id || current
            : current,
        )
      }
    })()

    return () => {
      isActive = false
      stopMediaStream(previewStreamRef.current)
    }
  }, [])

  const stopCapture = async (nextNotice = '캡처를 중지했습니다.') => {
    stopMediaStream(previewStreamRef.current)
    previewStreamRef.current = null
    setPreviewStream(null)

    if (activeSession?.platform === 'mac') {
      try {
        await stopNativeCapture({ sessionId: activeSession.id })
      } catch {
        setStatus('error')
        setNotice('native capture 세션을 정리하지 못했습니다.')
        return
      }
    }

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
    const source =
      selectedSource?.runtime === 'native-mac'
        ? selectedSource
        : (sources.find((candidate) => candidate.runtime === 'native-mac') ??
          null)

    if (!source?.ready) {
      setStatus('error')
      setNotice(
        '현재 native capture 경로가 준비되지 않았습니다. 브라우저 fallback preview로 먼저 검증하세요.',
      )
      return
    }

    setSelectedSourceId(source.id)
    setStatus('starting')
    setNotice('native ScreenCaptureKit capture 세션을 시작하는 중입니다.')

    try {
      stopMediaStream(previewStreamRef.current)
      previewStreamRef.current = null
      setPreviewStream(null)

      const session = await startNativeCapture({
        sourceId: source.id,
        includeAudio: true,
      })

      setPermission('granted')
      setActiveSession(captureSessionFromNativeRecord(session))
      setStatus('running')
      setNotice(
        'native capture 세션이 시작되었습니다. preview/frame bridge는 다음 slice에서 연결하고, 현재 Shadow Player replay lane은 mock buffer를 유지합니다.',
      )
    } catch {
      setStatus('error')
      setNotice(
        'native capture 세션을 시작하지 못했습니다. 브라우저 fallback preview로 계속 검증할 수 있습니다.',
      )
    }
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
