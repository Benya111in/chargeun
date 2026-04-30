import { useEffect, useMemo, useRef, useState } from 'react'

import type { CaptureInputState } from './capture-input'
import { transcribeAudioSample } from './desktop-bridge'
import type { NativePreviewState } from './native-preview'

type AsrEntry = {
  message?: string | null
  pcmRef: string
  sessionId: string
  source: string
  status:
    | 'recognized'
    | 'no-match'
    | 'unavailable'
    | 'missing-file'
    | 'error'
    | 'browser-preview'
  transcript: string
  tsMs: number
}

export function useLiveAsrText(
  nativePreview: NativePreviewState,
  captureInput: CaptureInputState,
) {
  const [entries, setEntries] = useState<AsrEntry[]>([])
  const lastRequestedPcmRefRef = useRef<string | null>(null)

  useEffect(() => {
    if (!captureInput.sessionId) {
      lastRequestedPcmRefRef.current = null
      return
    }
    const sessionId = captureInput.sessionId

    if (
      !nativePreview.lastAudioPcmRef ||
      nativePreview.lastAudioAtMs === null ||
      nativePreview.audioState === 'idle' ||
      nativePreview.audioState === 'fallback'
    ) {
      return
    }

    const pcmRef = nativePreview.lastAudioPcmRef

    if (lastRequestedPcmRefRef.current === pcmRef) {
      return
    }

    lastRequestedPcmRefRef.current = pcmRef
    let isActive = true

    void transcribeAudioSample({
      pcmRef,
      locale: 'ko-KR',
    }).then((result) => {
      if (!isActive) {
        return
      }

      setEntries((previous) => {
        const windowStartMs =
          captureInput.frameWindow[0]?.tsMs ?? nativePreview.lastAudioAtMs ?? 0
        const nextEntries = [
          ...previous.filter(
            (entry) =>
              entry.pcmRef !== pcmRef && entry.tsMs >= windowStartMs - 3_000,
          ),
          {
            message: result.message,
            pcmRef,
            sessionId,
            source: result.source,
            status: result.status,
            transcript: result.transcript.trim(),
            tsMs: nativePreview.lastAudioAtMs ?? Date.now(),
          },
        ]

        return nextEntries.slice(-6)
      })
    })

    return () => {
      isActive = false
    }
  }, [
    captureInput.frameWindow,
    captureInput.sessionId,
    nativePreview.audioState,
    nativePreview.lastAudioAtMs,
    nativePreview.lastAudioPcmRef,
  ])

  const visibleEntries = useMemo(() => {
    if (!captureInput.sessionId || captureInput.frameWindow.length === 0) {
      return []
    }

    const windowStartMs = captureInput.frameWindow[0]?.tsMs ?? 0
    const windowEndMs =
      captureInput.frameWindow[captureInput.frameWindow.length - 1]?.tsMs ?? 0

    return entries.filter(
      (entry) =>
        entry.sessionId === captureInput.sessionId &&
        entry.tsMs >= windowStartMs - 2_000 &&
        entry.tsMs <= windowEndMs + 1_500,
    )
  }, [captureInput.frameWindow, captureInput.sessionId, entries])

  const asrText = useMemo(() => {
    const seen = new Set<string>()

    return visibleEntries
      .filter(
        (entry) =>
          entry.status === 'recognized' && entry.transcript.trim().length > 0,
      )
      .map((entry) => entry.transcript.trim())
      .filter((transcript) => {
        if (seen.has(transcript)) {
          return false
        }

        seen.add(transcript)
        return true
      })
      .join(' ')
  }, [visibleEntries])

  const lastEntry = visibleEntries[visibleEntries.length - 1] ?? null
  const status =
    nativePreview.audioState === 'idle' && captureInput.shadowStatus !== 'idle'
      ? 'unavailable'
      : nativePreview.audioState === 'idle'
        ? 'idle'
        : nativePreview.audioState === 'fallback'
          ? 'unavailable'
          : asrText
            ? 'ready'
            : lastEntry &&
                ['unavailable', 'missing-file', 'error'].includes(
                  lastEntry.status,
                )
              ? 'unavailable'
              : nativePreview.lastAudioPcmRef
                ? 'transcribing'
                : 'idle'

  return {
    asrText,
    message:
      status === 'unavailable' && !lastEntry?.message
        ? '브라우저 미리보기에서는 네이티브 음성 인식이 연결되지 않습니다.'
        : (lastEntry?.message ?? null),
    status,
  } as const
}
