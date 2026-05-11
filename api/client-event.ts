import {
  assertMethod,
  assertSameOrigin,
  readJsonBody,
  sanitizeText,
  sendJson,
} from './_shared'

export default async function handler(req: any, res: any) {
  if (!assertMethod(req, res, ['POST']) || !assertSameOrigin(req, res)) {
    return
  }

  try {
    const body = await readJsonBody(req)
    const eventType = sanitizeText(body?.eventType, 80)

    if (eventType) {
      console.info(
        JSON.stringify({
          eventType,
          message: sanitizeText(body?.message, 240),
          route: sanitizeText(body?.route, 120),
          ts: Date.now(),
        }),
      )
    }

    sendJson(res, 202, {
      accepted: true,
    })
  } catch {
    sendJson(res, 202, {
      accepted: false,
    })
  }
}
