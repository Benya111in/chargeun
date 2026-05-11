import {
  assertMethod,
  assertSameOrigin,
  sendJson,
  validateBetaAccess,
} from './_shared'

export default function handler(req: any, res: any) {
  if (!assertMethod(req, res, ['POST']) || !assertSameOrigin(req, res)) {
    return
  }

  const access = validateBetaAccess(req, res)
  if (!access.ok) {
    return
  }

  sendJson(res, 200, {
    ok: true,
  })
}
