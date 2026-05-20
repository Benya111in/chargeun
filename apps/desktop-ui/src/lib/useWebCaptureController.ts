import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { CaptureSession } from '@ansimtrack/shared-types'

import {
  BROWSER_FALLBACK_SOURCE_ID,
  createCaptureSession,
  type CaptureControllerStatus,
  type CapturePermissionState,
  type CaptureSourceOption,
} from './capture-contract'
import {
  initialCaptureInputState,
  pushCaptureFrame,
  syncCaptureInputWithSession,
  type CaptureInputState,
} from './capture-input'
import { useBrowserFrameSampler } from './useBrowserFrameSampler'

type WebCaptureControllerState = {
  activeSession: CaptureSession | null
  captureInput: CaptureInputState
  notice: string
  permission: CapturePermissionState
  previewStream: MediaStream | null
  source: CaptureSourceOption
  status: CaptureControllerStatus
}

type CaptureStartResult = {
  notice: string
  ok: boolean
}

const browserCaptureSupported =
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getDisplayMedia)

const webScreenShareSource: CaptureSourceOption = {
  description: browserCaptureSupported
    ? '브라우저 화면공유로 영상과 오디오 일부를 읽습니다.'
    : '현재 브라우저에서는 화면공유를 지원하지 않습니다.',
  displayName: '브라우저 화면공유',
  id: BROWSER_FALLBACK_SOURCE_ID,
  priority: 'primary',
  ready: browserCaptureSupported,
  runtime: 'browser-fallback',
  sourceType: 'browser_tab',
}

export function useWebCaptureController() {
  const [activeSession, setActiveSession] = useState<CaptureSession | null>(
    null,
  )
  const [captureInput, setCaptureInput] = useState(initialCaptureInputState)
  const [notice, setNotice] = useState(
    browserCaptureSupported
      ? '화면 공유를 시작하면 4초 늦게 장면을 다시 보여 줍니다.'
      : '이 브라우저에서는 화면 공유를 사용할 수 없습니다.',
  )
  const [permission, setPermission] = useState<CapturePermissionState>(
    browserCaptureSupported ? 'unknown' : 'unsupported',
  )
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<CaptureControllerStatus>('idle')
  const previewStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    setCaptureInput(syncCaptureInputWithSession(activeSession))
  }, [activeSession])

  useEffect(
    () => () => {
      stopMediaStream(previewStreamRef.current)
    },
    [],
  )

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

  const stopCapture = useCallback(
    async (nextNotice = '화면 공유를 중지했습니다.') => {
      stopMediaStream(previewStreamRef.current)
      previewStreamRef.current = null
      setPreviewStream(null)
      setActiveSession(null)
      setCaptureInput(initialCaptureInputState)
      setStatus('idle')
      setNotice(nextNotice)
    },
    [],
  )

  const startScreenShare =
    useCallback(async (): Promise<CaptureStartResult> => {
      if (activeSession) {
        const nextNotice = '이미 화면 공유가 실행 중입니다.'
        setNotice(nextNotice)
        return { notice: nextNotice, ok: false }
      }

      if (
        !browserCaptureSupported ||
        !navigator.mediaDevices?.getDisplayMedia
      ) {
        const nextNotice =
          '이 브라우저에서는 화면 공유를 사용할 수 없습니다. 데스크톱 Chrome에서 열어 주세요.'
        setPermission('unsupported')
        setStatus('error')
        setNotice(nextNotice)
        return { notice: nextNotice, ok: false }
      }

      setStatus('starting')
      setNotice('화면 공유 권한을 요청하는 중입니다.')

      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: {
            frameRate: { ideal: 30, max: 30 },
          },
        })
        const videoTracks = stream.getVideoTracks()
        const [videoTrack] = videoTracks

        if (!videoTrack || videoTrack.readyState === 'ended') {
          stopMediaStream(stream)
          const nextNotice =
            '공유된 화면 영상을 찾지 못했습니다. 화면이나 탭을 다시 선택해 주세요.'
          setPermission('unknown')
          setStatus('error')
          setNotice(nextNotice)
          return { notice: nextNotice, ok: false }
        }

        stopMediaStream(previewStreamRef.current)
        previewStreamRef.current = stream
        setPreviewStream(stream)
        setPermission('granted')

        const session = createCaptureSession(webScreenShareSource, {
          displayName: videoTrack?.label || '공유한 화면',
          hasAudio: stream.getAudioTracks().length > 0,
          platform: 'web',
        })

        for (const track of stream.getTracks()) {
          track.addEventListener(
            'ended',
            () => {
              void stopCapture('화면 공유가 종료되었습니다.')
            },
            { once: true },
          )
        }

        setActiveSession(session)
        setStatus('running')
        const nextNotice = stream.getAudioTracks().length
          ? '화면 공유가 시작되었습니다. 영상과 오디오 단서를 함께 읽습니다.'
          : '화면 공유가 시작되었습니다. 오디오는 없어도 영상 단서로 분석합니다.'
        setNotice(nextNotice)
        return { notice: nextNotice, ok: true }
      } catch (error) {
        const denied =
          error instanceof DOMException && error.name === 'NotAllowedError'
        const nextNotice = denied
          ? '화면 공유 권한이 취소되었습니다.'
          : '화면 공유를 시작하지 못했습니다.'
        setPermission(denied ? 'denied' : 'unknown')
        setStatus('error')
        setNotice(nextNotice)
        return { notice: nextNotice, ok: false }
      }
    }, [activeSession, stopCapture])

  const state = useMemo(
    () =>
      ({
        activeSession,
        captureInput,
        notice,
        permission,
        previewStream,
        source: webScreenShareSource,
        status,
      }) satisfies WebCaptureControllerState,
    [activeSession, captureInput, notice, permission, previewStream, status],
  )

  return {
    actions: {
      startScreenShare,
      stopCapture,
    },
    state,
  }
}

function stopMediaStream(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) {
    track.stop()
  }
}
