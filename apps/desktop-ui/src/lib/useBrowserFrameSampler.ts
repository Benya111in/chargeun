import { useEffect } from 'react'

import type { CaptureSession } from '@ansimtrack/shared-types'

import { createBrowserFrameSample } from './capture-input'

const defaultBrowserSampleIntervalMs = 1_000
const defaultBrowserSampleWidth = 960

export function useBrowserFrameSampler(input: {
  enabled: boolean
  onFrame: (frame: ReturnType<typeof createBrowserFrameSample>) => void
  session: CaptureSession | null
  stream: MediaStream | null
}) {
  const { enabled, onFrame, session, stream } = input

  useEffect(() => {
    if (!enabled || !session || !stream || typeof document === 'undefined') {
      return
    }

    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    let intervalId: number | null = null
    let isDisposed = false
    let samplingWarningLogged = false
    const sessionStartMs = performance.now()

    video.autoplay = true
    video.muted = true
    video.playsInline = true
    video.srcObject = stream

    const startSampling = async () => {
      try {
        await video.play()
      } catch {
        return
      }

      intervalId = window.setInterval(() => {
        if (isDisposed || video.videoWidth === 0 || video.videoHeight === 0) {
          return
        }

        const width = Math.min(defaultBrowserSampleWidth, video.videoWidth)
        const height = Math.max(
          1,
          Math.round((width / video.videoWidth) * video.videoHeight),
        )

        canvas.width = width
        canvas.height = height

        let frameRef: string

        try {
          context.drawImage(video, 0, 0, width, height)
          frameRef = canvas.toDataURL('image/jpeg', 0.62)
        } catch (error) {
          if (!samplingWarningLogged) {
            samplingWarningLogged = true
            console.warn('Browser frame sampling failed.', error)
          }

          return
        }

        onFrame(
          createBrowserFrameSample({
            frameRef,
            height,
            sessionId: session.id,
            tsMs: Math.round(performance.now() - sessionStartMs),
            width,
          }),
        )
      }, defaultBrowserSampleIntervalMs)
    }

    void startSampling()

    return () => {
      isDisposed = true

      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }

      video.pause()
      video.srcObject = null
    }
  }, [enabled, onFrame, session, stream])
}
