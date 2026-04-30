import { useEffect, useMemo, useRef, useState } from 'react'

import type { CaptureInputState } from './capture-input'
import { extractOcrTokens } from './desktop-bridge'

type OcrFrameEntry = {
  frameId: string
  status: 'browser-preview' | 'recognized'
  tokens: string[]
  tsMs: number
}

export function useLiveOcrTokens(captureInput: CaptureInputState) {
  const [entries, setEntries] = useState<OcrFrameEntry[]>([])
  const lastRequestedFrameIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (
      !captureInput.latestFrame ||
      !captureInput.sessionId ||
      captureInput.shadowStatus === 'idle'
    ) {
      lastRequestedFrameIdRef.current = null
      return
    }

    const frame = captureInput.latestFrame
    const frameId = `${frame.sessionId}:${frame.tsMs}`

    if (lastRequestedFrameIdRef.current === frameId) {
      return
    }

    lastRequestedFrameIdRef.current = frameId
    let isActive = true

    void extractOcrTokens({
      imageRef: frame.imageRef,
    }).then((result) => {
      if (!isActive) {
        return
      }

      setEntries((previous) => {
        const windowStartMs = captureInput.frameWindow[0]?.tsMs ?? frame.tsMs
        const nextEntries = [
          ...previous.filter(
            (entry) =>
              entry.frameId !== frameId && entry.tsMs >= windowStartMs - 1000,
          ),
          {
            frameId,
            status: result.status,
            tokens: result.tokens,
            tsMs: frame.tsMs,
          },
        ]

        return nextEntries.slice(-8)
      })
    })

    return () => {
      isActive = false
    }
  }, [
    captureInput.frameWindow,
    captureInput.latestFrame,
    captureInput.sessionId,
    captureInput.shadowStatus,
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
        entry.frameId.startsWith(`${captureInput.sessionId}:`) &&
        entry.tsMs >= windowStartMs - 1000 &&
        entry.tsMs <= windowEndMs,
    )
  }, [captureInput.frameWindow, captureInput.sessionId, entries])

  const ocrTokens = useMemo(() => {
    const seen = new Set<string>()

    return visibleEntries.flatMap((entry) =>
      entry.tokens.filter((token) => {
        if (seen.has(token)) {
          return false
        }

        seen.add(token)
        return true
      }),
    )
  }, [visibleEntries])

  const lastEntry = visibleEntries[visibleEntries.length - 1] ?? null
  const status =
    captureInput.shadowStatus === 'idle'
      ? 'idle'
      : lastEntry?.status === 'browser-preview'
        ? 'unavailable'
        : ocrTokens.length > 0
          ? 'ready'
          : 'scanning'

  return {
    message:
      status === 'unavailable'
        ? '브라우저 미리보기에서는 네이티브 OCR이 연결되지 않습니다.'
        : null,
    ocrTokens,
    status,
  } as const
}
