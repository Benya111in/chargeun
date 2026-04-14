import { useEffect, useRef } from 'react'

import type { CaptureSession } from '@ansimtrack/shared-types'

import {
  buildPerceptionSeed,
  type CaptureInputState,
} from '../lib/capture-input'
import type {
  CaptureControllerStatus,
  CaptureSourceOption,
} from '../lib/capture-contract'
import type { NativePreviewState } from '../lib/native-preview'
import { cn } from '../lib/utils'

export function LiveCapturePreview({
  notice,
  selectedSource,
  session,
  status,
  stream,
  captureInput,
  nativePreview,
}: {
  notice: string
  captureInput: CaptureInputState
  selectedSource: CaptureSourceOption | null
  session: CaptureSession | null
  status: CaptureControllerStatus
  stream: MediaStream | null
  nativePreview: NativePreviewState
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const perceptionSeed = buildPerceptionSeed(captureInput)

  useEffect(() => {
    const element = videoRef.current

    if (!element) {
      return
    }

    element.srcObject = stream

    return () => {
      if (element.srcObject === stream) {
        element.srcObject = null
      }
    }
  }, [stream])

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--ink)]">
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            className="aspect-video w-full object-cover"
            muted
            playsInline
          />
        ) : nativePreview.lastFrame ? (
          <img
            alt="Native capture preview"
            className="aspect-video w-full object-cover"
            src={nativePreview.lastFrame.src}
          />
        ) : (
          <div className="flex aspect-video items-center justify-center px-6 text-center text-sm leading-6 text-white/70">
            live preview lane 대기 중
          </div>
        )}
      </div>

      <div className="grid gap-3 rounded-md border border-[var(--line)] bg-white p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            live preview
          </p>
          <p className="mt-2 text-sm font-semibold text-[var(--ink)]">
            {session?.displayName ??
              selectedSource?.displayName ??
              '캡처 소스 선택'}
          </p>
        </div>
        <div className="grid gap-2 text-sm leading-6 text-[var(--muted)]">
          <p>
            {selectedSource?.description ?? '캡처 경로를 확인하는 중입니다.'}
          </p>
          <p>{notice}</p>
        </div>
        <div
          className={cn(
            'rounded-md px-3 py-2 text-sm font-medium',
            status === 'running'
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-[var(--soft)] text-[var(--muted)]',
          )}
        >
          replay lane과 분리된 preview 상태: {getStatusLabel(status)}
        </div>
        <div className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--soft)] px-3 py-3 text-sm text-[var(--muted)]">
          <p>
            입력 경로:{' '}
            {stream
              ? '브라우저 MediaStream'
              : nativePreview.lastFrame
                ? 'native frame snapshot'
                : '미연결'}
          </p>
          <p>
            오디오:{' '}
            {nativePreview.audioState === 'live'
              ? `native 이벤트 수신 중${
                  nativePreview.lastAudioSampleRate &&
                  nativePreview.lastAudioChannels
                    ? ` · ${nativePreview.lastAudioSampleRate}Hz / ${nativePreview.lastAudioChannels}ch`
                    : ''
                }`
              : nativePreview.audioState === 'requested'
                ? '요청됨'
                : nativePreview.audioState === 'fallback'
                  ? '미연결, 영상 preview만 유지'
                  : '없음'}
          </p>
          {nativePreview.lastAudioAtMs ? (
            <p>
              최근 audio 이벤트:{' '}
              {new Date(nativePreview.lastAudioAtMs).toLocaleTimeString()}
            </p>
          ) : null}
          <p>
            native frame 수: {nativePreview.frameCount}
            {nativePreview.lastFrameAtMs
              ? ` · 최근 ${new Date(nativePreview.lastFrameAtMs).toLocaleTimeString()}`
              : ''}
          </p>
          <p>
            analysis frame 창: {captureInput.frameWindow.length}개 · shadow 입력{' '}
            {captureInput.shadowStatus === 'ready' ? '준비됨' : '준비 중'}
          </p>
          <p>
            perception seed:{' '}
            {perceptionSeed
              ? `${perceptionSeed.keyframes.length} keyframes / ${perceptionSeed.tStartMs}-${perceptionSeed.tEndMs}`
              : '대기 중'}
          </p>
          {nativePreview.lastError ? <p>{nativePreview.lastError}</p> : null}
        </div>
      </div>
    </div>
  )
}

function getStatusLabel(status: CaptureControllerStatus) {
  switch (status) {
    case 'bootstrapping':
      return '경로 확인 중'
    case 'idle':
      return '대기 중'
    case 'starting':
      return '시작 중'
    case 'running':
      return '실행 중'
    case 'error':
      return '오류'
  }
}
