import { useEffect, useRef, useState } from 'react'

import type { PerceptionPacket } from '@ansimtrack/shared-types'

import type { CaptureInputState } from './capture-input'
import { analyzeFrameWindow } from './web-analysis-api'

type WebPerceptionStatus =
  | 'idle'
  | 'waiting'
  | 'analyzing'
  | 'ready'
  | 'delayed'
  | 'blocked'
  | 'error'

const requestIntervalMs = 4_000
const requestTimeoutMs = 12_000

export function useWebPerceptionAnalysis(input: {
  asrText: string
  betaCode: string
  captureInput: CaptureInputState
  enabled: boolean
}) {
  const { asrText, betaCode, captureInput, enabled } = input
  const [message, setMessage] = useState<string | null>(null)
  const [packet, setPacket] = useState<PerceptionPacket | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [status, setStatus] = useState<WebPerceptionStatus>('idle')
  const lastRequestAtRef = useRef(0)
  const lastRequestKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      return
    }

    if (!captureInput.sessionId || captureInput.frameWindow.length < 2) {
      return
    }

    const frames = captureInput.frameWindow.slice(-3)
    const tStartMs = frames[0]?.tsMs ?? Date.now()
    const tEndMs = frames[frames.length - 1]?.tsMs ?? tStartMs
    const requestKey = [
      captureInput.sessionId,
      tStartMs,
      tEndMs,
      asrText,
      frames.map((frame) => frame.imageRef.length).join(','),
    ].join(':')
    const now = Date.now()

    if (
      requestKey === lastRequestKeyRef.current ||
      now - lastRequestAtRef.current < requestIntervalMs
    ) {
      return
    }

    lastRequestKeyRef.current = requestKey
    lastRequestAtRef.current = now
    queueMicrotask(() => {
      setStatus(packet ? 'delayed' : 'analyzing')
      setMessage(
        packet ? '새 장면 분석을 기다리는 중입니다.' : '장면을 분석 중입니다.',
      )
    })

    const controller = new AbortController()
    const timeout = window.setTimeout(
      () => controller.abort(),
      requestTimeoutMs,
    )
    let disposed = false

    analyzeFrameWindow({
      asrText,
      betaCode,
      frames,
      signal: controller.signal,
      sessionId: captureInput.sessionId,
      tEndMs,
      tStartMs,
    })
      .then((result) => {
        if (disposed) {
          return
        }

        setPacket(result.packet)
        setSource(result.source)
        setStatus('ready')
        setMessage('현재 장면의 근거를 읽었습니다.')
      })
      .catch((error) => {
        if (disposed) {
          return
        }

        setStatus(packet ? 'delayed' : 'error')
        setMessage(
          error instanceof Error
            ? error.message
            : '분석 서버 응답이 늦어지고 있습니다.',
        )
      })
      .finally(() => {
        window.clearTimeout(timeout)
      })

    return () => {
      disposed = true
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [
    asrText,
    betaCode,
    captureInput.frameWindow,
    captureInput.sessionId,
    enabled,
    packet,
  ])

  return {
    message: !enabled
      ? '베타 접근 코드를 입력하면 분석을 시작할 수 있습니다.'
      : !captureInput.sessionId
        ? '화면 공유를 시작해 주세요.'
        : captureInput.frameWindow.length < 2
          ? '화면 샘플을 모으는 중입니다.'
          : message,
    packet,
    source,
    status: !enabled
      ? 'blocked'
      : !captureInput.sessionId
        ? 'idle'
        : captureInput.frameWindow.length < 2
          ? 'waiting'
          : status,
  } as const
}
