import { z } from 'zod'

export const hazardTypeSchema = z.enum(['fire', 'earthquake', 'unknown'])
export const captureSourceTypeSchema = z.enum([
  'monitor',
  'window',
  'browser_tab',
  'video_element',
])
export const safetyModeSchema = z.enum(['grounded', 'review_official'])
export const voiceIntentSchema = z.enum([
  'repeat',
  'easy',
  'why',
  'action',
  'report',
])

export const captureSessionSchema = z.object({
  id: z.string(),
  sourceType: captureSourceTypeSchema,
  platform: z.enum(['mac', 'windows', 'web']),
  startedAt: z.number(),
  hasAudio: z.boolean(),
  displayName: z.string().optional(),
})

export const segmentSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  hazard: hazardTypeSchema,
  phase: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  confidence: z.number().min(0).max(1),
  officialRuleIds: z.array(z.string()),
})

export const overlayTargetSchema = z.object({
  label: z.string(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  frameRange: z.tuple([z.number(), z.number()]),
})

export const trackSetSchema = z.object({
  basic: z.string().min(1),
  easy: z.string().min(1),
  action: z.string().min(1).optional(),
  reason: z.string().min(1),
  caregiver: z.string().min(1).optional(),
  report: z.string().min(1).optional(),
})

export const segmentExplanationSchema = z
  .object({
    segmentId: z.string(),
    safetyMode: safetyModeSchema,
    doNot: z.string().min(1).optional(),
    tracks: trackSetSchema,
    overlayTargets: z.array(overlayTargetSchema),
  })
  .superRefine((value, ctx) => {
    if (value.safetyMode === 'review_official' && value.tracks.action) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'review_official mode cannot expose action text',
        path: ['tracks', 'action'],
      })
    }
  })

export const perceptionPacketSchema = z.object({
  sessionId: z.string(),
  tStartMs: z.number(),
  tEndMs: z.number(),
  asrText: z.string(),
  ocrTokens: z.array(z.string()),
  uiElements: z.array(
    z.object({
      label: z.string(),
      bbox: z.array(z.number()).length(4),
      conf: z.number().min(0).max(1),
    }),
  ),
  objectHints: z.array(
    z.object({
      label: z.string(),
      bbox: z.array(z.number()).length(4),
      conf: z.number().min(0).max(1),
    }),
  ),
  keyframes: z.array(z.string()),
})

export const ruleRecordSchema = z.object({
  rule_id: z.string(),
  hazard: z.enum(['fire', 'earthquake']),
  phase: z.string(),
  when: z.array(z.string()).min(1),
  action: z.string().min(1),
  do_not: z.string().optional(),
  why: z.string().min(1),
  caregiver: z.string().optional(),
  report_script: z.string().optional(),
  source_title: z.string().min(1),
  source_url: z.string().url(),
  updated_at: z.string().min(1),
})

export const voiceReplySchema = z.object({
  text: z.string().min(1),
  audioRef: z.string().optional(),
})
