import { z } from 'zod'

const knownHazardTypes = [
  'fire',
  'earthquake',
  'heavy_rain',
  'typhoon',
  'heatwave',
  'coldwave',
  'heavy_snow',
] as const

export const hazardTypeSchema = z.enum([...knownHazardTypes, 'unknown'])
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

export const learningTeachBackOptionRoleSchema = z.enum(['correct', 'contrast'])

export const learningTeachBackOptionKindSchema = z.enum([
  'object',
  'person',
  'place',
  'signal',
  'state',
])

const teachBackGuidanceLikePattern =
  /(하세요|해요|가요|봐요|말해요|않아요|피해요|두어요|잡아요|기다려요|확인해요|요)$/

export const learningTeachBackOptionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).max(24),
    role: learningTeachBackOptionRoleSchema,
    kind: learningTeachBackOptionKindSchema,
    feedback: z.string().min(1).max(120),
    officialRuleIds: z.array(z.string().min(1)).optional(),
    evidenceRefs: z.array(z.string().min(1)),
  })
  .superRefine((value, ctx) => {
    if (value.label === '잘 모르겠어요') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'teach-back options cannot use a fixed unsure answer',
        path: ['label'],
      })
    }

    if (teachBackGuidanceLikePattern.test(value.label)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'teach-back option labels must be objects, places, people, signals, or states, not action guidance',
        path: ['label'],
      })
    }

    if (value.role === 'correct' && !value.officialRuleIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'correct teach-back options require official rule ids',
        path: ['officialRuleIds'],
      })
    }

    if (value.role === 'contrast' && value.officialRuleIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'contrast teach-back options cannot be grounded as official actions',
        path: ['officialRuleIds'],
      })
    }
  })

export const learningTeachBackSchema = z
  .object({
    prompt: z.string().min(1).max(80),
    correctOptionId: z.string().min(1),
    options: z.array(learningTeachBackOptionSchema).min(2).max(3),
    reviewPrompt: z.string().min(1).max(120),
  })
  .superRefine((value, ctx) => {
    const ids = new Set(value.options.map((option) => option.id))
    const labels = new Set(value.options.map((option) => option.label))
    const kinds = new Set(value.options.map((option) => option.kind))
    const correctOptions = value.options.filter(
      (option) => option.role === 'correct',
    )

    if (ids.size !== value.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'teach-back option ids must be unique',
        path: ['options'],
      })
    }

    if (labels.size !== value.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'teach-back option labels must be unique',
        path: ['options'],
      })
    }

    if (kinds.size !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'teach-back options in one question must use the same semantic kind',
        path: ['options'],
      })
    }

    if (correctOptions.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'teach-back questions require exactly one correct option',
        path: ['options'],
      })
    }

    if (!ids.has(value.correctOptionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'correctOptionId must reference an existing option',
        path: ['correctOptionId'],
      })
    }

    if (
      correctOptions.length === 1 &&
      correctOptions[0]?.id !== value.correctOptionId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'correctOptionId must reference the correct option',
        path: ['correctOptionId'],
      })
    }
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
  teachBack: learningTeachBackSchema.optional(),
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

export const officialSourceRecordSchema = z.object({
  sourceId: z.string().min(1),
  kind: z.enum([
    'html',
    'pdf',
    'video',
    'video_transcript',
    'poster',
    'guidebook',
  ]),
  title: z.string().min(1),
  agency: z.string().min(1),
  publisher: z.string().min(1),
  canonicalUrl: z.string().url(),
  originalUrl: z.string().url().optional(),
  licenseLabel: z.string().min(1),
  rightsNotes: z.string().min(1),
  rawStoragePolicy: z.enum([
    'metadata_only',
    'local_manual_only',
    'cache_ignored',
  ]),
  hazards: z.array(z.enum(knownHazardTypes)).min(1),
  retrievedAt: z.string().min(1),
  updatedAt: z.string().min(1).optional(),
})

export const officialSourceChunkSchema = z.object({
  chunkId: z.string().min(1),
  sourceId: z.string().min(1),
  hazard: z.enum(knownHazardTypes),
  phase: z.string().min(1),
  ruleIds: z.array(z.string().min(1)).min(1),
  heading: z.string().min(1),
  paraphraseKo: z.string().min(1).max(260),
  easyKo: z.string().min(1).max(120),
  keywords: z.array(z.string().min(1)).min(1),
  canonicalUrl: z.string().url(),
  sourceAnchor: z.string().min(1).optional(),
  audience: z.enum(['learner', 'teacher', 'caregiver', 'operator']),
  reviewStatus: z.enum(['approved', 'needs_human_review']),
  updatedAt: z.string().min(1),
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
      sourceUrl: z.string().url().optional(),
      sourceChunkId: z.string().min(1).optional(),
      sourceHeading: z.string().min(1).optional(),
      easyText: z.string().min(1).optional(),
      retrievalScore: z.number().optional(),
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
    const hasTeachBack = Boolean(value.tracks.teachBack)

    if (value.segment.status === 'validated' && !hasActionCards) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'validated learning segments must include grounded action cards',
        path: ['tracks', 'action'],
      })
    }

    if (value.segment.status === 'validated' && !hasTeachBack) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validated learning segments must include teach-back checks',
        path: ['tracks', 'teachBack'],
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

    if (
      ['needs_review', 'blocked'].includes(value.segment.status) &&
      hasTeachBack
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'review or blocked learning segments cannot expose teach-back checks',
        path: ['tracks', 'teachBack'],
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

    if (hasActionCards && value.tracks.teachBack) {
      const actionLabels = new Set(
        value.tracks.action?.cards.map((card) => card.label) ?? [],
      )
      const actionRuleIds = new Set(
        value.tracks.action?.cards.flatMap((card) => card.officialRuleIds) ??
          [],
      )

      for (const [index, option] of value.tracks.teachBack.options.entries()) {
        if (actionLabels.has(option.label)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'teach-back option labels cannot duplicate learner action cards',
            path: ['tracks', 'teachBack', 'options', index, 'label'],
          })
        }

        if (
          option.role === 'correct' &&
          !option.officialRuleIds?.some((ruleId) => actionRuleIds.has(ruleId))
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'correct teach-back option must share an official rule id with an action card',
            path: ['tracks', 'teachBack', 'options', index, 'officialRuleIds'],
          })
        }
      }
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
  hazard: z.enum(knownHazardTypes),
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
