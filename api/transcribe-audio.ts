import OpenAI, { toFile } from 'openai'

import {
  ValidationError,
  assertMethod,
  assertRateLimit,
  assertSameOrigin,
  getConfig,
  getFileExtension,
  handleApiError,
  parseAudioDataUrl,
  readJsonBody,
  sanitizeText,
  sendJson,
  validateBetaAccess,
} from './_shared'

export default async function handler(req: any, res: any) {
  if (!assertMethod(req, res, ['POST']) || !assertSameOrigin(req, res)) {
    return
  }

  const access = validateBetaAccess(req, res)
  if (!access.ok) {
    return
  }

  try {
    const config = getConfig()
    const body = await readJsonBody(req)
    const sessionId = sanitizeText(body?.sessionId, 120)
    const durationMs = Math.max(0, Number(body?.durationMs) || 0)

    if (!sessionId) {
      throw new ValidationError('session_id_required', 'sessionId is required.')
    }

    const audio = parseAudioDataUrl(body?.audioDataUrl)

    if (!config.hasOpenAiKey) {
      sendJson(res, 503, {
        error: 'openai_key_missing',
        message: '서버에 OpenAI API key가 설정되지 않았습니다.',
      })
      return
    }

    if (
      !assertRateLimit({
        betaCode: access.betaCode,
        endpoint: 'transcribe-audio',
        limit: 10,
        req,
        res,
        sessionId,
      })
    ) {
      return
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
    const file = await toFile(
      audio.buffer,
      `screen-share-audio.${getFileExtension(audio.mimeType)}`,
      { type: audio.mimeType },
    )
    const transcription = await client.audio.transcriptions.create({
      file,
      model: config.transcribeModel,
      response_format: 'json',
    } as any)

    sendJson(res, 200, {
      durationMs,
      source: config.transcribeModel,
      transcript: sanitizeText((transcription as any).text ?? '', 4000),
    })
  } catch (error) {
    handleApiError(res, error)
  }
}
