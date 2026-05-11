import { describe, expect, it } from 'vitest'

import { validateAnalyzeBody } from '../../../../api/analyze-frame-window'
import { ValidationError, parseAudioDataUrl } from '../../../../api/_shared'

const tinyJpegDataUrl = 'data:image/jpeg;base64,ZmFrZQ=='

describe('web API request validation', () => {
  it('accepts a bounded frame window payload', () => {
    expect(
      validateAnalyzeBody(
        {
          asrText: '비상구 안내',
          frames: [
            {
              height: 540,
              imageRef: tinyJpegDataUrl,
              tsMs: 1_000,
              width: 960,
            },
          ],
          sessionId: 'web-session-1',
          tEndMs: 2_000,
          tStartMs: 1_000,
        },
        3,
      ),
    ).toMatchObject({
      asrText: '비상구 안내',
      sessionId: 'web-session-1',
    })
  })

  it('rejects too many frames before model calls', () => {
    expect(() =>
      validateAnalyzeBody(
        {
          frames: [
            { imageRef: tinyJpegDataUrl },
            { imageRef: tinyJpegDataUrl },
            { imageRef: tinyJpegDataUrl },
            { imageRef: tinyJpegDataUrl },
          ],
          sessionId: 'web-session-1',
          tEndMs: 2_000,
          tStartMs: 1_000,
        },
        3,
      ),
    ).toThrowError(ValidationError)
  })

  it('rejects invalid image data URLs', () => {
    expect(() =>
      validateAnalyzeBody(
        {
          frames: [
            {
              imageRef: 'data:text/plain;base64,ZmFrZQ==',
            },
          ],
          sessionId: 'web-session-1',
          tEndMs: 2_000,
          tStartMs: 1_000,
        },
        3,
      ),
    ).toThrowError(ValidationError)
  })

  it('rejects invalid frame time windows', () => {
    expect(() =>
      validateAnalyzeBody(
        {
          frames: [{ imageRef: tinyJpegDataUrl }],
          sessionId: 'web-session-1',
          tEndMs: 1_000,
          tStartMs: 2_000,
        },
        3,
      ),
    ).toThrowError(ValidationError)
  })

  it('accepts short webm audio chunks', () => {
    expect(parseAudioDataUrl('data:audio/webm;base64,ZmFrZQ==')).toMatchObject({
      mimeType: 'audio/webm',
    })
  })
})
