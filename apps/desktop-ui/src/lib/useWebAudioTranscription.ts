import { useEffect, useMemo, useRef, useState } from 'react'

import type { CaptureSession } from '@ansimtrack/shared-types'

import { transcribeAudioChunk } from './web-analysis-api'

type AudioTranscriptEntry = {
  source: string
  text: string
  ts: number
}

type WebAudioStatus =
  | 'idle'
  | 'recording'
  | 'ready'
  | 'transcribing'
  | 'unavailable'
  | 'visual-only'

const chunkMs = 6_000

export function useWebAudioTranscription(input: {
  betaCode: string
  enabled: boolean
  session: CaptureSession | null
  stream: MediaStream | null
}) {
  const { betaCode, enabled, session, stream } = input
  const [entries, setEntries] = useState<AudioTranscriptEntry[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [status, setStatus] = useState<WebAudioStatus>('idle')
  const requestInFlightRef = useRef(false)
  const hasAudioTrack = Boolean(stream?.getAudioTracks().length)
  const mediaRecorderAvailable = typeof MediaRecorder !== 'undefined'

  useEffect(() => {
    if (!enabled || !session || !stream) {
      return
    }

    if (!hasAudioTrack) {
      return
    }

    if (!mediaRecorderAvailable) {
      return
    }

    const mimeType = pickMediaRecorderMimeType()
    let recorder: MediaRecorder

    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    } catch {
      queueMicrotask(() => {
        setMessage('화면공유 오디오 녹음을 시작하지 못했습니다.')
        setStatus('unavailable')
      })
      return
    }

    let disposed = false

    recorder.ondataavailable = (event) => {
      if (disposed || event.data.size === 0 || requestInFlightRef.current) {
        return
      }

      requestInFlightRef.current = true
      setStatus('transcribing')

      void transcribeAudioChunk({
        audioBlob: event.data,
        betaCode,
        durationMs: chunkMs,
        sessionId: session.id,
      })
        .then((result) => {
          if (disposed) {
            return
          }

          const transcript = result.transcript.trim()
          if (transcript) {
            setEntries((current) =>
              [
                ...current,
                {
                  source: result.source,
                  text: transcript,
                  ts: Date.now(),
                },
              ].slice(-5),
            )
            setMessage('화면공유 오디오를 자막 단서로 읽었습니다.')
            setStatus('ready')
          } else {
            setMessage('이번 오디오 구간에서는 읽을 말이 없었습니다.')
            setStatus('recording')
          }
        })
        .catch((error) => {
          if (disposed) {
            return
          }

          setMessage(
            error instanceof Error
              ? error.message
              : '오디오 전사를 처리하지 못했습니다.',
          )
          setStatus('unavailable')
        })
        .finally(() => {
          requestInFlightRef.current = false
        })
    }

    recorder.start(chunkMs)
    queueMicrotask(() => {
      setMessage('화면공유 오디오를 짧은 구간으로 읽는 중입니다.')
      setStatus('recording')
    })

    return () => {
      disposed = true
      if (recorder.state !== 'inactive') {
        recorder.stop()
      }
    }
  }, [
    betaCode,
    enabled,
    hasAudioTrack,
    mediaRecorderAvailable,
    session,
    stream,
  ])

  const asrText = useMemo(() => {
    const seen = new Set<string>()
    return entries
      .map((entry) => entry.text)
      .filter((text) => {
        if (seen.has(text)) {
          return false
        }

        seen.add(text)
        return true
      })
      .join(' ')
  }, [entries])

  return {
    asrText,
    message:
      !enabled || !session || !stream
        ? null
        : !hasAudioTrack
          ? '오디오가 없어도 영상 단서로 분석합니다.'
          : !mediaRecorderAvailable
            ? '이 브라우저에서는 화면공유 오디오 녹음을 사용할 수 없습니다.'
            : message,
    status:
      !enabled || !session || !stream
        ? 'idle'
        : !hasAudioTrack
          ? 'visual-only'
          : !mediaRecorderAvailable
            ? 'unavailable'
            : status,
  } as const
}

export function pickMediaRecorderMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]

  return (
    candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ??
    ''
  )
}
