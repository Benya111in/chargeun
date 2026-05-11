import { assertMethod, getConfig, sendJson } from './_shared'

export default function handler(req: any, res: any) {
  if (!assertMethod(req, res, ['GET'])) {
    return
  }

  const config = getConfig()

  sendJson(res, 200, {
    betaAccessConfigured:
      config.betaCodes.length > 0 || process.env.VERCEL_ENV !== 'production',
    hasOpenAiKey: config.hasOpenAiKey,
    maxFramesPerAnalysis: config.maxFramesPerAnalysis,
    maxSessionMinutes: config.maxSessionMinutes,
    models: {
      analysis: config.analysisModel,
      transcription: config.transcribeModel,
    },
    rateLimit: {
      analyzePerMinute: 18,
      transcribePerMinute: 10,
    },
    status: config.hasOpenAiKey ? 'ready' : 'missing-openai-key',
    version: config.version,
  })
}
