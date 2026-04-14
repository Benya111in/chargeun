import { useEffect, useRef } from 'react'

import type { CaptureSession } from '@ansimtrack/shared-types'

import type {
  CaptureControllerStatus,
  CaptureSourceOption,
} from '../lib/capture-contract'
import { cn } from '../lib/utils'

export function LiveCapturePreview({
  notice,
  selectedSource,
  session,
  status,
  stream,
}: {
  notice: string
  selectedSource: CaptureSourceOption | null
  session: CaptureSession | null
  status: CaptureControllerStatus
  stream: MediaStream | null
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

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
