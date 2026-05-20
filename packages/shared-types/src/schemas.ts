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

export const captureSampleOriginSchema = z.enum(['browser', 'native'])
const bboxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .superRefine((value, ctx) => {
    const [x, y, width, height] = value

    if (x < 0 || y < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'bbox origin must be non-negative',
      })
    }

    if (width <= 0 || height <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'bbox size must be positive',
      })
    }
  })

export const segmentSchema = z
  .object({
    id: z.string(),
    sessionId: z.string(),
    hazard: hazardTypeSchema,
    phase: z.string(),
    startMs: z.number(),
    endMs: z.number(),
    confidence: z.number().min(0).max(1),
    officialRuleIds: z.array(z.string()),
  })
  .superRefine((value, ctx) => {
    if (value.endMs < value.startMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'segment endMs must be greater than or equal to startMs',
        path: ['endMs'],
      })
    }
  })

export const overlayTargetSchema = z
  .object({
    label: z.string(),
    bbox: bboxSchema,
    frameRange: z.tuple([z.number(), z.number()]),
  })
  .superRefine((value, ctx) => {
    if (value.frameRange[1] < value.frameRange[0]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'overlay frame range end must be greater than or equal to start',
        path: ['frameRange'],
      })
    }
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
    if (value.safetyMode === 'review_official') {
      if (value.tracks.action) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'review_official mode cannot expose action text',
          path: ['tracks', 'action'],
        })
      }

      if (value.tracks.report) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'review_official mode cannot expose report text',
          path: ['tracks', 'report'],
        })
      }

      if (value.doNot) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'review_official mode cannot expose do-not guidance',
          path: ['doNot'],
        })
      }
    }
  })

export const learningSegmentStatusSchema = z.enum([
  'draft',
  'validated',
  'needs_review',
  'blocked',
])

export const learningReadingLevelSchema = z.enum([
  'very_easy',
  'easy',
  'standard',
])

export const learningSegmentSchema = z
  .object({
    segmentId: z.string().min(1),
    sessionId: z.string().min(1),
    sourceId: z.string().min(1),
    hazard: hazardTypeSchema,
    phase: z.string().min(1),
    decisionPoint: z.string().min(1),
    startMs: z.number(),
    endMs: z.number(),
    confidence: z.number().min(0).max(1),
    status: learningSegmentStatusSchema,
  })
  .superRefine((value, ctx) => {
    if (value.endMs < value.startMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'learning segment endMs must be greater than or equal to startMs',
        path: ['endMs'],
      })
    }
  })

export const learningActionCardSchema = z.object({
  label: z.string().min(1),
  order: z.number().int().positive(),
  officialRuleIds: z.array(z.string().min(1)).min(1),
})

export const learningTrackSetSchema = z.object({
  easy: z.object({
    text: z.string().min(1).max(140),
    maxReadingLevel: learningReadingLevelSchema,
  }),
  action: z
    .object({
      cards: z.array(learningActionCardSchema).min(1).max(3),
    })
    .optional(),
  reason: z.object({
    text: z.string().min(1).max(180),
    officialRuleIds: z.array(z.string().min(1)),
  }),
  doNot: z
    .object({
      text: z.string().min(1).max(180),
      officialRuleIds: z.array(z.string().min(1)).min(1),
    })
    .optional(),
  caregiver: z
    .object({
      script: z.string().min(1),
      correctionHint: z.string().min(1),
    })
    .optional(),
  report: z
    .object({
      text: z.string().min(1).max(180),
      emergencyNumbers: z.array(z.string().min(1)),
      condition: z.string().min(1),
    })
    .optional(),
})

export const evidenceBundleSchema = z.object({
  visualEvidence: z.array(
    z.object({
      frameTimeMs: z.number(),
      observation: z.string().min(1),
      bbox: bboxSchema.optional(),
    }),
  ),
  ocrEvidence: z.array(
    z.object({
      text: z.string().min(1),
      timeMs: z.number(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  asrEvidence: z.array(
    z.object({
      text: z.string().min(1),
      startMs: z.number(),
      endMs: z.number(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  ruleEvidence: z.array(
    z.object({
      ruleId: z.string().min(1),
      title: z.string().min(1),
      matchedText: z.string().min(1),
      sourceName: z.string().min(1),
    }),
  ),
  modelInference: z.array(
    z.object({
      claim: z.string().min(1),
      basedOn: z.array(z.enum(['visual', 'ocr', 'asr', 'rule'])).min(1),
    }),
  ),
})

export const suppressedCandidateSchema = z.object({
  candidate: z.string().min(1),
  category: z.enum([
    'unsafe_action',
    'unsupported_action',
    'too_many_actions',
    'unclear_evidence',
    'not_for_learner',
  ]),
  reason: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)),
})

export const structuredLearningExplanationSchema = z
  .object({
    version: z.literal('slowlearner_multitrack_v1'),
    segment: learningSegmentSchema,
    tracks: learningTrackSetSchema,
    evidence: evidenceBundleSchema,
    suppressedCandidates: z.array(suppressedCandidateSchema),
    validation: z.object({
      schemaValid: z.boolean(),
      hasGroundedAction: z.boolean(),
      learnerSafe: z.boolean(),
      requiresHumanReview: z.boolean(),
      warnings: z.array(z.string()),
    }),
  })
  .superRefine((value, ctx) => {
    const hasActionCards = Boolean(value.tracks.action?.cards.length)

    if (value.segment.status === 'validated' && !hasActionCards) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'validated learning segments must include grounded action cards',
        path: ['tracks', 'action'],
      })
    }

    if (
      ['needs_review', 'blocked'].includes(value.segment.status) &&
      hasActionCards
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'review or blocked learning segments cannot expose action cards',
        path: ['tracks', 'action'],
      })
    }

    if (hasActionCards && !value.validation.hasGroundedAction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'action cards require hasGroundedAction validation',
        path: ['validation', 'hasGroundedAction'],
      })
    }

    if (
      value.segment.status === 'validated' &&
      (value.validation.requiresHumanReview || !value.validation.learnerSafe)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'validated segments must be learner safe without required review',
        path: ['validation'],
      })
    }
  })

export const learningReviewSubmissionSchema = z.object({
  reviewerId: z.string().min(1),
  segmentId: z.string().min(1),
  submittedAt: z.string().min(1),
  lrsAnswers: z.record(z.string(), z.enum(['yes', 'no', 'na'])),
  learnerSimulationNotes: z.string().optional(),
  blockedReason: z.string().optional(),
  approvedForLearner: z.boolean(),
})

export const perceptionPacketSchema = z
  .object({
    sessionId: z.string(),
    tStartMs: z.number(),
    tEndMs: z.number(),
    asrText: z.string(),
    ocrTokens: z.array(z.string()),
    uiElements: z.array(
      z.object({
        label: z.string(),
        bbox: bboxSchema,
        conf: z.number().min(0).max(1),
      }),
    ),
    objectHints: z.array(
      z.object({
        label: z.string(),
        bbox: bboxSchema,
        conf: z.number().min(0).max(1),
      }),
    ),
    keyframes: z.array(z.string()),
  })
  .superRefine((value, ctx) => {
    if (value.tEndMs < value.tStartMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'packet tEndMs must be greater than or equal to tStartMs',
        path: ['tEndMs'],
      })
    }
  })

export const captureFrameSampleSchema = z.object({
  sessionId: z.string(),
  tsMs: z.number(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  imageRef: z.string().min(1),
  origin: captureSampleOriginSchema,
})

export const captureAudioSampleSchema = z.object({
  sessionId: z.string(),
  tsMs: z.number(),
  pcmRef: z.string().min(1),
  sampleRate: z.number().positive(),
  channels: z.number().int().positive(),
  origin: captureSampleOriginSchema,
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

export const macCaptureEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session-started'),
    sessionId: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    hasAudio: z.boolean(),
  }),
  z.object({
    type: z.literal('frame'),
    sessionId: z.string(),
    tsMs: z.number(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    pixelBufferRef: z.string().min(1),
  }),
  z.object({
    type: z.literal('audio'),
    sessionId: z.string(),
    tsMs: z.number(),
    pcmRef: z.string().min(1),
    sampleRate: z.number().positive(),
    channels: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('error'),
    sessionId: z.string(),
    code: z.string().min(1),
    message: z.string().min(1),
  }),
  z.object({
    type: z.literal('session-stopped'),
    sessionId: z.string(),
  }),
])

export const voiceReplySchema = z.object({
  text: z.string().min(1),
  audioRef: z.string().optional(),
})
