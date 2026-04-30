import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { CaptureSession } from '@ansimtrack/shared-types'

import {
  initialCaptureInputState,
  pushCaptureFrame,
  syncCaptureInputWithNativeFrame,
  syncCaptureInputWithSession,
  type CaptureInputState,
} from './capture-input'
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
  listenToNativeCaptureEvents,
  listNativeCaptureSources,
  startNativeCapture,
  stopNativeCapture,
} from './desktop-bridge'
import {
  initialNativePreviewState,
  reduceNativePreviewState,
  type NativePreviewState,
} from './native-preview'
import { useBrowserFrameSampler } from './useBrowserFrameSampler'

type CaptureControllerState = {
  activeSession: CaptureSession | null
  bootstrap: CaptureBootstrapState
  captureInput: CaptureInputState
  nativePreview: NativePreviewState
  notice: string
  permission: CapturePermissionState
  previewStream: MediaStream | null
  selectedSource: CaptureSourceOption | null
  selectedSourceId: string
  sources: CaptureSourceOption[]
  status: CaptureControllerStatus
}

type CaptureStartResult = {
  notice: string
  ok: boolean
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
  const [captureInput, setCaptureInput] = useState(initialCaptureInputState)
  const [nativePreview, setNativePreview] = useState(initialNativePreviewState)
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)
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
    activeSessionIdRef.current = activeSession?.id ?? null
  }, [activeSession?.id])

  useEffect(() => {
    setCaptureInput(syncCaptureInputWithSession(activeSession))
  }, [activeSession])

  useEffect(() => {
    let unlistenNativeCapture = () => {}

    void (async () => {
      unlistenNativeCapture = await listenToNativeCaptureEvents((event) => {
        setNativePreview((current) => reduceNativePreviewState(current, event))

        if (event.type === 'error' && event.code !== 'audio-preview-fallback') {
          setStatus((current) => (current === 'running' ? current : 'error'))
          setNotice(event.message)
        }

        if (
          event.type === 'session-stopped' &&
          activeSessionIdRef.current === event.sessionId
        ) {
          setActiveSession(null)
          setStatus('idle')
          setNotice('native capture 세션이 정지되어 preview lane을 비웠습니다.')
        }
      })
    })()

    return () => {
      unlistenNativeCapture()
    }
  }, [])

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

  useEffect(() => {
    if (activeSession?.platform !== 'mac') {
      return
    }

    setCaptureInput((current) =>
      syncCaptureInputWithNativeFrame(current, nativePreview.lastFrame),
    )
  }, [activeSession?.platform, nativePreview.lastFrame])

  const handleBrowserSample = useCallback(
    (frame: Parameters<typeof pushCaptureFrame>[1]) => {
      setCaptureInput((current) => pushCaptureFrame(current, frame))
    },
    [],
  )

  useBrowserFrameSampler({
    enabled: activeSession?.platform === 'web',
    onFrame: handleBrowserSample,
    session: activeSession,
    stream: previewStream,
  })

  const stopCapture = async (nextNotice = '캡처를 중지했습니다.') => {
    stopMediaStream(previewStreamRef.current)
    previewStreamRef.current = null
    setPreviewStream(null)
    setCaptureInput(initialCaptureInputState)
    setNativePreview(initialNativePreviewState)

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

  const startBrowserFallback = async (): Promise<CaptureStartResult> => {
    if (activeSession) {
      const nextNotice =
        '이미 캡처가 실행 중입니다. 먼저 현재 캡처를 중지해 주세요.'
      setNotice(nextNotice)
      return { notice: nextNotice, ok: false }
    }

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
      return {
        notice:
          '이 환경에서는 브라우저 화면 공유 fallback을 사용할 수 없습니다.',
        ok: false,
      }
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
      setNativePreview(initialNativePreviewState)
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
        '브라우저 fallback live preview가 켜졌습니다. Shadow Player replay lane에도 실제 browser sample이 연결됩니다.',
      )
      return {
        notice:
          '브라우저 화면 공유가 시작되었습니다. 실제 화면 샘플이 분석 화면에 연결됩니다.',
        ok: true,
      }
    } catch (error) {
      const nextPermission =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'denied'
          : 'unknown'

      setPermission(nextPermission)
      setStatus('error')
      const nextNotice =
        nextPermission === 'denied'
          ? '사용자가 브라우저 화면 공유 권한을 취소했습니다.'
          : '브라우저 화면 공유를 시작하지 못했습니다.'
      setNotice(nextNotice)
      return { notice: nextNotice, ok: false }
    }
  }

  const startNativeMonitor = async (): Promise<CaptureStartResult> => {
    if (activeSession) {
      const nextNotice =
        '이미 캡처가 실행 중입니다. 먼저 현재 캡처를 중지해 주세요.'
      setNotice(nextNotice)
      return { notice: nextNotice, ok: false }
    }

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
      return {
        notice:
          '현재 모니터 읽기를 시작하지 못했습니다. 브라우저 공유로 먼저 볼 수 있습니다.',
        ok: false,
      }
    }

    setSelectedSourceId(source.id)
    setStatus('starting')
    setNotice('native ScreenCaptureKit capture 세션을 시작하는 중입니다.')

    try {
      stopMediaStream(previewStreamRef.current)
      previewStreamRef.current = null
      setPreviewStream(null)
      setNativePreview(initialNativePreviewState)

      const session = await startNativeCapture({
        sourceId: source.id,
        includeAudio: true,
      })

      setPermission('granted')
      setActiveSession(captureSessionFromNativeRecord(session))
      setStatus('running')
      setNotice(
        'native capture 세션이 시작되었습니다. preview lane은 native frame snapshot을 받고, Shadow Player replay lane도 같은 live input을 사용합니다.',
      )
      return {
        notice:
          '현재 모니터 읽기가 시작되었습니다. 화면 샘플이 분석 화면에 연결됩니다.',
        ok: true,
      }
    } catch {
      setStatus('error')
      const nextNotice =
        '현재 모니터 읽기를 시작하지 못했습니다. 브라우저 공유로 계속 볼 수 있습니다.'
      setNotice(nextNotice)
      return { notice: nextNotice, ok: false }
    }
  }

  const state: CaptureControllerState = {
    activeSession,
    bootstrap,
    captureInput,
    nativePreview,
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
