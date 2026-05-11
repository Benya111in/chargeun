import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  WebApiError,
  analyzeFrameWindow,
  getWebApiHealth,
} from './web-analysis-api'

const packet = {
  asrText: '비상구를 따라 이동하세요.',
  keyframes: ['web-frame://session/1/0'],
  objectHints: [
    {
      bbox: [0.1, 0.1, 0.2, 0.2],
      conf: 0.7,
      label: '비상구',
    },
  ],
  ocrTokens: ['비상구', '계단'],
  sessionId: 'session-1',
  tEndMs: 2_000,
  tStartMs: 1_000,
  uiElements: [],
}

describe('web-analysis-api', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads web API health metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            betaAccessConfigured: true,
            hasOpenAiKey: true,
            maxFramesPerAnalysis: 3,
            maxSessionMinutes: 10,
            models: {
              analysis: 'gpt-5.4-mini',
              transcription: 'gpt-4o-mini-transcribe',
            },
            rateLimit: {
              analyzePerMinute: 18,
              transcribePerMinute: 10,
            },
            status: 'ready',
            version: 'test',
          }),
        ),
      ),
    )

    await expect(getWebApiHealth()).resolves.toMatchObject({
      hasOpenAiKey: true,
      models: {
        analysis: 'gpt-5.4-mini',
      },
    })
  })

  it('validates perception packet responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          packet,
          source: 'openai-responses',
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await analyzeFrameWindow({
      betaCode: 'beta',
      frames: [
        {
          height: 540,
          imageRef: 'data:image/jpeg;base64,ZmFrZQ==',
          origin: 'browser',
          sessionId: 'session-1',
          tsMs: 1_000,
          width: 960,
        },
      ],
      sessionId: 'session-1',
      tEndMs: 2_000,
      tStartMs: 1_000,
    })

    expect(result.packet.ocrTokens).toEqual(['비상구', '계단'])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/analyze-frame-window',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-beta-code': 'beta',
        }),
        method: 'POST',
      }),
    )
  })

  it('throws a typed error for rejected beta access', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'beta_code_required',
            message: '베타 접근 코드가 필요합니다.',
          }),
          { status: 401 },
        ),
      ),
    )

    await expect(
      analyzeFrameWindow({
        betaCode: '',
        frames: [],
        sessionId: 'session-1',
        tEndMs: 2_000,
        tStartMs: 1_000,
      }),
    ).rejects.toMatchObject({
      code: 'beta_code_required',
      status: 401,
    } satisfies Partial<WebApiError>)
  })
})
