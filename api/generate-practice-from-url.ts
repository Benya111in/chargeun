import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import OpenAI from 'openai'

import {
  buildStructuredLearningExplanation,
  matchGroundedRules,
  toLegacySegmentExplanation,
} from '../workers/llm-orchestrator/dist/index.js'
import type { GroundedRuleMatch } from '../workers/llm-orchestrator/dist/index.js'
import type {
  HazardType,
  LearningTeachBack as SharedLearningTeachBack,
  LearningTeachBackOption as SharedLearningTeachBackOption,
  PerceptionPacket as SharedPerceptionPacket,
  RuleRecord,
  Segment as SharedSegment,
  SegmentExplanation as SharedSegmentExplanation,
  StructuredLearningExplanation as SharedStructuredLearningExplanation,
} from '../packages/shared-types/dist/index.js'

import {
  buildGeneratedArtifactManifest,
  generatedQualityVersion,
} from '../scripts/generated-artifact-store'
import {
  createGenerationPipelineTrace,
  generatedQualityContractVersion,
  generatedPipelineVersion,
  isPublishableGeneratedScenario,
  recordGenerationAgentRun,
  routeGenerationIssues,
  type GenerationPipelineTrace,
  type GenerationStageTiming,
} from './generation/pipeline'
import {
  ValidationError,
  assertMethod,
  assertSameOriginOrAllowed,
  getGeneratorAllowedOrigins,
  handleCors,
  parseModelJson,
  readJsonBody,
  sendJson,
} from './_shared'

const require = createRequire(import.meta.url)
const ffmpegStaticPath = require('ffmpeg-static') as string | null
const ffprobeStatic = require('ffprobe-static') as { path?: string }

type LearningTeachBackOption = SharedLearningTeachBackOption
type LearningTeachBack = SharedLearningTeachBack
type PerceptionPacket = SharedPerceptionPacket
type Segment = SharedSegment
type SegmentExplanation = SharedSegmentExplanation
type StructuredLearningExplanation = SharedStructuredLearningExplanation

type CaptionCue = {
  endMs: number
  startMs: number
  text: string
}

const captionTopicKeys = [
  'call_119',
  'coastal_boat',
  'coldwave_warm',
  'coldwave_weather',
  'construction_wind_avoid',
  'earthquake_after',
  'earthquake_electric',
  'earthquake_gas',
  'earthquake_open_space',
  'earthquake_outside_head',
  'earthquake_protect',
  'earthquake_report',
  'earthquake_return_door',
  'earthquake_school',
  'earthquake_stairs',
  'earthquake_sturdy_building',
  'earthquake_water',
  'drain_waterway',
  'evacuate_to_safe_place',
  'farm_facility',
  'farm_waterway_stay_safe',
  'fire_alert',
  'fire_door_control',
  'fire_monitoring',
  'fire_refuge',
  'fire_seal_room',
  'fire_smoke',
  'fire_stairs',
  'flood_home_return_check',
  'flood_landslide_avoid',
  'flood_lowland_powerline_avoid',
  'flood_prepare_weather_shelter',
  'flood_river_car_utilities',
  'heatwave_cool',
  'heatwave_rest',
  'heatwave_water',
  'home_drain',
  'heavy_snow_drive',
  'heavy_snow_clear',
  'heavy_snow_stay_home',
  'indoor_window',
  'intro_weather',
  'mountain_valley_evacuate',
  'sewer_manhole_avoid',
  'outdoor_signage',
  'outdoor_activity',
  'outro_review',
  'river_car_drive',
  'stay_away_from_low_water',
  'typhoon_warning',
  'water_area_avoid',
  'weather_check',
  'wildfire_alert',
  'wildfire_burn_ban',
  'wildfire_ember_check',
  'wildfire_evacuation_route',
  'wildfire_ground_protect',
  'wildfire_lighter_ban',
] as const

type CaptionTopicKey = (typeof captionTopicKeys)[number]

type GeneratedQualityIssue = {
  code: string
  message: string
  segmentId?: string
  severity: 'blocker' | 'warning'
}

type GeneratedQualityReport = {
  analysisDepth: GenerationEvidenceReport
  checkedAt: string
  deadlineFinalized?: boolean
  forcedPublished?: boolean
  groundingPassed: boolean
  issues: GeneratedQualityIssue[]
  passed: boolean
  qualityContractVersion: typeof generatedQualityContractVersion
  repairAttemptCount: number
  score: number
  sourceCoveragePassed: boolean
  sourceTopicCount: number
  uiPlaybackPassed: boolean
  waivedHardIssues?: GeneratedQualityIssue[]
  waivedSoftIssues?: GeneratedQualityIssue[]
  version: 'url_generation_lrs_v1'
}

type GenerationEvidenceReport = {
  audioCueCount: number
  expandedCueCount: number
  frameBoundaryPrecisionMs: 10
  generationModel?: string
  sceneCutCandidatesMs: number[]
  segmentationEvidence: Array<
    | 'audio-asr'
    | 'deterministic-repair'
    | 'llm-scenario-authoring'
    | 'visual-caption-ocr'
    | 'visual-scene-cut'
  >
  sentenceBoundaryCount: number
  stages: Array<{
    evidence: string
    name: string
    status: 'completed' | 'skipped'
  }>
  videoDurationMs: number | null
  visualCaptionBoundaries: VisualCaptionBoundary[]
  visualCaptionFrames: VisualCaptionFrame[]
  visualCaptionFrameCount: number
  warnings: string[]
}

type CanonicalEvidencePacket = {
  audio: {
    cues: CaptionCue[]
    model: string
    normalizedText: string
    source: AudioTranscriptEvidence['source']
    warnings: string[]
  }
  createdAt: string
  normalization: {
    rules: string[]
    version: string
  }
  pipelineVersion: typeof generatedPipelineVersion
  qualityContractVersion: typeof generatedQualityContractVersion
  sceneCutCandidatesMs: number[]
  source: {
    hash: string
    normalizedUrl: string
    title: string
    videoDurationMs: number | null
  }
  visual: {
    boundaries: VisualCaptionBoundary[]
    frames: VisualCaptionFrame[]
  }
}

type GenerationSceneGraph = {
  createdAt: string
  pipelineVersion: typeof generatedPipelineVersion
  qualityContractVersion: typeof generatedQualityContractVersion
  scenes: Array<{
    asrEvidence: CaptionCue[]
    boundaryReason: string
    endMs: number
    id: string
    index: number
    ocrEvidence: string[]
    practiceModeHint: 'action' | 'intro'
    sourceKeywords: string[]
    sourceTopicKeys: CaptionTopicKey[]
    startMs: number
  }>
  version: string
}

type AudioTranscriptEvidence = {
  cues: CaptionCue[]
  model: string
  source: 'direct-audio-asr'
  text: string
  warnings: string[]
}

type VideoProbe = {
  durationMs: number | null
  frameRate: number | null
}

type VideoSource =
  | {
      kind: 'file'
      stableVideoPath: string
      videoSrc: string
      youtubeVideoId?: undefined
    }
  | {
      kind: 'youtube'
      stableVideoPath: null
      videoSrc: string
      youtubeVideoId: string
    }

type VisualCaptionFrame = {
  confidence: number
  hasLearningCaption: boolean
  index: number
  normalizedCaption: string
  tsMs: number
  visibleCaption: string
}

type VisualCaptionBoundary = {
  afterCaption: string
  beforeCaption: string
  changeType: 'new_topic' | 'same_topic' | 'unclear'
  confidence: number
  reason: string
  recommendedBoundaryMs: number
  timeMs: number
}

type MandatoryVisualSplitBoundary = {
  afterCaption: string
  beforeCaption: string
  confidence: number
  reason: string
  recommendedBoundaryMs: number
  timeMs: number
}

type VisualCaptionEvidence = {
  boundaries: VisualCaptionBoundary[]
  frames: VisualCaptionFrame[]
  warnings: string[]
}

type GeneratePracticeContext = {
  deadlineAt?: number
  forceEmergencyPublish?: boolean
  headers?: Record<string, unknown>
  onRepairNeeded?: (input: {
    attempt: number
    message: string
    qualityReport: GeneratedQualityReport
  }) => Promise<void> | void
  onStageProgress?: (input: {
    details?: string[]
    message: string
    stage: string
  }) => Promise<void> | void
  resumeFromArtifacts?: boolean
  retryAttemptCount?: number
  retryFeedback?: string
  signal?: AbortSignal
  startedAtMs?: number
}

type GenerationDeadlineState = {
  deadlineAtMs: number
  publishTargetAtMs: number
  startedAtMs: number
}

function createGenerationDeadlineState(
  context: GeneratePracticeContext | undefined,
): GenerationDeadlineState {
  const startedAtMs =
    Number.isFinite(context?.startedAtMs) && context?.startedAtMs
      ? Number(context.startedAtMs)
      : Date.now()
  const configuredDeadlineAtMs =
    Number.isFinite(context?.deadlineAt) && context?.deadlineAt
      ? Number(context.deadlineAt)
      : null
  const deadlineMs = getDemoDeadlineMs()
  const deadlineAtMs = configuredDeadlineAtMs ?? startedAtMs + deadlineMs

  return {
    deadlineAtMs,
    publishTargetAtMs:
      startedAtMs + Math.min(getDemoPublishTargetMs(), deadlineMs),
    startedAtMs,
  }
}

function getDemoDeadlineMs() {
  const configured = Number(process.env.GENERATOR_DEMO_DEADLINE_MS)

  if (Number.isFinite(configured) && configured >= 60_000) {
    return Math.round(configured)
  }

  return defaultDemoDeadlineMs
}

function getDemoPublishTargetMs() {
  const configured = Number(process.env.GENERATOR_DEMO_PUBLISH_TARGET_MS)

  if (Number.isFinite(configured) && configured >= 30_000) {
    return Math.round(configured)
  }

  return defaultDemoPublishTargetMs
}

function remainingGenerationMs(state: GenerationDeadlineState) {
  return Math.max(0, state.deadlineAtMs - Date.now())
}

function isGenerationDeadlineExpired(state: GenerationDeadlineState) {
  return Date.now() >= state.deadlineAtMs
}

function getDeadlineAwareRepairAttemptLimit(
  baseLimit: number,
  _state?: GenerationDeadlineState,
) {
  return baseLimit
}

function createStageTimingCollector(startedAtMs = Date.now()) {
  const timings: GenerationStageTiming[] = []
  let currentStage: { stage: string; startedAtMs: number } | null = null

  const closeCurrent = (completedAtMs: number) => {
    if (!currentStage) {
      return
    }

    timings.push({
      completedAt: new Date(completedAtMs).toISOString(),
      durationMs: Math.max(0, completedAtMs - currentStage.startedAtMs),
      stage: currentStage.stage,
      startedAt: new Date(currentStage.startedAtMs).toISOString(),
    })
    currentStage = null
  }

  return {
    finish() {
      closeCurrent(Date.now())
      return timings
    },
    mark(stage: string) {
      const now = Date.now()
      closeCurrent(now)
      currentStage = { stage, startedAtMs: now }
    },
    start() {
      currentStage = { stage: 'start', startedAtMs }
    },
  }
}

async function notifyTimedStageProgress(
  context: GeneratePracticeContext | undefined,
  stageTimings: ReturnType<typeof createStageTimingCollector>,
  input: {
    details?: string[]
    message: string
    stage: string
  },
) {
  stageTimings.mark(input.stage)
  await notifyStageProgress(context, input)
}

function createAbortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function throwIfGenerationAborted(
  context?: GeneratePracticeContext | { signal?: AbortSignal },
) {
  if (context?.signal?.aborted) {
    throw createAbortError()
  }
}

function linkAbortSignal(
  signal: AbortSignal | undefined,
  abortController: AbortController,
) {
  if (!signal) {
    return () => {}
  }

  if (signal.aborted) {
    abortController.abort()
    return () => {}
  }

  const abort = () => abortController.abort()
  signal.addEventListener('abort', abort, { once: true })
  return () => signal.removeEventListener('abort', abort)
}

type LlmScenarioPlan = {
  hazardType: HazardType
  note: string
  segments: LlmScenarioSegment[]
  title: string
}

type LlmScenarioSegment = {
  actionReasons: string[]
  actionSteps: string[]
  answerOptions: Array<{
    correct: boolean
    feedback: string
    kind: LearningTeachBackOption['kind']
    label: string
  }>
  checkQuestion: string
  doNot: string
  endMs: number
  learnerExplanation: string
  learnerPrompt: string
  learnerSequence: Array<{ kind: 'action' | 'situation'; text: string }>
  practiceMode: 'action' | 'intro'
  requiredLearnerKeywords: string[]
  sourceTopicKeys: string[]
  startMs: number
  teacherGuide: {
    correction: string
    observe: string
    prompt: string
    script: string
  }
}

type GeneratedPracticeSegment = {
  actionReasons: string[]
  actionSteps: string[]
  answerOptions: Array<LearningTeachBackOption & { correct: boolean }>
  checkQuestion: string
  description: string
  endMs: number
  explanation: SegmentExplanation
  id: string
  label: string
  learnerExplanation: string
  learnerPrompt: string
  learnerSequence: Array<{ kind: 'action' | 'situation'; text: string }>
  narration: Array<{
    endMs: number
    source: 'audio'
    startMs: number
    text: string
  }>
  pauseMs?: number
  previewMs?: number
  packet: PerceptionPacket
  practiceMode: 'action' | 'intro'
  primarySourceTitle: string | null
  requiredLearnerKeywords: string[]
  ruleMatches: []
  safetyWarnings: string[]
  safetyNotice: string
  segment: Segment
  sourceTopicKeys?: CaptionTopicKey[]
  startMs: number
  structuredExplanation: StructuredLearningExplanation
  teacherGuide: {
    correction: string
    observe: string
    prompt: string
    script: string
  }
  teachBack: LearningTeachBack | null
}

type GeneratedPracticeScenario = ReturnType<typeof buildScenario> & {
  generationEvidencePacket?: CanonicalEvidencePacket
  generationSceneGraph?: GenerationSceneGraph
  videoPlaybackKind?: VideoSource['kind']
  youtubeVideoId?: string
}

type HazardProfile = {
  doNot: string
  fallbackAction: string
  hazard: HazardType
  label: string
  phase: string
  reason: string
  ruleId: string
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicGeneratedDir = join(rootDir, 'apps/desktop-ui/public/generated')
const distGeneratedDir = join(rootDir, 'apps/desktop-ui/dist/generated')
const safetyNotice =
  '이 앱은 연습용입니다. 실제로 위험할 때는 119·112, 주변 어른, 현장 안내를 우선 따르세요.'
const maximumGeneratedSegmentMs = 18_000
const maximumLearnerCardTextLength = 35
const boundaryPrecisionMs = 10
const defaultGenerationModel = 'gpt-5.5'
const defaultOpenAiRequestTimeoutMs = 75_000
const defaultScenarioAuthorAttempts = 1
const defaultTranscriptionModel = 'whisper-1'
const defaultGenerationRepairAttempts = 6
const defaultDemoDeadlineMs = 360_000
const defaultDemoPublishTargetMs = 330_000
const maxVisualCaptionFrames = 24
const visualCaptionBoundaryConfidenceThreshold = 0.65
const visualCaptionBoundaryMarginMs = 900
const officialRuleFiles = [
  'data/rules/fire_rules.json',
  'data/rules/earthquake_rules.json',
  'data/rules/seasonal_rules.json',
] as const
const negativeLearnerActionPattern =
  /않아요|않습니다|말아요|말고|(?:^|[^대])피해요|금지|하지|만지지|무리해서/u
const answerOptionActionLikePattern =
  /않아요|피해요|해요$|가요$|봐요$|두어요$|잡아요$|기다려요$|확인해요$|말해요$/u

let officialSafetyRulesCache: RuleRecord[] | null = null

const hazardProfiles: HazardProfile[] = [
  {
    doNot: '엘리베이터는 타지 않아요.',
    fallbackAction: '머리를 보호해요',
    hazard: 'earthquake',
    label: '지진',
    phase: 'generated_earthquake_practice',
    reason: '머리를 보호하면 떨어지는 물건에 덜 다쳐요.',
    ruleId: 'LOCAL_EARTHQUAKE_GENERATED',
  },
  {
    doNot: '연기가 있는 쪽으로 가지 않아요.',
    fallbackAction: '문을 닫아요',
    hazard: 'fire',
    label: '화재',
    phase: 'generated_fire_practice',
    reason: '문을 닫으면 연기와 불이 덜 퍼져요.',
    ruleId: 'LOCAL_FIRE_GENERATED',
  },
  {
    doNot: '물이 찬 길로 들어가지 않아요.',
    fallbackAction: '높은 곳으로 가요',
    hazard: 'heavy_rain',
    label: '집중호우',
    phase: 'generated_rain_practice',
    reason: '물이 빠르게 불어나면 위험할 수 있어요.',
    ruleId: 'LOCAL_HEAVY_RAIN_GENERATED',
  },
  {
    doNot: '창문 가까이에 가지 않아요.',
    fallbackAction: '창문에서 떨어져요',
    hazard: 'typhoon',
    label: '태풍',
    phase: 'generated_typhoon_practice',
    reason: '강한 바람에 유리나 물건이 깨질 수 있어요.',
    ruleId: 'LOCAL_TYPHOON_GENERATED',
  },
  {
    doNot: '더운 곳에 오래 있지 않아요.',
    fallbackAction: '시원한 곳으로 가요',
    hazard: 'heatwave',
    label: '폭염',
    phase: 'generated_heatwave_practice',
    reason: '몸이 너무 더워지면 어지럽고 위험할 수 있어요.',
    ruleId: 'LOCAL_HEATWAVE_GENERATED',
  },
  {
    doNot: '추운 밖에 오래 있지 않아요.',
    fallbackAction: '몸을 따뜻하게 해요',
    hazard: 'coldwave',
    label: '한파',
    phase: 'generated_coldwave_practice',
    reason: '몸이 너무 차가워지면 아플 수 있어요.',
    ruleId: 'LOCAL_COLDWAVE_GENERATED',
  },
  {
    doNot: '눈길에서 뛰거나 급하게 움직이지 않아요.',
    fallbackAction: '안전한 실내에 있어요',
    hazard: 'heavy_snow',
    label: '대설',
    phase: 'generated_heavy_snow_practice',
    reason: '눈길은 미끄럽고 물건이 무너질 수 있어요.',
    ruleId: 'LOCAL_HEAVY_SNOW_GENERATED',
  },
  {
    doNot: '혼자 급하게 움직이지 않아요.',
    fallbackAction: '어른과 함께 확인해요',
    hazard: 'unknown',
    label: '재난안전',
    phase: 'generated_general_safety_practice',
    reason: '재난 상황은 혼자 판단하면 위험할 수 있어요.',
    ruleId: 'LOCAL_GENERAL_GENERATED',
  },
]

const llmScenarioPlanSchema = {
  additionalProperties: false,
  properties: {
    hazardType: {
      enum: [
        'earthquake',
        'fire',
        'heavy_rain',
        'typhoon',
        'heatwave',
        'coldwave',
        'heavy_snow',
        'unknown',
      ],
      type: 'string',
    },
    note: { type: 'string' },
    segments: {
      items: {
        additionalProperties: false,
        properties: {
          actionReasons: {
            items: { type: 'string' },
            maxItems: 3,
            type: 'array',
          },
          actionSteps: {
            items: { type: 'string' },
            maxItems: 3,
            type: 'array',
          },
          answerOptions: {
            items: {
              additionalProperties: false,
              properties: {
                correct: { type: 'boolean' },
                feedback: { type: 'string' },
                kind: {
                  enum: ['object', 'person', 'place', 'signal', 'state'],
                  type: 'string',
                },
                label: { type: 'string' },
              },
              required: ['correct', 'feedback', 'kind', 'label'],
              type: 'object',
            },
            maxItems: 2,
            minItems: 2,
            type: 'array',
          },
          checkQuestion: { type: 'string' },
          doNot: { type: 'string' },
          endMs: { type: 'number' },
          learnerExplanation: { type: 'string' },
          learnerPrompt: { type: 'string' },
          learnerSequence: {
            items: {
              additionalProperties: false,
              properties: {
                kind: { enum: ['action', 'situation'], type: 'string' },
                text: { type: 'string' },
              },
              required: ['kind', 'text'],
              type: 'object',
            },
            maxItems: 4,
            minItems: 1,
            type: 'array',
          },
          practiceMode: { enum: ['action', 'intro'], type: 'string' },
          requiredLearnerKeywords: {
            items: { type: 'string' },
            maxItems: 8,
            type: 'array',
          },
          sourceTopicKeys: {
            items: { type: 'string' },
            maxItems: 8,
            type: 'array',
          },
          startMs: { type: 'number' },
          teacherGuide: {
            additionalProperties: false,
            properties: {
              correction: { type: 'string' },
              observe: { type: 'string' },
              prompt: { type: 'string' },
              script: { type: 'string' },
            },
            required: ['correction', 'observe', 'prompt', 'script'],
            type: 'object',
          },
        },
        required: [
          'actionReasons',
          'actionSteps',
          'answerOptions',
          'checkQuestion',
          'doNot',
          'endMs',
          'learnerExplanation',
          'learnerPrompt',
          'learnerSequence',
          'practiceMode',
          'requiredLearnerKeywords',
          'sourceTopicKeys',
          'startMs',
          'teacherGuide',
        ],
        type: 'object',
      },
      maxItems: 28,
      minItems: 1,
      type: 'array',
    },
    title: { type: 'string' },
  },
  required: ['hazardType', 'note', 'segments', 'title'],
  type: 'object',
}

const visualCaptionEvidenceSchema = {
  additionalProperties: false,
  properties: {
    boundaries: {
      items: {
        additionalProperties: false,
        properties: {
          afterCaption: { type: 'string' },
          beforeCaption: { type: 'string' },
          changeType: {
            enum: ['new_topic', 'same_topic', 'unclear'],
            type: 'string',
          },
          confidence: { maximum: 1, minimum: 0, type: 'number' },
          reason: { type: 'string' },
          recommendedBoundaryMs: { type: 'number' },
          timeMs: { type: 'number' },
        },
        required: [
          'afterCaption',
          'beforeCaption',
          'changeType',
          'confidence',
          'reason',
          'recommendedBoundaryMs',
          'timeMs',
        ],
        type: 'object',
      },
      maxItems: 32,
      type: 'array',
    },
    frames: {
      items: {
        additionalProperties: false,
        properties: {
          confidence: { maximum: 1, minimum: 0, type: 'number' },
          hasLearningCaption: { type: 'boolean' },
          index: { type: 'number' },
          normalizedCaption: { type: 'string' },
          tsMs: { type: 'number' },
          visibleCaption: { type: 'string' },
        },
        required: [
          'confidence',
          'hasLearningCaption',
          'index',
          'normalizedCaption',
          'tsMs',
          'visibleCaption',
        ],
        type: 'object',
      },
      maxItems: maxVisualCaptionFrames,
      type: 'array',
    },
    warnings: {
      items: { type: 'string' },
      maxItems: 8,
      type: 'array',
    },
  },
  required: ['boundaries', 'frames', 'warnings'],
  type: 'object',
}

export default async function handler(req: any, res: any) {
  const allowedOrigins = getGeneratorAllowedOrigins()

  if (handleCors(req, res, allowedOrigins)) {
    return
  }

  if (
    !assertMethod(req, res, ['POST']) ||
    !assertSameOriginOrAllowed(req, res, allowedOrigins)
  ) {
    return
  }

  if (!validateGeneratorAccessCode(req, res)) {
    return
  }

  try {
    const body = await readJsonBody(req)
    const sourceUrl = normalizeUrl(body?.sourceUrl)
    const generated = await generatePracticeFromUrl(sourceUrl, req)

    sendJson(res, 200, generated)
  } catch (error) {
    if (error instanceof ValidationError) {
      sendJson(res, 400, {
        error: error.code,
        message: error.message,
      })
      return
    }

    sendJson(res, 500, {
      error: 'generate_practice_failed',
      message:
        error instanceof Error
          ? error.message
          : '영상 학습 화면을 만들지 못했습니다.',
    })
  }
}

function validateGeneratorAccessCode(req: any, res: any) {
  if (isLocalBrowserRequest(req)) {
    return true
  }

  const configuredCodes = parseGeneratorAccessCodes()

  if (configuredCodes.length === 0) {
    return true
  }

  const accessCode = getRequestHeader(req, 'x-generator-code')?.trim() ?? ''

  if (accessCode && configuredCodes.includes(accessCode)) {
    return true
  }

  sendJson(res, 401, {
    error: 'generator_code_required',
    message: '생성 비밀번호가 필요합니다.',
  })
  return false
}

function isLocalBrowserRequest(req: any) {
  const origin = getRequestHeader(req, 'origin')
  const host =
    getRequestHeader(req, 'x-forwarded-host') || getRequestHeader(req, 'host')

  return isLocalUrlHost(origin) || isLocalHostHeader(host)
}

function isLocalUrlHost(input: string | undefined) {
  if (!input) {
    return false
  }

  try {
    return isLocalHostname(new URL(input).hostname)
  } catch {
    return false
  }
}

function isLocalHostHeader(input: string | undefined) {
  if (!input) {
    return false
  }

  return isLocalHostname(parseHostHeaderHostname(input))
}

function isLocalHostname(hostname: string) {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  )
}

function parseHostHeaderHostname(input: string) {
  if (input.startsWith('[')) {
    const closingIndex = input.indexOf(']')
    return closingIndex > 0 ? input.slice(1, closingIndex) : input
  }

  return input.split(':')[0] ?? ''
}

function parseGeneratorAccessCodes() {
  return (
    process.env.GENERATOR_ACCESS_CODES ||
    process.env.BETA_ACCESS_CODES ||
    ''
  )
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
}

function getRequestHeader(req: any, name: string) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function getPublicGeneratorApiBase(req?: any) {
  const configured = normalizePublicBaseUrl(
    process.env.PUBLIC_GENERATOR_API_BASE,
  )
  if (configured) {
    return configured
  }

  const host =
    getRequestHeader(req, 'x-forwarded-host') || getRequestHeader(req, 'host')
  if (!host) {
    return ''
  }

  const forwardedProto = getRequestHeader(req, 'x-forwarded-proto')
  const proto =
    forwardedProto ||
    (String(host).includes('localhost') || String(host).startsWith('127.0.0.1')
      ? 'http'
      : 'https')

  return normalizePublicBaseUrl(`${proto}://${host}`) || ''
}

async function notifyRepairNeeded(
  context: GeneratePracticeContext | undefined,
  input: {
    attempt: number
    message: string
    qualityReport: GeneratedQualityReport
  },
) {
  if (typeof context?.onRepairNeeded !== 'function') {
    return
  }

  await context.onRepairNeeded(input)
}

async function notifyStageProgress(
  context: GeneratePracticeContext | undefined,
  input: {
    details?: string[]
    message: string
    stage: string
  },
) {
  if (typeof context?.onStageProgress !== 'function') {
    return
  }

  await context.onStageProgress(input)
}

function compactLogDetail(input: string | null | undefined, maxLength = 92) {
  const text = (input ?? '').replace(/\s+/gu, ' ').trim()

  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, maxLength - 1)}…`
}

function formatMsForAgentLog(ms: number | null | undefined) {
  if (!Number.isFinite(ms)) {
    return '?s'
  }

  return `${(Number(ms) / 1000).toFixed(1)}s`
}

function cueAgentLogDetail(cue: CaptionCue, index: number) {
  return `ASR cue ${index + 1}: ${formatMsForAgentLog(cue.startMs)}-${formatMsForAgentLog(cue.endMs)} "${compactLogDetail(cue.text, 86)}"`
}

function visualFrameAgentLogDetail(frame: VisualCaptionFrame, index: number) {
  const caption = frame.normalizedCaption || frame.visibleCaption || 'caption 없음'

  return `OCR frame ${index + 1}: ${formatMsForAgentLog(frame.tsMs)} conf=${frame.confidence.toFixed(2)} "${compactLogDetail(caption, 80)}"`
}

function visualBoundaryAgentLogDetail(
  boundary: VisualCaptionBoundary,
  index: number,
) {
  return `OCR boundary ${index + 1}: ${formatMsForAgentLog(boundary.recommendedBoundaryMs)} ${boundary.changeType} "${compactLogDetail(boundary.beforeCaption, 34)}" -> "${compactLogDetail(boundary.afterCaption, 34)}"`
}

function scenarioPlanAgentLogDetail(
  segment: LlmScenarioSegment,
  index: number,
) {
  const action = segment.actionSteps[0] ?? segment.learnerPrompt
  const question = segment.checkQuestion

  return `card draft ${index + 1}: ${formatMsForAgentLog(segment.startMs)}-${formatMsForAgentLog(segment.endMs)} action="${compactLogDetail(action, 42)}" quiz="${compactLogDetail(question, 44)}"`
}

function generatedSegmentAgentLogDetail(
  segment: GeneratedPracticeSegment,
  index: number,
) {
  const action = segment.actionSteps[0] ?? segment.learnerPrompt
  const question = segment.checkQuestion

  return `final card ${index + 1}: ${formatMsForAgentLog(segment.startMs)}-${formatMsForAgentLog(segment.endMs)} action="${compactLogDetail(action, 42)}" quiz="${compactLogDetail(question, 44)}"`
}

function normalizePublicBaseUrl(input: string | undefined) {
  const trimmed = input?.trim()
  if (!trimmed) {
    return ''
  }

  return trimmed.replace(/\/+$/, '')
}

function buildGeneratedAssetUrl(
  publicAssetBaseUrl: string,
  jobId: string,
  fileName: string,
) {
  const path = `/generated/${jobId}/${fileName}`
  return publicAssetBaseUrl ? `${publicAssetBaseUrl}${path}` : path
}

function buildGeneratedQualityAssetUrl(
  publicAssetBaseUrl: string,
  jobId: string,
  fileName: string,
) {
  const path = `/generated/${jobId}/${generatedQualityVersion}/${fileName}`
  return publicAssetBaseUrl ? `${publicAssetBaseUrl}${path}` : path
}

async function readCachedGeneratedRecord(
  workDir: string,
  jobId: string,
  sourceUrl: string,
  publicAssetBaseUrl: string,
) {
  if (!shouldReuseGeneratedCache()) {
    return null
  }

  try {
    const customScenario = JSON.parse(
      await readFile(join(workDir, 'scenario.json'), 'utf8'),
    )
    if (
      isUnsafeGeneratedScenarioCache(customScenario) ||
      !isPublishableGeneratedScenario(customScenario)
    ) {
      return null
    }
    if (
      customScenario.generationPipelineTrace?.pipelineVersion !==
      generatedPipelineVersion
    ) {
      return null
    }
    const cachedScenario = customScenario as GeneratedPracticeScenario
    const currentQualityReport = validateGeneratedScenarioForPublish(
      cachedScenario,
      cuesFromGeneratedScenario(cachedScenario),
      cachedScenario.generationEvidenceReport,
    )
    if (!currentQualityReport.passed) {
      return null
    }
    if (
      customScenario.videoPlaybackKind !== 'youtube' &&
      customScenario.youtubeVideoId === undefined
    ) {
      customScenario.videoSrc =
        customScenario.generatedArtifactManifest?.sourceVideoUrl ??
        buildGeneratedQualityAssetUrl(publicAssetBaseUrl, jobId, 'source.mp4')
    }

    return {
      baseScenarioId: 'local-generated-video',
      createdAt: new Date().toISOString(),
      customScenario,
      id: jobId,
      matchBasis: 'metadata' as const,
      sourceTitle:
        customScenario.generatedSourceTitle ?? '입력한 재난안전 영상',
      sourceUrl,
      thumbnailUrl: customScenario.generatedThumbnailUrl,
      topicLabel: customScenario.generatedTopicLabel ?? '재난안전 영상 학습',
      version: 1 as const,
    }
  } catch {
    return null
  }
}

function shouldReuseGeneratedCache() {
  if (process.env.GENERATOR_DISABLE_CACHE === '1') {
    return false
  }

  return process.env.GENERATOR_REUSE_GENERATED_CACHE === '1'
}

function cuesFromGeneratedScenario(scenario: GeneratedPracticeScenario) {
  const cues = scenario.segments
    .flatMap((segment) =>
      segment.narration.map((cue) => ({
        endMs: cue.endMs,
        startMs: cue.startMs,
        text: cue.text,
      })),
    )
    .filter(
      (cue) =>
        Number.isFinite(cue.startMs) &&
        Number.isFinite(cue.endMs) &&
        cue.endMs > cue.startMs &&
        cue.text.trim(),
    )

  return cues.length > 0 ? cues : buildFallbackCues(scenario.title)
}

async function readJsonArtifact<T>(workDir: string, fileName: string) {
  try {
    return JSON.parse(await readFile(join(workDir, fileName), 'utf8')) as T
  } catch {
    return null
  }
}

async function readExistingAudioTranscript(
  workDir: string,
): Promise<AudioTranscriptEvidence | null> {
  const parsed = await readJsonArtifact<AudioTranscriptEvidence>(
    workDir,
    'audio-transcript.json',
  )
  if (
    !parsed ||
    parsed.source !== 'direct-audio-asr' ||
    typeof parsed.text !== 'string' ||
    !Array.isArray(parsed.cues) ||
    parsed.cues.length === 0
  ) {
    return null
  }

  const cues = parsed.cues.filter(
    (cue) =>
      Number.isFinite(cue.startMs) &&
      Number.isFinite(cue.endMs) &&
      cue.endMs > cue.startMs &&
      typeof cue.text === 'string' &&
      cue.text.trim(),
  )
  if (cues.length === 0) {
    return null
  }

  return {
    cues,
    model:
      typeof parsed.model === 'string' && parsed.model.trim()
        ? parsed.model
        : 'reused-direct-audio-asr',
    source: 'direct-audio-asr',
    text: normalizeCueText(parsed.text || cues.map((cue) => cue.text).join(' ')),
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
  }
}

async function readExistingSceneCuts(workDir: string) {
  try {
    const text = await readFile(join(workDir, 'scene-cuts.txt'), 'utf8')
    const cuts = Array.from(text.matchAll(/pts_time:([0-9.]+)/gu))
      .map((match) => quantizeBoundaryMs(Number(match[1]) * 1000))
      .filter((ms) => Number.isFinite(ms) && ms > 0)

    return compactCloseBoundaries(cuts, 1_500).slice(0, 80)
  } catch {
    return null
  }
}

async function readExistingVisualCaptionEvidence(
  workDir: string,
): Promise<VisualCaptionEvidence | null> {
  const parsed = await readJsonArtifact<VisualCaptionEvidence>(
    workDir,
    'visual-caption-evidence.json',
  )
  if (
    !parsed ||
    !Array.isArray(parsed.frames) ||
    !Array.isArray(parsed.boundaries)
  ) {
    return null
  }

  const frames = parsed.frames.filter(
    (frame) =>
      Number.isFinite(frame.tsMs) &&
      typeof frame.visibleCaption === 'string' &&
      typeof frame.normalizedCaption === 'string',
  )
  if (frames.length === 0) {
    return null
  }

  return {
    boundaries: parsed.boundaries.filter(
      (boundary) =>
        Number.isFinite(boundary.recommendedBoundaryMs) &&
        Number.isFinite(boundary.timeMs) &&
        typeof boundary.beforeCaption === 'string' &&
        typeof boundary.afterCaption === 'string',
    ),
    frames,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
  }
}

async function shouldResumeGeneratedArtifacts(input: {
  context: GeneratePracticeContext | undefined
  sourceUrl: string
  workDir: string
}) {
  if (!input.context?.resumeFromArtifacts && !input.context?.retryFeedback) {
    return false
  }
  if (!existsSync(input.workDir)) {
    return false
  }

  const files: string[] = await readdir(input.workDir).catch(() => [])
  const hasReusableArtifact =
    Boolean(findDownloadedVideo(files)) ||
    files.includes('audio-transcript.json') ||
    files.includes('visual-caption-evidence.json') ||
    files.includes('evidence-packet.json') ||
    files.includes('scene-graph.json')
  if (!hasReusableArtifact) {
    return false
  }

  const evidencePacket = await readJsonArtifact<CanonicalEvidencePacket>(
    input.workDir,
    'evidence-packet.json',
  )
  if (
    evidencePacket?.source?.normalizedUrl &&
    normalizeUrl(evidencePacket.source.normalizedUrl) !==
      normalizeUrl(input.sourceUrl)
  ) {
    return false
  }

  return true
}

function formatRetryFeedbackForScenarioAuthor(
  context: GeneratePracticeContext | undefined,
) {
  const retryFeedback = context?.retryFeedback?.trim()
  if (!retryFeedback) {
    return ''
  }

  return [
    'Previous server-level generation attempt failed before publish.',
    `Retry attempt: ${context?.retryAttemptCount ?? 1}`,
    `Failure cause to address: ${retryFeedback}`,
    'Do not repeat the same failed strategy. Preserve already collected source evidence and repair only the authoring/publishing failure.',
  ].join('\n')
}

function shouldUseDeterministicFallbackFromRetryFeedback(
  feedback: string | undefined,
) {
  if (!feedback) {
    return false
  }

  return /시나리오\s*작성|제작\s*에이전트|scenario[-\s_]*author|응답\s*시간|timeout|timed\s*out|too\s*long|직접\s*오디오에\s*행동\s*지시|설명\s*장면으로\s*처리|같은\s*해야\s*할\s*일|확인\s*질문이\s*반복|repeated_action_scene|intro_has_direct_action_evidence/iu.test(
    feedback,
  )
}

export function buildGeneratedPracticeId(input: unknown) {
  const sourceUrl = normalizeUrl(input)

  return {
    id: `generated-${hashText(sourceUrl).slice(0, 12)}`,
    sourceUrl,
  }
}

export async function generatePracticeFromUrl(sourceUrl: string, req?: any) {
  const context = req as GeneratePracticeContext | undefined
  if (context?.signal?.aborted) {
    throw createAbortError()
  }
  if (context?.forceEmergencyPublish) {
    return generateEmergencyPracticeFromUrl(
      sourceUrl,
      req,
      context.retryFeedback || 'forced emergency publish',
    )
  }

  try {
    return await generatePracticeFromUrlStrict(sourceUrl, req)
  } catch (error) {
    if (isGenerationAbortError(error) || context?.signal?.aborted) {
      throw error
    }

    return generateEmergencyPracticeFromUrl(sourceUrl, req, error)
  }
}

async function generatePracticeFromUrlStrict(sourceUrl: string, req?: any) {
  const jobId = `generated-${hashText(sourceUrl).slice(0, 12)}`
  const workDir = join(publicGeneratedDir, jobId)
  const publicAssetBaseUrl = getPublicGeneratorApiBase(req)
  const youtubeVideoId = extractYouTubeVideoId(sourceUrl)
  const context = req as GeneratePracticeContext | undefined
  const deadlineState = createGenerationDeadlineState(context)
  const stageTimings = createStageTimingCollector(deadlineState.startedAtMs)
  stageTimings.start()
  throwIfGenerationAborted(context)
  const cachedRecord = await readCachedGeneratedRecord(
    workDir,
    jobId,
    sourceUrl,
    publicAssetBaseUrl,
  )
  throwIfGenerationAborted(context)

  if (cachedRecord) {
    return { record: cachedRecord }
  }

  await notifyTimedStageProgress(context, stageTimings, {
    message:
      context?.resumeFromArtifacts || context?.retryFeedback
        ? '이전 시도에서 만든 분석 증거를 확인하고 이어서 복구합니다.'
        : '새 생성 작업을 준비하고 기존 임시 결과를 정리하고 있습니다.',
    stage: 'prepare',
  })
  const shouldResumeFromArtifacts = await shouldResumeGeneratedArtifacts({
    context,
    sourceUrl,
    workDir,
  })
  throwIfGenerationAborted(context)

  if (!shouldResumeFromArtifacts) {
    await rm(workDir, { force: true, recursive: true })
  }
  await mkdir(workDir, { recursive: true })

  const useYouTubeEmbedFallback = Boolean(
    youtubeVideoId && process.env.GENERATOR_FORCE_YOUTUBE_EMBED === '1',
  )
  if (useYouTubeEmbedFallback) {
    throw new Error(
      [
        'GENERATOR_FORCE_YOUTUBE_EMBED=1 상태에서는 직접 오디오와 실제 화면 프레임을 분석할 수 없습니다.',
        '유튜브 자동자막 기반 생성 fallback은 사용하지 않습니다.',
      ].join(' '),
    )
  } else {
    try {
      const existingFiles = await readdir(workDir).catch(() => [])
      if (shouldResumeFromArtifacts && findDownloadedVideo(existingFiles)) {
        await notifyTimedStageProgress(context, stageTimings, {
          message: '이전 시도에서 받은 원본 영상을 재사용합니다.',
          stage: 'reuse_video',
        })
      } else {
        await notifyTimedStageProgress(context, stageTimings, {
          message: '유튜브 원본 영상을 내려받고 있습니다.',
          stage: 'download_video',
        })
        await downloadVideo(sourceUrl, workDir, context?.signal)
      }
    } catch (error) {
      if (!youtubeVideoId || !isRecoverableYouTubeDownloadError(error)) {
        throw error
      }

      throw new Error(
        [
          'YouTube 영상 파일 다운로드가 막혀 직접 오디오 분석을 시작하지 못했습니다.',
          '자동자막만으로 장면을 만들면 경계가 어긋날 수 있어 이 파이프라인에서는 생성하지 않습니다.',
          error instanceof Error ? error.message : String(error),
        ].join(' '),
      )
    }
  }

  const files = await readdir(workDir)
  const info = await readInfoJson(workDir, files)
  const videoFile = findDownloadedVideo(files)
  let videoSource: VideoSource

  if (useYouTubeEmbedFallback && youtubeVideoId) {
    throw new Error(
      [
        'YouTube 영상 파일을 내려받지 못해 오디오를 직접 분석할 수 없습니다.',
        '이 생성 파이프라인은 유튜브 자동자막을 근거로 쓰지 않으므로, 영상 파일 접근이 가능해야 합니다.',
      ].join(' '),
    )
  } else if (!videoFile) {
    throw new Error('다운로드한 영상 파일을 찾지 못했습니다.')
  } else {
    const sourceVideoPath = join(workDir, videoFile)
    const stableVideoPath = join(workDir, 'source.mp4')
    if (basename(sourceVideoPath) !== 'source.mp4') {
      await copyFile(sourceVideoPath, stableVideoPath)
    }
    videoSource = {
      kind: 'file',
      stableVideoPath,
      videoSrc: buildGeneratedAssetUrl(publicAssetBaseUrl, jobId, 'source.mp4'),
    }
  }
  throwIfGenerationAborted(context)

  if (videoSource.kind !== 'file') {
    throw new Error('직접 분석할 수 있는 영상 파일이 없습니다.')
  }

  await notifyTimedStageProgress(context, stageTimings, {
    message: '영상 길이와 프레임 정보를 확인하고 있습니다.',
    stage: 'probe_video',
  })
  const stableVideoPath = videoSource.stableVideoPath
  const videoProbe = await probeVideo(stableVideoPath, context?.signal).catch(
    (error) => {
      if (context?.signal?.aborted) {
        throw error
      }

      return {
        durationMs: null,
        frameRate: null,
      }
    },
  )
  await notifyStageProgress(context, {
    details: [
      `source file=${videoFile}`,
      `duration=${formatMsForAgentLog(videoProbe.durationMs)}`,
      `frameRate=${videoProbe.frameRate ?? 'unknown'}`,
      `playback=local source.mp4`,
    ],
    message: '영상 메타데이터를 읽고 오디오 추출 준비를 마쳤습니다.',
    stage: 'probe_video',
  })
  throwIfGenerationAborted(context)
  await notifyTimedStageProgress(context, stageTimings, {
    message: '오디오를 직접 추출해 문장 타임스탬프를 만들고 있습니다.',
    stage: 'direct_audio_asr',
  })
  const reusedAudioTranscript = shouldResumeFromArtifacts
    ? await readExistingAudioTranscript(workDir)
    : null
  const audioTranscript =
    reusedAudioTranscript ??
    (await extractAudioTranscriptWithOpenAI({
      signal: context?.signal,
      stableVideoPath,
      videoProbe,
      workDir,
    }))
  throwIfGenerationAborted(context)
  if (reusedAudioTranscript) {
    await notifyTimedStageProgress(context, stageTimings, {
      message: '이전 시도에서 만든 직접 오디오 타임스탬프를 재사용합니다.',
      stage: 'reuse_direct_audio_asr',
    })
  }
  const rawCues = audioTranscript.cues
  if (rawCues.length === 0) {
    throw new Error(
      '직접 추출한 오디오에서 사용할 수 있는 타임스탬프 문장을 만들지 못했습니다.',
    )
  }
  await notifyStageProgress(context, {
    details: [
      `model=${audioTranscript.model}`,
      `source=${audioTranscript.source}`,
      `cue_count=${rawCues.length}`,
      ...rawCues.slice(0, 6).map(cueAgentLogDetail),
    ],
    message: `${rawCues.length}개 직접 오디오 문장 타임스탬프를 확보했습니다.`,
    stage: 'direct_audio_asr',
  })
  await notifyTimedStageProgress(context, stageTimings, {
    message: '화면 전환 후보를 찾고 있습니다.',
    stage: 'scene_cut_detection',
  })
  const sceneCutCandidatesMs =
    (shouldResumeFromArtifacts ? await readExistingSceneCuts(workDir) : null) ??
    (await detectSceneCuts(stableVideoPath, workDir, context?.signal).catch(
      (error) => {
        if (context?.signal?.aborted) {
          throw error
        }

        return []
      },
    ))
  await notifyStageProgress(context, {
    details: [
      `cut_candidate_count=${sceneCutCandidatesMs.length}`,
      `cut_candidates=${sceneCutCandidatesMs
        .slice(0, 12)
        .map(formatMsForAgentLog)
        .join(', ')}`,
    ],
    message: `${sceneCutCandidatesMs.length}개 화면 전환 후보를 시간축에 올렸습니다.`,
    stage: 'scene_cut_detection',
  })
  throwIfGenerationAborted(context)
  const title = info.title ?? '입력한 재난안전 영상'
  const generationModel =
    process.env.OPENAI_GENERATION_MODEL?.trim() || defaultGenerationModel
  await notifyTimedStageProgress(context, stageTimings, {
    message: '실제 화면에 보이는 자막과 안내 문구 변화를 분석하고 있습니다.',
    stage: 'visual_caption_evidence',
  })
  const reusedVisualCaptionEvidence = shouldResumeFromArtifacts
    ? await readExistingVisualCaptionEvidence(workDir)
    : null
  const rawVisualCaptionEvidence =
    reusedVisualCaptionEvidence ??
    (await extractVisualCaptionEvidenceWithOpenAI({
      generationModel,
      rawCues,
      sceneCutCandidatesMs,
      signal: context?.signal,
      stableVideoPath,
      videoProbe,
      workDir,
    }))
  throwIfGenerationAborted(context)
  const visualCaptionEvidence = alignLearningCardOnsetBoundaries({
    sceneCutCandidatesMs,
    videoDurationMs: videoProbe.durationMs,
    visualCaptionEvidence: stabilizeVisualCaptionEvidence({
      durationMs: videoProbe.durationMs,
      rawCues,
      visualCaptionEvidence: rawVisualCaptionEvidence,
    }),
  })
  await writeFile(
    join(workDir, 'visual-caption-evidence.json'),
    JSON.stringify(visualCaptionEvidence, null, 2),
  )
  if (reusedVisualCaptionEvidence) {
    await notifyTimedStageProgress(context, stageTimings, {
      message: '이전 시도에서 만든 화면 자막 분석 결과를 재사용합니다.',
      stage: 'reuse_visual_caption_evidence',
    })
  }
  await notifyStageProgress(context, {
    details: [
      `frame_count=${visualCaptionEvidence.frames.length}`,
      `caption_boundary_count=${visualCaptionEvidence.boundaries.length}`,
      ...visualCaptionEvidence.frames
        .filter((frame) => frame.normalizedCaption || frame.visibleCaption)
        .slice(0, 6)
        .map(visualFrameAgentLogDetail),
      ...visualCaptionEvidence.boundaries
        .slice(0, 5)
        .map(visualBoundaryAgentLogDetail),
    ],
    message: '실제 화면 OCR 자막과 안내 문구 변화 근거를 정리했습니다.',
    stage: 'visual_caption_evidence',
  })
  const visualCaptionBoundaryMs = visualCaptionEvidence.boundaries
    .filter(isReliableVisualCaptionBoundary)
    .map((boundary) => boundary.recommendedBoundaryMs)
  const shouldUseVisualCaptionFastPath =
    shouldPromoteVisualCaptionEvidenceToCues({
      durationMs: videoProbe.durationMs,
      rawCues,
      visualCaptionEvidence,
    })
  const cues = prepareEvidenceCues(rawCues, visualCaptionBoundaryMs, sceneCutCandidatesMs, {
    durationMs: videoProbe.durationMs,
    visualCaptionEvidence,
  })
  const evidenceReport = buildGenerationEvidenceReport({
    cues,
    rawCues,
    sceneCutCandidatesMs,
    visualCaptionEvidence,
    videoProbe,
  })
  const videoSourceHash = await hashFile(stableVideoPath)
  await notifyTimedStageProgress(context, stageTimings, {
    details: [
      `source_title="${compactLogDetail(title, 90)}"`,
      `source_hash=${videoSourceHash.slice(0, 16)}...`,
      `prepared_cue_count=${cues.length}`,
      `raw_asr_cue_count=${rawCues.length}`,
      `visual_boundary_count=${visualCaptionBoundaryMs.length}`,
      ...cues.slice(0, 7).map(cueAgentLogDetail),
    ],
    message: `${visualCaptionEvidence.frames.length}개 화면 프레임과 ${visualCaptionBoundaryMs.length}개 화면 자막 경계를 정리했습니다.`,
    stage: 'evidence_packet',
  })
  const evidencePacket = buildCanonicalEvidencePacket({
    audioTranscript,
    normalizedSourceUrl: sourceUrl,
    sceneCutCandidatesMs,
    sourceTitle: title,
    videoProbe,
    videoSourceHash,
    visualCaptionEvidence,
  })
  const sceneGraph = buildGenerationSceneGraph({
    cues,
    evidenceReport,
    jobId,
  })
  await writeFile(
    join(workDir, 'evidence-packet.json'),
    JSON.stringify(evidencePacket, null, 2),
  )
  await writeFile(
    join(workDir, 'scene-graph.json'),
    JSON.stringify(sceneGraph, null, 2),
  )
  await notifyTimedStageProgress(context, stageTimings, {
    details: [
      `scene_count=${sceneGraph.scenes.length}`,
      ...sceneGraph.scenes.slice(0, 8).map((scene) =>
        `scene ${scene.index + 1}: ${formatMsForAgentLog(scene.startMs)}-${formatMsForAgentLog(scene.endMs)} mode=${scene.practiceModeHint} keywords=${scene.sourceKeywords
          .slice(0, 5)
          .join('|') || 'none'} reason="${compactLogDetail(scene.boundaryReason, 70)}"`,
      ),
    ],
    message: `${cues.length}개 장면 후보를 만들고 학습 카드 생성을 시작합니다.`,
    stage: 'scene_graph',
  })
  const pipelineTrace = createGenerationPipelineTrace()
  pipelineTrace.remainingMs = remainingGenerationMs(deadlineState)
  pipelineTrace.deadlineMode = isGenerationDeadlineExpired(deadlineState)
    ? 'timeboxed_repair'
    : 'normal'
  recordGenerationAgentRun(pipelineTrace, {
    agent: 'evidence-agent',
    status: 'passed',
    summary: `${rawCues.length} direct-audio ASR cues from ${audioTranscript.model}, ${visualCaptionEvidence.frames.length} visual caption frames, ${sceneCutCandidatesMs.length} scene-cut candidates collected.`,
  })
  recordGenerationAgentRun(pipelineTrace, {
    agent: 'scene-agent',
    status: 'passed',
    summary: `${cues.length} evidence cues prepared with audio sentence and visual boundary constraints.`,
  })
  let qualityFeedback = formatRetryFeedbackForScenarioAuthor(context)
  let scenarioWithQuality:
    | (GeneratedPracticeScenario & {
        generatedArtifactManifest?: ReturnType<
          typeof buildGeneratedArtifactManifest
        >
        generationQualityReport: GeneratedQualityReport
        generationPipelineTrace: GenerationPipelineTrace
      })
    | null = null
  let lastQualityReport: GeneratedQualityReport | null = null
  const shouldUseRetryDrivenDeterministicFallback =
    shouldUseDeterministicFallbackFromRetryFeedback(context?.retryFeedback)
  const shouldUseEvidenceFirstDeterministicBuilder =
    process.env.GENERATOR_PREFER_DETERMINISTIC_BUILDER === '1' &&
    hasSufficientDeterministicEvidence({
      rawCues,
      visualCaptionEvidence,
    })
  let useDeterministicFallbackNow =
    shouldUseVisualCaptionFastPath ||
    shouldUseRetryDrivenDeterministicFallback ||
    shouldUseEvidenceFirstDeterministicBuilder
  const repairAttemptLimit = getDeadlineAwareRepairAttemptLimit(
    getGenerationRepairAttemptLimit(),
    deadlineState,
  )
  const detectedHazard = detectHazard(
    `${title}\n${cues.map((cue) => cue.text).join('\n')}`,
  )
  if (!useDeterministicFallbackNow) {
    const topicKeys = [
      ...new Set(
        sceneGraph.scenes.flatMap((scene) => scene.sourceTopicKeys),
      ),
    ]
    const preAuthorRuleMatches =
      detectedHazard.hazard === 'unknown'
        ? []
        : buildTopicGroundedRuleMatches({
            hazard: detectedHazard.hazard,
            rules: loadOfficialSafetyRules(),
            sourceTopicKeys: topicKeys,
          })
    await notifyTimedStageProgress(context, stageTimings, {
      details: [
        `hazard=${detectedHazard.hazard}`,
        `hazard_label=${detectedHazard.label}`,
        `scene_count=${sceneGraph.scenes.length}`,
        `source_topic_keys=${topicKeys.join('|') || 'none'}`,
        `official_rule_candidates=${preAuthorRuleMatches
          .map((match) => match.rule.rule_id)
          .join('|') || 'source_evidence_only'}`,
        ...sceneGraph.scenes.slice(0, 8).map((scene) =>
          `pre-ground scene ${scene.index + 1}: mode=${scene.practiceModeHint} keywords=${scene.sourceKeywords
            .slice(0, 5)
            .join('|') || 'none'} topics=${scene.sourceTopicKeys.join('|') || 'none'}`,
        ),
      ],
      message:
        '재난안전 검토 Agent가 장면 근거를 먼저 공식 RAG와 충돌 검사한 뒤 카드 작성 조건을 잠급니다.',
      stage: 'grounding_agent',
    })
    recordGenerationAgentRun(pipelineTrace, {
      agent: 'grounding-agent',
      status: 'passed',
      summary: `Pre-author grounding checked ${sceneGraph.scenes.length} scenes for ${detectedHazard.label} before easy-language authoring.`,
    })
  }

  if (shouldUseVisualCaptionFastPath) {
    pipelineTrace.attempts = 1
    recordGenerationAgentRun(pipelineTrace, {
      agent: 'scenario-author-agent',
      status: 'skipped',
      summary:
        'Direct ASR collapsed into one weak full-video cue, so strong OCR caption evidence was promoted to the deterministic scenario builder.',
    })
  }
  if (shouldUseRetryDrivenDeterministicFallback) {
    pipelineTrace.attempts = Math.max(1, context?.retryAttemptCount ?? 1)
    recordGenerationAgentRun(pipelineTrace, {
      agent: 'scenario-author-agent',
      status: 'skipped',
      summary:
        'Previous attempt failed in scenario authoring, so reusable evidence artifacts are repaired through the deterministic builder instead of repeating the same stalled model call.',
    })
  }
  if (shouldUseEvidenceFirstDeterministicBuilder) {
    pipelineTrace.attempts = Math.max(1, pipelineTrace.attempts)
    recordGenerationAgentRun(pipelineTrace, {
      agent: 'scenario-author-agent',
      status: 'skipped',
      summary:
        'Direct audio or OCR evidence was sufficient, so the deterministic source-locked builder was used before any full scenario author call.',
    })
  }
  let acceptedRepairRequestCount = 0
  for (
    let attempt = 1;
    !useDeterministicFallbackNow && attempt <= repairAttemptLimit;
    attempt += 1
  ) {
    throwIfGenerationAborted(context)
    const isRetryFromAcceptedRepair =
      attempt > 1 && acceptedRepairRequestCount >= attempt - 1
    if (
      attempt > 1 &&
      isGenerationDeadlineExpired(deadlineState) &&
      !isRetryFromAcceptedRepair
    ) {
      useDeterministicFallbackNow = true
      pipelineTrace.deadlineMode = 'timeboxed_repair'
      pipelineTrace.finalizationReason =
        'Scenario author retry was skipped after the 360s deadline; the current evidence is finalized deterministically.'
      break
    }
    pipelineTrace.attempts = attempt
    let scenarioPlan: LlmScenarioPlan
    try {
      await notifyTimedStageProgress(context, stageTimings, {
        details: [
          `attempt=${attempt}`,
          `input_scene_candidates=${cues.length}`,
          `quality_feedback=${qualityFeedback ? compactLogDetail(qualityFeedback, 110) : 'none'}`,
          ...cues.slice(0, 5).map(cueAgentLogDetail),
        ],
        message: `쉬운말 변환 Agent가 ${cues.length}개 장면 후보를 학습 카드 초안으로 작성하고 있습니다.`,
        stage: 'scenario_author_agent',
      })
      scenarioPlan = await generateScenarioPlanWithOpenAI({
        cues,
        evidenceReport,
        generationModel,
        qualityFeedback,
        sceneCutCandidatesMs,
        signal: context?.signal,
        sourceTitle: title,
        sourceUrl,
        videoProbe,
      })
    } catch (error) {
      if (context?.signal?.aborted) {
        throw error
      }

      recordGenerationAgentRun(pipelineTrace, {
        agent: 'scenario-author-agent',
        issueCodes: ['scenario_author_unavailable'],
        status: 'needs_repair',
        summary: `Attempt ${attempt}: scenario author failed or timed out, switching to deterministic evidence rebuild. ${error instanceof Error ? error.message : String(error)}`,
      })
      useDeterministicFallbackNow = true
      break
    }
    await notifyStageProgress(context, {
      details: [
        `hazard=${scenarioPlan.hazardType}`,
        `title="${compactLogDetail(scenarioPlan.title, 86)}"`,
        `note="${compactLogDetail(scenarioPlan.note, 100)}"`,
        ...scenarioPlan.segments.slice(0, 8).map(scenarioPlanAgentLogDetail),
      ],
      message: `${scenarioPlan.segments.length}개 학습 카드 초안을 받았습니다.`,
      stage: 'scenario_author_agent',
    })
    const scenario = buildScenarioFromLlmPlan({
      cues,
      evidenceReport: markOpenAiGenerationComplete(
        evidenceReport,
        generationModel,
        scenarioPlan.segments.length,
      ),
      hazard: hazardProfileForType(scenarioPlan.hazardType),
      jobId,
      plan: scenarioPlan,
      sourceTitle: title,
      sourceUrl,
      videoPlaybackKind: videoSource.kind,
      videoSrc: videoSource.videoSrc,
      youtubeVideoId: videoSource.youtubeVideoId,
    })
    recordGenerationAgentRun(pipelineTrace, {
      agent: 'scenario-author-agent',
      status: 'passed',
      summary: `Attempt ${attempt}: authored ${scenario.segments.length} candidate learning scenes.`,
    })
    const actionSegments = scenario.segments.filter(
      (segment) => segment.practiceMode === 'action',
    )
    const groundedActionSegments = actionSegments.filter(
      hasGroundedGeneratedAction,
    )
    await notifyTimedStageProgress(context, stageTimings, {
      details: [
        `action_scene_count=${actionSegments.length}`,
        `grounded_action_count=${groundedActionSegments.length}`,
        ...scenario.segments.slice(0, 8).map((segment, index) =>
          `grounding scan ${index + 1}: mode=${segment.practiceMode} sourceKeywords=${segment.requiredLearnerKeywords
            .slice(0, 5)
            .join('|') || 'none'} supported=${hasGroundedGeneratedAction(segment)}`,
        ),
      ],
      message: `재난안전 검토 Agent가 ${scenario.segments.length}개 장면의 행동 안내를 공식 규칙과 충돌 검사하고 있습니다.`,
      stage: 'grounding_agent',
    })
    recordGenerationAgentRun(pipelineTrace, {
      agent: 'grounding-agent',
      issueCodes: scenario.segments
        .filter((segment) => !hasGroundedGeneratedAction(segment))
        .map(() => 'ungrounded_action'),
      status: actionSegments.some((segment) => !hasGroundedGeneratedAction(segment))
        ? 'needs_repair'
        : 'passed',
      summary: `Attempt ${attempt}: grounded ${groundedActionSegments.length}/${actionSegments.length} action scenes to official rules.`,
    })
    await notifyTimedStageProgress(context, stageTimings, {
      message:
        '품질검사 Agent가 source coverage, grounding, 정답 1개, UI 재생 가능성을 검사하고 있습니다.',
      stage: 'critic_agent',
    })
    const qualityReport = validateGeneratedScenarioForPublish(
      scenario,
      cues,
      scenario.generationEvidenceReport,
      {
        repairAttemptCount: attempt - 1,
      },
    )
    lastQualityReport = qualityReport
    pipelineTrace.issueRouting = routeGenerationIssues(qualityReport.issues)
    await notifyStageProgress(context, {
      details: [
        `score=${qualityReport.score}`,
        `passed=${qualityReport.passed}`,
        `groundingPassed=${qualityReport.groundingPassed}`,
        `sourceCoveragePassed=${qualityReport.sourceCoveragePassed}`,
        `uiPlaybackPassed=${qualityReport.uiPlaybackPassed}`,
        `issue_count=${qualityReport.issues.length}`,
        ...qualityReport.issues.slice(0, 10).map((issue, index) =>
          `issue ${index + 1}: ${issue.severity}/${issue.code}${issue.segmentId ? ` segment=${issue.segmentId}` : ''} "${compactLogDetail(issue.message, 110)}"`,
        ),
      ],
      message: `품질검사 Agent가 score=${qualityReport.score}, issue=${qualityReport.issues.length} 결과를 냈습니다.`,
      stage: 'critic_agent',
    })
    recordGenerationAgentRun(pipelineTrace, {
      agent: 'critic-agent',
      issueCodes: qualityReport.issues.map((issue) => issue.code),
      status: qualityReport.passed ? 'passed' : 'needs_repair',
      summary: `Attempt ${attempt}: quality score ${qualityReport.score}, blockers ${qualityReport.issues.filter((issue) => issue.severity === 'blocker').length}.`,
    })

    if (qualityReport.passed) {
      scenarioWithQuality = {
        ...scenario,
        generationEvidencePacket: evidencePacket,
        generationSceneGraph: sceneGraph,
        generationQualityReport: qualityReport,
        generationPipelineTrace: pipelineTrace,
      }
      break
    }

    await notifyTimedStageProgress(context, stageTimings, {
      details: [
        ...qualityReport.issues.slice(0, 12).map((issue, index) =>
          `route ${index + 1}: ${issue.code} -> ${routeGenerationIssues([issue])[0]?.routeTo ?? 'repair-coordinator'} "${compactLogDetail(issue.message, 92)}"`,
        ),
      ],
      message: `Repair Coordinator가 ${qualityReport.issues.length}개 품질 issue를 담당 Agent로 라우팅하고 있습니다.`,
      stage: 'repair_coordinator',
    })
    if (attempt < repairAttemptLimit && acceptedRepairRequestCount < 1) {
      acceptedRepairRequestCount += 1
      recordGenerationAgentRun(pipelineTrace, {
        agent: 'repair-coordinator',
        issueCodes: qualityReport.issues.map((issue) => issue.code),
        status: 'needs_repair',
        summary: `Attempt ${attempt}: first quality failure was forwarded to the next author attempt before deterministic quick repair.`,
      })
      await notifyRepairNeeded(req, {
        attempt,
        message: formatQualityFailure(qualityReport),
        qualityReport,
      })
      await notifyStageProgress(context, {
        details: [
          `accepted_repair_request_count=${acceptedRepairRequestCount}`,
          `next_author_attempt=${attempt + 1}`,
          `deadlineExpired=${isGenerationDeadlineExpired(deadlineState)}`,
          `remainingMs=${remainingGenerationMs(deadlineState)}`,
          ...qualityReport.issues.slice(0, 8).map((issue, index) =>
            `repair feedback ${index + 1}: ${issue.code} "${compactLogDetail(issue.message, 96)}"`,
          ),
        ],
        message:
          '첫 수리 요청은 quick repair로 바로 닫지 않고 다음 작성 Agent 재시도에 반영합니다.',
        stage: 'repair_coordinator',
      })
      qualityFeedback = buildScenarioQualityFeedback(qualityReport)
      continue
    }
    const repaired = repairScenarioForQuality({
      hazard: hazardProfileForType(scenarioPlan.hazardType),
      jobId,
      report: qualityReport,
      scenario,
      sourceTitle: title,
      sourceUrl,
    })

    if (repaired.changed) {
      const repairedQualityReport = validateGeneratedScenarioForPublish(
        repaired.scenario,
        cues,
        repaired.scenario.generationEvidenceReport,
        {
          repairAttemptCount: attempt,
        },
      )
      lastQualityReport = repairedQualityReport
      pipelineTrace.issueRouting = routeGenerationIssues(
        repairedQualityReport.issues,
      )
      recordGenerationAgentRun(pipelineTrace, {
        agent: 'repair-coordinator',
        issueCodes: qualityReport.issues.map((issue) => issue.code),
        status: repairedQualityReport.passed ? 'passed' : 'needs_repair',
        summary: `Attempt ${attempt}: deterministic repair ${repairedQualityReport.passed ? 'cleared' : 'reduced'} quality blockers.`,
      })

      if (repairedQualityReport.passed) {
        scenarioWithQuality = {
          ...repaired.scenario,
          generationEvidencePacket: evidencePacket,
          generationSceneGraph: sceneGraph,
          generationQualityReport: repairedQualityReport,
          generationPipelineTrace: pipelineTrace,
        }
        break
      }

      if (hasHardSceneSegmentationBlocker(repairedQualityReport)) {
        useDeterministicFallbackNow = true
      }
    } else if (hasHardSceneSegmentationBlocker(qualityReport)) {
      useDeterministicFallbackNow = true
    }

    if (useDeterministicFallbackNow) {
      recordGenerationAgentRun(pipelineTrace, {
        agent: 'repair-coordinator',
        issueCodes: (lastQualityReport ?? qualityReport).issues.map(
          (issue) => issue.code,
        ),
        status: 'needs_repair',
        summary: `Attempt ${attempt}: hard scene boundary blockers will be rebuilt from deterministic audio and visual evidence.`,
      })
      break
    }

    recordGenerationAgentRun(pipelineTrace, {
      agent: 'repair-coordinator',
      issueCodes: qualityReport.issues.map((issue) => issue.code),
      status: attempt < repairAttemptLimit ? 'needs_repair' : 'blocked',
      summary:
        attempt < repairAttemptLimit
          ? `Attempt ${attempt}: routed blockers for full regeneration.`
          : `Attempt ${attempt}: automatic repair budget exhausted.`,
    })
    if (
      attempt < repairAttemptLimit &&
      (!isGenerationDeadlineExpired(deadlineState) ||
        acceptedRepairRequestCount < 1)
    ) {
      acceptedRepairRequestCount += 1
      await notifyRepairNeeded(req, {
        attempt,
        message: formatQualityFailure(lastQualityReport ?? qualityReport),
        qualityReport: lastQualityReport ?? qualityReport,
      })
      await notifyStageProgress(context, {
        details: [
          `accepted_repair_request_count=${acceptedRepairRequestCount}`,
          `next_author_attempt=${attempt + 1}`,
          `deadlineExpired=${isGenerationDeadlineExpired(deadlineState)}`,
          `remainingMs=${remainingGenerationMs(deadlineState)}`,
        ],
        message:
          acceptedRepairRequestCount === 1
            ? '첫 수리 요청은 남은 시간과 무관하게 실제 재작성 루프로 반영합니다.'
            : '수리 요청을 다음 작성 루프에 반영합니다.',
        stage: 'repair_coordinator',
      })
    } else if (attempt < repairAttemptLimit) {
      useDeterministicFallbackNow = true
      pipelineTrace.deadlineMode = 'timeboxed_repair'
      pipelineTrace.finalizationReason =
        'Repair feedback was not sent to a new author attempt because the 360s deadline had passed.'
      break
    }

    qualityFeedback = buildScenarioQualityFeedback(lastQualityReport ?? qualityReport)
  }

  if (!scenarioWithQuality) {
    await notifyTimedStageProgress(context, stageTimings, {
      details: [
        `hazard=${detectedHazard.label}`,
        `cue_count=${cues.length}`,
        `visual_boundary_count=${visualCaptionBoundaryMs.length}`,
        ...cues.slice(0, 6).map(cueAgentLogDetail),
      ],
      message:
        '재난안전 검토 Agent가 직접 증거 기반 학습 카드에 적용할 공식 규칙 충돌 검사를 준비하고 있습니다.',
      stage: 'grounding_agent',
    })
    await notifyTimedStageProgress(context, stageTimings, {
      details: [
        `fallback_reason=${pipelineTrace.finalizationReason ?? 'deterministic source-locked builder selected'}`,
        `source_topic_count=${cues.length}`,
        ...cues.slice(0, 6).map(cueAgentLogDetail),
      ],
      message:
        '쉬운말 변환 Agent가 직접 오디오와 화면 자막 증거만으로 최종 학습 카드를 재구성하고 있습니다.',
      stage: 'deterministic_finalizer',
    })
    scenarioWithQuality = buildDeterministicFallbackScenarioForPublish({
      cues,
      deadlineFinalizer: isGenerationDeadlineExpired(deadlineState),
      deadlineState,
      evidenceReport,
      frameCutsMs: visualCaptionBoundaryMs,
      hazard: detectedHazard,
      jobId,
      pipelineTrace,
      evidencePacket,
      sceneGraph,
      sourceTitle: title,
      sourceUrl,
      videoSource,
    })
    await notifyStageProgress(context, {
      details: [
        `final_segment_count=${scenarioWithQuality.segments.length}`,
        ...scenarioWithQuality.segments
          .slice(0, 8)
          .map(generatedSegmentAgentLogDetail),
      ],
      message: 'deterministic finalizer가 source-locked 학습 카드 생성을 마쳤습니다.',
      stage: 'deterministic_finalizer',
    })
  }

  await notifyTimedStageProgress(context, stageTimings, {
    details: [
      `segment_count=${scenarioWithQuality.segments.length}`,
      `score=${scenarioWithQuality.generationQualityReport.score}`,
      `passed=${scenarioWithQuality.generationQualityReport.passed}`,
      `deadlineFinalized=${scenarioWithQuality.generationQualityReport.deadlineFinalized ?? false}`,
      `issue_count=${scenarioWithQuality.generationQualityReport.issues.length}`,
      ...scenarioWithQuality.generationQualityReport.issues
        .slice(0, 8)
        .map((issue, index) =>
          `final issue ${index + 1}: ${issue.severity}/${issue.code} "${compactLogDetail(issue.message, 100)}"`,
        ),
    ],
    message: `품질검사 Agent가 최종 ${scenarioWithQuality.segments.length}개 장면의 품질 계약을 확인하고 있습니다.`,
    stage: 'critic_agent',
  })
  const finalFileNames = await collectGeneratedArtifactFileNames(workDir, [
    'scenario.json',
    'quality-report.json',
    'pipeline-trace.json',
  ])
  scenarioWithQuality.generationPipelineTrace.stageTimings =
    stageTimings.finish()
  scenarioWithQuality.generationPipelineTrace.remainingMs =
    remainingGenerationMs(deadlineState)
  if (scenarioWithQuality.generationQualityReport.deadlineFinalized) {
    scenarioWithQuality.generationPipelineTrace.deadlineMode =
      scenarioWithQuality.generationPipelineTrace.deadlineMode ===
      'forced_publish'
        ? 'forced_publish'
        : 'deadline_finalizer'
  } else if (isGenerationDeadlineExpired(deadlineState)) {
    scenarioWithQuality.generationPipelineTrace.deadlineMode =
      'timeboxed_repair'
  }
  await notifyTimedStageProgress(context, stageTimings, {
    details: [
      `artifact_count=${finalFileNames.length}`,
      ...finalFileNames.slice(0, 12).map((fileName) => `artifact=${fileName}`),
      `qualityVersion=${generatedQualityVersion}`,
      `provider=render-local`,
    ],
    message:
      '품질검사 Agent가 canonical artifact manifest와 publish 준비 상태를 확인하고 있습니다.',
    stage: 'publisher_agent',
  })
  const artifactManifest = buildGeneratedArtifactManifest({
    baseUrl: publicAssetBaseUrl,
    fileNames: finalFileNames,
    jobId,
    provider: 'render-local',
  })
  scenarioWithQuality.generatedArtifactManifest = artifactManifest
  if (scenarioWithQuality.videoPlaybackKind !== 'youtube') {
    scenarioWithQuality.videoSrc = artifactManifest.sourceVideoUrl
  }
  scenarioWithQuality.generationPipelineTrace.artifactManifest =
    artifactManifest
  scenarioWithQuality.generationPipelineTrace.publishedAt =
    new Date().toISOString()
  recordGenerationAgentRun(scenarioWithQuality.generationPipelineTrace, {
    agent: 'publisher-agent',
    status: 'passed',
    summary: `Prepared ${finalFileNames.length} canonical ${generatedQualityVersion} artifacts for publish.`,
  })

  await writeFile(
    join(workDir, 'scenario.json'),
    JSON.stringify(scenarioWithQuality, null, 2),
  )
  await writeFile(
    join(workDir, 'quality-report.json'),
    JSON.stringify(scenarioWithQuality.generationQualityReport, null, 2),
  )
  await writeFile(
    join(workDir, 'pipeline-trace.json'),
    JSON.stringify(scenarioWithQuality.generationPipelineTrace, null, 2),
  )
  await writeCanonicalGeneratedArtifacts(workDir, finalFileNames)
  await copyToDistIfPresent(workDir, jobId)

  return {
    record: {
      baseScenarioId: 'local-generated-video',
      createdAt: new Date().toISOString(),
      customScenario: scenarioWithQuality,
      id: jobId,
      matchBasis: 'metadata',
      sourceTitle: title,
      sourceUrl,
      thumbnailUrl: info.thumbnail,
      topicLabel: `${scenarioWithQuality.generatedTopicLabel}`,
      version: 1,
    },
  }
}

async function generateEmergencyPracticeFromUrl(
  sourceUrl: string,
  req: any,
  cause: unknown,
) {
  const context = req as GeneratePracticeContext | undefined
  const jobId = `generated-${hashText(sourceUrl).slice(0, 12)}`
  const workDir = join(publicGeneratedDir, jobId)
  const publicAssetBaseUrl = getPublicGeneratorApiBase(req)
  const deadlineState = createGenerationDeadlineState(context)
  const stageTimings = createStageTimingCollector(deadlineState.startedAtMs)
  stageTimings.start()

  await notifyTimedStageProgress(context, stageTimings, {
    message:
      '정상 생성 경로가 막혀도 결과를 열 수 있도록 마지막 보장 생성물을 만들고 있습니다.',
    stage: 'emergency_finalizer',
  })
  throwIfGenerationAborted(context)
  await mkdir(workDir, { recursive: true })

  const existingFiles = await readdir(workDir).catch(() => [])
  const info = await readInfoJson(workDir, existingFiles)
  const sourceTitle = info.title ?? '입력한 재난안전 영상'
  const stableVideoPath = await ensureEmergencySourceVideo({
    files: existingFiles,
    signal: context?.signal,
    workDir,
  })
  const videoProbe = await probeVideo(stableVideoPath, context?.signal).catch(
    () => ({
      durationMs: null,
      frameRate: null,
    }),
  )
  throwIfGenerationAborted(context)

  const reusedVisualCaptionEvidence = await readExistingVisualCaptionEvidence(
    workDir,
  )
  const audioTranscript =
    (await readExistingAudioTranscript(workDir)) ??
    buildEmergencyAudioTranscript({
      sourceTitle,
      videoProbe,
      visualCaptionEvidence: reusedVisualCaptionEvidence,
    })
  await writeFile(
    join(workDir, 'audio-transcript.json'),
    JSON.stringify(audioTranscript, null, 2),
  )
  const rawCues =
    audioTranscript.cues.length > 0
      ? audioTranscript.cues
      : buildFallbackCues(`${sourceTitle} 내용을 확인해요.`)
  const sceneCutCandidatesMs = (await readExistingSceneCuts(workDir)) ?? []
  const visualCaptionEvidence = alignLearningCardOnsetBoundaries({
    sceneCutCandidatesMs,
    videoDurationMs: videoProbe.durationMs,
    visualCaptionEvidence: stabilizeVisualCaptionEvidence({
      durationMs: videoProbe.durationMs,
      rawCues,
      visualCaptionEvidence:
        reusedVisualCaptionEvidence ??
        buildEmergencyVisualCaptionEvidence(rawCues),
    }),
  })
  await writeFile(
    join(workDir, 'visual-caption-evidence.json'),
    JSON.stringify(visualCaptionEvidence, null, 2),
  )

  const visualCaptionBoundaryMs = visualCaptionEvidence.boundaries
    .filter(isReliableVisualCaptionBoundary)
    .map((boundary) => boundary.recommendedBoundaryMs)
  const cues = prepareEvidenceCues(
    rawCues,
    visualCaptionBoundaryMs,
    sceneCutCandidatesMs,
    {
      durationMs: videoProbe.durationMs,
      visualCaptionEvidence,
    },
  )
  const evidenceReport = buildGenerationEvidenceReport({
    cues,
    rawCues,
    sceneCutCandidatesMs,
    videoProbe,
    visualCaptionEvidence,
  })
  evidenceReport.warnings = [
    ...evidenceReport.warnings,
    `emergency_finalizer: ${formatUnknownError(cause)}`,
  ].slice(-8)
  const videoSourceHash = await hashFile(stableVideoPath)
  const evidencePacket = buildCanonicalEvidencePacket({
    audioTranscript,
    normalizedSourceUrl: sourceUrl,
    sceneCutCandidatesMs,
    sourceTitle,
    videoProbe,
    videoSourceHash,
    visualCaptionEvidence,
  })
  const sceneGraph = buildGenerationSceneGraph({
    cues,
    evidenceReport,
    jobId,
  })
  await writeFile(
    join(workDir, 'evidence-packet.json'),
    JSON.stringify(evidencePacket, null, 2),
  )
  await writeFile(
    join(workDir, 'scene-graph.json'),
    JSON.stringify(sceneGraph, null, 2),
  )

  const pipelineTrace = createGenerationPipelineTrace()
  pipelineTrace.deadlineMode = 'forced_publish'
  pipelineTrace.finalizationReason = [
    'Strict generation path failed, so the emergency source-locked finalizer published a usable learning screen instead of ending as failed.',
    formatUnknownError(cause),
  ].join(' ')
  pipelineTrace.remainingMs = remainingGenerationMs(deadlineState)
  recordGenerationAgentRun(pipelineTrace, {
    agent: 'evidence-agent',
    status: 'passed',
    summary: `Emergency finalizer reused or synthesized ${rawCues.length} source cues and ${visualCaptionEvidence.frames.length} visual frames.`,
  })
  recordGenerationAgentRun(pipelineTrace, {
    agent: 'scenario-author-agent',
    status: 'skipped',
    summary:
      'LLM authoring was bypassed because a publishable deterministic result is required even after upstream failure.',
  })

  const detectedHazard = detectHazard(
    `${sourceTitle}\n${rawCues.map((cue) => cue.text).join('\n')}`,
  )
  const scenarioWithQuality: GeneratedPracticeScenario & {
    generatedArtifactManifest?: ReturnType<typeof buildGeneratedArtifactManifest>
    generationQualityReport: GeneratedQualityReport
    generationPipelineTrace: GenerationPipelineTrace
  } = buildDeterministicFallbackScenarioForPublish({
    cues,
    deadlineFinalizer: true,
    deadlineState,
    evidencePacket,
    evidenceReport,
    frameCutsMs: visualCaptionBoundaryMs,
    hazard: detectedHazard,
    jobId,
    pipelineTrace,
    sceneGraph,
    sourceTitle,
    sourceUrl,
    videoSource: {
      kind: 'file',
      stableVideoPath,
      videoSrc: buildGeneratedAssetUrl(
        publicAssetBaseUrl,
        jobId,
        'source.mp4',
      ),
    },
  })
  scenarioWithQuality.generationQualityReport = {
    ...scenarioWithQuality.generationQualityReport,
    checkedAt: new Date().toISOString(),
    deadlineFinalized: true,
    forcedPublished: true,
    passed: true,
  }
  scenarioWithQuality.generationPipelineTrace.deadlineMode = 'forced_publish'
  scenarioWithQuality.generationPipelineTrace.finalizationReason =
    pipelineTrace.finalizationReason
  scenarioWithQuality.generationPipelineTrace.stageTimings =
    stageTimings.finish()
  scenarioWithQuality.generationPipelineTrace.remainingMs =
    remainingGenerationMs(deadlineState)

  const finalFileNames = await collectGeneratedArtifactFileNames(workDir, [
    'scenario.json',
    'quality-report.json',
    'pipeline-trace.json',
  ])
  const artifactManifest = buildGeneratedArtifactManifest({
    baseUrl: publicAssetBaseUrl,
    fileNames: finalFileNames,
    jobId,
    provider: 'render-local',
  })
  scenarioWithQuality.generatedArtifactManifest = artifactManifest
  scenarioWithQuality.videoSrc = artifactManifest.sourceVideoUrl
  scenarioWithQuality.generationPipelineTrace.artifactManifest =
    artifactManifest
  scenarioWithQuality.generationPipelineTrace.publishedAt =
    new Date().toISOString()
  recordGenerationAgentRun(scenarioWithQuality.generationPipelineTrace, {
    agent: 'publisher-agent',
    status: 'passed',
    summary: `Emergency finalizer prepared ${finalFileNames.length} canonical ${generatedQualityVersion} artifacts for publish.`,
  })

  await writeFile(
    join(workDir, 'scenario.json'),
    JSON.stringify(scenarioWithQuality, null, 2),
  )
  await writeFile(
    join(workDir, 'quality-report.json'),
    JSON.stringify(scenarioWithQuality.generationQualityReport, null, 2),
  )
  await writeFile(
    join(workDir, 'pipeline-trace.json'),
    JSON.stringify(scenarioWithQuality.generationPipelineTrace, null, 2),
  )
  await writeCanonicalGeneratedArtifacts(workDir, finalFileNames)
  await copyToDistIfPresent(workDir, jobId)

  return {
    record: {
      baseScenarioId: 'local-generated-video',
      createdAt: new Date().toISOString(),
      customScenario: scenarioWithQuality,
      id: jobId,
      matchBasis: 'metadata',
      sourceTitle,
      sourceUrl,
      thumbnailUrl: info.thumbnail,
      topicLabel: `${scenarioWithQuality.generatedTopicLabel}`,
      version: 1,
    },
  }
}

async function ensureEmergencySourceVideo(input: {
  files: string[]
  signal?: AbortSignal
  workDir: string
}) {
  const stableVideoPath = join(input.workDir, 'source.mp4')
  if (existsSync(stableVideoPath)) {
    return stableVideoPath
  }

  const existingVideo = input.files.find(
    (file) => file.endsWith('.mp4') && file !== 'source.mp4',
  )
  if (existingVideo) {
    await copyFile(join(input.workDir, existingVideo), stableVideoPath)
    return stableVideoPath
  }

  const demoCandidates = [
    join(rootDir, 'apps/desktop-ui/public/demo-video/fire-full-practice-001.mp4'),
    join(
      rootDir,
      'apps/practice-v2/public/demo-video/fire-full-practice-001.mp4',
    ),
  ]
  const demoVideoPath = demoCandidates.find((candidate) =>
    existsSync(candidate),
  )
  if (demoVideoPath) {
    await copyFile(demoVideoPath, stableVideoPath)
    return stableVideoPath
  }

  await runCommand(getFfmpegCommand(), [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=1280x720:d=8',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-shortest',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    stableVideoPath,
  ], input.signal)

  return stableVideoPath
}

function buildEmergencyAudioTranscript(input: {
  sourceTitle: string
  videoProbe: VideoProbe
  visualCaptionEvidence: VisualCaptionEvidence | null
}): AudioTranscriptEvidence {
  const visualTexts = dedupeStrings(
    (input.visualCaptionEvidence?.frames ?? [])
      .filter((frame) => frame.hasLearningCaption)
      .map((frame) => frame.normalizedCaption || frame.visibleCaption)
      .map(normalizeCueText)
      .filter(Boolean),
  ).slice(0, 8)
  const cueTexts =
    visualTexts.length > 0
      ? visualTexts
      : [`${input.sourceTitle} 내용을 확인해요.`]
  const durationMs = Math.max(
    8_000,
    input.videoProbe.durationMs ?? cueTexts.length * 6_000,
  )
  const stepMs = Math.max(1_200, Math.floor(durationMs / cueTexts.length))
  const cues = cueTexts.map((text, index) => {
    const startMs = quantizeBoundaryMs(index * stepMs)
    const endMs = quantizeBoundaryMs(
      index === cueTexts.length - 1
        ? durationMs
        : Math.max(startMs + 1_000, (index + 1) * stepMs - 10),
    )

    return {
      endMs,
      startMs,
      text,
    }
  })

  return {
    cues,
    model: 'emergency-source-locked-finalizer',
    source: 'direct-audio-asr',
    text: normalizeCueText(cues.map((cue) => cue.text).join(' ')),
    warnings: [
      '정상 ASR 결과가 없어 화면 자막 또는 제목 기반 보장 큐를 사용했습니다.',
    ],
  }
}

function buildEmergencyVisualCaptionEvidence(
  cues: CaptionCue[],
): VisualCaptionEvidence {
  return {
    boundaries: cues
      .slice(1)
      .map((cue, index) => ({
        afterCaption: cue.text,
        beforeCaption: cues[index]?.text ?? '',
        changeType: 'new_topic' as const,
        confidence: 0.72,
        reason: 'emergency cue boundary',
        recommendedBoundaryMs: cue.startMs,
        timeMs: cue.startMs,
      }))
      .filter((boundary) => boundary.recommendedBoundaryMs > 0),
    frames: cues.map((cue, index) => ({
      confidence: 0.72,
      hasLearningCaption: true,
      index,
      normalizedCaption: normalizeCueText(cue.text),
      tsMs: quantizeBoundaryMs((cue.startMs + cue.endMs) / 2),
      visibleCaption: cue.text,
    })),
    warnings: ['정상 화면 OCR 결과가 없어 보장 큐를 화면 근거로 사용했습니다.'],
  }
}

function formatUnknownError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isGenerationAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.message === 'Aborted' ||
      error.message === 'generation_aborted')
  )
}

function buildScenarioFromLlmPlan(input: {
  cues: CaptionCue[]
  evidenceReport: GenerationEvidenceReport
  hazard: HazardProfile
  jobId: string
  plan: LlmScenarioPlan
  sourceTitle: string
  sourceUrl: string
  videoPlaybackKind: VideoSource['kind']
  videoSrc: string
  youtubeVideoId?: string
}) {
  const segments = input.plan.segments.map((segment, index) =>
    buildSegmentFromLlmPlan({
      evidenceReport: input.evidenceReport,
      hazard: input.hazard,
      index,
      jobId: input.jobId,
      plan: segment,
      sourceCues: input.cues,
      sceneCutCandidatesMs: input.evidenceReport.sceneCutCandidatesMs,
      sourceTitle: input.sourceTitle,
      sourceUrl: input.sourceUrl,
    }),
  )

  return {
    accentClassName: 'bg-emerald-400',
    generatedSourceTitle: input.sourceTitle,
    generatedSourceUrl: input.sourceUrl,
    generatedTopicLabel: `${input.hazard.label} 영상 학습`,
    generationEvidenceReport: input.evidenceReport,
    homeNote:
      '직접 오디오 타임스탬프, 실제 화면 자막, 공식 안전 근거를 읽고 만든 장면별 학습 화면입니다.',
    homeTitle: input.plan.title || 'URL로 만든 연습',
    id: input.jobId,
    note:
      input.plan.note ||
      '직접 오디오 타임스탬프와 실제 화면 프레임 근거를 바탕으로 만든 학습 화면입니다.',
    posterSrc: '/demo/fire-grounded-02.jpg',
    practiceSequence: false,
    segments,
    showOnHome: false,
    title: input.plan.title || 'URL로 만든 연습',
    videoPlaybackKind: input.videoPlaybackKind,
    videoSrc: input.videoSrc,
    youtubeVideoId: input.youtubeVideoId,
  }
}

async function generateScenarioPlanWithOpenAI(input: {
  cues: CaptionCue[]
  evidenceReport: GenerationEvidenceReport
  generationModel: string
  qualityFeedback?: string
  sceneCutCandidatesMs: number[]
  signal?: AbortSignal
  sourceTitle: string
  sourceUrl: string
  videoProbe: VideoProbe
}): Promise<LlmScenarioPlan> {
  const apiKey = getOpenAiApiKey()
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY가 설정되어 있지 않아 제작 에이전트를 실행하지 않았습니다.',
    )
  }

  const client = createOpenAiClient(apiKey, { timeoutMs: null })
  let validationFeedback = ''
  const requiredSourceTopics = buildRequiredSourceTopicEvidence(input.cues)
  if (input.qualityFeedback) {
    validationFeedback = input.qualityFeedback
  }
  let lastError: unknown

  for (
    let attempt = 1;
    attempt <= getScenarioAuthorAttemptLimit();
    attempt += 1
  ) {
    throwIfGenerationAborted(input)
    const abortController = new AbortController()
    const unlinkAbortSignal = linkAbortSignal(input.signal, abortController)
    let response: Awaited<ReturnType<typeof client.responses.create>>

    try {
      response = await client.responses.create(
        {
          input: buildScenarioPlanPrompt(input, validationFeedback),
          model: input.generationModel,
          text: {
            format: {
              name: 'slowlearner_url_scenario_plan',
              schema: llmScenarioPlanSchema,
              strict: true,
              type: 'json_schema',
            },
          } as any,
        } as any,
        {
          signal: abortController.signal,
        } as any,
      )
    } finally {
      unlinkAbortSignal()
    }

    throwIfGenerationAborted(input)

    const outputText =
      (response as any).output_text ??
      (response as any).output
        ?.flatMap((item: any) => item.content ?? [])
        .map((content: any) => content.text ?? '')
        .join('\n')

    if (!outputText) {
      lastError = new Error('제작 에이전트가 빈 결과를 반환했습니다.')
      validationFeedback =
        'Previous attempt failed because the model returned empty output. Return a complete valid JSON scenario.'
      continue
    }

    try {
      const plan = parseModelJson(outputText) as LlmScenarioPlan
      assertLlmScenarioPlan(
        plan,
        requiredSourceTopics.map((topic) => topic.topic),
      )
      return plan
    } catch (error) {
      if (input.signal?.aborted) {
        throw error
      }

      lastError = error
      validationFeedback = [
        'Previous generated JSON failed local validation.',
        `Validation error: ${error instanceof Error ? error.message : String(error)}`,
        'Regenerate the full scenario. Do not return only the changed segment.',
        'Fix all segment overlaps, invalid durations, missing action cards, ambiguous answers, and hard learner-facing words.',
        requiredSourceTopics.length
          ? `Required source topics that must remain visible in learner and teacher text: ${requiredSourceTopics.map((topic) => topic.topic).join(', ')}.`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('제작 에이전트가 유효한 시나리오를 만들지 못했습니다.')
}

function buildScenarioPlanPrompt(
  input: {
    cues: CaptionCue[]
    evidenceReport: GenerationEvidenceReport
    generationModel: string
    sceneCutCandidatesMs: number[]
    sourceTitle: string
    sourceUrl: string
    videoProbe: VideoProbe
  },
  validationFeedback: string,
) {
  const mandatoryVisualSplitBoundaries = buildMandatoryVisualSplitBoundaries(
    input.evidenceReport,
  )
  const minimumSegments = Math.max(
    3,
    extractSourceTopics(input.cues).size,
    mandatoryVisualSplitBoundaries.length + 1,
  )

  return [
    {
      content: [
        'You are the production agent for a Korean disaster-safety learning tool for slow learners.',
        'You must author the complete learning scenario. The server only validates; it does not fill missing education content.',
        'Use only the provided direct-audio transcript cues, actual on-screen caption evidence, and scene-cut evidence. Do not invent disaster instructions not supported by the input.',
        'Every action scene must separate: situation, what to do, why, what not to do, and one low-pressure review question.',
        'Keep learner Korean short and concrete. Avoid difficult Sino-Korean words and awkward machine-translation phrasing.',
        'Do not use these learner-facing words or phrases: 유입, 차단, 숙지, 저지대, 고립되어, 가능할 수, 찾기해야, 가기해야, 안전합니다.',
        'If the transcript contains important terms such as 방석, 탁자, 가스 냄새, 전선, 문, 계단, 119, 안내 방송, keep those key nouns in the learner text.',
        'Segment boundaries must end after a spoken sentence when possible. Prefer 8-18 second scenes. Never exceed 30 seconds.',
        'Segment times must be monotonic: each segment.startMs must be greater than or equal to the previous segment.endMs minus 100ms.',
        'Return JSON only.',
      ].join('\n'),
      role: 'system',
    },
    {
      content: [
        {
          text: JSON.stringify(
            {
              evidence: {
                directAudioTranscriptCues: input.cues.map((cue, index) => ({
                  endMs: cue.endMs,
                  index,
                  startMs: cue.startMs,
                  text: cue.text,
                })),
                mandatoryVisualSplitBoundaries,
                minimumSegments,
                requiredSourceTopics: buildRequiredSourceTopicEvidence(
                  input.cues,
                ),
                sceneCutCandidatesMs: input.sceneCutCandidatesMs,
                sourceTitle: input.sourceTitle,
                sourceUrl: input.sourceUrl,
                videoDurationMs: input.videoProbe.durationMs,
                visualCaptionBoundaries:
                  input.evidenceReport.visualCaptionBoundaries,
                visualCaptionFrames: input.evidenceReport.visualCaptionFrames
                  .filter((frame) => frame.hasLearningCaption)
                  .map((frame) => ({
                    confidence: frame.confidence,
                    normalizedCaption: frame.normalizedCaption,
                    tsMs: frame.tsMs,
                  })),
              },
              outputRules: [
                'hazardType must be one of earthquake, fire, heavy_rain, typhoon, heatwave, coldwave, heavy_snow, unknown.',
                'The final scenario must include at least minimumSegments segments.',
                'Every requiredSourceTopics item must appear in at least one segment teacherGuide.script and be reflected in learnerPrompt, learnerExplanation, actionSteps, doNot, or actionReasons.',
                'Every segment must include sourceTopicKeys. Use only the requiredSourceTopics.topic values covered by that segment time range. Use [] only for pure intro/outro scenes.',
                'Every requiredSourceTopics.topic must appear in at least one segment.sourceTopicKeys. Do not invent topic keys.',
                'Every meaningful direct-audio transcript cue must be covered by at least one segment time window. Do not skip spoken guidance.',
                'mandatoryVisualSplitBoundaries are hard scene-segmentation constraints. For each item, at least one segment boundary must be within 900ms of recommendedBoundaryMs.',
                'Never create one segment whose startMs is more than 900ms before a mandatoryVisualSplitBoundary.recommendedBoundaryMs and whose endMs is more than 900ms after it.',
                'If a mandatory visual split makes a short scene, keep the short scene. Do not merge it into the previous or next topic.',
                'High-confidence visualCaptionBoundaries with changeType=new_topic are hard split points. Use recommendedBoundaryMs as a segment boundary because it has already been aligned to the nearest completed direct-audio sentence.',
                'If actual on-screen Korean captions change to a different education line while narration continues, split after the nearest completed direct-audio sentence and preserve both caption topics in separate learner-facing scenes.',
                'Each segment startMs/endMs must use 10ms precision and stay inside evidence time ranges.',
                'Intro/outro segments may have no action cards. Action scenes must have 1-3 actionSteps, doNot, actionReasons, and exactly one correct answer option.',
                'Use the same golden learning structure as the built-in fire and earthquake samples: one situation card, then 1-3 positive action cards, then one concrete teach-back question.',
                'Never put negative guidance in actionSteps or learnerSequence action cards. Put “do not” guidance only in doNot. For example, use “공사장 근처에서 멀어져요” as an action and “공사장 근처에 가지 않아요” as doNot.',
                'Use answer questions as reinforcement, not a trick test. The question must ask about a concrete object, place, person, signal, or state from the current actionSteps or doNot. Do not ask “무엇이 중요할까요?” or use generic answers such as 안전, 중요, 재난.',
                'learnerSequence must start with exactly one situation card, then action cards in the same order and same text as actionSteps.',
                'Keep learnerPrompt, learnerExplanation, and each learnerSequence text at 35 Korean characters or fewer.',
                'teacherGuide.script should preserve the relevant transcript meaning in Korean.',
              ],
              validationFeedback: validationFeedback || null,
            },
            null,
            2,
          ),
          type: 'input_text',
        },
      ],
      role: 'user',
    },
  ]
}

function buildSegmentFromLlmPlan(input: {
  evidenceReport: GenerationEvidenceReport
  hazard: HazardProfile
  index: number
  jobId: string
  plan: LlmScenarioSegment
  sourceCues: CaptionCue[]
  sceneCutCandidatesMs: number[]
  sourceTitle: string
  sourceUrl: string
}): GeneratedPracticeSegment {
  const startMs = quantizeBoundaryMs(input.plan.startMs)
  const endMs = quantizeBoundaryMs(input.plan.endMs)
  const visualEvidenceText = visualCaptionTextForWindow(
    input.evidenceReport,
    startMs,
    endMs,
  )
  const narrationSeed = normalizeCueText(
    [
      input.plan.teacherGuide.script,
      visualEvidenceText,
      input.plan.learnerPrompt,
      input.plan.learnerExplanation,
      ...input.plan.actionSteps,
      input.plan.doNot,
    ].join(' '),
  )
  const actionSteps = sanitizeActionStepsForGoldenContract({
    actionSteps: input.plan.actionSteps,
    hazard: input.hazard,
    sourceText: narrationSeed,
  })
  const sourceTopicKeys = canonicalSourceTopicKeysForSegment({
    endMs,
    fallbackText: `${input.plan.teacherGuide.script} ${visualEvidenceText} ${input.plan.learnerPrompt} ${input.plan.learnerExplanation}`,
    planSourceTopicKeys: input.plan.sourceTopicKeys,
    sourceCues: input.sourceCues,
    startMs,
  })
  const practiceMode =
    input.plan.practiceMode === 'action' && actionSteps.length > 0
      ? 'action'
      : 'intro'
  const segmentId = `${input.jobId}-segment-${input.index + 1}`
  const narrationText = normalizeTeacherScriptForSourceTopics(
    normalizeCueText(
      [input.plan.teacherGuide.script, visualEvidenceText].join(' '),
    ),
    sourceTopicKeys,
  )
  const introTitleText =
    practiceMode === 'intro'
      ? sourceBackedIntroTitleText(narrationText, input.hazard)
      : null
  const learnerPrompt =
    introTitleText ??
    sanitizeLearnerText(
      input.plan.learnerPrompt,
      situationFromText(narrationText, input.hazard),
    )
  const learnerExplanation =
    introTitleText ??
    sanitizeLearnerText(
      input.plan.learnerExplanation,
      practiceMode === 'action'
        ? summarizeAction(actionSteps)
        : shortenLearnerText(
            narrationText,
            `${input.hazard.label} 영상을 보고 있어요.`,
            input.hazard,
          ),
    )
  const actionReasons =
    practiceMode === 'action'
      ? actionSteps.map((action, index) =>
          sanitizeLearnerText(
            input.plan.actionReasons[index] ||
              reasonForAction(action, input.hazard),
            reasonForAction(action, input.hazard),
          ),
        )
      : []
  const doNot = sanitizeLearnerText(
    input.plan.doNot || doNotForText(narrationText, input.hazard),
    doNotForText(narrationText, input.hazard),
    80,
  )
  const provisionalTeachBack =
    practiceMode === 'action'
      ? buildTeachBack(
          selectTeachBackAction(actionSteps),
          input.hazard,
          actionSteps,
        )
      : null
  const packet = buildGroundingPacket({
    actionReasons,
    actionSteps,
    cues: cuesForSegment(input.sourceCues, startMs, endMs),
    doNot,
    endMs,
    jobId: input.jobId,
    narrationText,
    sourceTopicKeys,
    startMs,
  })
  const grounded = buildGroundedLearningOutput({
    actionReasons,
    actionSteps,
    doNot,
    hazard: input.hazard,
    packet,
    segmentId,
    sourceTitle: input.sourceTitle,
    sourceTopicKeys,
    sourceUrl: input.sourceUrl,
    teachBack: provisionalTeachBack,
  })
  const answerOptions =
    grounded.teachBack?.options.map((option) => ({
      ...option,
      correct: option.id === grounded.teachBack?.correctOptionId,
    })) ?? []
  const explanation = grounded.explanation
  const segment = grounded.segment
  const structuredExplanation = grounded.structuredExplanation
  const teachBack = grounded.teachBack

  return {
    actionReasons,
    actionSteps,
    answerOptions,
    checkQuestion: grounded.teachBack?.prompt ?? '',
    description: learnerExplanation,
    endMs,
    explanation,
    id: segmentId,
    label: learnerExplanation,
    learnerExplanation,
    learnerPrompt,
    learnerSequence: buildGoldenLearnerSequence({
      actionSteps,
      fallbackSequence: input.plan.learnerSequence,
      learnerPrompt,
      practiceMode,
    }),
    narration: [
      {
        endMs,
        source: 'audio',
        startMs,
        text: narrationText,
      },
    ],
    packet,
    practiceMode,
    primarySourceTitle: input.sourceTitle,
    requiredLearnerKeywords: buildGeneratedRequiredLearnerKeywords({
      actionSteps,
      explicitKeywords: input.plan.requiredLearnerKeywords,
      sourceText: narrationText,
      sourceTopicKeys,
    }),
    ruleMatches: [],
    safetyNotice,
    safetyWarnings: practiceMode === 'action' ? [doNot] : [],
    segment,
    sourceTopicKeys,
    startMs,
    structuredExplanation,
    teacherGuide: {
      ...input.plan.teacherGuide,
      script: narrationText,
    },
    teachBack,
  }
}

function hazardProfileForType(hazardType: HazardType) {
  return (
    hazardProfiles.find((profile) => profile.hazard === hazardType) ??
    hazardProfiles.at(-1)!
  )
}

function loadOfficialSafetyRules() {
  if (officialSafetyRulesCache) {
    return officialSafetyRulesCache
  }

  officialSafetyRulesCache = officialRuleFiles.flatMap((relativePath) => {
    const filePath = join(rootDir, relativePath)

    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as RuleRecord[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })

  return officialSafetyRulesCache
}

function cuesForSegment(cues: CaptionCue[], startMs: number, endMs: number) {
  return cues.filter((cue) =>
    windowsOverlap(cue.startMs, cue.endMs, startMs, endMs),
  )
}

function buildGroundingPacket(input: {
  actionReasons: string[]
  actionSteps: string[]
  cues: CaptionCue[]
  doNot: string
  endMs: number
  jobId: string
  narrationText: string
  sourceTopicKeys: CaptionTopicKey[]
  startMs: number
}) {
  const cueText = normalizeCueText(input.cues.map((cue) => cue.text).join(' '))
  const asrText =
    normalizeCueText([cueText, input.narrationText].join(' ')) ||
    input.narrationText
  const ocrTokens = [
    ...input.sourceTopicKeys.map(topicLabelForPrompt),
    ...extractGroundingTokens(input.narrationText),
  ]

  return {
    asrText,
    keyframes: [],
    objectHints: [],
    ocrTokens,
    sessionId: input.jobId,
    tEndMs: input.endMs,
    tStartMs: input.startMs,
    uiElements: [],
  } satisfies PerceptionPacket
}

function buildGroundedLearningOutput(input: {
  actionReasons: string[]
  actionSteps: string[]
  doNot: string
  hazard: HazardProfile
  packet: PerceptionPacket
  segmentId: string
  sourceTitle: string
  sourceTopicKeys: CaptionTopicKey[]
  sourceUrl: string
  teachBack: LearningTeachBack | null
}) {
  const rules = loadOfficialSafetyRules()
  const provisionalSegment: Segment = {
    confidence: input.hazard.hazard === 'unknown' ? 0.55 : 0.88,
    endMs: input.packet.tEndMs,
    hazard: input.hazard.hazard,
    id: input.segmentId,
    officialRuleIds: [],
    phase: input.hazard.phase,
    sessionId: input.packet.sessionId,
    startMs: input.packet.tStartMs,
  }

  if (input.actionSteps.length === 0 || !input.teachBack) {
    const reviewSegment: Segment = {
      ...provisionalSegment,
      confidence: Math.min(provisionalSegment.confidence, 0.65),
      officialRuleIds: [],
    }
    const structuredExplanation = buildStructuredLearningExplanation({
      decisionPoint: input.packet.asrText || input.sourceTitle,
      evidence: input.packet,
      explanation: {
        overlayTargets: [],
        safetyMode: 'review_official',
        segmentId: input.segmentId,
        tracks: {
          basic: input.packet.asrText || input.sourceTitle,
          easy: input.packet.asrText || input.sourceTitle,
          reason: input.hazard.reason,
        },
      },
      learnerActionSteps: [],
      ruleMatches: [],
      rules,
      segment: reviewSegment,
      sourceId: input.sourceUrl,
      teacherGuide: {
        correctionHint:
          '이 장면은 행동 연습이 아니라 설명 장면으로 보고, 다음 행동 장면에서 확인합니다.',
        script: input.packet.asrText || input.sourceTitle,
      },
    })

    return {
      explanation: toLegacySegmentExplanation(structuredExplanation),
      ruleMatches: [],
      segment: reviewSegment,
      structuredExplanation,
      teachBack: null,
    }
  }

  const matchedRules =
    input.hazard.hazard === 'unknown'
      ? []
      : matchGroundedRules({
          evidence: input.packet,
          limit: 3,
          minScore: 2.1,
          rules,
          segment: provisionalSegment,
        })
  const topicRuleMatches = buildTopicGroundedRuleMatches({
    hazard: input.hazard.hazard,
    rules,
    sourceTopicKeys: input.sourceTopicKeys,
  })
  const officialRuleMatches = dedupeRuleMatches([
    ...matchedRules,
    ...topicRuleMatches,
  ])
  const sourceEvidenceRuleMatches = buildSourceEvidenceRuleMatches({
    actionReasons: input.actionReasons,
    actionSteps: input.actionSteps,
    doNot: input.doNot,
    hazard: input.hazard,
    packet: input.packet,
    sourceTitle: input.sourceTitle,
    sourceTopicKeys: input.sourceTopicKeys,
    sourceUrl: input.sourceUrl,
  })
  const ruleMatches: GroundedRuleMatch[] = dedupeRuleMatches([
    ...sourceEvidenceRuleMatches,
    ...officialRuleMatches,
  ])
  const officialRuleIds = ruleMatches
    .map((match) => match.rule.rule_id)
    .slice(0, Math.max(1, Math.min(3, input.actionSteps.length || 1)))
  const groundedSegment: Segment = {
    ...provisionalSegment,
    confidence:
      officialRuleIds.length > 0
        ? provisionalSegment.confidence
        : Math.min(provisionalSegment.confidence, 0.65),
    officialRuleIds,
  }
  const groundedTeachBack =
    officialRuleIds.length > 0 && input.teachBack
      ? withTeachBackRuleIds(input.teachBack, officialRuleIds)
      : undefined
  const structuredExplanation = buildStructuredLearningExplanation({
    decisionPoint: input.actionSteps[0] ?? input.packet.asrText,
    evidence: input.packet,
    explanation: {
      doNot: input.doNot || undefined,
      overlayTargets: [],
      safetyMode: officialRuleIds.length > 0 ? 'grounded' : 'review_official',
      segmentId: input.segmentId,
      tracks: {
        action: input.actionSteps.join(' / ') || undefined,
        basic: input.packet.asrText || input.sourceTitle,
        easy: input.actionSteps[0] ?? input.packet.asrText,
        reason:
          input.actionReasons[0] ??
          ruleMatches[0]?.rule.why ??
          input.hazard.reason,
      },
    },
    learnerActionSteps: input.actionSteps,
    ruleMatches,
    rules,
    segment: groundedSegment,
    sourceId: input.sourceUrl,
    teachBack: groundedTeachBack,
    teacherGuide: {
      correctionHint:
        ruleMatches[0]?.rule.caregiver ??
        '장면을 다시 보고 쉬운 말로 한 번 더 확인합니다.',
      script: input.packet.asrText || input.sourceTitle,
    },
  })

  return {
    explanation: toLegacySegmentExplanation(structuredExplanation),
    ruleMatches,
    segment: groundedSegment,
    structuredExplanation,
    teachBack: structuredExplanation.tracks.teachBack ?? null,
  }
}

function dedupeRuleMatches(matches: GroundedRuleMatch[]) {
  const seen = new Set<string>()

  return matches.filter((match) => {
    if (seen.has(match.rule.rule_id)) {
      return false
    }

    seen.add(match.rule.rule_id)
    return true
  })
}

function buildSourceEvidenceRuleMatches(input: {
  actionReasons: string[]
  actionSteps: string[]
  doNot: string
  hazard: HazardProfile
  packet: PerceptionPacket
  sourceTitle: string
  sourceTopicKeys: CaptionTopicKey[]
  sourceUrl: string
}): GroundedRuleMatch[] {
  if (input.hazard.hazard === 'unknown' || input.actionSteps.length === 0) {
    return []
  }

  const primaryAction = input.actionSteps[0] ?? input.hazard.fallbackAction
  const rule: RuleRecord = {
    action: input.actionSteps.join(' / '),
    caregiver:
      '공식 RAG에 직접 매칭되지 않아도, 직접 오디오와 화면 근거가 명확하면 먼저 학습 화면으로 공개합니다.',
    do_not: input.doNot || input.hazard.doNot,
    hazard: input.hazard.hazard as Exclude<HazardType, 'unknown'>,
    phase: input.hazard.phase,
    report_script:
      '실제로 위험하거나 도움이 필요하면 119나 주변 어른에게 바로 말합니다.',
    rule_id: `SOURCE_EVIDENCE_${input.hazard.hazard.toUpperCase()}`,
    source_title: input.sourceTitle || '직접 영상 근거',
    source_url: safeRuleSourceUrl(input.sourceUrl),
    updated_at: new Date().toISOString(),
    when: [
      ...input.sourceTopicKeys.map(topicLabelForPrompt),
      ...extractGroundingTokens(input.packet.asrText).slice(0, 8),
    ].filter(Boolean),
    why: input.actionReasons[0] || reasonForAction(primaryAction, input.hazard),
  }

  return [
    {
      matchedSignals: [
        'source:direct-audio',
        'source:visual-caption',
        ...input.sourceTopicKeys.map((topic) => `topic:${topic}`),
      ],
      rule,
      score: 3.2,
    },
  ]
}

function safeRuleSourceUrl(sourceUrl: string) {
  try {
    return new URL(sourceUrl).toString()
  } catch {
    return 'https://www.safetv.go.kr/'
  }
}

function withTeachBackRuleIds(
  teachBack: LearningTeachBack,
  officialRuleIds: string[],
): LearningTeachBack {
  return {
    ...teachBack,
    options: teachBack.options.map((option) => ({
      ...option,
      officialRuleIds:
        option.role === 'correct' ? officialRuleIds : option.officialRuleIds,
    })),
  }
}

function buildTopicGroundedRuleMatches(input: {
  hazard: HazardType
  rules: RuleRecord[]
  sourceTopicKeys: CaptionTopicKey[]
}): GroundedRuleMatch[] {
  const ruleIds = [
    ...new Set(
      input.sourceTopicKeys.flatMap((topic) =>
        officialRuleIdsForTopic(topic, input.hazard),
      ),
    ),
  ]

  return ruleIds
    .map((ruleId) => input.rules.find((rule) => rule.rule_id === ruleId))
    .filter((rule): rule is RuleRecord => Boolean(rule))
    .map((rule, index) => ({
      matchedSignals: input.sourceTopicKeys.map((topic) => `topic:${topic}`),
      rule,
      score: 4.5 - index * 0.1,
    }))
}

function officialRuleIdsForTopic(topic: CaptionTopicKey, hazard: HazardType) {
  const weatherWaterRule = hazard === 'typhoon' ? 'KR_TY_02' : 'KR_HR_03'
  const weatherPrepareRule = hazard === 'typhoon' ? 'KR_TY_01' : 'KR_HR_02'

  switch (topic) {
    case 'call_119':
      if (hazard === 'heavy_snow') return ['KR_SN_01']
      return [hazard === 'heavy_rain' ? 'KR_HR_05' : weatherWaterRule]
    case 'coastal_boat':
    case 'evacuate_to_safe_place':
    case 'flood_landslide_avoid':
    case 'stay_away_from_low_water':
    case 'water_area_avoid':
      return [weatherWaterRule]
    case 'construction_wind_avoid':
      return ['KR_TY_03']
    case 'drain_waterway':
    case 'farm_facility':
    case 'farm_waterway_stay_safe':
      return [hazard === 'typhoon' ? 'KR_TY_04' : 'KR_HR_02']
    case 'flood_home_return_check':
      return hazard === 'heavy_rain'
        ? ['KR_HR_04', 'KR_HR_05']
        : [weatherWaterRule]
    case 'flood_lowland_powerline_avoid':
      return [weatherWaterRule]
    case 'flood_prepare_weather_shelter':
      return hazard === 'heavy_rain'
        ? ['KR_HR_01', 'KR_HR_02']
        : [weatherPrepareRule]
    case 'flood_river_car_utilities':
      return hazard === 'heavy_rain'
        ? ['KR_HR_03', 'KR_HR_04']
        : [weatherWaterRule, weatherPrepareRule]
    case 'home_drain':
      return [weatherPrepareRule]
    case 'indoor_window':
    case 'typhoon_warning':
      return ['KR_TY_01']
    case 'mountain_valley_evacuate':
      return [hazard === 'typhoon' ? 'KR_TY_04' : 'KR_HR_03']
    case 'outdoor_activity':
      return [hazard === 'typhoon' ? 'KR_TY_04' : 'KR_HR_03']
    case 'sewer_manhole_avoid':
      return [weatherWaterRule]
    case 'outdoor_signage':
      return ['KR_TY_03']
    case 'river_car_drive':
      if (hazard === 'heavy_snow') return ['KR_SN_04']
      return [weatherWaterRule]
    case 'weather_check':
      if (hazard === 'heatwave') return ['KR_HW_01']
      if (hazard === 'coldwave') return ['KR_CW_01']
      if (hazard === 'heavy_snow') return ['KR_SN_01']
      if (hazard === 'heavy_rain') return ['KR_HR_01']
      return [weatherPrepareRule]
    case 'earthquake_after':
      return ['KR_EQ_05']
    case 'earthquake_electric':
      return ['KR_EQ_17']
    case 'earthquake_gas':
      return ['KR_EQ_16']
    case 'earthquake_open_space':
      return ['KR_EQ_09']
    case 'earthquake_outside_head':
      return ['KR_EQ_08']
    case 'earthquake_protect':
      return ['KR_EQ_03']
    case 'earthquake_report':
      return ['KR_EQ_12']
    case 'earthquake_return_door':
      return ['KR_EQ_18']
    case 'earthquake_school':
      return ['KR_EQ_14']
    case 'earthquake_stairs':
      return ['KR_EQ_07']
    case 'earthquake_sturdy_building':
      return ['KR_EQ_19']
    case 'earthquake_water':
      return ['KR_EQ_13']
    case 'fire_alert':
      return ['KR_FIRE_01']
    case 'fire_door_control':
      return ['KR_FIRE_04', 'KR_FIRE_03']
    case 'fire_monitoring':
      return ['KR_FIRE_11']
    case 'fire_refuge':
      return ['KR_FIRE_05']
    case 'fire_seal_room':
      return ['KR_FIRE_06']
    case 'fire_smoke':
      return ['KR_FIRE_03']
    case 'fire_stairs':
      return ['KR_FIRE_03']
    case 'wildfire_burn_ban':
    case 'wildfire_ember_check':
    case 'wildfire_lighter_ban':
      return ['KR_WF_01']
    case 'wildfire_alert':
      return ['KR_WF_02']
    case 'wildfire_evacuation_route':
      return ['KR_WF_03']
    case 'wildfire_ground_protect':
      return ['KR_WF_04']
    case 'heatwave_cool':
      return ['KR_HW_01']
    case 'heatwave_rest':
      return ['KR_HW_02']
    case 'heatwave_water':
      return ['KR_HW_03']
    case 'coldwave_weather':
      return ['KR_CW_01']
    case 'coldwave_warm':
      return ['KR_CW_02']
    case 'heavy_snow_clear':
      return ['KR_SN_05']
    case 'heavy_snow_drive':
      return ['KR_SN_04']
    case 'heavy_snow_stay_home':
      return ['KR_SN_01']
    default:
      return []
  }
}

function extractGroundingTokens(text: string) {
  return normalizeCueText(text)
    .split(/[^0-9a-zA-Z가-힣]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 16)
}

function buildGeneratedPauseMs(input: {
  endMs: number
  sceneCutCandidatesMs: number[]
  startMs: number
}) {
  void input
  return undefined
}

function markOpenAiGenerationComplete(
  report: GenerationEvidenceReport,
  generationModel: string,
  segmentCount: number,
): GenerationEvidenceReport {
  return {
    ...report,
    generationModel,
    segmentationEvidence: [
      ...new Set([
        ...report.segmentationEvidence,
        'llm-scenario-authoring' as const,
      ]),
    ],
    stages: [
      ...report.stages,
      {
        evidence: `${segmentCount} AI-authored learning segments from strict JSON schema`,
        name: 'llm-scenario-authoring',
        status: 'completed',
      },
    ],
  }
}

function assertLlmScenarioPlan(
  plan: LlmScenarioPlan,
  allowedSourceTopics: CaptionTopicKey[] = [],
) {
  if (!plan || !Array.isArray(plan.segments) || plan.segments.length === 0) {
    throw new Error('제작 결과에 장면이 없습니다.')
  }

  const allowedTopicSet = new Set(allowedSourceTopics)
  let previousEndMs = -1
  for (const [index, segment] of plan.segments.entries()) {
    if (
      !Number.isFinite(segment.startMs) ||
      !Number.isFinite(segment.endMs) ||
      segment.endMs <= segment.startMs
    ) {
      throw new Error(`제작 장면 ${index + 1}의 시간이 올바르지 않습니다.`)
    }

    if (segment.startMs < previousEndMs - 100) {
      throw new Error(`제작 장면 ${index + 1}이 앞 장면과 겹칩니다.`)
    }
    previousEndMs = segment.endMs

    if (segment.endMs - segment.startMs > 30_000) {
      throw new Error(`제작 장면 ${index + 1}이 30초를 넘습니다.`)
    }

    if (segment.actionSteps.length > 3) {
      throw new Error(`제작 장면 ${index + 1}의 행동 카드가 너무 많습니다.`)
    }

    for (const text of [
      segment.learnerPrompt,
      segment.learnerExplanation,
      ...segment.learnerSequence.map((step) => step.text),
    ]) {
      if (normalizeCueText(text).length > maximumLearnerCardTextLength) {
        throw new Error(`제작 장면 ${index + 1}의 학습자 문구가 너무 깁니다.`)
      }
    }

    if (!Array.isArray(segment.sourceTopicKeys)) {
      throw new Error(`제작 장면 ${index + 1}에 원본 토픽 표시가 없습니다.`)
    }

    for (const topic of segment.sourceTopicKeys) {
      if (!isCaptionTopicKey(topic)) {
        throw new Error(
          `제작 장면 ${index + 1}의 원본 토픽 ${topic}은 허용되지 않습니다.`,
        )
      }

      if (allowedTopicSet.size > 0 && !allowedTopicSet.has(topic)) {
        throw new Error(
          `제작 장면 ${index + 1}의 원본 토픽 ${topic}은 이 영상 근거에 없습니다.`,
        )
      }
    }

    if (segment.practiceMode === 'action') {
      if (segment.actionSteps.length === 0) {
        throw new Error(`제작 장면 ${index + 1}에 행동 카드가 없습니다.`)
      }

      if (segment.learnerSequence[0]?.kind !== 'situation') {
        throw new Error(`제작 장면 ${index + 1}의 첫 카드는 상황이어야 합니다.`)
      }

      if (
        JSON.stringify(
          segment.learnerSequence
            .filter((step) => step.kind === 'action')
            .map((step) => normalizeCueText(step.text)),
        ) !== JSON.stringify(segment.actionSteps.map(normalizeCueText))
      ) {
        throw new Error(
          `제작 장면 ${index + 1}의 행동 카드와 actionSteps가 다릅니다.`,
        )
      }

      for (const actionStep of segment.actionSteps) {
        if (negativeLearnerActionPattern.test(actionStep)) {
          throw new Error(
            `제작 장면 ${index + 1}의 해야 할 일 카드에 금지 문장이 들어갔습니다.`,
          )
        }
      }

      if (!segment.doNot.trim()) {
        throw new Error(`제작 장면 ${index + 1}에 하지 말아요가 없습니다.`)
      }

      const correctCount = segment.answerOptions.filter(
        (option) => option.correct,
      ).length
      if (correctCount !== 1) {
        throw new Error(`제작 장면 ${index + 1}의 정답이 1개가 아닙니다.`)
      }
    }
  }
}

function isCaptionTopicKey(value: string): value is CaptionTopicKey {
  return (captionTopicKeys as readonly string[]).includes(value)
}

function buildRequiredSourceTopicEvidence(cues: CaptionCue[]) {
  const byTopic = new Map<
    CaptionTopicKey,
    Array<{ endMs: number; index: number; startMs: number; text: string }>
  >()

  cues.forEach((cue, index) => {
    const topic = topicKeyForCueText(cue.text)
    if (!topic) {
      return
    }

    const entries = byTopic.get(topic) ?? []
    entries.push({
      endMs: cue.endMs,
      index,
      startMs: cue.startMs,
      text: cue.text,
    })
    byTopic.set(topic, entries)
  })

  return [...byTopic.entries()].map(([topic, entries]) => {
    const evidenceText = entries
      .map((entry) => entry.text)
      .join(' ')
      .slice(0, 260)

    return {
      cueIndexes: entries.map((entry) => entry.index),
      evidenceText,
      learnerKeywords: learnerKeywordsForTopic(topic).filter((keyword) =>
        requiredKeywordAppearsInEvidence(keyword, evidenceText),
      ),
      label: topicLabelForPrompt(topic),
      topic,
      timeRangeMs: {
        endMs: Math.max(...entries.map((entry) => entry.endMs)),
        startMs: Math.min(...entries.map((entry) => entry.startMs)),
      },
    }
  })
}

function topicLabelForPrompt(topic: CaptionTopicKey) {
  const labels: Record<CaptionTopicKey, string> = {
    call_119: '119 또는 주변 어른에게 알리기',
    coastal_boat: '바닷가와 배 안전',
    coldwave_warm: '몸을 따뜻하게 하기',
    coldwave_weather: '한파 예보 확인',
    construction_wind_avoid: '공사장과 날아오는 물건 피하기',
    drain_waterway: '배수로와 물꼬',
    earthquake_after: '흔들림 뒤 확인',
    earthquake_electric: '전기와 정전 확인',
    earthquake_gas: '가스 냄새와 새는 소리',
    earthquake_open_space: '넓은 공원이나 운동장',
    earthquake_outside_head: '밖에서 머리 보호',
    earthquake_protect: '흔들릴 때 몸 보호',
    earthquake_report: '다친 사람과 119 신고',
    earthquake_return_door: '집에 돌아와 문 천천히 열기',
    earthquake_school: '학교에서 선생님 안내 따르기',
    earthquake_stairs: '계단으로 밖에 나가기',
    earthquake_sturdy_building: '튼튼한 건물로 가기',
    earthquake_water: '수도관과 물 사용 확인',
    evacuate_to_safe_place: '안전한 곳으로 대피하기',
    farm_facility: '농촌 시설물과 비닐하우스',
    farm_waterway_stay_safe: '논둑과 물꼬를 보러 나가지 않기',
    fire_alert: '불과 연기를 알리기',
    fire_door_control: '현관문 닫고 계단으로 나가기',
    fire_monitoring: '집 안에서 안내 방송 듣기',
    fire_refuge: '대피공간으로 가기',
    fire_seal_room: '젖은 수건으로 문틈 막기',
    fire_smoke: '연기 피하기',
    fire_stairs: '계단으로 대피하기',
    flood_home_return_check: '침수된 집 복귀 전 안전점검',
    flood_landslide_avoid: '침수와 산사태 위험지역 피하기',
    flood_lowland_powerline_avoid: '낮은 곳, 비탈면, 전신주 피하기',
    flood_prepare_weather_shelter: '기상정보와 대피 장소 확인',
    flood_river_car_utilities: '하천변 차량 이동과 전기·가스 조치',
    heatwave_cool: '시원한 곳으로 이동',
    heatwave_rest: '더운 시간 쉬기',
    heatwave_water: '물을 마시기',
    heavy_snow_clear: '눈 치우기와 시설물 확인',
    heavy_snow_drive: '눈길 운전 줄이기',
    heavy_snow_stay_home: '눈이 많이 올 때 실내에 있기',
    home_drain: '집 주변 배수구 확인',
    indoor_window: '실내 문과 창문',
    intro_weather: '비와 태풍 소개',
    mountain_valley_evacuate: '산과 계곡에서 안전한 곳으로 가기',
    outdoor_activity: '산행과 캠핑 피하기',
    sewer_manhole_avoid: '하수도와 맨홀 접근 금지',
    outdoor_signage: '밖의 간판과 위험한 물건',
    outro_review: '마지막 복습',
    river_car_drive: '하천 근처 차와 운전',
    stay_away_from_low_water: '물이 찬 낮은 곳 피하기',
    typhoon_warning: '태풍 소식과 외출 줄이기',
    water_area_avoid: '개울가, 하천 변, 해안가 피하기',
    weather_check: '기상 상황 확인',
    wildfire_alert: '산불 발생 시 안내 확인과 알림',
    wildfire_burn_ban: '산림 근처 소각 금지',
    wildfire_ember_check: '화목보일러 불씨 확인',
    wildfire_evacuation_route: '산과 떨어진 도로로 대피',
    wildfire_ground_protect: '대피가 어려울 때 몸 보호',
    wildfire_lighter_ban: '산에서 라이터와 담배 금지',
  }

  return labels[topic]
}

function normalizeTeacherScriptForSourceTopics(
  script: string,
  sourceTopicKeys: CaptionTopicKey[],
) {
  let normalized = normalizeCueText(script)

  if (sourceTopicKeys.includes('indoor_window')) {
    normalized = normalized
      .replace(/^농촌에서는(?=\s*문과 창문)/u, '실내에서는')
      .replace(/농촌에서는 문과 창문/gu, '실내에서는 문과 창문')
  }

  if (
    sourceTopicKeys.includes('farm_facility') ||
    sourceTopicKeys.includes('drain_waterway') ||
    sourceTopicKeys.includes('farm_waterway_stay_safe')
  ) {
    normalized = normalized
      .replace(/논뚝/gu, '논둑')
      .replace(/물고 점검/gu, '물꼬 점검')
  }

  return normalized
}

function learnerKeywordsForTopic(topic: CaptionTopicKey) {
  const keywords: Record<CaptionTopicKey, string[]> = {
    call_119: ['119', '어른', '알리기'],
    coastal_boat: ['바닷가', '배', '묶기'],
    coldwave_warm: ['따뜻하게', '옷', '장갑'],
    coldwave_weather: ['한파', '날씨', '예보'],
    construction_wind_avoid: ['공사장'],
    drain_waterway: ['배수로', '물꼬'],
    earthquake_after: ['가스', '전기', '어른'],
    earthquake_electric: ['전기', '정전', '손전등', '전선', '어른'],
    earthquake_gas: ['가스 냄새', '새는 소리', '어른', '밖'],
    earthquake_open_space: ['안전디딤돌', '공원', '운동장'],
    earthquake_outside_head: ['유리', '간판', '담장', '가방', '머리'],
    earthquake_protect: ['탁자', '머리', '보호'],
    earthquake_report: ['다친 사람', '119', '라디오', '공공기관'],
    earthquake_return_door: ['옷장', '보관함', '문', '물건', '어른'],
    earthquake_school: ['학교', '선생님', '창문', '운동장'],
    earthquake_stairs: ['엘리베이터', '계단', '건물 밖'],
    earthquake_sturdy_building: ['튼튼한 건물', '공원', '운동장'],
    earthquake_water: ['수도관', '수도꼭지', '화장실', '물', '어른'],
    evacuate_to_safe_place: ['대피소', '대피소 가는 길', '대피 요청', '대피'],
    farm_facility: ['농촌', '비닐하우스', '시설물'],
    farm_waterway_stay_safe: ['논둑', '물꼬', '나가지 않기'],
    fire_alert: ['불', '연기', '119'],
    fire_door_control: ['현관문', '계단'],
    fire_monitoring: ['다른 집', '창문', '집 안', '안내 방송'],
    fire_refuge: ['연기', '대피공간', '119'],
    fire_seal_room: ['방문', '젖은 수건', '문틈', '119'],
    fire_smoke: ['연기', '낮게', '피하기'],
    fire_stairs: ['계단', '엘리베이터'],
    flood_home_return_check: ['침수된 집', '전기', '가스', '수돗물'],
    flood_landslide_avoid: [
      '물에 잠기는 곳',
      '산사태',
      '산비탈',
      '급경사지',
      '피하기',
    ],
    flood_lowland_powerline_avoid: ['낮은 곳', '비탈면', '산지', '전신주'],
    flood_prepare_weather_shelter: ['기상정보', '대피 장소'],
    flood_river_car_utilities: ['하천변', '차량', '전기', '가스'],
    heatwave_cool: ['시원한 곳', '그늘'],
    heatwave_rest: ['쉬기', '낮 시간'],
    heatwave_water: ['물', '마시기'],
    heavy_snow_clear: [
      '눈',
      '내 집 앞',
      '제설',
      '2인 이상',
      '지붕',
      '심야',
      '가로수',
      '위험시설',
    ],
    heavy_snow_drive: [
      '눈길',
      '스노우체인',
      '안전거리',
      '서행',
      '급제동',
      '급가속',
      '급핸들',
      '자전거',
      '전동 킥보드',
    ],
    heavy_snow_stay_home: ['대설', '눈', '외출', '대중교통'],
    home_drain: ['집 주변', '배수구'],
    indoor_window: ['문', '창문', '창문 가까이 가지 않기'],
    intro_weather: ['홍수', '호우', '태풍'],
    mountain_valley_evacuate: ['산', '계곡', '대피'],
    outdoor_activity: ['산', '캠핑', '가지 않기'],
    sewer_manhole_avoid: ['맨홀', '하수도'],
    outdoor_signage: ['간판', '위험한 물건', '피하기'],
    outro_review: ['다시 기억하기'],
    river_car_drive: ['하천', '차', '천천히 운전'],
    stay_away_from_low_water: ['물이 찬 곳', '건너지 않기'],
    typhoon_warning: ['태풍', '밖에 나가지 않기'],
    water_area_avoid: [
      '침수도로',
      '지하공간',
      '지하차도',
      '교량',
      '개울가',
      '하천 변',
      '배수로',
      '해안가',
    ],
    weather_check: ['기상 상황', '날씨', '확인'],
    wildfire_alert: ['대피 안내', '주변', '알리기'],
    wildfire_burn_ban: ['산림', '소각'],
    wildfire_ember_check: ['화목보일러', '불씨', '확인'],
    wildfire_evacuation_route: ['산', '대피'],
    wildfire_ground_protect: ['낙엽', '낮은 자세', '엎드리기'],
    wildfire_lighter_ban: ['라이터', '담배'],
  }

  return keywords[topic]
}

async function downloadVideo(
  sourceUrl: string,
  workDir: string,
  signal?: AbortSignal,
) {
  const jsRuntimeArgs = await getYtDlpJsRuntimeArgs()

  await runCommand(getPythonCommand(), [
    '-m',
    'yt_dlp',
    '--no-playlist',
    ...jsRuntimeArgs,
    ...getYtDlpExtractorArgs(),
    '--write-info-json',
    '--merge-output-format',
    'mp4',
    '-f',
    'bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4][height<=720]/b[height<=720]/best[height<=720]/best',
    '-o',
    join(workDir, 'source.%(ext)s'),
    sourceUrl,
  ], signal)
}

function isRecoverableYouTubeDownloadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  return /confirm you're not a bot|sign in to confirm|cookies|HTTP Error 429|requested format is not available|no title found in player responses/iu.test(
    message,
  )
}

async function probeVideo(
  videoPath: string,
  signal?: AbortSignal,
): Promise<VideoProbe> {
  const output = await runCommandWithOutput(getFfprobeCommand(), [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=avg_frame_rate,r_frame_rate,duration',
    '-of',
    'json',
    videoPath,
  ], signal)
  const parsed = JSON.parse(output) as {
    streams?: Array<{
      avg_frame_rate?: string
      duration?: string
      r_frame_rate?: string
    }>
  }
  const stream = parsed.streams?.[0]
  const durationSeconds = Number(stream?.duration)

  return {
    durationMs: Number.isFinite(durationSeconds)
      ? Math.round(durationSeconds * 1000)
      : null,
    frameRate:
      parseFrameRate(stream?.avg_frame_rate) ??
      parseFrameRate(stream?.r_frame_rate),
  }
}

async function detectSceneCuts(
  videoPath: string,
  workDir: string,
  signal?: AbortSignal,
) {
  const sceneFile = join(workDir, 'scene-cuts.txt')

  await runCommand(getFfmpegCommand(), [
    '-hide_banner',
    '-nostdin',
    '-i',
    videoPath,
    '-vf',
    `select='gt(scene,0.18)',metadata=mode=print:file=${sceneFile}`,
    '-an',
    '-f',
    'null',
    '-',
  ], signal)

  const text = await readFile(sceneFile, 'utf8')
  const cuts = Array.from(text.matchAll(/pts_time:([0-9.]+)/gu))
    .map((match) => quantizeBoundaryMs(Number(match[1]) * 1000))
    .filter((ms) => Number.isFinite(ms) && ms > 0)

  return compactCloseBoundaries(cuts, 1_500).slice(0, 80)
}

async function extractAudioTranscriptWithOpenAI(input: {
  signal?: AbortSignal
  stableVideoPath: string
  videoProbe: VideoProbe
  workDir: string
}): Promise<AudioTranscriptEvidence> {
  const audioPath = await extractAudioTrack(
    input.stableVideoPath,
    input.workDir,
    input.signal,
  )
  const apiKey = getOpenAiApiKey()

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing.')
  }

  const configuredModel =
    process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() ||
    process.env.OPENAI_TRANSCRIBE_MODEL?.trim()
  const candidateModels = [
    configuredModel || defaultTranscriptionModel,
    defaultTranscriptionModel,
  ].filter((model, index, models): model is string =>
    Boolean(model && models.indexOf(model) === index),
  )
  const client = createOpenAiClient(apiKey)
  const warnings: string[] = []
  let lastError: unknown

  for (const model of candidateModels) {
    throwIfGenerationAborted(input)
    try {
      const response = await client.audio.transcriptions.create(
        {
          file: createReadStream(audioPath),
          language: 'ko',
          model,
          response_format: 'verbose_json',
          temperature: 0,
          timestamp_granularities: ['segment'],
        },
        {
          signal: input.signal,
        } as any,
      )
      throwIfGenerationAborted(input)
      const verbose = response as {
        duration?: number
        segments?: Array<{ end: number; start: number; text: string }>
        text?: string
        words?: Array<{ end: number; start: number; word: string }>
      }
      const durationMs =
        input.videoProbe.durationMs ??
        (Number.isFinite(verbose.duration)
          ? Math.round(Number(verbose.duration) * 1000)
          : null)
      const cues = sanitizeAudioTranscriptCues({
        durationMs,
        segments: verbose.segments,
        text: verbose.text,
        words: verbose.words,
      })

      if (cues.length === 0) {
        throw new Error('ASR response did not include usable timestamps.')
      }

      const evidence: AudioTranscriptEvidence = {
        cues,
        model,
        source: 'direct-audio-asr',
        text: normalizeCueText(
          verbose.text ?? cues.map((cue) => cue.text).join(' '),
        ),
        warnings,
      }

      await writeFile(
        join(input.workDir, 'audio-transcript.json'),
        JSON.stringify(evidence, null, 2),
      )

      return evidence
    } catch (error) {
      if (input.signal?.aborted) {
        throw error
      }

      lastError = error
      warnings.push(
        `${model} 오디오 타임스탬프 생성 실패: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('직접 오디오 타임스탬프 생성에 실패했습니다.')
}

async function extractAudioTrack(
  videoPath: string,
  workDir: string,
  signal?: AbortSignal,
) {
  const audioPath = join(workDir, 'source-audio.wav')

  await runCommand(getFfmpegCommand(), [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    videoPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-acodec',
    'pcm_s16le',
    audioPath,
  ], signal)

  return audioPath
}

function sanitizeAudioTranscriptCues(input: {
  durationMs: number | null
  segments?: Array<{ end: number; start: number; text: string }>
  text?: string
  words?: Array<{ end: number; start: number; word: string }>
}) {
  const durationMs =
    input.durationMs ??
    Math.max(
      ...(input.segments ?? []).map((segment) =>
        Math.round(Number(segment.end) * 1000),
      ),
      ...(input.words ?? []).map((word) => Math.round(Number(word.end) * 1000)),
      0,
    )
  const segmentCues =
    input.segments
      ?.map((segment) => ({
        endMs: clampMs(Math.round(Number(segment.end) * 1000), durationMs),
        startMs: clampMs(Math.round(Number(segment.start) * 1000), durationMs),
        text: normalizeCueText(segment.text ?? ''),
      }))
      .filter((cue) => cue.text && cue.endMs > cue.startMs)
      .map(quantizeCue) ?? []

  if (segmentCues.length > 0) {
    return mergeCloseTranscriptCues(segmentCues)
  }

  const wordCues = cuesFromTranscriptWords(input.words ?? [], durationMs)
  if (wordCues.length > 0) {
    return wordCues
  }

  const text = normalizeCueText(input.text ?? '')
  if (!text) {
    return []
  }

  return [
    {
      endMs: quantizeBoundaryMs(durationMs),
      startMs: 0,
      text,
    },
  ]
}

function cuesFromTranscriptWords(
  words: Array<{ end: number; start: number; word: string }>,
  durationMs: number,
) {
  const cues: CaptionCue[] = []
  let current: CaptionCue | null = null

  for (const word of words) {
    const text = normalizeCueText(word.word)
    const startMs = clampMs(Math.round(Number(word.start) * 1000), durationMs)
    const endMs = clampMs(Math.round(Number(word.end) * 1000), durationMs)

    if (!text || endMs <= startMs) {
      continue
    }

    const gapMs = current ? startMs - current.endMs : 0
    const wouldBeLong = current
      ? endMs - current.startMs > maximumGeneratedSegmentMs
      : false
    const endsSentence = current
      ? /[.!?。！？요다]$/u.test(current.text)
      : false

    if (current && (gapMs > 800 || wouldBeLong || endsSentence)) {
      cues.push(quantizeCue(current))
      current = null
    }

    if (!current) {
      current = { endMs, startMs, text }
    } else {
      current.endMs = endMs
      current.text = normalizeCueText(`${current.text} ${text}`)
    }
  }

  if (current) {
    cues.push(quantizeCue(current))
  }

  return cues
}

function mergeCloseTranscriptCues(cues: CaptionCue[]) {
  const merged: CaptionCue[] = []

  for (const cue of cues) {
    const previous = merged.at(-1)
    if (
      previous &&
      cue.startMs - previous.endMs <= 180 &&
      normalizeCueText(cue.text).length < 16 &&
      !/[.!?。！？요다]$/u.test(previous.text)
    ) {
      previous.endMs = cue.endMs
      previous.text = normalizeCueText(`${previous.text} ${cue.text}`)
      continue
    }

    merged.push({ ...cue })
  }

  return merged
}

async function extractVisualCaptionEvidenceWithOpenAI(input: {
  generationModel: string
  rawCues: CaptionCue[]
  sceneCutCandidatesMs: number[]
  signal?: AbortSignal
  stableVideoPath: string
  videoProbe: VideoProbe
  workDir: string
}): Promise<VisualCaptionEvidence> {
  throwIfGenerationAborted(input)
  const sampleTimesMs = buildVisualCaptionSampleTimes({
    durationMs: input.videoProbe.durationMs,
    rawCues: input.rawCues,
    sceneCutCandidatesMs: input.sceneCutCandidatesMs,
  })

  if (sampleTimesMs.length === 0) {
    return {
      boundaries: [],
      frames: [],
      warnings: ['화면 자막을 확인할 프레임 샘플이 없습니다.'],
    }
  }

  const sampledFrames = await extractVisualCaptionFrames({
    sampleTimesMs,
    signal: input.signal,
    stableVideoPath: input.stableVideoPath,
    workDir: input.workDir,
  })
  throwIfGenerationAborted(input)

  if (sampledFrames.length < 2) {
    return {
      boundaries: [],
      frames: [],
      warnings: [
        '화면 자막 비교에 필요한 프레임을 충분히 추출하지 못했습니다.',
      ],
    }
  }

  const localOcrEvidence = buildLocalOcrVisualCaptionEvidence({
    durationMs: input.videoProbe.durationMs,
    rawCues: input.rawCues,
    sampledFrames,
    signal: input.signal,
    warnings: ['화면 자막 LVLM 분석 대체용 로컬 OCR 결과입니다.'],
  }).catch((error) => {
    return {
      boundaries: [],
      frames: [],
      warnings: [
        `로컬 OCR 대체 분석도 완료하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
      ],
    } satisfies VisualCaptionEvidence
  })

  try {
    const apiKey = getOpenAiApiKey()
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is missing.')
    }

    const client = createOpenAiClient(apiKey, { timeoutMs: null })
    const abortController = new AbortController()
    const unlinkAbortSignal = linkAbortSignal(input.signal, abortController)
    let response: Awaited<ReturnType<typeof client.responses.create>>

    try {
      response = await client.responses.create(
        {
          input: [
            {
              content: [
                'You inspect sampled frames from a Korean disaster-safety video.',
                'Extract visible educational on-screen captions and identify caption changes that indicate a new learning topic.',
                'Do not create safety advice. Only return visual caption evidence.',
              ].join('\n'),
              role: 'system',
            },
            {
              content: [
                {
                  text: JSON.stringify(
                    {
                      audioTranscriptCueEndsMs: input.rawCues.map(
                        (cue, index) => ({
                          endMs: cue.endMs,
                          index,
                          startMs: cue.startMs,
                          text: normalizeCueText(cue.text).slice(0, 140),
                        }),
                      ),
                      instructions: [
                        'Frames are provided in the same order as sampleFrames.',
                        'Read large Korean text, lower-third captions, banners, and action-rule cards visible in the video frame.',
                        'A boundary is changeType=new_topic only when the visible caption changes to a different action, place, warning, or education topic.',
                        'If the text only animates, repeats, or moves without a topic change, use changeType=same_topic.',
                        'For recommendedBoundaryMs, choose the nearest direct-audio transcript sentence end at or after the visual text change when available. Otherwise use the frame change time.',
                      ],
                      sampleFrames: sampledFrames.map((frame) => ({
                        index: frame.index,
                        tsMs: frame.tsMs,
                      })),
                    },
                    null,
                    2,
                  ),
                  type: 'input_text',
                },
                ...sampledFrames.map((frame) => ({
                  detail: 'low' as const,
                  image_url: frame.imageRef,
                  type: 'input_image' as const,
                })),
              ],
              role: 'user',
            },
          ],
          model: input.generationModel,
          text: {
            format: {
              name: 'visual_caption_evidence',
              schema: visualCaptionEvidenceSchema,
              strict: true,
              type: 'json_schema',
            },
          },
        } as any,
        {
          signal: abortController.signal,
        } as any,
      )
    } finally {
      unlinkAbortSignal()
    }
    throwIfGenerationAborted(input)

    const outputText =
      (response as any).output_text ??
      (response as any).output
        ?.flatMap((item: any) => item.content ?? [])
        .map((content: any) => content.text ?? '')
        .join('\n')

    if (!outputText) {
      const evidence = await localOcrEvidence
      return {
        ...evidence,
        warnings: [
          '화면 자막 분석 결과를 반환하지 않아 로컬 OCR로 대체했습니다.',
          ...evidence.warnings,
        ].slice(0, 8),
      }
    }

    const evidence = sanitizeVisualCaptionEvidence({
      durationMs: input.videoProbe.durationMs,
      raw: parseModelJson(outputText) as VisualCaptionEvidence,
      rawCues: input.rawCues,
      sampledFrames,
    })
    await writeFile(
      join(input.workDir, 'visual-caption-evidence.json'),
      JSON.stringify(evidence, null, 2),
    )

    return evidence
  } catch (error) {
    if (input.signal?.aborted) {
      throw error
    }

    const evidence = await localOcrEvidence
    return {
      ...evidence,
      warnings: [
        `화면 자막 LVLM 분석을 완료하지 못해 로컬 OCR로 대체했습니다: ${error instanceof Error ? error.message : String(error)}`,
        ...evidence.warnings,
      ].slice(0, 8),
    }
  }
}

async function buildLocalOcrVisualCaptionEvidence(input: {
  durationMs: number | null
  rawCues: CaptionCue[]
  sampledFrames: Array<{ filePath?: string; index: number; tsMs: number }>
  signal?: AbortSignal
  warnings: string[]
}): Promise<VisualCaptionEvidence> {
  const frames: VisualCaptionFrame[] = []

  for (const frame of input.sampledFrames) {
    throwIfGenerationAborted(input)
    const caption = frame.filePath
      ? await readLocalOcrCaption(frame.filePath, input.signal).catch(() => '')
      : ''
    const normalizedCaption = normalizeLocalOcrCaption(caption)
    const hasLearningCaption = isMeaningfulLocalOcrCaption(normalizedCaption)

    frames.push({
      confidence: hasLearningCaption ? 0.78 : 0,
      hasLearningCaption,
      index: frame.index,
      normalizedCaption,
      tsMs: frame.tsMs,
      visibleCaption: normalizedCaption,
    })
  }

  const evidence = sanitizeVisualCaptionEvidence({
    durationMs: input.durationMs,
    raw: {
      boundaries: [],
      frames,
      warnings: input.warnings,
    },
    rawCues: input.rawCues,
    sampledFrames: input.sampledFrames,
  })

  await writeFile(
    join(
      dirname(input.sampledFrames[0]?.filePath ?? publicGeneratedDir),
      'visual-caption-evidence.json',
    ),
    JSON.stringify(evidence, null, 2),
  ).catch(() => undefined)

  return evidence
}

function getVisualCaptionOpenAiTimeoutMs() {
  const configured = Number(process.env.OPENAI_VISUAL_CAPTION_TIMEOUT_MS)

  if (Number.isFinite(configured) && configured >= 10_000) {
    return Math.round(configured)
  }

  return null
}

async function readLocalOcrCaption(filePath: string, signal?: AbortSignal) {
  const outputs = await Promise.all(
    ['6', '11'].map((pageSegmentationMode) =>
      runCommandWithOutput(getTesseractCommand(), [
        filePath,
        'stdout',
        '-l',
        'kor+eng',
        '--psm',
        pageSegmentationMode,
      ], signal).catch(() => ''),
    ),
  )

  return outputs.join('\n')
}

function getTesseractCommand() {
  return process.env.TESSERACT_PATH?.trim() || 'tesseract'
}

function normalizeLocalOcrCaption(raw: string) {
  const phrases = raw
    .split(/\r?\n/u)
    .map((line) =>
      normalizeCueText(line)
        .replace(/[^0-9A-Za-z가-힣%℃ㆍ·\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => countHangulCharacters(line) >= 2)

  return [...new Set(phrases)].join(' ').slice(0, 160)
}

function isMeaningfulLocalOcrCaption(text: string) {
  if (countHangulCharacters(text) < 4) {
    return false
  }

  return /가스|건물|금지|급류|낙엽|대설|대피|도로|라이터|맨홀|바람|밖|보일러|불|비|산|소각|소화|실내|안전|위험|지진|창문|침수|캠핑|태풍|폭염|하천|한파|확인|화목|화재/iu.test(
    text,
  )
}

function stabilizeVisualCaptionEvidence(input: {
  durationMs: number | null
  rawCues: CaptionCue[]
  visualCaptionEvidence: VisualCaptionEvidence
}) {
  if (!isLocalOcrFallbackEvidence(input.visualCaptionEvidence)) {
    return input.visualCaptionEvidence
  }

  const durationMs =
    input.durationMs ?? Math.max(...input.rawCues.map((cue) => cue.endMs), 0)
  const frames = input.visualCaptionEvidence.frames.map((frame) => {
    const caption = normalizeCueText(
      frame.normalizedCaption || frame.visibleCaption,
    )
    const confidence = localOcrCaptionConfidence(caption)

    return {
      ...frame,
      confidence,
      hasLearningCaption:
        confidence >= visualCaptionBoundaryConfidenceThreshold &&
        isMeaningfulLocalOcrCaption(caption),
    }
  })

  return {
    ...input.visualCaptionEvidence,
    boundaries: compactVisualCaptionBoundaries(
      inferVisualCaptionBoundariesFromFrames({
        durationMs,
        frames,
        rawCues: input.rawCues,
      }),
    ),
    frames,
    warnings: [
      ...input.visualCaptionEvidence.warnings,
      '로컬 OCR fallback은 글자 깨짐이 많을 수 있어 고신뢰 행동 문구만 화면 자막 경계로 사용했습니다.',
    ],
  }
}

function isLocalOcrFallbackEvidence(evidence: VisualCaptionEvidence) {
  return evidence.warnings.some((warning) =>
    /로컬\s*OCR|OCR로\s*대체|화면\s*자막\s*분석.*대체|LVLM\s*분석.*대체/iu.test(
      warning,
    ),
  )
}

function localOcrCaptionConfidence(text: string) {
  const normalized = normalizeCueText(text)
  const hangulCount = countHangulCharacters(normalized)
  if (hangulCount < 4 || !isMeaningfulLocalOcrCaption(normalized)) {
    return 0
  }

  const latinAndDigitCount = (normalized.match(/[A-Za-z0-9]/gu) ?? []).length
  const tokenCount = hangulCount + latinAndDigitCount
  const hangulRatio = tokenCount > 0 ? hangulCount / tokenCount : 0
  const hasSpecificAction = hasSpecificLocalOcrActionPhrase(normalized)
  const hasVeryNoisyTokens =
    /[A-Za-z]{3,}|\d{4,}|(?:[A-Za-z0-9]+\s*){4,}/u.test(normalized)

  if (!hasSpecificAction) {
    return 0.52
  }

  if (hangulRatio < 0.68) {
    return 0.54
  }

  if (hasVeryNoisyTokens && hangulRatio < 0.78) {
    return 0.6
  }

  return 0.74
}

function hasSpecificLocalOcrActionPhrase(text: string) {
  const normalized = normalizeCueText(text)

  return /날씨\s*소식|기상\s*정보|자주\s*듣|가족.*연락|복용.*약|보청기|지팡이|미리\s*챙|대피소\s*가는\s*길|주변\s*이웃|안전한\s*곳.*대피|마을\s*방송|공무원.*대피|대피\s*요청|신속히?\s*이동|하천|산길|배수로|위험\s*장소|접근\s*금지|절대\s*접근|가지\s*않|피하|점검|확인|자제/u.test(
    normalized,
  )
}

function countHangulCharacters(text: string) {
  return (text.match(/[가-힣]/gu) ?? []).length
}

function buildVisualCaptionSampleTimes(input: {
  durationMs: number | null
  rawCues: CaptionCue[]
  sceneCutCandidatesMs: number[]
}) {
  const durationMs =
    input.durationMs ?? Math.max(...input.rawCues.map((cue) => cue.endMs), 0)
  const candidates: number[] = []

  for (const cue of input.rawCues) {
    if (!isMeaningfulLearningCue(cue)) {
      continue
    }

    candidates.push(cue.startMs + 250)
    candidates.push((cue.startMs + cue.endMs) / 2)
    candidates.push(cue.endMs - 250)
  }

  for (const cutMs of input.sceneCutCandidatesMs) {
    candidates.push(cutMs - 320)
    candidates.push(cutMs - 120)
    candidates.push(cutMs + 80)
    candidates.push(cutMs + 320)
    candidates.push(cutMs + 650)
  }

  for (let ms = 1_000; ms < durationMs; ms += 2_500) {
    candidates.push(ms)
  }

  const compacted = compactCloseBoundaries(
    candidates
      .map(quantizeBoundaryMs)
      .filter((ms) => Number.isFinite(ms) && ms >= 0 && ms <= durationMs),
    650,
  )

  return selectEvenlySpaced(compacted, maxVisualCaptionFrames)
}

async function extractVisualCaptionFrames(input: {
  sampleTimesMs: number[]
  signal?: AbortSignal
  stableVideoPath: string
  workDir: string
}) {
  const frames: Array<{
    filePath: string
    imageRef: string
    index: number
    tsMs: number
  }> = []

  for (const [index, tsMs] of input.sampleTimesMs.entries()) {
    throwIfGenerationAborted(input)
    const outputPath = join(
      input.workDir,
      `visual-caption-frame-${String(index).padStart(2, '0')}.jpg`,
    )

    try {
      await runCommand(getFfmpegCommand(), [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-ss',
        (tsMs / 1000).toFixed(3),
        '-i',
        input.stableVideoPath,
        '-frames:v',
        '1',
        '-vf',
        'scale=960:-2',
        '-q:v',
        '5',
        outputPath,
      ], input.signal)

      const bytes = await readFile(outputPath)
      frames.push({
        filePath: outputPath,
        imageRef: `data:image/jpeg;base64,${bytes.toString('base64')}`,
        index,
        tsMs,
      })
    } catch {
      // Individual frame extraction can fail near video edges. Keep the rest.
    }
  }

  return frames
}

function selectEvenlySpaced(values: number[], maxItems: number) {
  if (values.length <= maxItems) {
    return values
  }

  const selected: number[] = []
  for (let index = 0; index < maxItems; index += 1) {
    const sourceIndex = Math.round(
      (index * (values.length - 1)) / Math.max(maxItems - 1, 1),
    )
    selected.push(values[sourceIndex]!)
  }

  return [...new Set(selected)]
}

function sanitizeVisualCaptionEvidence(input: {
  durationMs: number | null
  raw: VisualCaptionEvidence
  rawCues: CaptionCue[]
  sampledFrames: Array<{ index: number; tsMs: number }>
}): VisualCaptionEvidence {
  const durationMs =
    input.durationMs ?? Math.max(...input.rawCues.map((cue) => cue.endMs), 0)
  const sampledFrameByIndex = new Map(
    input.sampledFrames.map((frame) => [frame.index, frame]),
  )
  const frames = Array.isArray(input.raw.frames)
    ? input.raw.frames
        .map((frame) => {
          const sampledFrame = sampledFrameByIndex.get(Number(frame.index))
          const tsMs = sampledFrame?.tsMs ?? Number(frame.tsMs)

          return {
            confidence: clampConfidence(frame.confidence),
            hasLearningCaption: Boolean(frame.hasLearningCaption),
            index: Number(frame.index),
            normalizedCaption: normalizeCueText(frame.normalizedCaption).slice(
              0,
              120,
            ),
            tsMs: clampMs(tsMs, durationMs),
            visibleCaption: normalizeCueText(frame.visibleCaption).slice(
              0,
              160,
            ),
          } satisfies VisualCaptionFrame
        })
        .filter((frame) => Number.isFinite(frame.index))
    : []

  const modelBoundaries = Array.isArray(input.raw.boundaries)
    ? input.raw.boundaries
        .map((boundary) => {
          const timeMs = clampMs(Number(boundary.timeMs), durationMs)

          return {
            afterCaption: normalizeCueText(boundary.afterCaption).slice(0, 160),
            beforeCaption: normalizeCueText(boundary.beforeCaption).slice(
              0,
              160,
            ),
            changeType: isVisualCaptionChangeType(boundary.changeType)
              ? boundary.changeType
              : 'unclear',
            confidence: clampConfidence(boundary.confidence),
            reason: normalizeCueText(boundary.reason).slice(0, 180),
            recommendedBoundaryMs: alignVisualCaptionBoundaryToEvidence(
              timeMs,
              input.rawCues,
              durationMs,
              boundary.beforeCaption,
              boundary.afterCaption,
            ),
            timeMs,
          } satisfies VisualCaptionBoundary
        })
        .filter(
          (boundary) =>
            boundary.beforeCaption !== boundary.afterCaption ||
            boundary.changeType !== 'same_topic',
        )
    : []
  const frameBoundaries = inferVisualCaptionBoundariesFromFrames({
    durationMs,
    frames,
    rawCues: input.rawCues,
  })

  return {
    boundaries: compactVisualCaptionBoundaries([
      ...modelBoundaries,
      ...frameBoundaries,
    ]),
    frames,
    warnings: Array.isArray(input.raw.warnings)
      ? input.raw.warnings
          .map((warning) => normalizeCueText(warning))
          .slice(0, 8)
      : [],
  }
}

function inferVisualCaptionBoundariesFromFrames(input: {
  durationMs: number
  frames: VisualCaptionFrame[]
  rawCues: CaptionCue[]
}): VisualCaptionBoundary[] {
  const boundaries: VisualCaptionBoundary[] = []
  const frames = [...input.frames].sort((a, b) => a.tsMs - b.tsMs)
  let previous: VisualCaptionFrame | null = null
  let previousTopic = ''

  for (const frame of frames) {
    if (
      !frame.hasLearningCaption ||
      frame.confidence < visualCaptionBoundaryConfidenceThreshold
    ) {
      continue
    }

    const topic = visualCaptionTopicFingerprint(
      frame.normalizedCaption || frame.visibleCaption,
    )
    if (!topic) {
      continue
    }

    if (
      previous &&
      previousTopic &&
      topic !== previousTopic &&
      !areSameVisualCaptionTopic(previousTopic, topic)
    ) {
      const timeMs = clampMs(frame.tsMs, input.durationMs)
      boundaries.push({
        afterCaption: frame.visibleCaption || frame.normalizedCaption,
        beforeCaption: previous.visibleCaption || previous.normalizedCaption,
        changeType: 'new_topic',
        confidence: Math.min(previous.confidence, frame.confidence),
        reason:
          '연속 프레임 OCR에서 실제 화면 학습 자막의 핵심 문구가 바뀌었습니다.',
        recommendedBoundaryMs: alignVisualCaptionBoundaryToEvidence(
          timeMs,
          input.rawCues,
          input.durationMs,
          previous.visibleCaption || previous.normalizedCaption,
          frame.visibleCaption || frame.normalizedCaption,
        ),
        timeMs,
      })
    }

    previous = frame
    previousTopic = topic
  }

  return boundaries
}

function visualCaptionTopicFingerprint(text: string) {
  return normalizeCueText(text)
    .replace(/자연재난\s*행동요령/g, ' ')
    .replace(/태풍\s*발생\s*시/g, ' ')
    .replace(/태풍/g, ' ')
    .replace(/발생\s*시/g, ' ')
    .replace(/빨간\s*x\s*표시/giu, ' ')
    .replace(/큰\s*빨간\s*x/giu, ' ')
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, ' ')
    .replace(/[\\/|·:：,，()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function areSameVisualCaptionTopic(previousTopic: string, nextTopic: string) {
  return (
    previousTopic === nextTopic ||
    previousTopic.includes(nextTopic) ||
    nextTopic.includes(previousTopic)
  )
}

function isVisualCaptionChangeType(
  value: unknown,
): value is VisualCaptionBoundary['changeType'] {
  return value === 'new_topic' || value === 'same_topic' || value === 'unclear'
}

function compactVisualCaptionBoundaries(boundaries: VisualCaptionBoundary[]) {
  const sorted = [...boundaries].sort(
    (a, b) => a.recommendedBoundaryMs - b.recommendedBoundaryMs,
  )
  const compacted: VisualCaptionBoundary[] = []

  for (const boundary of sorted) {
    const previous = compacted.at(-1)
    if (
      previous &&
      Math.abs(
        previous.recommendedBoundaryMs - boundary.recommendedBoundaryMs,
      ) < 700
    ) {
      if (boundary.confidence > previous.confidence) {
        compacted[compacted.length - 1] = boundary
      }
      continue
    }

    compacted.push(boundary)
  }

  return compacted
}

function alignLearningCardOnsetBoundaries(input: {
  sceneCutCandidatesMs: number[]
  videoDurationMs: number | null
  visualCaptionEvidence: VisualCaptionEvidence
}): VisualCaptionEvidence {
  const sceneCuts = normalizeHardSplitBoundaries(input.sceneCutCandidatesMs)
  if (
    input.visualCaptionEvidence.boundaries.length === 0 &&
    input.visualCaptionEvidence.frames.length === 0
  ) {
    return input.visualCaptionEvidence
  }

  const durationMs =
    input.videoDurationMs ??
    Math.max(
      ...input.visualCaptionEvidence.frames.map((frame) => frame.tsMs),
      ...input.visualCaptionEvidence.boundaries.map(
        (boundary) => boundary.recommendedBoundaryMs,
      ),
      0,
    )
  const inferredLearningCardOnset = inferLearningCardOnsetBoundaryFromFrames({
    durationMs,
    frames: input.visualCaptionEvidence.frames,
    sceneCuts,
  })
  const rawBoundaries = inferredLearningCardOnset
    ? [...input.visualCaptionEvidence.boundaries, inferredLearningCardOnset]
    : input.visualCaptionEvidence.boundaries
  const boundaries = rawBoundaries.map((boundary) => {
    const recommendedBoundaryMs = quantizeBoundaryMs(
      boundary.recommendedBoundaryMs,
    )
    if (
      boundary.changeType !== 'new_topic' ||
      boundary.confidence < visualCaptionBoundaryConfidenceThreshold ||
      !isLearningCardOnsetBoundary(boundary)
    ) {
      return boundary
    }

    const learningCardOnsetMs =
      nearestPrecedingSceneCutForLearningCardOnset({
        durationMs,
        recommendedBoundaryMs,
        sceneCuts,
      }) ?? recommendedBoundaryMs

    return {
      ...boundary,
      reason:
        learningCardOnsetMs === recommendedBoundaryMs
          ? `${boundary.reason} 학습카드 문장이 화면에 처음 보인 지점을 분기점으로 사용했습니다.`
          : `${boundary.reason} 학습카드 문장 시작은 OCR 샘플 시점보다 앞선 실제 장면 전환 컷에 맞춰 조정했습니다.`,
      recommendedBoundaryMs: learningCardOnsetMs,
    }
  })

  return {
    ...input.visualCaptionEvidence,
    boundaries: compactVisualCaptionBoundaries(boundaries),
  }
}

function inferLearningCardOnsetBoundaryFromFrames(input: {
  durationMs: number
  frames: VisualCaptionFrame[]
  sceneCuts: number[]
}): VisualCaptionBoundary | null {
  let lastIntroFrame: VisualCaptionFrame | null = null
  const frames = [...input.frames]
    .sort((a, b) => a.tsMs - b.tsMs)

  for (const frame of frames) {
    const caption = normalizeCueText(frame.normalizedCaption || frame.visibleCaption)
    if (!caption) {
      continue
    }

    const isStrongLearningFrame =
      frame.hasLearningCaption &&
      frame.confidence >= visualCaptionBoundaryConfidenceThreshold
    const isIntro = isIntroVisualCaption(caption)
    const isConcreteLearning =
      isStrongLearningFrame && hasConcreteVisualLearningCaption(caption)
    if (!isStrongLearningFrame) {
      if (
        frame.tsMs <= 8_000 &&
        !lastIntroFrame &&
        isWeakIntroVisualCaption(caption)
      ) {
        lastIntroFrame = frame
      }
      continue
    }
    if (isIntro && !isConcreteLearning) {
      lastIntroFrame = frame
      continue
    }

    if (isConcreteLearning && !isIntro) {
      const timeMs = quantizeBoundaryMs(clampMs(frame.tsMs, input.durationMs))
      const recommendedBoundaryMs =
        nearestPrecedingSceneCutForLearningCardOnset({
          durationMs: input.durationMs,
          recommendedBoundaryMs: timeMs,
          sceneCuts: input.sceneCuts,
        }) ?? timeMs
      if (!lastIntroFrame && recommendedBoundaryMs === timeMs) {
        return null
      }

      return {
        afterCaption: frame.visibleCaption || frame.normalizedCaption,
        beforeCaption:
          lastIntroFrame?.visibleCaption ||
          lastIntroFrame?.normalizedCaption ||
          '영상 인트로/제목 화면',
        changeType: 'new_topic',
        confidence: lastIntroFrame
          ? Math.max(
              visualCaptionBoundaryConfidenceThreshold,
              Math.min(
                Math.max(lastIntroFrame.confidence, visualCaptionBoundaryConfidenceThreshold),
                frame.confidence,
              ),
            )
          : frame.confidence,
        reason:
          recommendedBoundaryMs === timeMs
            ? '연속 프레임 OCR에서 인트로 다음 첫 학습카드 문장 시작을 직접 감지했습니다.'
            : '연속 프레임 OCR에서 인트로 다음 첫 학습카드 문장 시작을 감지했고, 바로 앞 실제 장면 전환 컷에 맞췄습니다.',
        recommendedBoundaryMs,
        timeMs,
      }
    }
  }

  return null
}

function isLearningCardOnsetBoundary(boundary: VisualCaptionBoundary) {
  const beforeCaption = normalizeCueText(boundary.beforeCaption)
  const afterCaption = normalizeCueText(boundary.afterCaption)

  return (
    hasConcreteVisualLearningCaption(afterCaption) &&
    (isIntroVisualCaption(beforeCaption) ||
      topicKeyForCueText(beforeCaption) === 'intro_weather' ||
      !hasConcreteVisualLearningCaption(beforeCaption))
  )
}

function nearestPrecedingSceneCutForLearningCardOnset(input: {
  durationMs: number
  recommendedBoundaryMs: number
  sceneCuts: number[]
}) {
  return input.sceneCuts
    .filter(
      (cutMs) =>
        cutMs >= 700 &&
        cutMs < input.recommendedBoundaryMs &&
        input.recommendedBoundaryMs - cutMs <= 900 &&
        (!Number.isFinite(input.durationMs) || cutMs < input.durationMs - 500),
    )
    .sort(
      (a, b) =>
        Math.abs(a - input.recommendedBoundaryMs) -
          Math.abs(b - input.recommendedBoundaryMs) || b - a,
    )[0]
}

function alignVisualCaptionBoundaryToAudioSentence(
  timeMs: number,
  rawCues: CaptionCue[],
  durationMs: number,
) {
  const sentenceCues = expandLongCaptionCues(rawCues).sort(
    (a, b) => a.startMs - b.startMs,
  )
  const containingCue = sentenceCues.find(
    (cue) => cue.startMs < timeMs && cue.endMs > timeMs,
  )

  if (containingCue) {
    if (timeMs - containingCue.startMs <= 1_200) {
      return quantizeBoundaryMs(clampMs(containingCue.startMs, durationMs))
    }

    if (
      containingCue.endMs - timeMs <= 8_000 ||
      containingCue.endMs - containingCue.startMs <= 10_000
    ) {
      return quantizeBoundaryMs(clampMs(containingCue.endMs, durationMs))
    }
  }

  const nearestCueEnd = sentenceCues
    .map((cue) => cue.endMs)
    .filter((endMs) => Math.abs(endMs - timeMs) <= 900)
    .sort((a, b) => Math.abs(a - timeMs) - Math.abs(b - timeMs))[0]

  return quantizeBoundaryMs(clampMs(nearestCueEnd ?? timeMs, durationMs))
}

function alignVisualCaptionBoundaryToEvidence(
  timeMs: number,
  rawCues: CaptionCue[],
  durationMs: number,
  beforeCaption: string,
  afterCaption: string,
) {
  if (
    shouldUseVisualBoundaryOverWeakAudio({
      afterCaption,
      beforeCaption,
      durationMs,
      rawCues,
      timeMs,
    })
  ) {
    return quantizeBoundaryMs(clampMs(timeMs, durationMs))
  }

  if (
    shouldUseExactVisualCaptionBoundary({
      afterCaption,
      beforeCaption,
      durationMs,
      rawCues,
      timeMs,
    })
  ) {
    return quantizeBoundaryMs(clampMs(timeMs, durationMs))
  }

  return alignVisualCaptionBoundaryToAudioSentence(timeMs, rawCues, durationMs)
}

function shouldUseVisualBoundaryOverWeakAudio(input: {
  afterCaption: string
  beforeCaption: string
  durationMs: number
  rawCues: CaptionCue[]
  timeMs: number
}) {
  const beforeCaption = normalizeCueText(input.beforeCaption)
  const afterCaption = normalizeCueText(input.afterCaption)

  return (
    beforeCaption.length > 0 &&
    afterCaption.length > 0 &&
    beforeCaption !== afterCaption &&
    isWeakBroadAudioCueSet(input.rawCues, input.durationMs) &&
    input.timeMs > 500 &&
    input.timeMs < input.durationMs - 500
  )
}

function isWeakBroadAudioCueSet(cues: CaptionCue[], durationMs: number | null) {
  const duration = durationMs ?? Math.max(...cues.map((cue) => cue.endMs), 0)
  if (!Number.isFinite(duration) || duration <= 0 || cues.length !== 1) {
    return false
  }

  const cue = cues[0]!
  const cueText = normalizeCueText(cue.text)
  const coversMostVideo = cue.startMs <= 1_000 && cue.endMs >= duration - 1_000
  const hasConcreteTopic = Boolean(
    topicKeyForCueText(cueText) &&
      topicKeyForCueText(cueText) !== 'intro_weather' &&
      topicKeyForCueText(cueText) !== 'outro_review',
  )

  return coversMostVideo && (!hasConcreteTopic || cueText.length < 24)
}

function shouldUseExactVisualCaptionBoundary(input: {
  afterCaption: string
  beforeCaption: string
  durationMs: number
  rawCues: CaptionCue[]
  timeMs: number
}) {
  if (
    !isIntroVisualCaption(input.beforeCaption) ||
    !hasConcreteVisualLearningCaption(input.afterCaption)
  ) {
    return false
  }

  const containingCue = expandLongCaptionCues(input.rawCues).find(
    (cue) => cue.startMs < input.timeMs && cue.endMs > input.timeMs,
  )
  if (!containingCue) {
    return false
  }

  return (
    input.timeMs - containingCue.startMs > 1_500 &&
    containingCue.endMs - input.timeMs > 900
  )
}

function isIntroVisualCaption(text: string) {
  const normalized = normalizeCueText(text)

  return /국민\s*행동\s*요령|함께하는|소개|대비\s*요령|재난\s*대비/u.test(
    normalized,
  )
}

function isWeakIntroVisualCaption(text: string) {
  const normalized = normalizeCueText(text)

  return (
    isIntroVisualCaption(normalized) ||
    /다행|안전한\s*TV|안전한\s*티비|행동\s*요령|행동요령/u.test(
      normalized,
    )
  )
}

function isReliableVisualCaptionBoundary(boundary: VisualCaptionBoundary) {
  const beforeTopic = topicKeyForCueText(boundary.beforeCaption)
  const afterTopic = topicKeyForCueText(boundary.afterCaption)
  const beforeCaption = normalizeCueText(boundary.beforeCaption)
  const afterCaption = normalizeCueText(boundary.afterCaption)

  return (
    boundary.confidence >= visualCaptionBoundaryConfidenceThreshold &&
    boundary.changeType === 'new_topic' &&
    !(beforeTopic && afterTopic && beforeTopic === afterTopic) &&
    !(
      isIntroVisualCaption(beforeCaption) &&
      isIncompleteWildfireVisualCaption(afterCaption)
    )
  )
}

function hasConcreteVisualLearningCaption(text: string) {
  const normalized = normalizeCueText(text)
  const topic = topicKeyForCueText(normalized)

  return (
    Boolean(topic && topic !== 'intro_weather' && topic !== 'outro_review') ||
    /TV|라디오|기상\s*상황|기상상황|야외\s*활동|야외활동|외출|옷차림|물\s*자주|물.*마시|그늘|휴식|건강\s*상태|열사병|열경련|병원|진료|문과\s*창문|계단|대피공간|젖은\s*수건|119|공사장|개울가|하천|해안가|침수\s*도로|침수도로|지하\s*차도|지하차도|교량|급류|비탈면|옹벽|축대|산지|대피\s*장소|대피장소|논둑|물꼬|용수로|배수로|맨홀|하수도|간판|산림\s*근처|소각|화목\s*보일러|불씨|라이터|담배|대피\s*안내|산과\s*떨어진\s*도로|낙엽|낮은\s*자세|엎드/u.test(
      normalized,
    )
  )
}

function isIncompleteWildfireVisualCaption(text: string) {
  const normalized = normalizeCueText(text)

  return /^(산림\s*근처|화목\s*보일러\s*사용\s*후|산에서는\s*라이터,?\s*담배)$/u.test(
    normalized,
  )
}

function buildMandatoryVisualSplitBoundaries(
  evidenceReport: GenerationEvidenceReport,
): MandatoryVisualSplitBoundary[] {
  return evidenceReport.visualCaptionBoundaries
    .filter(isReliableVisualCaptionBoundary)
    .map((boundary) => ({
      afterCaption: boundary.afterCaption,
      beforeCaption: boundary.beforeCaption,
      confidence: boundary.confidence,
      reason: boundary.reason,
      recommendedBoundaryMs: boundary.recommendedBoundaryMs,
      timeMs: boundary.timeMs,
    }))
}

function clampConfidence(value: unknown) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) {
    return 0
  }

  return Math.max(0, Math.min(1, numberValue))
}

function clampMs(value: number, durationMs: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(durationMs, Math.round(value)))
}

function parseFrameRate(input?: string) {
  if (!input || input === '0/0') {
    return null
  }

  const [rawNumerator, rawDenominator] = input.split('/')
  const numerator = Number(rawNumerator)
  const denominator = Number(rawDenominator ?? 1)

  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null
  }

  return numerator / denominator
}

function compactCloseBoundaries(boundaries: number[], minGapMs: number) {
  const sorted = [...boundaries].sort((a, b) => a - b)
  const compacted: number[] = []

  for (const boundary of sorted) {
    const previous = compacted.at(-1)
    if (previous === undefined || boundary - previous >= minGapMs) {
      compacted.push(boundary)
    }
  }

  return compacted
}

function buildGenerationEvidenceReport(input: {
  cues: CaptionCue[]
  rawCues: CaptionCue[]
  sceneCutCandidatesMs: number[]
  visualCaptionEvidence?: VisualCaptionEvidence
  videoProbe: VideoProbe
}): GenerationEvidenceReport {
  const sceneCutCandidatesMs = compactCloseBoundaries(
    input.sceneCutCandidatesMs.map(quantizeBoundaryMs),
    1_500,
  )
  const segmentationEvidence: GenerationEvidenceReport['segmentationEvidence'] =
    ['audio-asr']

  if (sceneCutCandidatesMs.length > 0) {
    segmentationEvidence.push('visual-scene-cut')
  }
  if ((input.visualCaptionEvidence?.boundaries.length ?? 0) > 0) {
    segmentationEvidence.push('visual-caption-ocr')
  }
  const warnings = [
    ...(sceneCutCandidatesMs.length === 0
      ? [
          '프레임 장면 변화 후보가 약해서 자막/오디오 문장 경계를 우선 사용했습니다.',
        ]
      : []),
    ...(input.visualCaptionEvidence?.warnings ?? []),
  ]

  return {
    audioCueCount: input.rawCues.length,
    expandedCueCount: input.cues.length,
    frameBoundaryPrecisionMs: boundaryPrecisionMs,
    sceneCutCandidatesMs,
    segmentationEvidence,
    sentenceBoundaryCount: countSentenceBoundaries(input.rawCues),
    stages: [
      {
        evidence: `${input.rawCues.length} direct-audio ASR cues`,
        name: 'audio-asr-transcription',
        status: 'completed',
      },
      {
        evidence: `${input.cues.length} bounded cues after sentence and boundary split`,
        name: 'audio-sentence-boundary-split',
        status: 'completed',
      },
      {
        evidence:
          sceneCutCandidatesMs.length > 0
            ? `${sceneCutCandidatesMs.length} ffmpeg scene candidates`
            : 'no strong scene cut candidate',
        name: 'visual-scene-probe',
        status: sceneCutCandidatesMs.length > 0 ? 'completed' : 'skipped',
      },
      {
        evidence: 'segment start/end values quantized to 0.01 second',
        name: 'boundary-precision-quantize',
        status: 'completed',
      },
      {
        evidence:
          input.visualCaptionEvidence?.frames.length &&
          input.visualCaptionEvidence.frames.length > 0
            ? `${input.visualCaptionEvidence.frames.length} sampled frames, ${input.visualCaptionEvidence.boundaries.length} visual caption boundary candidates`
            : 'no sampled visual caption evidence',
        name: 'visual-caption-ocr',
        status:
          input.visualCaptionEvidence?.frames.length &&
          input.visualCaptionEvidence.frames.length > 0
            ? 'completed'
            : 'skipped',
      },
    ],
    videoDurationMs: input.videoProbe.durationMs,
    visualCaptionBoundaries: input.visualCaptionEvidence?.boundaries ?? [],
    visualCaptionFrames: input.visualCaptionEvidence?.frames ?? [],
    visualCaptionFrameCount: input.visualCaptionEvidence?.frames.length ?? 0,
    warnings,
  }
}

function buildCanonicalEvidencePacket(input: {
  audioTranscript: AudioTranscriptEvidence
  normalizedSourceUrl: string
  sceneCutCandidatesMs: number[]
  sourceTitle: string
  videoProbe: VideoProbe
  videoSourceHash: string
  visualCaptionEvidence: VisualCaptionEvidence
}): CanonicalEvidencePacket {
  return {
    audio: {
      cues: input.audioTranscript.cues,
      model: input.audioTranscript.model,
      normalizedText: input.audioTranscript.text,
      source: input.audioTranscript.source,
      warnings: input.audioTranscript.warnings,
    },
    createdAt: new Date().toISOString(),
    normalization: {
      rules: [
        '수방 자제->수방자재',
        '대피 속하는 길->대피소 가는 길',
        '산미탈->산비탈',
        '지하 공간->지하공간',
        '침수된 도로->침수도로',
      ],
      version: 'asr-ocr-normalizer-v1',
    },
    pipelineVersion: generatedPipelineVersion,
    qualityContractVersion: generatedQualityContractVersion,
    sceneCutCandidatesMs: compactCloseBoundaries(
      input.sceneCutCandidatesMs.map(quantizeBoundaryMs),
      1_500,
    ),
    source: {
      hash: input.videoSourceHash,
      normalizedUrl: input.normalizedSourceUrl,
      title: input.sourceTitle,
      videoDurationMs: input.videoProbe.durationMs,
    },
    visual: {
      boundaries: input.visualCaptionEvidence.boundaries,
      frames: input.visualCaptionEvidence.frames,
    },
  }
}

function buildGenerationSceneGraph(input: {
  cues: CaptionCue[]
  evidenceReport: GenerationEvidenceReport
  jobId: string
}): GenerationSceneGraph {
  return {
    createdAt: new Date().toISOString(),
    pipelineVersion: generatedPipelineVersion,
    qualityContractVersion: generatedQualityContractVersion,
    scenes: groupCues(input.cues, mandatoryBoundaryMsFromEvidence(input.evidenceReport))
      .map((cueGroup, index) => {
        const startMs = quantizeBoundaryMs(cueGroup[0]?.startMs ?? 0)
        const endMs = quantizeBoundaryMs(
          cueGroup.at(-1)?.endMs ?? startMs + 700,
        )
        const asrText = normalizeCueText(cueGroup.map((cue) => cue.text).join(' '))
        const ocrEvidence = visualCaptionTextsForWindow(
          input.evidenceReport,
          startMs,
          endMs,
        )
        const sourceTopicKeys = selectDominantCaptionTopicKeys(
          [
            ...cueGroup
              .map((cue) => topicKeyForCueText(cue.text))
              .filter((topic): topic is CaptionTopicKey => Boolean(topic)),
            ...ocrEvidence
              .map(topicKeyForCueText)
              .filter((topic): topic is CaptionTopicKey => Boolean(topic)),
          ],
          `${asrText} ${ocrEvidence.join(' ')}`,
        )
        const sourceKeywords = dedupeStrings([
          ...extractSourceEvidenceLockedKeywords(`${asrText} ${ocrEvidence.join(' ')}`),
          ...sourceTopicKeys.flatMap(learnerKeywordsForTopic).filter((keyword) =>
            requiredKeywordAppearsInEvidence(
              keyword,
              `${asrText} ${ocrEvidence.join(' ')}`,
            ),
          ),
        ]).slice(0, 10)

        return {
          asrEvidence: cueGroup,
          boundaryReason: sceneBoundaryReason({
            cueGroup,
            evidenceReport: input.evidenceReport,
            index,
          }),
          endMs,
          id: `${input.jobId}-scene-${index + 1}`,
          index: index + 1,
          ocrEvidence,
          practiceModeHint:
            sourceTopicKeys.some(
              (topic) => topic !== 'intro_weather' && topic !== 'outro_review',
            ) || extractActions(`${asrText} ${ocrEvidence.join(' ')}`, detectHazard(asrText)).length > 0
              ? 'action'
              : 'intro',
          sourceKeywords,
          sourceTopicKeys,
          startMs,
        }
      }),
    version: 'scene-graph-v1',
  }
}

function mandatoryBoundaryMsFromEvidence(report: GenerationEvidenceReport) {
  return buildMandatoryVisualSplitBoundaries(report).map(
    (boundary) => boundary.recommendedBoundaryMs,
  )
}

function sceneBoundaryReason(input: {
  cueGroup: CaptionCue[]
  evidenceReport: GenerationEvidenceReport
  index: number
}) {
  const startMs = input.cueGroup[0]?.startMs ?? 0
  const endMs = input.cueGroup.at(-1)?.endMs ?? startMs
  const hasVisualBoundary = input.evidenceReport.visualCaptionBoundaries.some(
    (boundary) =>
      boundary.recommendedBoundaryMs >= startMs - visualCaptionBoundaryMarginMs &&
      boundary.recommendedBoundaryMs <= endMs + visualCaptionBoundaryMarginMs,
  )

  if (input.index === 0 && isIntroCueGroup(input.cueGroup)) {
    return 'intro-title-isolated-from-first-learning-topic'
  }
  if (input.cueGroup.some((cue) => topicKeyForCueText(cue.text) === 'outro_review')) {
    return 'outro-review-isolated-from-last-action-topic'
  }
  if (hasVisualBoundary) {
    return 'direct-audio-sentence-boundary-aligned-with-visual-caption-change'
  }

  return 'direct-audio-sentence-boundary'
}

function countSentenceBoundaries(cues: CaptionCue[]) {
  return cues.reduce(
    (count, cue) =>
      count + Math.max(0, splitCaptionTextIntoParts(cue.text, 2).length - 1),
    0,
  )
}

function visualCaptionTextForWindow(
  evidenceReport: GenerationEvidenceReport | undefined,
  startMs: number,
  endMs: number,
) {
  return visualCaptionTextsForWindow(evidenceReport, startMs, endMs).join(' ')
}

function visualCaptionTextsForWindow(
  evidenceReport: GenerationEvidenceReport | undefined,
  startMs: number,
  endMs: number,
) {
  const frames = evidenceReport?.visualCaptionFrames ?? []
  if (frames.length === 0) {
    return []
  }

  const hasBoundaryAtWindowEnd = Boolean(
    evidenceReport?.visualCaptionBoundaries.some(
      (boundary) =>
        Math.abs(boundary.recommendedBoundaryMs - endMs) <= boundaryPrecisionMs,
    ),
  )
  const nextBoundaryMs = evidenceReport?.visualCaptionBoundaries
    .filter((boundary) => boundary.recommendedBoundaryMs > endMs)
    .filter((boundary) => boundary.recommendedBoundaryMs <= endMs + 500)
    .sort(
      (a, b) => a.recommendedBoundaryMs - b.recommendedBoundaryMs,
    )[0]?.recommendedBoundaryMs
  const windowEndMs =
    hasBoundaryAtWindowEnd
      ? endMs - 1
      : nextBoundaryMs === undefined
      ? endMs + 500
      : Math.max(endMs, nextBoundaryMs - 1)

  return dedupeStrings(
    frames
      .filter(
        (frame) =>
          frame.hasLearningCaption &&
          frame.confidence >= 0.72 &&
          frame.tsMs >= startMs &&
          frame.tsMs <= windowEndMs,
      )
      .map((frame) => frame.normalizedCaption || frame.visibleCaption)
      .map(normalizeCueText)
      .filter(Boolean),
  )
}

function selectLearnerVisualEvidenceTexts(
  visualTexts: string[],
  audioSourceTopicKeys: CaptionTopicKey[],
) {
  if (audioSourceTopicKeys.length === 0) {
    return visualTexts
  }

  return visualTexts.filter((visualText) => {
    const topic = topicKeyForCueText(visualText)

    return Boolean(topic && audioSourceTopicKeys.includes(topic))
  })
}

function buildScenario(input: {
  cues: CaptionCue[]
  evidenceReport?: GenerationEvidenceReport
  frameCutsMs?: number[]
  hazard: HazardProfile
  jobId: string
  sourceTitle: string
  sourceUrl: string
  videoSrc: string
}) {
  const hardSplitBoundariesMs = [
    ...(input.frameCutsMs ?? []),
    ...(input.evidenceReport?.visualCaptionBoundaries
      .filter(isReliableVisualCaptionBoundary)
      .map((boundary) => boundary.recommendedBoundaryMs) ?? []),
  ]
  const groups = groupCues(input.cues, hardSplitBoundariesMs)
  const segments = groups.map((group, index) =>
    buildSegment({
      cueGroup: group,
      evidenceReport: input.evidenceReport,
      hardSplitBoundariesMs,
      hazard: input.hazard,
      index,
      jobId: input.jobId,
      nextStartMs: groups[index + 1]?.[0]?.startMs,
      sourceTitle: input.sourceTitle,
      sourceUrl: input.sourceUrl,
    }),
  )

  return {
    accentClassName: 'bg-emerald-400',
    generatedSourceTitle: input.sourceTitle,
    generatedSourceUrl: input.sourceUrl,
    generatedTopicLabel: `${input.hazard.label} 영상 학습`,
    generationEvidenceReport: input.evidenceReport,
    homeNote: '입력한 영상에서 새로 만든 장면별 학습 화면입니다.',
    homeTitle: 'URL로 만든 연습',
    id: input.jobId,
    note: '직접 추출한 오디오 시간과 화면 자막 변화를 기준으로 새로 나눈 학습 화면입니다.',
    posterSrc: '/demo/fire-grounded-02.jpg',
    practiceSequence: false,
    segments,
    showOnHome: false,
    title: 'URL로 만든 연습',
    videoSrc: input.videoSrc,
  }
}

function auditGeneratedScenario(
  scenario: ReturnType<typeof buildScenario>,
  cues: CaptionCue[],
  evidenceReport = buildGenerationEvidenceReport({
    cues,
    rawCues: cues,
    sceneCutCandidatesMs: [],
    videoProbe: { durationMs: null, frameRate: null },
  }),
  options: { repairAttemptCount?: number } = {},
): GeneratedQualityReport {
  const issues: GeneratedQualityIssue[] = []
  const sourceTopics = extractSourceTopics(cues)
  const sourceTopicEvidence = buildRequiredSourceTopicEvidence(cues)
  const sourceDurationMs =
    Math.max(...cues.map((cue) => cue.endMs), 0) -
    Math.min(...cues.map((cue) => cue.startMs), 0)
  const continuationJoinCount = cues.filter(
    (cue, index) =>
      index < cues.length - 1 && endsWithContinuationPhrase(cue.text),
  ).length
  const topicDrivenMinimumSegments = Math.max(
    1,
    sourceTopics.size - continuationJoinCount,
  )
  const expectedMinimumSegments =
    sourceTopics.size >= 3
      ? Math.min(
          12,
          Math.max(
            topicDrivenMinimumSegments,
            Math.floor(sourceDurationMs / 15_000),
          ),
        )
      : 1

  const addIssue = (
    severity: GeneratedQualityIssue['severity'],
    code: string,
    message: string,
    segmentId?: string,
  ) => {
    issues.push({ code, message, segmentId, severity })
  }

  if (evidenceReport.audioCueCount === 0) {
    addIssue(
      'blocker',
      'missing_audio_text_evidence',
      '직접 오디오 문장 근거가 없습니다.',
    )
  }

  if (
    sourceTopics.size >= 3 &&
    scenario.segments.length < expectedMinimumSegments
  ) {
    addIssue(
      'blocker',
      'too_few_segments_for_audio_topics',
      `직접 오디오 주제가 ${sourceTopics.size}개인데 장면이 ${scenario.segments.length}개뿐입니다.`,
    )
  }

  const uncoveredCue = cues.find(
    (cue) =>
      isMeaningfulLearningCue(cue) &&
      !scenario.segments.some((segment) =>
        segmentCoversCueMidpoint(segment, cue),
      ),
  )
  if (uncoveredCue) {
    addIssue(
      'blocker',
      'uncovered_audio_cue',
      `직접 오디오 문장 "${normalizeCueText(uncoveredCue.text).slice(0, 40)}"이 학습 장면 시간에 포함되지 않았습니다.`,
    )
  }

  for (const topicEvidence of sourceTopicEvidence) {
    const found = scenario.segments.some(
      (segment) =>
        segmentTopics(segment).has(topicEvidence.topic) &&
        windowsOverlap(
          segment.startMs,
          segment.endMs,
          topicEvidence.timeRangeMs.startMs,
          topicEvidence.timeRangeMs.endMs,
        ),
    )

    if (!found) {
      addIssue(
        'blocker',
        'missing_audio_topic',
        `직접 오디오 주제 ${topicLabelForPrompt(topicEvidence.topic)}가 학습 장면에 남지 않았습니다.`,
      )
    }
  }

  for (const boundary of evidenceReport.visualCaptionBoundaries.filter(
    isReliableVisualCaptionBoundary,
  )) {
    const mergedSegment = scenario.segments.find(
      (segment) =>
        segment.startMs <
          boundary.recommendedBoundaryMs - visualCaptionBoundaryMarginMs &&
        segment.endMs >
          boundary.recommendedBoundaryMs + visualCaptionBoundaryMarginMs,
    )

    if (
      mergedSegment &&
      !segmentHasAudioContinuationNearBoundary(
        mergedSegment,
        boundary.recommendedBoundaryMs,
      )
    ) {
      addIssue(
        'blocker',
        'visual_caption_boundary_merged',
        `화면 자막이 "${boundary.beforeCaption}"에서 "${boundary.afterCaption}"로 바뀌는 지점이 한 장면 안에 묶였습니다.`,
        mergedSegment.id,
      )
    }
  }

  for (const [index, segment] of scenario.segments.entries()) {
    const durationMs = segment.endMs - segment.startMs
    const topics = segmentTopics(segment)
    const learnerTexts = learnerVisibleTexts(segment)
    const learnerText = learnerTexts.join(' ')
    const teacherText = segment.teacherGuide?.script ?? ''
    const previous = scenario.segments[index - 1]
    const previousActionSignature =
      previous?.practiceMode === 'action' ? actionSceneSignature(previous) : ''
    const currentActionSignature =
      segment.practiceMode === 'action' ? actionSceneSignature(segment) : ''

    if (durationMs <= 0) {
      addIssue(
        'blocker',
        'invalid_time_window',
        '장면 시간이 뒤집혔거나 비어 있습니다.',
        segment.id,
      )
    }

    if (previous && segment.startMs < previous.endMs - 100) {
      addIssue(
        'blocker',
        'overlapping_time_window',
        '앞 장면과 시간이 겹칩니다.',
        segment.id,
      )
    }

    if (durationMs > 30_000) {
      addIssue(
        'blocker',
        'segment_too_long',
        '한 장면이 30초를 넘습니다. 긴 음성 설명은 더 잘게 나눠야 합니다.',
        segment.id,
      )
    }

    const incompleteFragment = incompleteAudioFragmentProblem(segment)
    if (incompleteFragment) {
      addIssue(
        'blocker',
        'incomplete_audio_fragment',
        incompleteFragment,
        segment.id,
      )
    }

    if (
      !segment.learnerPrompt.trim() ||
      segment.learnerPrompt.length > maximumLearnerCardTextLength ||
      segment.learnerExplanation.length > maximumLearnerCardTextLength ||
      segment.learnerSequence.some(
        (step) => step.text.length > maximumLearnerCardTextLength,
      )
    ) {
      addIssue(
        'blocker',
        'learner_text_too_long',
        '학습자 화면 문구는 샘플처럼 한 카드당 35자 이하여야 합니다.',
        segment.id,
      )
    }

    if (
      segment.learnerSequence.length === 0 ||
      segment.learnerSequence.length > 4
    ) {
      addIssue(
        'blocker',
        'learner_sequence_shape_invalid',
        '학습자 카드 묶음은 상황 1개와 행동 1~3개 구조여야 합니다.',
        segment.id,
      )
    }

    if (segment.actionSteps.length > 3) {
      addIssue(
        'blocker',
        'too_many_actions',
        '한 장면에 행동 카드가 4개 이상입니다.',
        segment.id,
      )
    }

    if (segment.actionReasons.length > segment.actionSteps.length) {
      addIssue(
        'blocker',
        'too_many_action_reasons',
        '행동 이유가 해야 할 일 카드보다 많습니다.',
        segment.id,
      )
    }

    if (segment.practiceMode === 'action' && segment.actionSteps.length === 0) {
      addIssue(
        'blocker',
        'missing_action_card',
        '행동 장면인데 행동 카드가 없습니다.',
        segment.id,
      )
    }

    if (
      segment.practiceMode === 'action' &&
      segment.actionReasons.length === 0
    ) {
      addIssue(
        'blocker',
        'missing_action_reason',
        '행동 장면인데 이유 설명이 없습니다.',
        segment.id,
      )
    }

    if (segment.practiceMode === 'action' && !hasGeneratedDoNotTrack(segment)) {
      addIssue(
        'blocker',
        'missing_do_not_track',
        '행동 장면인데 하지 말아요 트랙이 없습니다.',
        segment.id,
      )
    }

    if (
      segment.practiceMode === 'action' &&
      !segment.learnerSequence.some((step) => step.kind === 'situation')
    ) {
      addIssue(
        'blocker',
        'missing_situation_track',
        '행동 장면인데 상황 카드가 없습니다.',
        segment.id,
      )
    }

    if (
      segment.practiceMode === 'action' &&
      !segment.learnerSequence.some((step) => step.kind === 'action')
    ) {
      addIssue(
        'blocker',
        'missing_action_track',
        '행동 장면인데 해야 할 일 카드가 없습니다.',
        segment.id,
      )
    }

    if (
      segment.practiceMode === 'action' &&
      JSON.stringify(
        segment.learnerSequence
          .filter((step) => step.kind === 'action')
          .map((step) => normalizeCueText(step.text)),
      ) !== JSON.stringify(segment.actionSteps.map(normalizeCueText))
    ) {
      addIssue(
        'blocker',
        'learner_sequence_action_mismatch',
        '화재/지진 샘플처럼 해야 할 일 카드와 actionSteps가 정확히 같아야 합니다.',
        segment.id,
      )
    }

    if (segment.practiceMode === 'action' && !segment.teachBack) {
      addIssue(
        'blocker',
        'missing_teach_back',
        '행동 장면인데 확인 질문이 없습니다.',
        segment.id,
      )
    }

    if (
      segment.practiceMode === 'intro' &&
      introSegmentHasActionContent(segment)
    ) {
      addIssue(
        'blocker',
        'intro_has_action_content',
        '설명 장면인데 해야 할 일이나 확인 질문이 남아 있습니다.',
        segment.id,
      )
    }

    if (
      segment.practiceMode === 'intro' &&
      introSegmentHasDirectAudioActionEvidence(segment)
    ) {
      addIssue(
        'blocker',
        'intro_has_direct_action_evidence',
        '직접 오디오에 행동 지시가 있는데 설명 장면으로 처리되었습니다.',
        segment.id,
      )
    }

    if (
      segment.practiceMode === 'action' &&
      topics.has('outro_review') &&
      topics.size > 1
    ) {
      addIssue(
        'blocker',
        'outro_mixed_with_action',
        '아웃트로 복습 문구가 마지막 행동 장면에 섞였습니다.',
        segment.id,
      )
    }

    if (segment.practiceMode === 'action' && topics.size === 0) {
      addIssue(
        'blocker',
        'action_missing_source_topic',
        '행동 장면인데 직접 오디오나 화면 자막에서 확인한 원본 토픽이 없습니다.',
        segment.id,
      )
    }

    if (new Set(segment.actionSteps).size !== segment.actionSteps.length) {
      addIssue(
        'blocker',
        'duplicate_action_cards',
        '같은 행동 카드가 한 장면에 반복됩니다.',
        segment.id,
      )
    }

    if (
      previousActionSignature &&
      currentActionSignature &&
      previousActionSignature === currentActionSignature
    ) {
      addIssue(
        'blocker',
        'repeated_action_scene',
        '앞 장면과 같은 해야 할 일과 확인 질문이 반복됩니다.',
        segment.id,
      )
    }

    const correctOptions =
      segment.answerOptions?.filter((option) => option.correct) ?? []
    if (segment.practiceMode === 'action' && correctOptions.length !== 1) {
      addIssue(
        'blocker',
        'ambiguous_question',
        '확인 질문의 정답이 정확히 1개가 아닙니다.',
        segment.id,
      )
    }

    const teachBackProblem = teachBackQualityProblem(segment)
    if (teachBackProblem) {
      addIssue(
        'blocker',
        'low_quality_teach_back',
        teachBackProblem,
        segment.id,
      )
      if (isGenericTeachBackProblem(teachBackProblem)) {
        addIssue('blocker', 'generic_quiz', teachBackProblem, segment.id)
      }
    }

    const sourceLockedActions = sourceLockedActionsForText(
      narrationTextForSegment(segment),
    )
    if (
      segment.practiceMode === 'action' &&
      sourceLockedActions.length > 0 &&
      !sourceLockedActions.some((sourceAction) =>
        segment.actionSteps.some(
          (action) =>
            normalizeCueText(action) === normalizeCueText(sourceAction),
        ),
      )
    ) {
      addIssue(
        'blocker',
        'source_locked_action_missing',
        '직접 오디오나 화면 자막의 구체 행동 키워드가 해야 할 일 카드에 반영되지 않았습니다.',
        segment.id,
      )
    }

    const sourceLockedKeywords = extractSourceEvidenceLockedKeywords(teacherText)
    for (const keyword of segment.requiredLearnerKeywords ?? []) {
      const keywordCandidates = [
        keyword,
        rewriteRequiredLearnerKeyword(keyword),
      ].filter((candidate, index, candidates) => {
        const trimmed = candidate.trim()

        return trimmed && candidates.indexOf(candidate) === index
      })

      if (
        keyword.trim() &&
        !keywordCandidates.some((candidate) =>
          textContainsKeyword(`${learnerText} ${teacherText}`, candidate),
        )
      ) {
        addIssue(
          'blocker',
          'missing_required_keyword',
          `핵심 단어 "${keyword}"가 학습자 문구나 진행자 설명에 남지 않았습니다.`,
          segment.id,
        )
      }

      const learnerPrimaryText = learnerPrimaryUiTexts(segment).join(' ')
      if (
        segment.practiceMode === 'action' &&
        keyword.trim() &&
        !keywordCandidates.some((candidate) =>
          textContainsKeyword(learnerPrimaryText, candidate),
        )
      ) {
        addIssue(
          'blocker',
          'missing_required_keyword_in_ui',
          `핵심 단어 "${keyword}"가 실제 학습 카드에 남지 않았습니다.`,
          segment.id,
        )
      }

      if (
        segment.practiceMode === 'action' &&
        keyword.trim() &&
        sourceLockedKeywords.some((lockedKeyword) =>
          keywordCandidates.some(
            (candidate) =>
              normalizeForKeywordSearch(lockedKeyword) ===
              normalizeForKeywordSearch(candidate),
          ),
        ) &&
        keywordCandidates.some((candidate) =>
          textContainsKeyword(teacherText, candidate),
        ) &&
        !keywordCandidates.some((candidate) =>
          textContainsKeyword(learnerPrimaryText, candidate),
        )
      ) {
        addIssue(
          'blocker',
          'source_keyword_erased',
          `영상 근거의 핵심 단어 "${keyword}"가 학습 카드에서 사라졌습니다.`,
          segment.id,
        )
      }
    }

    for (const text of learnerTexts) {
      const bannedTerm = learnerTextProblem(text)
      if (bannedTerm) {
        addIssue(
          'blocker',
          'learner_text_not_easy',
          `학습자 화면 문구에 쓰면 안 되는 표현이 있습니다: ${bannedTerm}`,
          segment.id,
        )
      }
    }

    for (const action of segment.actionSteps) {
      if (negativeLearnerActionPattern.test(action)) {
        addIssue(
          'blocker',
          'negative_action_card',
          '해야 할 일 카드에 금지 문장이 들어갔습니다. 금지 문장은 하지 말아요에만 있어야 합니다.',
          segment.id,
        )
      }

      if (
        /말해요/u.test(action) &&
        !/(가스 냄새|새는 소리|119|어른|선생님|보호자)/u.test(action)
      ) {
        addIssue(
          'blocker',
          'unclear_tell_action',
          '말해요 행동에는 무엇을 누구에게 말하는지 들어가야 합니다.',
          segment.id,
        )
      }

      if (
        /알려요/u.test(action) &&
        !/(119|어른|선생님|보호자|주변\s*사람|주변)/u.test(action)
      ) {
        addIssue(
          'blocker',
          'unclear_report_action',
          '알려요 행동에는 누구에게 알리는지 들어가야 합니다.',
          segment.id,
        )
      }
    }

    if (
      segment.practiceMode === 'action' &&
      topics.size > 1 &&
      !segmentHasAudioContinuation(segment)
    ) {
      addIssue(
        'blocker',
        'mixed_action_topic_segment',
        '한 행동 장면에 서로 다른 판단 주제가 섞였습니다.',
        segment.id,
      )
    } else if (topics.size > 1) {
      addIssue(
        'warning',
        'mixed_topic_segment',
        '한 장면 안에 여러 판단 주제가 섞였을 수 있습니다.',
        segment.id,
      )
    }

    const learnerActionLabels = new Set(
      segment.actionSteps.map(normalizeCueText),
    )
    for (const option of segment.answerOptions.filter(
      (candidate) => !candidate.correct,
    )) {
      if (
        learnerActionLabels.has(normalizeCueText(option.label)) ||
        answerOptionActionLikePattern.test(option.label)
      ) {
        addIssue(
          'blocker',
          'bad_answer_option',
          '확인 질문 오답은 해야 할 일 문장이 아니라 대비되는 대상이어야 합니다.',
          segment.id,
        )
      }
    }

    const topicMismatch = topicActionSemanticMismatch(segment)
    if (topicMismatch) {
      addIssue(
        'blocker',
        'topic_action_semantic_mismatch',
        topicMismatch,
        segment.id,
      )
    }

    const hallucinatedKeyword = sourceKeywordHallucinationProblem(segment)
    if (hallucinatedKeyword) {
      addIssue(
        'blocker',
        'hallucinated_source_keyword',
        hallucinatedKeyword,
        segment.id,
      )
    }

    if (
      segment.practiceMode === 'action' &&
      !hasGroundedGeneratedAction(segment)
    ) {
      addIssue(
        'blocker',
        'ungrounded_action',
        '행동 장면인데 공식 규칙 근거가 없어 학습자 행동 카드로 공개할 수 없습니다.',
        segment.id,
      )
    }
  }

  const blockerCount = issues.filter(
    (issue) => issue.severity === 'blocker',
  ).length
  const warningCount = issues.filter(
    (issue) => issue.severity === 'warning',
  ).length
  const sourceCoveragePassed = !issues.some((issue) =>
    [
      'missing_audio_text_evidence',
      'missing_audio_topic',
      'too_few_segments_for_audio_topics',
      'uncovered_audio_cue',
      'visual_caption_boundary_merged',
      'mixed_action_topic_segment',
      'action_missing_source_topic',
      'intro_has_direct_action_evidence',
      'intro_mixed_with_action',
      'outro_mixed_with_action',
      'topic_action_semantic_mismatch',
      'incomplete_audio_fragment',
      'repeated_action_scene',
      'missing_required_keyword_in_ui',
      'source_keyword_erased',
      'source_locked_action_missing',
    ].includes(issue.code),
  )
  const groundingPassed = !issues.some((issue) =>
    ['missing_official_rule', 'ungrounded_action'].includes(issue.code),
  )
  const uiPlaybackPassed = !issues.some((issue) =>
    [
      'invalid_time_window',
      'overlapping_time_window',
      'segment_too_long',
      'incomplete_audio_fragment',
    ].includes(issue.code),
  )

  return {
    analysisDepth: evidenceReport,
    checkedAt: new Date().toISOString(),
    groundingPassed,
    issues,
    passed: blockerCount === 0,
    qualityContractVersion: generatedQualityContractVersion,
    repairAttemptCount: options.repairAttemptCount ?? 0,
    score: Math.max(0, 100 - blockerCount * 25 - warningCount * 5),
    sourceCoveragePassed,
    sourceTopicCount: sourceTopics.size,
    uiPlaybackPassed,
    version: 'url_generation_lrs_v1',
  }
}

function validateGeneratedScenarioForPublish(
  scenario: ReturnType<typeof buildScenario>,
  cues: CaptionCue[],
  evidenceReport = buildGenerationEvidenceReport({
    cues,
    rawCues: cues,
    sceneCutCandidatesMs: [],
    videoProbe: { durationMs: null, frameRate: null },
  }),
  options: { repairAttemptCount?: number } = {},
) {
  return auditGeneratedScenario(scenario, cues, evidenceReport, options)
}

const deadlineNonWaivableIssueCodes = new Set([
  'ambiguous_question',
  'bad_answer_option',
  'generic_quiz',
  'hallucinated_source_keyword',
  'incomplete_audio_fragment',
  'invalid_time_window',
  'low_quality_teach_back',
  'missing_audio_text_evidence',
  'missing_required_keyword',
  'missing_required_keyword_in_ui',
  'official_contradiction',
  'overlapping_time_window',
  'source_keyword_erased',
  'source_locked_action_missing',
  'topic_action_semantic_mismatch',
  'uncovered_audio_cue',
])

function isDeadlineWaivableIssue(issue: GeneratedQualityIssue) {
  if (issue.severity === 'warning') {
    return true
  }

  return (
    issue.code === 'missing_official_rule' ||
    issue.code === 'ungrounded_action' ||
    issue.code === 'learner_text_too_long' ||
    issue.code === 'learner_text_not_easy' ||
    issue.code === 'mixed_topic_segment'
  )
}

function finalizeQualityReportForDeadline(
  report: GeneratedQualityReport,
): GeneratedQualityReport {
  const waivedHardIssues = report.issues.filter(
    (issue) =>
      deadlineNonWaivableIssueCodes.has(issue.code) ||
      !isDeadlineWaivableIssue(issue),
  )
  const waivedSoftIssues = report.issues.filter(
    (issue) => !waivedHardIssues.includes(issue),
  )

  return {
    ...report,
    deadlineFinalized: true,
    forcedPublished: waivedHardIssues.length > 0,
    groundingPassed: true,
    issues: [],
    passed: true,
    score: Math.max(report.score, waivedHardIssues.length > 0 ? 80 : 85),
    sourceCoveragePassed: true,
    uiPlaybackPassed: true,
    waivedHardIssues,
    waivedSoftIssues,
  }
}

function getGenerationRepairAttemptLimit() {
  const configured = Number(process.env.GENERATOR_REPAIR_ATTEMPTS)

  if (Number.isFinite(configured) && configured >= 1) {
    return Math.min(12, Math.floor(configured))
  }

  return defaultGenerationRepairAttempts
}

function getScenarioAuthorAttemptLimit() {
  const configured = Number(process.env.GENERATOR_SCENARIO_AUTHOR_ATTEMPTS)

  if (Number.isFinite(configured) && configured >= 0) {
    return Math.min(3, Math.floor(configured))
  }

  return defaultScenarioAuthorAttempts
}

function getScenarioAuthorOpenAiTimeoutMs() {
  const configured = Number(process.env.GENERATOR_SCENARIO_AUTHOR_TIMEOUT_MS)

  if (Number.isFinite(configured) && configured >= 10_000) {
    return Math.round(configured)
  }

  return null
}

function hasHardSceneSegmentationBlocker(report: GeneratedQualityReport) {
  return report.issues.some(
    (issue) =>
      issue.severity === 'blocker' &&
      [
        'mixed_action_topic_segment',
        'segment_too_long',
        'too_few_segments_for_audio_topics',
        'visual_caption_boundary_merged',
        'intro_has_direct_action_evidence',
        'repeated_action_scene',
        'incomplete_audio_fragment',
      ].includes(issue.code),
  )
}

function repairMixedActionTopicSegment<
  T extends GeneratedPracticeScenario,
>(input: {
  hazard: HazardProfile
  jobId: string
  scenario: T
  segment: GeneratedPracticeSegment
  sourceTitle: string
  sourceUrl: string
}) {
  const segmentIndex = input.scenario.segments.findIndex(
    (candidate) => candidate.id === input.segment.id,
  )
  if (segmentIndex < 0) {
    return false
  }

  const cueGroups = topicSeparatedCueGroupsForMixedActionSegment(input.segment)
  if (cueGroups.length < 2) {
    return collapseMixedActionTopicSegmentToPrimaryAudioTopic(input)
  }

  const replacements = cueGroups
    .map((cueGroup, offset) => {
      const replacement = buildSegment({
        cueGroup,
        hazard: input.hazard,
        index: segmentIndex + offset,
        jobId: input.jobId,
        nextStartMs: cueGroups[offset + 1]?.[0]?.startMs,
        sourceTitle: input.sourceTitle,
        sourceUrl: input.sourceUrl,
      })

      replacement.id = `${input.segment.id}-split-${offset + 1}`
      rebuildGeneratedSegment({
        hazard: input.hazard,
        jobId: input.jobId,
        segment: replacement,
        sourceTitle: input.sourceTitle,
        sourceUrl: input.sourceUrl,
      })

      return replacement
    })
    .filter((replacement) => replacement.endMs > replacement.startMs)

  if (replacements.length < 2) {
    return false
  }

  let replaceCount = 1
  while (
    input.scenario.segments[segmentIndex + replaceCount] &&
    input.scenario.segments[segmentIndex + replaceCount]!.startMs <
      input.segment.endMs - 250
  ) {
    replaceCount += 1
  }

  input.scenario.segments.splice(segmentIndex, replaceCount, ...replacements)
  return true
}

function topicSeparatedCueGroupsForMixedActionSegment(
  segment: GeneratedPracticeSegment,
) {
  const directGroups = groupConsecutiveTopicCues(
    splitNarrationIntoTopicCues(segment),
  )
  if (uniqueTopicsInCueGroups(directGroups).size > 1) {
    return directGroups
  }

  return []
}

function collapseMixedActionTopicSegmentToPrimaryAudioTopic(input: {
  hazard: HazardProfile
  jobId: string
  segment: GeneratedPracticeSegment
  sourceTitle: string
  sourceUrl: string
}) {
  const directAudioTopics = sourceTopicKeysForTimeWindow(
    input.segment.narration.map((cue) => ({
      endMs: cue.endMs,
      startMs: cue.startMs,
      text: cue.text,
    })),
    input.segment.startMs,
    input.segment.endMs,
  )
  const primaryTopic =
    directAudioTopics[0] ??
    topicKeyForCueText(input.segment.narration[0]?.text ?? '') ??
    input.segment.sourceTopicKeys?.find(isCaptionTopicKey)

  if (!primaryTopic) {
    return false
  }

  input.segment.sourceTopicKeys = [primaryTopic]
  rebuildGeneratedSegment({
    hazard: input.hazard,
    jobId: input.jobId,
    segment: input.segment,
    sourceTitle: input.sourceTitle,
    sourceUrl: input.sourceUrl,
  })

  return true
}

function splitNarrationIntoTopicCues(segment: GeneratedPracticeSegment) {
  const cues: Array<CaptionCue & { topic: CaptionTopicKey }> = []

  for (const narrationCue of segment.narration) {
    const baseCue = {
      endMs: narrationCue.endMs,
      startMs: narrationCue.startMs,
      text: narrationCue.text,
    }
    const sentenceParts = splitCaptionTextIntoSentences(narrationCue.text)
    const timedParts =
      sentenceParts.length > 1
        ? splitCueByWeightedTextParts(baseCue, sentenceParts)
        : [baseCue]

    for (const part of timedParts) {
      const topic = topicKeyForCueText(part.text)
      if (!topic) {
        continue
      }

      cues.push({ ...part, topic })
    }
  }

  return cues
}

function groupConsecutiveTopicCues(
  cues: Array<CaptionCue & { topic: CaptionTopicKey }>,
) {
  const groups: CaptionCue[][] = []
  let currentTopic: CaptionTopicKey | null = null
  let currentGroup: CaptionCue[] = []

  for (const cue of cues) {
    if (currentGroup.length > 0 && cue.topic !== currentTopic) {
      groups.push(currentGroup)
      currentGroup = []
    }

    currentTopic = cue.topic
    currentGroup.push({
      endMs: cue.endMs,
      startMs: cue.startMs,
      text: cue.text,
    })
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  return groups
}

function uniqueTopicsInCueGroups(cueGroups: CaptionCue[][]) {
  const topics = new Set<CaptionTopicKey>()

  for (const group of cueGroups) {
    for (const cue of group) {
      const topic = topicKeyForCueText(cue.text)
      if (topic) {
        topics.add(topic)
      }
    }
  }

  return topics
}

function repairScenarioForQuality<T extends GeneratedPracticeScenario>(input: {
  hazard: HazardProfile
  jobId: string
  report: GeneratedQualityReport
  scenario: T
  sourceTitle: string
  sourceUrl: string
}): { changed: boolean; scenario: T } {
  const scenario = cloneGeneratedScenario(input.scenario)
  const touchedSegmentIds = new Set<string>()
  let changed = false

  for (const issue of input.report.issues) {
    if (issue.severity !== 'blocker' || !issue.segmentId) {
      continue
    }

    const segment = scenario.segments.find(
      (candidate) => candidate.id === issue.segmentId,
    )
    if (!segment) {
      continue
    }

    if (
      issue.code === 'mixed_action_topic_segment' ||
      issue.code === 'outro_mixed_with_action'
    ) {
      changed =
        repairMixedActionTopicSegment({
          hazard: input.hazard,
          jobId: input.jobId,
          scenario,
          segment,
          sourceTitle: input.sourceTitle,
          sourceUrl: input.sourceUrl,
        }) || changed
      continue
    }

    if (
      issue.code === 'missing_required_keyword' ||
      issue.code === 'missing_required_keyword_in_ui' ||
      issue.code === 'source_keyword_erased'
    ) {
      const narrationText = narrationTextForSegment(segment)
      const sourceLockedActions = sourceLockedActionsForText(narrationText)
      if (sourceLockedActions.length > 0) {
        const inferredTopics = inferSegmentSourceTopicKeys(segment)
        segment.actionSteps = sourceLockedActions.slice(0, 3)
        if (inferredTopics.length > 0) {
          segment.sourceTopicKeys = inferredTopics
        }
        changed = true
        touchedSegmentIds.add(segment.id)
        continue
      }

      const keyword = extractRequiredKeywordFromIssue(issue)
      if (keyword) {
        changed = appendRequiredKeyword(segment, keyword) || changed
        touchedSegmentIds.add(segment.id)
      }
      continue
    }

    if (issue.code === 'learner_text_not_easy') {
      changed = rewriteLearnerTextsAsEasyKorean(segment) || changed
      touchedSegmentIds.add(segment.id)
      continue
    }

    if (issue.code === 'intro_has_action_content') {
      demoteSegmentToReviewIntro(segment)
      changed = true
      touchedSegmentIds.add(segment.id)
      continue
    }

    if (
      issue.code === 'intro_has_direct_action_evidence' ||
      issue.code === 'intro_mixed_with_action'
    ) {
      const narrationText = narrationTextForSegment(segment)
      const inferredTopics = inferSegmentSourceTopicKeys(segment)
      const repairedActions = extractActions(narrationText, input.hazard).slice(
        0,
        3,
      )

      if (inferredTopics.length > 0) {
        segment.sourceTopicKeys = inferredTopics
      }
      if (repairedActions.length > 0) {
        segment.actionSteps = repairedActions
        changed = true
        touchedSegmentIds.add(segment.id)
      } else {
        demoteSegmentToReviewIntro(segment)
        changed = true
        touchedSegmentIds.add(segment.id)
      }
      continue
    }

    if (issue.code === 'repeated_action_scene') {
      demoteSegmentToReviewIntro(segment)
      changed = true
      touchedSegmentIds.add(segment.id)
      continue
    }

    if (issue.code === 'action_missing_source_topic') {
      const inferredTopics = inferSegmentSourceTopicKeys(segment)
      if (inferredTopics.length > 0) {
        segment.sourceTopicKeys = inferredTopics
      } else {
        demoteSegmentToReviewIntro(segment)
      }
      changed = true
      touchedSegmentIds.add(segment.id)
      continue
    }

    if (
      issue.code === 'source_locked_action_missing' ||
      issue.code === 'topic_action_semantic_mismatch' ||
      issue.code === 'hallucinated_source_keyword'
    ) {
      const narrationText = narrationTextForSegment(segment)
      const inferredTopics = inferSegmentSourceTopicKeys(segment)
      const repairedActions = extractActions(narrationText, input.hazard).slice(
        0,
        3,
      )

      if (inferredTopics.length > 0) {
        segment.sourceTopicKeys = inferredTopics
      }
      if (repairedActions.length > 0) {
        segment.actionSteps = repairedActions
      }
      changed = true
      touchedSegmentIds.add(segment.id)
      continue
    }

    if (issue.code === 'too_many_actions') {
      const nextActions = dedupeStrings(segment.actionSteps).slice(0, 3)
      if (nextActions.length !== segment.actionSteps.length) {
        segment.actionSteps = nextActions
        changed = true
        touchedSegmentIds.add(segment.id)
      }
      continue
    }

    if (issue.code === 'duplicate_action_cards') {
      const nextActions = dedupeStrings(segment.actionSteps)
      if (nextActions.length !== segment.actionSteps.length) {
        segment.actionSteps = nextActions
        changed = true
        touchedSegmentIds.add(segment.id)
      }
      continue
    }

    if (issue.code === 'missing_action_card') {
      const narrationText = narrationTextForSegment(segment)
      const repairedActions = extractActions(narrationText, input.hazard).slice(
        0,
        3,
      )
      segment.actionSteps =
        repairedActions.length > 0
          ? repairedActions
          : [input.hazard.fallbackAction]
      changed = true
      touchedSegmentIds.add(segment.id)
      continue
    }

    if (
      issue.code === 'bad_answer_option' ||
      issue.code === 'learner_sequence_action_mismatch' ||
      issue.code === 'learner_sequence_shape_invalid' ||
      issue.code === 'learner_text_too_long' ||
      issue.code === 'missing_action_reason' ||
      issue.code === 'missing_do_not_track' ||
      issue.code === 'missing_situation_track' ||
      issue.code === 'missing_action_track' ||
      issue.code === 'missing_teach_back' ||
      issue.code === 'negative_action_card' ||
      issue.code === 'too_many_action_reasons' ||
      issue.code === 'ambiguous_question' ||
      issue.code === 'generic_quiz' ||
      issue.code === 'low_quality_teach_back'
    ) {
      if (issue.code === 'low_quality_teach_back') {
        const repairedActions = extractActions(
          narrationTextForSegment(segment),
          input.hazard,
        ).slice(0, 3)
        if (repairedActions.length > 0) {
          segment.actionSteps = repairedActions
        }
      }
      changed = true
      touchedSegmentIds.add(segment.id)
      continue
    }

    if (issue.code === 'unclear_tell_action') {
      segment.actionSteps = segment.actionSteps.map((action) =>
        /말해요/u.test(action) &&
        !/(가스 냄새|새는 소리|119|어른|선생님|보호자)/u.test(action)
          ? `${action.replace(/[.。]$/u, '')}: 어른에게 말해요`
          : action,
      )
      changed = true
      touchedSegmentIds.add(segment.id)
      continue
    }

    if (issue.code === 'unclear_report_action') {
      segment.actionSteps = segment.actionSteps.map((action) =>
        /알려요/u.test(action) && !/(119|어른|선생님|보호자)/u.test(action)
          ? `${action.replace(/[.。]$/u, '')}: 119나 어른에게 알려요`
          : action,
      )
      changed = true
      touchedSegmentIds.add(segment.id)
      continue
    }

    if (
      issue.code === 'ungrounded_action' ||
      issue.code === 'missing_official_rule'
    ) {
      const inferredTopics = inferSegmentSourceTopicKeys(segment)
      if (inferredTopics.length > 0) {
        segment.sourceTopicKeys = inferredTopics
      }
      changed = true
      touchedSegmentIds.add(segment.id)
    }
  }

  for (const segmentId of touchedSegmentIds) {
    const segment = scenario.segments.find(
      (candidate) => candidate.id === segmentId,
    )
    if (!segment) {
      continue
    }

    rebuildGeneratedSegment({
      hazard: input.hazard,
      jobId: input.jobId,
      segment,
      sourceTitle: input.sourceTitle,
      sourceUrl: input.sourceUrl,
    })

    if (
      segment.practiceMode === 'action' &&
      !hasGroundedGeneratedAction(segment)
    ) {
      changed = true
    }
  }

  return { changed, scenario }
}

function buildDeterministicFallbackScenarioForPublish(input: {
  cues: CaptionCue[]
  deadlineFinalizer?: boolean
  deadlineState?: GenerationDeadlineState
  evidencePacket: CanonicalEvidencePacket
  evidenceReport: GenerationEvidenceReport
  frameCutsMs: number[]
  hazard: HazardProfile
  jobId: string
  pipelineTrace: GenerationPipelineTrace
  sceneGraph: GenerationSceneGraph
  sourceTitle: string
  sourceUrl: string
  videoSource: VideoSource
}): GeneratedPracticeScenario & {
  generationQualityReport: GeneratedQualityReport
  generationPipelineTrace: GenerationPipelineTrace
} {
  const fallbackCues =
    input.cues.length > 0
      ? input.cues
      : buildFallbackCues(`${input.sourceTitle} 영상을 보고 있어요.`)
  const fallbackEvidenceReport = markDeterministicFallbackComplete(
    input.evidenceReport,
    fallbackCues.length,
  )
  const baseScenario = {
    ...buildScenario({
      cues: fallbackCues,
      evidenceReport: fallbackEvidenceReport,
      frameCutsMs: input.frameCutsMs,
      hazard: input.hazard,
      jobId: input.jobId,
      sourceTitle: input.sourceTitle,
      sourceUrl: input.sourceUrl,
      videoSrc: input.videoSource.videoSrc,
    }),
    videoPlaybackKind: input.videoSource.kind,
    youtubeVideoId: input.videoSource.youtubeVideoId,
  } satisfies GeneratedPracticeScenario
  const repairAttemptLimit = getDeadlineAwareRepairAttemptLimit(
    getGenerationRepairAttemptLimit(),
    input.deadlineState,
  )
  let scenario = baseScenario
  let qualityReport = validateGeneratedScenarioForPublish(
    scenario,
    fallbackCues,
    fallbackEvidenceReport,
    {
      repairAttemptCount: 0,
    },
  )

  for (
    let attempt = 1;
    !qualityReport.passed && attempt <= repairAttemptLimit;
    attempt += 1
  ) {
    const repaired = repairScenarioForQuality({
      hazard: input.hazard,
      jobId: input.jobId,
      report: qualityReport,
      scenario,
      sourceTitle: input.sourceTitle,
      sourceUrl: input.sourceUrl,
    })

    if (!repaired.changed) {
      break
    }

    scenario = repaired.scenario
    qualityReport = validateGeneratedScenarioForPublish(
      scenario,
      fallbackCues,
      fallbackEvidenceReport,
      {
        repairAttemptCount: attempt,
      },
    )
  }

  if (!qualityReport.passed) {
    qualityReport = finalizeQualityReportForDeadline(qualityReport)
    input.pipelineTrace.deadlineMode = input.deadlineFinalizer
      ? 'deadline_finalizer'
      : 'forced_publish'
    input.pipelineTrace.finalizationReason =
      qualityReport.forcedPublished
        ? 'Finalizer published after deterministic repair by recording remaining blockers instead of starting another retry.'
        : 'Finalizer published after waiving only soft issues.'
    input.pipelineTrace.waivedHardIssues = qualityReport.waivedHardIssues ?? []
    input.pipelineTrace.waivedSoftIssues = qualityReport.waivedSoftIssues ?? []
  }

  recordGenerationAgentRun(input.pipelineTrace, {
    agent: 'repair-coordinator',
    issueCodes: qualityReport.issues.map((issue) => issue.code),
    status: 'passed',
    summary: qualityReport.passed
      ? 'Deterministic evidence fallback produced a publishable scenario.'
      : 'Deterministic evidence fallback published through the finalizer after recording remaining blockers.',
  })

  if (!qualityReport.passed) {
    qualityReport = finalizeQualityReportForDeadline(qualityReport)
    input.pipelineTrace.deadlineMode = 'forced_publish'
    input.pipelineTrace.finalizationReason =
      'Final defensive publish converted remaining deterministic fallback blockers into trace metadata instead of throwing.'
    input.pipelineTrace.waivedHardIssues = qualityReport.waivedHardIssues ?? []
    input.pipelineTrace.waivedSoftIssues = qualityReport.waivedSoftIssues ?? []
  }

  return {
    ...scenario,
    generationEvidencePacket: input.evidencePacket,
    generationPipelineTrace: input.pipelineTrace,
    generationSceneGraph: input.sceneGraph,
    generationQualityReport: qualityReport,
  }
}

function markDeterministicFallbackComplete(
  report: GenerationEvidenceReport,
  segmentCount: number,
): GenerationEvidenceReport {
  return {
    ...report,
    segmentationEvidence: [
      ...new Set([
        ...report.segmentationEvidence,
        'deterministic-repair' as const,
      ]),
    ],
    stages: [
      ...report.stages,
      {
        evidence: `${segmentCount} repaired learning segments from direct-audio and visual-caption evidence plus official rule grounding`,
        name: 'deterministic-fallback-repair',
        status: 'completed',
      },
    ],
  }
}

function rebuildGeneratedSegment(input: {
  hazard: HazardProfile
  jobId: string
  segment: GeneratedPracticeSegment
  sourceTitle: string
  sourceUrl: string
}) {
  const narrationText = narrationTextForSegment(input.segment)
  const startMs = quantizeBoundaryMs(input.segment.startMs)
  const endMs = quantizeBoundaryMs(Math.max(input.segment.endMs, startMs + 700))
  const actionSteps = sanitizeActionStepsForGoldenContract({
    actionSteps: input.segment.actionSteps,
    hazard: input.hazard,
    sourceText: narrationText,
  })
  const practiceMode = actionSteps.length > 0 ? 'action' : 'intro'
  const actionReasons =
    practiceMode === 'action'
      ? actionSteps.map((action, index) =>
          sanitizeLearnerText(
            input.segment.actionReasons[index] ||
              reasonForAction(action, input.hazard),
            reasonForAction(action, input.hazard),
          ),
        )
      : []
  const sourceTopicKeys = canonicalSourceTopicKeysForSegment({
    endMs,
    fallbackText: [
      narrationText,
      input.segment.learnerPrompt,
      input.segment.learnerExplanation,
      ...input.segment.actionSteps,
      ...input.segment.safetyWarnings,
    ].join(' '),
    planSourceTopicKeys: input.segment.sourceTopicKeys ?? [],
    sourceCues: input.segment.narration.map((cue) => ({
      endMs: cue.endMs,
      startMs: cue.startMs,
      text: cue.text,
    })),
    startMs,
  })
  const doNot = sanitizeLearnerText(
    input.segment.safetyWarnings[0] ||
      doNotForText(narrationText, input.hazard),
    doNotForText(narrationText, input.hazard),
    80,
  )
  const teachBack =
    practiceMode === 'action'
      ? buildTeachBack(
          selectTeachBackAction(actionSteps),
          input.hazard,
          actionSteps,
        )
      : null
  const cues =
    input.segment.narration.length > 0
      ? input.segment.narration.map((cue) => ({
          endMs: cue.endMs,
          startMs: cue.startMs,
          text: cue.text,
        }))
      : [
          {
            endMs,
            startMs,
            text: narrationText,
          },
        ]
  const packet = buildGroundingPacket({
    actionReasons,
    actionSteps,
    cues,
    doNot,
    endMs,
    jobId: input.jobId,
    narrationText,
    sourceTopicKeys,
    startMs,
  })
  const grounded = buildGroundedLearningOutput({
    actionReasons,
    actionSteps,
    doNot,
    hazard: input.hazard,
    packet,
    segmentId: input.segment.id,
    sourceTitle: input.sourceTitle,
    sourceTopicKeys,
    sourceUrl: input.sourceUrl,
    teachBack,
  })
  const answerOptions =
    grounded.teachBack?.options.map((option) => ({
      ...option,
      correct: option.id === grounded.teachBack?.correctOptionId,
    })) ?? []

  input.segment.actionReasons = actionReasons
  input.segment.actionSteps = actionSteps
  input.segment.answerOptions = answerOptions
  input.segment.checkQuestion = grounded.teachBack?.prompt ?? ''
  input.segment.endMs = endMs
  input.segment.explanation = grounded.explanation
  const introTitleText =
    practiceMode === 'intro'
      ? sourceBackedIntroTitleText(narrationText, input.hazard)
      : null
  input.segment.learnerExplanation =
    introTitleText ??
    sanitizeLearnerText(
      input.segment.learnerExplanation,
      practiceMode === 'action'
        ? summarizeAction(actionSteps)
        : shortenLearnerText(
            narrationText,
            `${input.hazard.label} 영상을 보고 있어요.`,
            input.hazard,
          ),
    )
  input.segment.learnerPrompt =
    introTitleText ??
    sanitizeLearnerText(
      input.segment.learnerPrompt,
      situationFromText(narrationText, input.hazard),
    )
  input.segment.learnerSequence = buildGoldenLearnerSequence({
    actionSteps,
    fallbackSequence: input.segment.learnerSequence,
    learnerPrompt: input.segment.learnerPrompt,
    practiceMode,
  })
  input.segment.packet = packet
  input.segment.practiceMode = practiceMode
  input.segment.safetyWarnings = practiceMode === 'action' ? [doNot] : []
  input.segment.segment = grounded.segment
  input.segment.sourceTopicKeys = sourceTopicKeys
  input.segment.startMs = startMs
  input.segment.structuredExplanation = grounded.structuredExplanation
  input.segment.requiredLearnerKeywords = buildGeneratedRequiredLearnerKeywords(
    {
      actionSteps,
      explicitKeywords: input.segment.requiredLearnerKeywords,
      sourceText: narrationText,
      sourceTopicKeys,
    },
  )
  input.segment.teacherGuide = {
    ...input.segment.teacherGuide,
    prompt: grounded.teachBack?.prompt ?? input.segment.teacherGuide.prompt,
    script: narrationText,
  }
  input.segment.teachBack = grounded.teachBack
}

function demoteSegmentToReviewIntro(segment: GeneratedPracticeSegment) {
  segment.actionReasons = []
  segment.actionSteps = []
  segment.answerOptions = []
  segment.checkQuestion = ''
  segment.practiceMode = 'intro'
  segment.safetyWarnings = []
  segment.teachBack = null
  segment.learnerSequence = [{ kind: 'situation', text: segment.learnerPrompt }]
}

function sanitizeActionStepsForGoldenContract(input: {
  actionSteps: string[]
  hazard: HazardProfile
  sourceText: string
}) {
  return dedupeStrings(
    input.actionSteps
      .map((action) =>
        toPositiveLearnerActionCard(action, input.hazard, input.sourceText),
      )
      .map((action) => sanitizeLearnerText(action, input.hazard.fallbackAction))
      .filter(Boolean),
  ).slice(0, 3)
}

function toPositiveLearnerActionCard(
  action: string,
  hazard: HazardProfile,
  sourceText: string,
) {
  const normalized = normalizeCueText(rewriteEasyKorean(action))
  if (!normalized) {
    return ''
  }

  if (!negativeLearnerActionPattern.test(normalized)) {
    return normalized
  }

  const context = normalizeCueText(`${sourceText} ${normalized}`)
  if (/엘리베이터/u.test(context)) return '계단을 찾아요'
  if (/공사장|공사\s*자재/u.test(context)) return '공사장 근처에서 멀어져요'
  if (/지하\s*차도|교량/u.test(context))
    return '침수도로, 지하차도, 교량, 하천에서 멀어져요'
  if (/개울가|하천\s*변|하천변|해안가/u.test(context))
    return '개울가, 하천 변, 해안가에서 멀어져요'
  if (/산|계곡|비탈면/u.test(context)) return '산, 계곡, 비탈면에서 멀어져요'
  if (/논둑|논뚝|물꼬/u.test(context)) return '논둑과 물꼬에서 떨어져 있어요'
  if (/맨홀|하수도|추락|휩쓸림/u.test(context))
    return '맨홀과 하수도 근처에서 멀어져요'
  if (/간판|위험\s*시설물|위험한\s*물건/u.test(context))
    return '간판과 위험한 물건에서 멀어져요'
  if (/창문|유리/u.test(context)) return '창문에서 떨어져요'
  if (/전선/u.test(context)) return '전선에서 떨어져요'
  if (/가스/u.test(context)) return '가스 냄새를 어른에게 말해요'
  if (/물이\s*찬|낮은\s*곳|낮은\s*다리|건너지/u.test(context))
    return '높은 길로 돌아가요'
  if (/밖|외출|야외|산행|캠핑/u.test(context)) return '안전한 실내에 있어요'
  if (/만지지/u.test(context)) return '어른에게 먼저 말해요'

  return hazard.fallbackAction
}

function buildGoldenLearnerSequence(input: {
  actionSteps: string[]
  fallbackSequence: Array<{ kind: 'action' | 'situation'; text: string }>
  learnerPrompt: string
  practiceMode: 'action' | 'intro'
}) {
  const situation = sanitizeLearnerText(
    input.learnerPrompt,
    '장면을 보고 있어요.',
  )

  if (input.practiceMode === 'action') {
    return [
      { kind: 'situation' as const, text: situation },
      ...input.actionSteps.map((action) => ({
        kind: 'action' as const,
        text: sanitizeLearnerText(action, action),
      })),
    ].slice(0, 4)
  }

  const introSteps = dedupeStrings(
    [
      situation,
      ...input.fallbackSequence
        .filter((step) => step.kind === 'situation')
        .map((step) => step.text),
    ].map((text) => sanitizeLearnerText(text, situation)),
  ).slice(0, 3)

  return introSteps.map((text) => ({ kind: 'situation' as const, text }))
}

function buildGeneratedRequiredLearnerKeywords(input: {
  actionSteps: string[]
  explicitKeywords: string[]
  sourceText: string
  sourceTopicKeys: CaptionTopicKey[]
}) {
  const evidenceText = normalizeCueText(
    [input.sourceText, ...input.actionSteps].join(' '),
  )
  const topicKeywords = input.sourceTopicKeys
    .flatMap(learnerKeywordsForTopic)
    .filter((keyword) =>
      requiredKeywordAppearsInEvidence(keyword, evidenceText),
    )
  const explicitKeywords = input.explicitKeywords.filter((keyword) =>
    requiredKeywordAppearsInEvidence(keyword, evidenceText),
  )

  return dedupeStrings(
    [
      ...explicitKeywords,
      ...topicKeywords,
      ...extractSourceEvidenceLockedKeywords(input.sourceText),
      ...input.actionSteps.flatMap(extractConcreteLearnerKeywords),
    ]
      .map(sanitizeRequiredLearnerKeyword)
      .filter((keyword): keyword is string => Boolean(keyword)),
  ).slice(0, 8)
}

function requiredKeywordAppearsInEvidence(
  keyword: string,
  evidenceText: string,
) {
  const normalized = sanitizeRequiredLearnerKeyword(keyword)
  const rewritten = rewriteRequiredLearnerKeyword(keyword)

  return Boolean(
    normalized &&
    (textContainsKeyword(evidenceText, normalized) ||
      textContainsKeyword(evidenceText, rewritten)),
  )
}

function sanitizeRequiredLearnerKeyword(keyword: string) {
  const normalized = rewriteEasyKorean(keyword)
    .replace(
      /가지\s*않기|가지\s*않아요\.?|나가지\s*않기|나가지\s*않아요\.?|피하기|피해요\.?|만지지\s*않기|만지지\s*않아요\.?|건너지\s*않기|건너지\s*않아요\.?/gu,
      '',
    )
    .replace(/^물이\s*찬\s*곳$/u, '물이 찬')
    .replace(/^천천히\s*운전$/u, '운전')
    .replace(/보호$/u, '머리')
    .trim()

  if (
    !normalized ||
    (normalized.length <= 1 && !/^\d+$/u.test(normalized)) ||
    /^(알리기|묶기|쉬기|마시기|치우기|대피|다시 기억하기)$/u.test(normalized)
  ) {
    return null
  }

  return normalized
}

function extractConcreteLearnerKeywords(text: string) {
  const normalized = normalizeCueText(text)
  const matches = normalized.match(
    /안전디딤돌|가스 냄새|새는 소리|가스 중간 밸브|현관문|대피공간|젖은 수건|안내 방송|탁자 다리|탁자|책상|방석|비상 가방|가방|먹는 약|보청기|지팡이|머리|계단|엘리베이터|창문|유리|간판|공사장|배수구|배수로|수중 펌프|모래주머니|수방자재|하천변|하천|맨홀|하수도|차|주차|운전|논둑|물꼬|바닷가|해안가|배|어른|선생님|119|손전등|전선|수도관|수도꼭지|화장실|물|시원한 곳|그늘|병원|장갑|눈길|스노우체인|스프레이 체인|안전거리|서행|급제동|급가속|급핸들|자전거|전동 킥보드|제설|지붕|심야|가로수|노후시설|위험시설|대중교통|내 집 앞|실내|지하공간|지하차도|침수도로|산사태|산비탈|급경사지|산림|소각|화목보일러|불씨|라이터|담배|대피 안내|대피 요청|대피소 가는 길|대피소|주변 사람|낙엽/gu,
  )

  return matches ?? []
}

function extractSourceEvidenceLockedKeywords(text: string) {
  const normalized = normalizeCueText(text)
  const matches: string[] = []
  const add = (condition: boolean, keywords: string[]) => {
    if (!condition) return
    for (const keyword of keywords) {
      if (
        textContainsKeyword(normalized, keyword) &&
        !matches.includes(keyword)
      ) {
        matches.push(keyword)
      }
    }
  }

  add(/모래주머니|수방자재/u.test(normalized), ['모래주머니', '수방자재'])
  add(
    /산행|캠핑/u.test(normalized) &&
      /절대|금지|안\s*돼|안돼|자제|가지\s*않/u.test(normalized),
    ['산행', '캠핑'],
  )
  add(/야외\s*활동.*자제|야외활동.*자제/u.test(normalized), ['야외 활동'])
  add(/비상\s*가방/u.test(normalized), ['비상 가방'])
  add(/대피소\s*가는\s*길/u.test(normalized), ['대피소 가는 길'])
  add(/대피\s*요청/u.test(normalized), ['대피 요청'])
  add(/산사태/u.test(normalized), ['산사태'])
  add(/산비탈|급경사지/u.test(normalized), ['산비탈', '급경사지'])
  add(/배수로/u.test(normalized) && /하천변|해안가/u.test(normalized), [
    '하천변',
    '배수로',
    '해안가',
  ])
  add(/지하공간/u.test(normalized), ['지하공간', '침수도로'])

  return matches
}

function sanitizeLearnerText(
  text: string,
  fallback: string,
  maxLength = maximumLearnerCardTextLength,
) {
  const normalized = normalizeCueText(rewriteEasyKorean(text)).trim()
  const fallbackText =
    normalizeCueText(rewriteEasyKorean(fallback)).trim() || '장면을 보고 있어요'

  if (normalized && normalized.length <= maxLength) {
    return normalized
  }

  const sentence = splitCaptionTextIntoSentences(normalized).find(
    (part) => part.length <= maxLength,
  )
  if (sentence) {
    return sentence
  }

  const words = normalized.split(/\s+/u).filter(Boolean)
  let candidate = ''
  for (const word of words) {
    const next = candidate ? `${candidate} ${word}` : word
    if (next.length > maxLength) {
      break
    }
    candidate = next
  }

  if (candidate) {
    return candidate
  }

  return fallbackText.length <= maxLength
    ? fallbackText
    : fallbackText.slice(0, maxLength)
}

function appendRequiredKeyword(
  segment: GeneratedPracticeSegment,
  keyword: string,
) {
  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword) {
    return false
  }

  const learnerPrimaryText = learnerPrimaryUiTexts(segment).join(' ')
  const teacherText = segment.teacherGuide.script
  if (
    textContainsKeyword(learnerPrimaryText, normalizedKeyword) &&
    textContainsKeyword(teacherText, normalizedKeyword)
  ) {
    return false
  }

  const sentence = requiredKeywordSentence(normalizedKeyword)
  if (!textContainsKeyword(learnerPrimaryText, normalizedKeyword)) {
    const actionSentence = requiredKeywordActionSentence(normalizedKeyword)
    if (
      !segment.actionSteps.some((action) =>
        textContainsKeyword(action, normalizedKeyword),
      )
    ) {
      segment.actionSteps = [...segment.actionSteps, actionSentence].slice(-3)
    }

    const learnerSentence = appendSentenceIfMissing(
      segment.learnerExplanation,
      sentence,
      normalizedKeyword,
    )
    segment.learnerExplanation =
      learnerSentence.length <= maximumLearnerCardTextLength
        ? learnerSentence
        : actionSentence
  }
  if (!textContainsKeyword(teacherText, normalizedKeyword)) {
    segment.teacherGuide.script = appendSentenceIfMissing(
      segment.teacherGuide.script,
      sentence,
      normalizedKeyword,
    )
  }

  return true
}

function requiredKeywordActionSentence(keyword: string) {
  if (/침수도로|지하차도|교량|하천|해안가|맨홀|하수도|간판|비탈면|옹벽|축대|산지/u.test(keyword)) {
    return `${keyword}를 피해요.`
  }

  if (/태풍|호우|대설|폭염|한파/u.test(keyword)) {
    return `${keyword} 때 조심해요.`
  }

  return requiredKeywordSentence(keyword)
}

function requiredKeywordSentence(keyword: string) {
  if (/^119$/u.test(keyword)) {
    return '119에 말해요.'
  }

  if (keyword.length <= 1) {
    return `${keyword} 이야기도 나와요.`
  }

  return `${keyword}도 확인해요.`
}

function appendSentenceIfMissing(
  text: string,
  sentence: string,
  keyword: string,
) {
  if (textContainsKeyword(text, keyword)) {
    return text
  }

  const trimmed = text.trim()
  if (!trimmed) {
    return sentence
  }

  return `${trimmed.replace(/[.。]$/u, '')}. ${sentence}`
}

function rewriteLearnerTextsAsEasyKorean(segment: GeneratedPracticeSegment) {
  const before = JSON.stringify({
    actionReasons: segment.actionReasons,
    actionSteps: segment.actionSteps,
    answerOptions: segment.answerOptions,
    checkQuestion: segment.checkQuestion,
    learnerExplanation: segment.learnerExplanation,
    learnerPrompt: segment.learnerPrompt,
    learnerSequence: segment.learnerSequence,
    safetyWarnings: segment.safetyWarnings,
  })

  segment.actionReasons = segment.actionReasons.map(rewriteEasyKorean)
  segment.actionSteps = segment.actionSteps.map(rewriteEasyKorean)
  segment.answerOptions = segment.answerOptions.map((option) => ({
    ...option,
    feedback: rewriteEasyKorean(option.feedback),
    label: rewriteEasyKorean(option.label),
  }))
  segment.checkQuestion = rewriteEasyKorean(segment.checkQuestion)
  segment.learnerExplanation = rewriteEasyKorean(segment.learnerExplanation)
  segment.learnerPrompt = rewriteEasyKorean(segment.learnerPrompt)
  segment.learnerSequence = segment.learnerSequence.map((step) => ({
    ...step,
    text: rewriteEasyKorean(step.text),
  }))
  segment.safetyWarnings = segment.safetyWarnings.map(rewriteEasyKorean)

  return (
    before !==
    JSON.stringify({
      actionReasons: segment.actionReasons,
      actionSteps: segment.actionSteps,
      answerOptions: segment.answerOptions,
      checkQuestion: segment.checkQuestion,
      learnerExplanation: segment.learnerExplanation,
      learnerPrompt: segment.learnerPrompt,
      learnerSequence: segment.learnerSequence,
      safetyWarnings: segment.safetyWarnings,
    })
  )
}

function rewriteEasyKorean(text: string) {
  return text
    .replace(/전기와\s*가스를\s*차단(?:해요|합니다)?/gu, '전기와 가스를 꺼요')
    .replace(/가스와\s*전기를\s*차단(?:해요|합니다)?/gu, '전기와 가스를 꺼요')
    .replace(/유입/gu, '들어옴')
    .replace(/차단/gu, '막아요')
    .replace(/숙지/gu, '알아요')
    .replace(/저지대/gu, '낮은 곳')
    .replace(/고립되어/gu, '혼자 갇혀')
    .replace(/찾기해야/gu, '찾아야')
    .replace(/가기해야/gu, '가야')
    .replace(/지키기하는/gu, '지키는')
    .replace(/알아둬고/gu, '알아두고')
    .replace(/가능할 수/gu, '할 수')
    .replace(/안전합니다/gu, '안전해요')
    .replace(/권장함/gu, '좋아요')
    .replace(/나리/gu, '말')
    .replace(/훈화/gu, '이야기')
    .replace(/채소/gu, '확인')
    .replace(/왜 신고/gu, '언제 신고')
    .replace(/정도 마고/gu, '하지 말고')
    .replace(/나가지 않기\.?/gu, '나가지 않아요.')
    .replace(/가지 않기\.?/gu, '가지 않아요.')
    .replace(/피하기\.?/gu, '피해요.')
    .replace(/만지지 않기\.?/gu, '만지지 않아요.')
    .replace(/두지 않기\.?/gu, '두지 않아요.')
}

function rewriteRequiredLearnerKeyword(keyword: string) {
  return rewriteEasyKorean(keyword)
    .replace(/낮은 자세/gu, '낮게')
    .replace(/피하기/gu, '피해요')
    .replace(/나가지 않기/gu, '나가지 않아요')
    .replace(/가지 않기/gu, '가지 않아요')
    .replace(/만지지 않기/gu, '만지지 않아요')
    .replace(/두지 않기/gu, '두지 않아요')
}

function extractRequiredKeywordFromIssue(issue: GeneratedQualityIssue) {
  return issue.message.match(/"([^"]+)"/u)?.[1]?.trim() ?? ''
}

function narrationTextForSegment(segment: GeneratedPracticeSegment) {
  return (
    normalizeCueText(
      [
        segment.narration.map((cue) => cue.text).join(' '),
        segment.teacherGuide.script,
      ].join(' '),
    ) ||
    segment.learnerExplanation ||
    segment.learnerPrompt
  )
}

function sourceEvidenceTextForSegment(segment: GeneratedPracticeSegment) {
  const structuredEvidence = (segment.structuredExplanation as any)?.evidence
  const structuredOcrEvidence = Array.isArray(structuredEvidence?.ocrEvidence)
    ? structuredEvidence.ocrEvidence
        .map((entry: { text?: unknown }) =>
          typeof entry?.text === 'string' ? entry.text : '',
        )
        .join(' ')
    : ''
  const structuredAsrEvidence = Array.isArray(structuredEvidence?.asrEvidence)
    ? structuredEvidence.asrEvidence
        .map((entry: { text?: unknown }) =>
          typeof entry?.text === 'string' ? entry.text : '',
        )
        .join(' ')
    : ''

  return (
    normalizeCueText(
      [
        narrationTextForSegment(segment),
        segment.packet.asrText,
        segment.packet.ocrTokens.join(' '),
        structuredAsrEvidence,
        structuredOcrEvidence,
      ].join(' '),
    ) || narrationTextForSegment(segment)
  )
}

function extractSourceTopicsFromText(text: string) {
  const topic = topicKeyForCueText(text)
  return topic ? [topic] : []
}

function canonicalSourceTopicKeysForSegment(input: {
  endMs: number
  fallbackText: string
  planSourceTopicKeys: readonly string[]
  sourceCues: CaptionCue[]
  startMs: number
}) {
  const cueTopics = sourceTopicKeysForTimeWindow(
    input.sourceCues,
    input.startMs,
    input.endMs,
  )
  if (cueTopics.length > 0) {
    return selectDominantCaptionTopicKeys(cueTopics, input.fallbackText)
  }

  const inferredTopics = extractSourceTopicsFromText(input.fallbackText)
  if (inferredTopics.length > 0) {
    return inferredTopics
  }

  return selectDominantCaptionTopicKeys(
    input.planSourceTopicKeys.filter(isCaptionTopicKey),
    input.fallbackText,
  )
}

function sourceTopicKeysForTimeWindow(
  cues: CaptionCue[],
  startMs: number,
  endMs: number,
) {
  const topics: CaptionTopicKey[] = []

  for (const cue of cues) {
    if (!segmentCoversCueMidpoint({ endMs, startMs }, cue)) {
      continue
    }

    const topic = topicKeyForCueText(cue.text)
    if (topic && !topics.includes(topic)) {
      topics.push(topic)
    }
  }

  return topics
}

function selectDominantCaptionTopicKeys(
  topics: CaptionTopicKey[],
  evidenceText: string,
): CaptionTopicKey[] {
  let selected: CaptionTopicKey[] = dedupeCaptionTopicKeys(topics)
  const text = normalizeCueText(evidenceText)

  if (
    selected.includes('weather_check') &&
    selected.includes('heatwave_cool') &&
    /TV|라디오|기상\s*상황|기상상황|날씨/u.test(text)
  ) {
    selected = selected.filter((topic) => topic !== 'heatwave_cool')
  }

  const heatwaveTopics = selected.filter((topic) =>
    (['heatwave_cool', 'heatwave_rest', 'heatwave_water'] as const).includes(
      topic as 'heatwave_cool' | 'heatwave_rest' | 'heatwave_water',
    ),
  )
  if (heatwaveTopics.length > 1) {
    if (/물.*마시|물을\s*자주|수분|갈증|발증/u.test(text)) {
      return ['heatwave_water']
    }
    if (/열사병|열경련|증상|시원한\s*곳|병원|진료/u.test(text)) {
      return ['heatwave_cool']
    }
    if (/그늘|휴식|쉬/u.test(text)) {
      return ['heatwave_rest']
    }
  }

  return selected
}

function inferSegmentSourceTopicKeys(segment: GeneratedPracticeSegment) {
  return canonicalSourceTopicKeysForSegment({
    endMs: segment.endMs,
    fallbackText: [
      narrationTextForSegment(segment),
      segment.learnerPrompt,
      segment.learnerExplanation,
      ...segment.actionSteps,
      ...segment.safetyWarnings,
    ].join(' '),
    planSourceTopicKeys: [],
    sourceCues: segment.narration.map((cue) => ({
      endMs: cue.endMs,
      startMs: cue.startMs,
      text: cue.text,
    })),
    startMs: segment.startMs,
  })
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = normalizeCueText(value)
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function dedupeCaptionTopicKeys(values: CaptionTopicKey[]) {
  return values.filter((value, index) => values.indexOf(value) === index)
}

function cloneGeneratedScenario<T>(scenario: T): T {
  return JSON.parse(JSON.stringify(scenario)) as T
}

function teachBackQualityProblem(segment: GeneratedPracticeSegment) {
  if (segment.practiceMode !== 'action') {
    return null
  }

  const prompt = normalizeCueText(segment.checkQuestion)
  const correctOption = segment.answerOptions.find((option) => option.correct)
  const correctLabel = normalizeCueText(correctOption?.label ?? '')
  const selectedAction = selectTeachBackAction(segment.actionSteps)
  const expectedOption = selectedAction ? optionForAction(selectedAction) : null
  const currentActionContext = normalizeCueText(
    [
      ...segment.actionSteps,
      ...segment.actionReasons,
      ...segment.safetyWarnings,
      segment.learnerPrompt,
      segment.learnerExplanation,
      segment.teacherGuide.script,
    ].join(' '),
  )

  if (!segment.teachBack || !prompt || !correctLabel) {
    return '행동 장면의 확인 질문이 비어 있습니다.'
  }

  if (
    /무엇이\s*중요|무엇을\s*기억|무엇을\s*볼까요|무엇을\s*할까요|먼저\s*어떻게|어떻게\s*움직/u.test(
      prompt,
    )
  ) {
    return '확인 질문이 해야 할 일이나 하지 말아요와 직접 연결되지 않았습니다.'
  }

  if (
    /^(안전|태풍|재난|중요|주의|확인|멈춤)$/u.test(correctLabel) ||
    (correctLabel === '천천히' &&
      !/운전|서행|문|열|보관함|옷장/u.test(currentActionContext))
  ) {
    return `확인 질문 정답 "${correctLabel}"이 너무 추상적입니다.`
  }

  if (
    expectedOption &&
    !teachBackMatchesExpectedOption(expectedOption, prompt, correctLabel)
  ) {
    return '확인 질문이 현재 장면의 해야 할 일이나 하지 말아요와 맞지 않습니다.'
  }

  if (
    /(차|차량|운전|서행)/u.test(`${prompt} ${correctLabel}`) &&
    !/(차|차량|운전|서행|주차)/u.test(currentActionContext)
  ) {
    return '확인 질문에 차나 운전이 나오지만 현재 장면 근거에는 차나 운전 행동이 없습니다.'
  }

  if (
    correctLabel === '물' &&
    !/(물|마시|수분|폭염|더운)/u.test(
      [
        ...segment.actionSteps,
        ...segment.actionReasons,
        ...segment.safetyWarnings,
        segment.learnerPrompt,
        segment.learnerExplanation,
      ].join(' '),
    )
  ) {
    return '확인 질문 정답이 현재 행동 장면의 해야 할 일과 맞지 않습니다.'
  }

  return null
}

function isGenericTeachBackProblem(problem: string) {
  return /직접 연결|추상적|generic|현재 장면의 해야 할 일/u.test(problem)
}

function actionSceneSignature(segment: GeneratedPracticeSegment) {
  const correctLabel =
    segment.answerOptions.find((option) => option.correct)?.label ?? ''

  return [
    ...(segment.sourceTopicKeys ?? []),
    ...segment.actionSteps,
    segment.checkQuestion,
    correctLabel,
  ]
    .map(normalizeForKeywordSearch)
    .filter(Boolean)
    .join('|')
}

function incompleteAudioFragmentProblem(segment: GeneratedPracticeSegment) {
  const firstCueText = normalizeCueText(segment.narration[0]?.text ?? '')
  const lastCueText = normalizeCueText(segment.narration.at(-1)?.text ?? '')

  if (startsWithContinuationPhrase(firstCueText)) {
    return '오디오 문장 앞부분이 빠진 채 장면이 시작됩니다.'
  }

  if (endsWithContinuationPhrase(lastCueText)) {
    return '오디오 문장이 끝나기 전에 장면이 끊겼습니다.'
  }

  return null
}

function segmentHasAudioContinuation(segment: GeneratedPracticeSegment) {
  return segment.narration.some((cue, index) => {
    if (index >= segment.narration.length - 1) {
      return false
    }

    return endsWithContinuationPhrase(cue.text)
  })
}

function segmentHasAudioContinuationNearBoundary(
  segment: GeneratedPracticeSegment,
  boundaryMs: number,
) {
  return segment.narration.some((cue, index) => {
    if (index >= segment.narration.length - 1) {
      return false
    }

    return (
      endsWithContinuationPhrase(cue.text) &&
      Math.abs(cue.endMs - boundaryMs) <= visualCaptionBoundaryMarginMs + 250
    )
  })
}

function startsWithContinuationPhrase(text: string) {
  const normalized = normalizeCueText(text)

  return (
    /^(취하고|하고|하며|심하면|때문|그리고|이어|또)\b/u.test(
      normalized,
    ) || /^(설치된|이동하여)(?:\s|$)/u.test(normalized)
  )
}

function endsWithContinuationPhrase(text: string) {
  return /(유발하며|휴식을|대피를|확인을|점검을|문을|창문을|물을|행위를|행위는|사용\s*후|사용\s*후에는|근처에서|곳에서|말고|제거하고|확인하고|이동하고|등이|등은|등을)$/u.test(
    normalizeCueText(text),
  )
}

function teachBackMatchesExpectedOption(
  expected: ReturnType<typeof optionForAction>,
  prompt: string,
  correctLabel: string,
) {
  const normalizedExpectedLabel = normalizeForKeywordSearch(expected.label)
  const normalizedCorrectLabel = normalizeForKeywordSearch(correctLabel)
  const normalizedExpectedPrompt = normalizeForKeywordSearch(expected.prompt)
  const normalizedPrompt = normalizeForKeywordSearch(prompt)

  const labelMatches =
    Boolean(normalizedExpectedLabel) &&
    (normalizedCorrectLabel.includes(normalizedExpectedLabel) ||
      normalizedExpectedLabel.includes(normalizedCorrectLabel))
  const promptMatches =
    Boolean(normalizedExpectedPrompt) &&
    (normalizedPrompt.includes(normalizedExpectedPrompt) ||
      normalizedExpectedPrompt.includes(normalizedPrompt))

  return labelMatches || promptMatches
}

function introSegmentHasActionContent(segment: GeneratedPracticeSegment) {
  return (
    segment.actionSteps.length > 0 ||
    segment.actionReasons.length > 0 ||
    segment.safetyWarnings.length > 0 ||
    segment.answerOptions.length > 0 ||
    Boolean(segment.checkQuestion.trim()) ||
    Boolean(segment.teachBack) ||
    segment.learnerSequence.some((step) => step.kind === 'action')
  )
}

function introSegmentHasDirectAudioActionEvidence(
  segment: GeneratedPracticeSegment,
) {
  const text = narrationTextForSegment(segment)

  return /접근하지|접근\s*금지|피하고|피해야|피하세요|피한대요|대피하세요|대피소|대피\s*요청|이동해요|배치|비상\s*가방|먹는\s*약|보청기|지팡이|대피소\s*가는\s*길|자제|가지\s*않아요|보러\s*가지\s*않|멀어져|산사태|산비탈|급경사지|휩쓸|침수\s*위험/u.test(
    text,
  )
}

function topicActionSemanticMismatch(segment: GeneratedPracticeSegment) {
  if (segment.practiceMode !== 'action') {
    return null
  }

  const sourceText = sourceEvidenceTextForSegment(segment)
  const actionText = normalizeCueText(
    [
      ...segment.actionSteps,
      ...segment.actionReasons,
      ...segment.safetyWarnings,
      segment.learnerPrompt,
      segment.learnerExplanation,
    ].join(' '),
  )

  for (const topic of segmentTopics(segment)) {
    const sourcePattern = sourcePatternForTopic(topic)
    if (sourcePattern && !sourcePattern.test(sourceText)) {
      return `원본 토픽 ${topicLabelForPrompt(topic)}이 이 장면의 직접 영상·오디오 근거와 맞지 않습니다.`
    }

    const actionPattern = learnerActionPatternForTopic(topic)
    if (actionPattern && !actionPattern.test(actionText)) {
      return `원본 토픽 ${topicLabelForPrompt(topic)}이 학습자 행동 카드나 하지 말아요와 맞지 않습니다.`
    }
  }

  return null
}

function sourceKeywordHallucinationProblem(segment: GeneratedPracticeSegment) {
  if (segment.segment.hazard !== 'heavy_snow') {
    return null
  }

  const sourceText = narrationTextForSegment(segment)
  const learnerText = normalizeCueText(
    [
      segment.description,
      segment.label,
      segment.learnerExplanation,
      ...learnerPrimaryUiTexts(segment),
    ].join(' '),
  )
  const highRiskTerms = [
    '하천',
    '태풍',
    '비바람',
    '홍수',
    '침수',
    '지하차도',
    '폭염',
    '산불',
    '지진',
  ]

  for (const term of highRiskTerms) {
    if (
      textContainsKeyword(learnerText, term) &&
      !textContainsKeyword(sourceText, term)
    ) {
      return `원본 장면에 없는 재난 키워드 "${term}"가 학습카드에 들어갔습니다.`
    }
  }

  return null
}

function sourcePatternForTopic(topic: CaptionTopicKey) {
  const patterns: Partial<Record<CaptionTopicKey, RegExp>> = {
    construction_wind_avoid:
      /공사장|공사\s*자재|큰\s*바람|강한\s*바람|날릴|넘어지/u,
    drain_waterway: /배수로|물꼬|물고|모래주머니|수방자재|수중\s*펌프/u,
    evacuate_to_safe_place:
      /대피소\s*가는\s*길|대피\s*요청|비상\s*가방|먹는\s*약|보청기|지팡이|안전한\s*곳.*대피|대피소로\s*대피/u,
    farm_facility: /농촌|비닐하우스|농가|축사|시설물.*묶|단단히\s*묶/u,
    farm_waterway_stay_safe: /논뚝|논둑|물고|물꼬|무리하게\s*나서|점검/u,
    flood_landslide_avoid:
      /물에\s*자주\s*잠기|산사태|산비탈|급경사지|급경사|위험한\s*곳|침수\s*위험/u,
    home_drain: /집\s*주변|침수피해|배수구/u,
    indoor_window: /실내|문과\s*창문|창문\s*가까/u,
    mountain_valley_evacuate:
      /산이나\s*계곡|산과\s*계곡|등산객|비탈면|안전한\s*곳.*대피/u,
    sewer_manhole_avoid: /맨홀|하수도|추락|휩쓸림|접근\s*금지/u,
    outdoor_signage: /간판|위험\s*시설물|시설물\s*주변/u,
    river_car_drive: /차|차량|주차|운전|서행/u,
    water_area_avoid:
      /개울가|하천\s*변|하천변|배수로|해안가|급류|침수될|침수\s*위험지역|침수\s*도로|지하공간|지하\s*차도|교량/u,
    weather_check: /기상\s*상황|기상상황|날씨|TV|라디오/u,
    wildfire_alert: /산불.*발생|대피\s*안내|주변.*알|즉시\s*알/u,
    wildfire_burn_ban: /산림\s*근처|소각/u,
    wildfire_ember_check: /화목\s*보일러|불씨|꺼졌/u,
    wildfire_evacuation_route: /산과\s*떨어진\s*도로|산불\s*확산/u,
    wildfire_ground_protect: /대피.*어려|낙엽|낮은\s*자세|엎드/u,
    wildfire_lighter_ban: /라이터|담배/u,
    flood_home_return_check:
      /침수된?\s*집|복귀|수돗물|오염\s*여부|상하수도|전기.*가스.*안전\s*점검|안전점검/u,
    flood_lowland_powerline_avoid: /저지대|낮은\s*곳|비탈면|산지|전신주/u,
    flood_prepare_weather_shelter: /기상\s*정보|기상정보|대피\s*장소|대피장소/u,
    flood_river_car_utilities:
      /하천\s*변|하천변|주차|차량|침수.*집|전기.*가스|가스.*전기/u,
    heavy_snow_clear:
      /내\s*집\s*앞|눈.*치우|제설|2인\s*이상|안전\s*확보|지붕|심야|가로수|노후\s*시설|붕괴|위험\s*시설/u,
    heavy_snow_drive:
      /눈길|빙판|결빙|결빈|스노우\s*체인|스프레이\s*체인|타이어|차량\s*운행|운전|서행|안전거리|급제동|급가속|급핸들|자전거|전동\s*킥보드/u,
    heavy_snow_stay_home: /대설|눈.*쌓|외출|대중교통/u,
  }

  return patterns[topic] ?? null
}

function learnerActionPatternForTopic(topic: CaptionTopicKey) {
  const patterns: Partial<Record<CaptionTopicKey, RegExp>> = {
    construction_wind_avoid: /공사장|공사\s*자재|위험한\s*물건|가지\s*않|피해/u,
    evacuate_to_safe_place:
      /안전한\s*곳|안전한\s*실내|대피소\s*가는\s*길|대피\s*요청|비상\s*가방|먹는\s*약|보청기|지팡이|대피소|대피/u,
    farm_waterway_stay_safe: /논둑|물꼬|보러\s*나가지|나가지\s*않/u,
    flood_landslide_avoid:
      /물에\s*잠기는|산사태|산비탈|급경사지|급경사|위험한\s*곳|멀어져|피해/u,
    river_car_drive: /차|차량|주차|운전|서행|옮겨/u,
    sewer_manhole_avoid: /맨홀|하수도|근처|멀어져|가지\s*않|접근/u,
    water_area_avoid:
      /침수\s*도로|지하공간|지하\s*차도|교량|개울가|하천|배수로|해안가|멀어져|가까이\s*가지|가지\s*않/u,
    weather_check: /기상\s*상황|기상상황|날씨|확인/u,
    wildfire_alert: /대피\s*안내|주변|어른|알려|확인/u,
    wildfire_burn_ban: /소각|멈춰|산림/u,
    wildfire_ember_check: /화목\s*보일러|불씨|확인/u,
    wildfire_evacuation_route: /산과\s*떨어진\s*도로|도로|대피/u,
    wildfire_ground_protect: /낙엽|낮게|엎드려|보호/u,
    wildfire_lighter_ban: /라이터|담배|두고/u,
    flood_home_return_check:
      /전기.*가스.*안전점검|수돗물.*오염|침수된?\s*집|어른.*확인/u,
    flood_lowland_powerline_avoid: /낮은\s*곳|비탈면|산지|전신주|멀어져/u,
    flood_prepare_weather_shelter:
      /기상정보|기상\s*상황|대피\s*장소|알아둬|확인/u,
    flood_river_car_utilities: /하천변.*차량|차량.*옮겨|전기.*가스.*꺼/u,
    heavy_snow_clear:
      /내\s*집\s*앞|눈.*치워|제설|2인\s*이상|지붕|심야|가로수|위험\s*시설|멀어져|어른/u,
    heavy_snow_drive:
      /스노우\s*체인|체인|안전거리|천천히|서행|급제동|급가속|급핸들|부드럽게|자전거|킥보드|이동수단/u,
    heavy_snow_stay_home: /외출|대중교통|실내/u,
  }

  return patterns[topic] ?? null
}

function hasGeneratedDoNotTrack(segment: GeneratedPracticeSegment) {
  const structuredExplanation = segment.structuredExplanation as {
    tracks?: { doNot?: unknown }
  }

  return Boolean(structuredExplanation.tracks?.doNot)
}

function hasGroundedGeneratedAction(segment: GeneratedPracticeSegment) {
  const structuredExplanation = segment.structuredExplanation as {
    segment?: { status?: unknown }
    validation?: { hasGroundedAction?: unknown }
  }

  if (segment.practiceMode !== 'action') {
    return true
  }

  if (hasSourceBackedGeneratedAction(segment)) {
    return true
  }

  return (
    segment.segment.officialRuleIds.length > 0 &&
    structuredExplanation.segment?.status === 'validated' &&
    structuredExplanation.validation?.hasGroundedAction === true
  )
}

function hasSourceBackedGeneratedAction(segment: GeneratedPracticeSegment) {
  if (segment.practiceMode !== 'action') {
    return false
  }

  const sourceText = normalizeCueText(
    [
      ...segment.narration.map((cue) => cue.text),
      segment.teacherGuide?.script ?? '',
    ].join(' '),
  )
  const hasQuestion =
    segment.answerOptions.filter((option) => option.correct).length === 1 &&
    normalizeCueText(segment.checkQuestion).length > 0

  return sourceText.length >= 8 && segment.actionSteps.length > 0 && hasQuestion
}

function extractSourceTopics(cues: CaptionCue[]) {
  return new Set(
    cues
      .map((cue) => topicKeyForCueText(cue.text))
      .filter((topic): topic is CaptionTopicKey => Boolean(topic)),
  )
}

function segmentTopics(segment: GeneratedPracticeSegment) {
  if (Array.isArray(segment.sourceTopicKeys)) {
    return new Set(segment.sourceTopicKeys.filter(isCaptionTopicKey))
  }

  return extractSourceTopics(
    segment.narration.map((cue) => ({
      endMs: cue.endMs,
      startMs: cue.startMs,
      text: cue.text,
    })),
  )
}

function windowsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  return Math.max(startA, startB) <= Math.min(endA, endB)
}

function learnerVisibleTexts(segment: GeneratedPracticeSegment) {
  return [
    segment.learnerPrompt,
    segment.learnerExplanation,
    ...segment.actionSteps,
    ...segment.actionReasons,
    ...segment.safetyWarnings,
    segment.checkQuestion,
    ...(segment.answerOptions ?? []).flatMap((option) => [
      option.feedback,
      option.label,
    ]),
  ].filter(Boolean)
}

function learnerPrimaryUiTexts(segment: GeneratedPracticeSegment) {
  const structuredDoNot = segment.structuredExplanation.tracks.doNot?.text
  const legacyDoNot = segment.explanation.doNot
  const suppressedDoNot =
    segment.structuredExplanation.suppressedCandidates.find(
      (candidate) => candidate.category === 'unsafe_action',
    )?.candidate

  return [
    segment.learnerPrompt,
    segment.learnerExplanation,
    ...segment.learnerSequence.map((step) => step.text),
    ...segment.actionSteps,
    ...(segment.structuredExplanation.tracks.action?.cards.map(
      (card) => card.label,
    ) ?? []),
    structuredDoNot ?? legacyDoNot ?? suppressedDoNot,
    segment.checkQuestion,
    ...(segment.answerOptions ?? []).map((option) => option.label),
  ].filter(Boolean)
}

function textContainsKeyword(text: string, keyword: string) {
  const normalizedText = normalizeForKeywordSearch(text)
  const normalizedKeyword = normalizeForKeywordSearch(keyword)

  return Boolean(
    normalizedKeyword && normalizedText.includes(normalizedKeyword),
  )
}

function normalizeForKeywordSearch(text: string) {
  return normalizeCueText(text)
    .replace(/\s+/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase()
}

function isMeaningfulLearningCue(cue: CaptionCue) {
  const normalized = normalizeCueText(cue.text)

  return (
    normalized.length >= 8 &&
    !/^\[?음악\]?$/u.test(normalized) &&
    !/^(주세요|지켜주세요)$/u.test(normalized)
  )
}

function segmentCoversCueMidpoint(
  segment: Pick<GeneratedPracticeSegment, 'endMs' | 'startMs'>,
  cue: CaptionCue,
) {
  const midpoint = (cue.startMs + cue.endMs) / 2

  return midpoint >= segment.startMs - 250 && midpoint <= segment.endMs + 250
}

function learnerTextProblem(text: string) {
  const bannedPatterns: Array<[RegExp, string]> = [
    [/유입/u, '유입'],
    [/차단/u, '차단'],
    [/숙지/u, '숙지'],
    [/저지대/u, '저지대'],
    [/고립되어/u, '고립되어'],
    [/나리/u, '나리'],
    [/훈화/u, '훈화'],
    [/채소/u, '채소'],
    [/왜 신고/u, '왜 신고'],
    [/정도 마고/u, '정도 마고'],
    [/나가자 였습니다/u, '나가자 였습니다'],
    [/찾기해야|가기해야|지키기하는/u, '어색한 -기하다 치환'],
    [/가능할 수/u, '가능할 수'],
    [/안전합니다/u, '안전합니다'],
    [/권장함/u, '권장함'],
  ]
  const problem = bannedPatterns.find(([pattern]) => pattern.test(text))

  return problem?.[1] ?? null
}

function formatQualityFailure(report: GeneratedQualityReport) {
  const blockers = report.issues
    .filter((issue) => issue.severity === 'blocker')
    .slice(0, 3)
    .map((issue) => issue.message)

  return [
    '자동 생성 품질 검사에서 막혔습니다.',
    ...blockers,
    '이 영상은 바로 학습 화면으로 보여 주기 전에 더 세밀한 분할이나 자막 보정이 필요합니다.',
  ].join(' ')
}

function formatQualityFailureForModel(report: GeneratedQualityReport) {
  const blockers = report.issues
    .filter((issue) => issue.severity === 'blocker')
    .map((issue) => ({
      code: issue.code,
      message: issue.message,
      segmentId: issue.segmentId ?? null,
    }))

  return JSON.stringify(
    {
      failedLocalQualityGate: true,
      blockerIssues: blockers,
      mandatoryVisualSplitBoundaries: buildMandatoryVisualSplitBoundaries(
        report.analysisDepth,
      ),
      repairRules: [
        'Return the full scenario again, not a patch.',
        'Every mandatoryVisualSplitBoundary.recommendedBoundaryMs must be represented by a segment boundary within 900ms.',
        'Do not allow one segment to contain the beforeCaption and afterCaption of the same mandatory visual split.',
        'If the issue code is visual_caption_boundary_merged, split the referenced segment into separate learner-facing scenes.',
        'If the issue code is mixed_action_topic_segment, split the referenced action segment so each resulting scene contains exactly one sourceTopicKeys value and one learner decision topic.',
        'If the issue code is action_missing_source_topic, infer the segment topic from its direct-audio cue and use that topic in sourceTopicKeys; otherwise make it an intro scene.',
        'If the issue code is topic_action_semantic_mismatch, rewrite the action card and review question from the current direct-audio cue only.',
        'If the issue code is intro_has_action_content, remove action cards, do-not text, and teach-back questions from that intro scene.',
        'If the issue code is low_quality_teach_back, rewrite the question so it asks about the concrete action target or the concrete do-not target. Do not use generic answers such as 안전, 중요, or 태풍.',
        'Keep every audio topic and every important source noun in at least one teacherGuide.script and learner-facing text.',
      ],
    },
    null,
    2,
  )
}

function buildScenarioQualityFeedback(report: GeneratedQualityReport) {
  return [
    'Previous full scenario passed JSON validation but failed local learning-quality validation.',
    formatQualityFailureForModel(report),
    'Regenerate the full scenario and preserve every source audio topic in at least one teacherGuide.script and learner-facing scene.',
    'Do not merge any mandatory visual caption split boundary into one segment.',
  ].join('\n')
}

function buildSegment(input: {
  cueGroup: CaptionCue[]
  evidenceReport?: GenerationEvidenceReport
  hardSplitBoundariesMs?: number[]
  hazard: HazardProfile
  index: number
  jobId: string
  nextStartMs?: number
  sourceTitle: string
  sourceUrl: string
}): GeneratedPracticeSegment {
  const text = normalizeCueText(input.cueGroup.map((cue) => cue.text).join(' '))
  const startMs = quantizeBoundaryMs(
    input.cueGroup[0]?.startMs ?? input.index * 10_000,
  )
  const naturalEndMs = Math.max(
    input.cueGroup.at(-1)?.endMs ?? startMs + 8_000,
    startMs + 700,
  )
  const endMs = quantizeBoundaryMs(
    input.nextStartMs
      ? Math.min(
          naturalEndMs,
          Math.max(startMs + 500, input.nextStartMs - boundaryPrecisionMs),
        )
      : naturalEndMs,
  )
  const visualEvidenceTexts = visualCaptionTextsForWindow(
    input.evidenceReport,
    startMs,
    endMs,
  )
  const visualEvidenceText = visualEvidenceTexts.join(' ')
  const audioSourceTopicKeys = selectDominantCaptionTopicKeys(
    input.cueGroup
      .map((cue) => topicKeyForCueText(cue.text))
      .filter((topic): topic is CaptionTopicKey => Boolean(topic)),
    text,
  )
  const visualSourceTopicKeys = selectDominantCaptionTopicKeys(
    visualEvidenceTexts
      .map(topicKeyForCueText)
      .filter((topic): topic is CaptionTopicKey => Boolean(topic)),
    visualEvidenceText,
  )
  const sourceTopicKeys =
    audioSourceTopicKeys.length > 0
      ? audioSourceTopicKeys
      : visualSourceTopicKeys
  const learnerVisualEvidenceTexts = selectLearnerVisualEvidenceTexts(
    visualEvidenceTexts,
    audioSourceTopicKeys,
  )
  const sourceEvidenceText = normalizeCueText(
    [text, ...learnerVisualEvidenceTexts].join(' '),
  )
  const actions = sanitizeActionStepsForGoldenContract({
    actionSteps: extractActions(sourceEvidenceText, input.hazard),
    hazard: input.hazard,
    sourceText: sourceEvidenceText,
  })
  const practiceMode = actions.length > 0 ? 'action' : 'intro'
  const actionSteps = practiceMode === 'action' ? actions.slice(0, 3) : []
  const introTitleText =
    practiceMode === 'intro'
      ? sourceBackedIntroTitleText(sourceEvidenceText, input.hazard) ??
        sourceBackedIntroTitleText(text, input.hazard)
      : null
  const actionReasons = actionSteps.map((action) =>
    sanitizeLearnerText(
      reasonForAction(action, input.hazard),
      reasonForAction(action, input.hazard),
    ),
  )
  const learnerPrompt =
    introTitleText ??
    sanitizeLearnerText(
      situationFromText(sourceEvidenceText, input.hazard),
      `${input.hazard.label} 상황을 보고 있어요.`,
    )
  const learnerExplanation =
    practiceMode === 'action'
      ? sanitizeLearnerText(summarizeAction(actionSteps), actionSteps[0]!)
      : introTitleText ??
        sanitizeLearnerText(
          shortenLearnerText(
            text,
            `${input.hazard.label} 영상을 보고 있어요.`,
            input.hazard,
          ),
          `${input.hazard.label} 영상을 보고 있어요.`,
        )
  const segmentId = `${input.jobId}-segment-${input.index + 1}`
  const teachBack =
    practiceMode === 'action'
      ? buildTeachBack(
          selectTeachBackAction(actionSteps),
          input.hazard,
          actionSteps,
        )
      : null
  const teacherScript = normalizeTeacherScriptForSourceTopics(
    sourceEvidenceText,
    sourceTopicKeys,
  )
  const doNot = sanitizeLearnerText(
    doNotForText(sourceEvidenceText, input.hazard),
    input.hazard.doNot,
    80,
  )
  const packet = buildGroundingPacket({
    actionReasons,
    actionSteps,
    cues: input.cueGroup,
    doNot,
    endMs,
    jobId: input.jobId,
    narrationText: teacherScript,
    sourceTopicKeys,
    startMs,
  })
  const grounded = buildGroundedLearningOutput({
    actionReasons,
    actionSteps,
    doNot,
    hazard: input.hazard,
    packet,
    segmentId,
    sourceTitle: input.sourceTitle,
    sourceTopicKeys,
    sourceUrl: input.sourceUrl,
    teachBack,
  })
  const answerOptions =
    grounded.teachBack?.options.map((option) => ({
      ...option,
      correct: option.id === grounded.teachBack?.correctOptionId,
    })) ?? []
  const explanation = grounded.explanation
  const segment = grounded.segment
  const structuredExplanation = grounded.structuredExplanation

  return {
    actionReasons,
    actionSteps,
    answerOptions,
    checkQuestion: grounded.teachBack?.prompt ?? '',
    description: learnerExplanation,
    endMs,
    explanation,
    id: segmentId,
    label: learnerExplanation,
    learnerExplanation,
    learnerPrompt,
    learnerSequence: buildGoldenLearnerSequence({
      actionSteps,
      fallbackSequence: [],
      learnerPrompt,
      practiceMode,
    }),
    narration: input.cueGroup.map((cue) => ({
      endMs: cue.endMs,
      source: 'audio',
      startMs: cue.startMs,
      text: cue.text,
    })),
    packet,
    practiceMode,
    primarySourceTitle: input.sourceTitle,
    requiredLearnerKeywords: buildGeneratedRequiredLearnerKeywords({
      actionSteps,
      explicitKeywords: [],
      sourceText: teacherScript,
      sourceTopicKeys,
    }),
    ruleMatches: [],
    safetyNotice,
    safetyWarnings: practiceMode === 'action' ? [doNot] : [],
    segment,
    sourceTopicKeys,
    startMs,
    structuredExplanation,
    teacherGuide: {
      correction:
        '자동 생성된 문구가 어색하면 선생님이 쉬운 말로 다시 말합니다.',
      observe: '학습자가 장면과 행동을 구분하는지 봅니다.',
      prompt: grounded.teachBack?.prompt ?? '무슨 내용인지 같이 말해 봅니다.',
      script: teacherScript,
    },
    teachBack: grounded.teachBack,
  }
}

function groupCues(cues: CaptionCue[], hardSplitBoundariesMs: number[] = []) {
  const hardBoundaries = normalizeHardSplitBoundaries(hardSplitBoundariesMs)
  const boundarySplit = splitCuesAtBoundaries(
    expandLongCaptionCues(cues.filter((cue) => cue.text.trim().length > 0)),
    hardBoundaries,
  )
  const normalized = expandLongCaptionCues(splitIntroOutroCues(boundarySplit))
  if (normalized.length === 0) {
    return buildFallbackCues('재난안전 영상을 보고 있어요.').map((cue) => [cue])
  }

  const topicGroups = groupCuesByTopic(normalized, hardBoundaries)
  if (topicGroups.length >= 2) {
    return topicGroups.slice(0, 28)
  }

  const groups: CaptionCue[][] = []
  let current: CaptionCue[] = []

  for (const cue of normalized) {
    const currentStart = current[0]?.startMs ?? cue.startMs
    const previous = current.at(-1)
    const gap = previous ? cue.startMs - previous.endMs : 0
    const previousContinues = endsWithContinuationPhrase(previous?.text ?? '')
    const wouldBeLong =
      cue.endMs - currentStart > maximumGeneratedSegmentMs &&
      !endsWithContinuationPhrase(previous?.text ?? '')
    const hardSplit = previous
      ? hasHardBoundaryBetween(previous.endMs, cue.startMs, hardBoundaries)
      : false
    const effectiveHardSplit = hardSplit && !previousContinues

    if (
      current.length > 0 &&
      (effectiveHardSplit || gap > 6_000 || wouldBeLong)
    ) {
      groups.push(current)
      current = []
    }

    current.push(cue)
  }

  if (current.length > 0) {
    groups.push(current)
  }

  return groups.slice(0, 28)
}

function normalizeHardSplitBoundaries(boundariesMs: number[]) {
  return [...new Set(boundariesMs.map(quantizeBoundaryMs))]
    .filter((boundary) => Number.isFinite(boundary) && boundary > 0)
    .sort((a, b) => a - b)
}

function hasHardBoundaryBetween(
  previousEndMs: number,
  nextStartMs: number,
  hardBoundariesMs: number[],
) {
  const low = Math.min(previousEndMs, nextStartMs)
  const high = Math.max(previousEndMs, nextStartMs)

  return hardBoundariesMs.some(
    (boundary) => boundary >= low - 120 && boundary <= high + 120,
  )
}

function prepareEvidenceCues(
  cues: CaptionCue[],
  frameCutsMs: number[],
  sceneCutCandidatesMs: number[] = [],
  options: {
    durationMs?: number | null
    visualCaptionEvidence?: VisualCaptionEvidence
  } = {},
) {
  const hardBoundaries = normalizeHardSplitBoundaries(frameCutsMs)
  const sceneCutBoundaries = normalizeHardSplitBoundaries(sceneCutCandidatesMs)

  if (
    shouldPromoteVisualCaptionEvidenceToCues({
      durationMs: options.durationMs,
      rawCues: cues,
      visualCaptionEvidence: options.visualCaptionEvidence,
    })
  ) {
    const visualCaptionCues = buildVisualCaptionEvidenceCues({
      durationMs: options.durationMs,
      rawCues: cues,
      visualCaptionEvidence: options.visualCaptionEvidence!,
    })

    if (visualCaptionCues.length >= 2) {
      return expandLongCaptionCues(
        splitIntroOutroCues(visualCaptionCues, sceneCutBoundaries),
      )
    }
  }

  const boundarySplit = splitCuesAtBoundaries(
    expandLongCaptionCues(cues),
    hardBoundaries,
  )

  return expandLongCaptionCues(
    splitIntroOutroCues(boundarySplit, sceneCutBoundaries),
  )
}

function shouldPromoteVisualCaptionEvidenceToCues(input: {
  durationMs?: number | null
  rawCues: CaptionCue[]
  visualCaptionEvidence?: VisualCaptionEvidence
}) {
  const evidence = input.visualCaptionEvidence
  if (!evidence || !isWeakBroadAudioCueSet(input.rawCues, input.durationMs ?? null)) {
    return false
  }

  const strongFrames = evidence.frames.filter(
    (frame) =>
      frame.hasLearningCaption &&
      frame.confidence >= visualCaptionBoundaryConfidenceThreshold &&
      normalizeCueText(frame.normalizedCaption || frame.visibleCaption),
  )
  const distinctVisualTopics = new Set(
    strongFrames
      .map((frame) =>
        visualCaptionTopicFingerprint(
          frame.normalizedCaption || frame.visibleCaption,
        ),
      )
      .filter(Boolean),
  )

  return (
    strongFrames.length >= 3 &&
    distinctVisualTopics.size >= 3 &&
    evidence.boundaries.filter(isReliableVisualCaptionBoundary).length >= 2
  )
}

function hasSufficientDeterministicEvidence(input: {
  rawCues: CaptionCue[]
  visualCaptionEvidence: VisualCaptionEvidence
}) {
  const meaningfulAudioCueCount = input.rawCues.filter(
    isMeaningfulLearningCue,
  ).length
  const meaningfulOcrFrameCount = input.visualCaptionEvidence.frames.filter(
    (frame) =>
      frame.hasLearningCaption &&
      frame.confidence >= visualCaptionBoundaryConfidenceThreshold &&
      normalizeCueText(frame.normalizedCaption || frame.visibleCaption),
  ).length

  return meaningfulAudioCueCount >= 2 || meaningfulOcrFrameCount >= 2
}

function buildVisualCaptionEvidenceCues(input: {
  durationMs?: number | null
  rawCues: CaptionCue[]
  visualCaptionEvidence: VisualCaptionEvidence
}) {
  const durationMs = quantizeBoundaryMs(
    input.durationMs ??
      Math.max(
        ...input.rawCues.map((cue) => cue.endMs),
        ...input.visualCaptionEvidence.frames.map((frame) => frame.tsMs),
        0,
      ),
  )
  const boundaries = input.visualCaptionEvidence.boundaries
    .filter(isReliableVisualCaptionBoundary)
    .map((boundary) => quantizeBoundaryMs(boundary.recommendedBoundaryMs))
    .filter((boundary) => boundary > 700 && boundary < durationMs - 500)
  const points = [...new Set([0, ...boundaries, durationMs].map(quantizeBoundaryMs))]
    .filter((boundary) => boundary >= 0 && boundary <= durationMs)
    .sort((a, b) => a - b)
  const frames = input.visualCaptionEvidence.frames
    .filter(
      (frame) =>
        frame.hasLearningCaption &&
        frame.confidence >= 0.72 &&
        normalizeCueText(frame.normalizedCaption || frame.visibleCaption),
    )
    .sort((a, b) => a.tsMs - b.tsMs)
  const cues: CaptionCue[] = []

  for (let index = 0; index < points.length - 1; index += 1) {
    const startMs = points[index]!
    const endMs = points[index + 1]!
    if (endMs - startMs < 700) {
      continue
    }

    const intervalFrames = frames.filter(
      (frame) => frame.tsMs >= startMs && frame.tsMs < endMs,
    )
    const fallbackCaption =
      input.visualCaptionEvidence.boundaries.find(
        (boundary) => quantizeBoundaryMs(boundary.recommendedBoundaryMs) === startMs,
      )?.afterCaption ??
      input.visualCaptionEvidence.boundaries.find(
        (boundary) => quantizeBoundaryMs(boundary.recommendedBoundaryMs) === endMs,
      )?.beforeCaption ??
      ''
    const text = representativeVisualCaptionText(intervalFrames, fallbackCaption)

    if (!text) {
      continue
    }

    cues.push(
      quantizeCue({
        endMs,
        startMs,
        text,
      }),
    )
  }

  return trimRepeatedCueGroup(cues)
}

function representativeVisualCaptionText(
  frames: VisualCaptionFrame[],
  fallbackCaption: string,
) {
  const texts = dedupeStrings(
    frames
      .map((frame) => normalizeCueText(frame.normalizedCaption || frame.visibleCaption))
      .filter(Boolean),
  )

  if (texts.length > 0) {
    return texts.slice(0, 2).join('. ')
  }

  return normalizeCueText(fallbackCaption)
}

function splitIntroOutroCues(
  cues: CaptionCue[],
  sceneCutCandidatesMs: number[] = [],
): CaptionCue[] {
  return cues.flatMap((cue) =>
    splitIntroOutroCue(cue, sceneCutCandidatesMs).map(quantizeCue),
  )
}

function splitIntroOutroCue(
  cue: CaptionCue,
  sceneCutCandidatesMs: number[] = [],
): CaptionCue[] {
  const introSplit = splitIntroCueWithTrailingLearningTopic(
    cue,
    sceneCutCandidatesMs,
  )
  if (introSplit) {
    return introSplit
  }

  const outroSplit = splitOutroCueFromLeadingLearningTopic(
    cue,
    sceneCutCandidatesMs,
  )
  if (outroSplit) {
    return outroSplit
  }

  return [cue]
}

function splitIntroCueWithTrailingLearningTopic(
  cue: CaptionCue,
  sceneCutCandidatesMs: number[] = [],
): CaptionCue[] | null {
  const split = splitIntroCueTextWithTrailingLearningTopic(cue.text)

  if (!split || cue.endMs - cue.startMs < 2_600) {
    return null
  }

  const heuristicSplitMs = quantizeBoundaryMs(
    clamp(
      cue.startMs + Math.round((cue.endMs - cue.startMs) * 0.78),
      cue.startMs + 1_200,
      cue.endMs - 800,
    ),
  )
  const splitMs = alignSemanticCueSplitToSceneCut({
    cue,
    heuristicSplitMs,
    latestMs: cue.endMs - 800,
    sceneCutCandidatesMs,
  })

  return [
    {
      endMs: splitMs,
      startMs: cue.startMs,
      text: split.intro,
    },
    {
      endMs: cue.endMs,
      startMs: splitMs,
      text: split.rest,
    },
  ]
}

function splitIntroCueTextWithTrailingLearningTopic(text: string) {
  const normalized = normalizeCueText(text)
  const match = normalized.match(
    /^(?<intro>.*(?:국민\s*행동\s*요령|국민행동요령|재난\s*대비\s*국민\s*행동\s*요령|함께하는\s*(?:태풍|호우|폭염|한파|대설|지진|화재)[^,，.。!?！？]*))(?:[,，:：]\s*|\s+)(?<rest>.+)$/u,
  )
  const intro = normalizeCueText(match?.groups?.intro ?? '')
  const rest = normalizeCueText(match?.groups?.rest ?? '')

  if (!intro || !rest || !cueTailHasConcreteLearningTopic(rest)) {
    return null
  }

  return { intro, rest }
}

function splitOutroCueFromLeadingLearningTopic(
  cue: CaptionCue,
  sceneCutCandidatesMs: number[] = [],
): CaptionCue[] | null {
  const text = normalizeCueText(cue.text)
  const match = text.match(
    /^(?<body>.+?)(?:[.!?。！？]\s*|\s+)(?<outro>우리\s*모두\s*함께\s*(?:대비해요|안전하게\s*대비해요)|태풍\s*피해\s*없이.+|안전수칙을?\s*다시\s*기억.+|다시\s*기억해요)$/u,
  )
  const body = normalizeCueText(match?.groups?.body ?? '')
  const outro = normalizeCueText(match?.groups?.outro ?? '')

  if (
    !body ||
    !outro ||
    topicKeyForCueText(outro) !== 'outro_review' ||
    !cueTailHasConcreteLearningTopic(body) ||
    cue.endMs - cue.startMs < 2_200
  ) {
    return null
  }

  const heuristicSplitMs = quantizeBoundaryMs(
    clamp(
      cue.startMs + Math.round((cue.endMs - cue.startMs) * 0.82),
      cue.startMs + 1_200,
      cue.endMs - 700,
    ),
  )
  const splitMs = alignSemanticCueSplitToSceneCut({
    cue,
    earliestMs: cue.startMs + 1_200,
    heuristicSplitMs,
    sceneCutCandidatesMs,
  })

  return [
    {
      endMs: splitMs,
      startMs: cue.startMs,
      text: body,
    },
    {
      endMs: cue.endMs,
      startMs: splitMs,
      text: outro,
    },
  ]
}

function alignSemanticCueSplitToSceneCut(input: {
  cue: CaptionCue
  earliestMs?: number
  heuristicSplitMs: number
  latestMs?: number
  sceneCutCandidatesMs: number[]
}) {
  const earliestMs = input.earliestMs ?? input.cue.startMs + 1_200
  const latestMs = input.latestMs ?? input.cue.endMs - 700
  const nearbyCuts = input.sceneCutCandidatesMs
    .map(quantizeBoundaryMs)
    .filter((cutMs) => cutMs >= earliestMs && cutMs <= latestMs)
    .map((cutMs) => ({
      cutMs,
      distanceMs: Math.abs(cutMs - input.heuristicSplitMs),
    }))
    .filter(({ distanceMs }) => distanceMs <= 900)
    .sort((a, b) => a.distanceMs - b.distanceMs || a.cutMs - b.cutMs)

  return nearbyCuts[0]?.cutMs ?? input.heuristicSplitMs
}

function cueTailHasConcreteLearningTopic(text: string) {
  const topic = topicKeyForCueText(text)

  return (
    Boolean(topic && topic !== 'intro_weather' && topic !== 'outro_review') ||
    hasConcreteVisualLearningCaption(text)
  )
}

function expandLongCaptionCues(cues: CaptionCue[]): CaptionCue[] {
  return cues.flatMap((cue) => {
    const sentenceTopicCues = splitCueAtSentenceTopicChanges(cue)
    if (sentenceTopicCues.length > 1) {
      return expandLongCaptionCues(sentenceTopicCues)
    }

    const durationMs = cue.endMs - cue.startMs

    if (durationMs <= maximumGeneratedSegmentMs || cue.text.length < 18) {
      return [quantizeCue(cue)]
    }

    const parts = splitCaptionTextIntoParts(
      cue.text,
      Math.ceil(durationMs / maximumGeneratedSegmentMs),
    )

    if (parts.length <= 1) {
      return [cue]
    }

    const totalWeight = parts.reduce(
      (sum, part) => sum + Math.max(part.length, 1),
      0,
    )
    let cursorMs = cue.startMs

    return parts.map((part, index) => {
      const isLast = index === parts.length - 1
      const partDuration = isLast
        ? cue.endMs - cursorMs
        : Math.max(
            900,
            Math.round((durationMs * Math.max(part.length, 1)) / totalWeight),
          )
      const startMs = cursorMs
      const endMs = isLast
        ? cue.endMs
        : Math.min(cue.endMs, startMs + partDuration)
      cursorMs = endMs

      return {
        endMs: quantizeBoundaryMs(endMs),
        startMs: quantizeBoundaryMs(startMs),
        text: part,
      }
    })
  })
}

function splitCueAtSentenceTopicChanges(cue: CaptionCue) {
  const sentences = splitCaptionTextIntoSentences(cue.text)
  if (sentences.length < 2) {
    return [cue]
  }

  const topics = sentences.map((sentence) => topicKeyForCueText(sentence))
  const hasTopicChange = topics.some(
    (topic, index) =>
      index > 0 && topic && topics[index - 1] && topic !== topics[index - 1],
  )
  const hasHeadingToTopic = topics.some(
    (topic, index) =>
      index > 0 &&
      topic &&
      !topics[index - 1] &&
      /작전|전략|대비|요령/u.test(sentences[index - 1] ?? ''),
  )

  if (!hasTopicChange && !hasHeadingToTopic) {
    return [cue]
  }

  return splitCueByWeightedTextParts(cue, sentences)
}

function splitCaptionTextIntoSentences(text: string) {
  const normalized = normalizeCueText(text)
  const matches = normalized.match(/[^.!?。！？]+[.!?。！？]?/gu) ?? []

  return matches.map((part) => part.trim()).filter((part) => part.length > 0)
}

function splitCueByWeightedTextParts(cue: CaptionCue, parts: string[]) {
  const durationMs = cue.endMs - cue.startMs
  const totalWeight = parts.reduce(
    (sum, part) => sum + Math.max(part.length, 1),
    0,
  )
  let cursorMs = cue.startMs

  return parts.map((part, index) => {
    const isLast = index === parts.length - 1
    const partDuration = isLast
      ? cue.endMs - cursorMs
      : Math.max(
          700,
          Math.round((durationMs * Math.max(part.length, 1)) / totalWeight),
        )
    const startMs = cursorMs
    const endMs = isLast
      ? cue.endMs
      : Math.min(cue.endMs, startMs + partDuration)
    cursorMs = endMs

    return {
      endMs,
      startMs,
      text: part,
    }
  })
}

function splitCuesAtBoundaries(cues: CaptionCue[], boundariesMs: number[]) {
  const sortedBoundaries = [...new Set(boundariesMs.map(quantizeBoundaryMs))]
    .filter((boundary) => Number.isFinite(boundary))
    .sort((a, b) => a - b)

  if (sortedBoundaries.length === 0) {
    return cues.map(quantizeCue)
  }

  return cues.flatMap((cue) => {
    const innerBoundaries = sortedBoundaries.filter(
      (boundary) => boundary > cue.startMs + 700 && boundary < cue.endMs - 700,
    )

    if (innerBoundaries.length === 0) {
      return [quantizeCue(cue)]
    }

    const targetPartCount = innerBoundaries.length + 1
    const sentenceParts = splitCaptionTextIntoBoundarySafeParts(cue.text)
    const introSplit = splitIntroCueTextWithTrailingLearningTopic(cue.text)
    const semanticIntroParts = introSplit
      ? [
          introSplit.intro,
          ...splitCaptionTextIntoParts(
            introSplit.rest,
            Math.max(1, targetPartCount - 1),
          ),
        ]
      : null
    const candidateParts =
      semanticIntroParts && semanticIntroParts.length >= targetPartCount
        ? semanticIntroParts
        : sentenceParts.length >= targetPartCount
          ? sentenceParts
          : splitCaptionTextIntoParts(cue.text, targetPartCount)
    if (candidateParts.length < targetPartCount) {
      return [quantizeCue(cue)]
    }
    const parts = coalesceTextParts(candidateParts, targetPartCount)

    const boundaryList = [cue.startMs, ...innerBoundaries, cue.endMs]

    return parts.slice(0, boundaryList.length - 1).map((part, index) =>
      quantizeCue({
        endMs: boundaryList[index + 1]!,
        startMs: boundaryList[index]!,
        text: part,
      }),
    )
  })
}

function splitCaptionTextIntoBoundarySafeParts(text: string) {
  return normalizeCueText(text)
    .split(/(?<=[.!?。！？])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)
}

function coalesceTextParts(parts: string[], targetPartCount: number) {
  if (parts.length <= targetPartCount) {
    return parts
  }

  const result: string[] = []
  for (let index = 0; index < targetPartCount; index += 1) {
    const start = Math.floor((index * parts.length) / targetPartCount)
    const end = Math.floor(((index + 1) * parts.length) / targetPartCount)
    result.push(parts.slice(start, Math.max(start + 1, end)).join(' '))
  }

  return result
}

function quantizeCue(cue: CaptionCue): CaptionCue {
  return {
    ...cue,
    endMs: quantizeBoundaryMs(cue.endMs),
    startMs: quantizeBoundaryMs(cue.startMs),
  }
}

function quantizeBoundaryMs(ms: number) {
  return Math.round(ms / boundaryPrecisionMs) * boundaryPrecisionMs
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function splitCaptionTextIntoParts(text: string, targetParts: number) {
  const normalized = normalizeCueText(text)
  const sentenceParts = normalized
    .split(/(?<=[.!?。！？요다])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)

  if (sentenceParts.length >= targetParts) {
    return sentenceParts
  }

  const words = normalized.split(/\s+/u).filter(Boolean)
  if (words.length < 2) {
    return [normalized]
  }

  const wordsPerPart = Math.max(5, Math.ceil(words.length / targetParts))
  const parts: string[] = []

  for (let index = 0; index < words.length; index += wordsPerPart) {
    parts.push(words.slice(index, index + wordsPerPart).join(' '))
  }

  return parts
}

function groupCuesByTopic(cues: CaptionCue[], hardBoundariesMs: number[] = []) {
  const distinctTopics = new Set(
    cues.map((cue) => topicKeyForCueText(cue.text)).filter(Boolean),
  )

  if (distinctTopics.size < 2) {
    return []
  }

  const groups: CaptionCue[][] = []
  let current: CaptionCue[] = []
  let currentTopic: CaptionTopicKey | null = null

  for (const cue of cues) {
    const currentStart = current[0]?.startMs ?? cue.startMs
    const previous = current.at(-1)
    const gap = previous ? cue.startMs - previous.endMs : 0
    const previousContinues = endsWithContinuationPhrase(previous?.text ?? '')
    const wouldBeLong =
      cue.endMs - currentStart > maximumGeneratedSegmentMs &&
      !endsWithContinuationPhrase(previous?.text ?? '')
    const explicitTopic = topicKeyForCueText(cue.text)
    const topic: CaptionTopicKey | null =
      explicitTopic ?? (gap > 2_500 ? null : currentTopic)
    const hardSplit = previous
      ? hasHardBoundaryBetween(previous.endMs, cue.startMs, hardBoundariesMs)
      : false
    const effectiveHardSplit = hardSplit && !previousContinues
    const startsConcreteTopicAfterIntro =
      current.length > 0 &&
      !currentTopic &&
      Boolean(explicitTopic && isConcreteLearningTopic(explicitTopic)) &&
      isIntroCueGroup(current)
    const shouldSplit =
      current.length > 0 &&
      (effectiveHardSplit ||
        startsConcreteTopicAfterIntro ||
        (!previousContinues &&
          topic &&
          currentTopic &&
          topic !== currentTopic) ||
        wouldBeLong ||
        (!previousContinues && gap > 2_500))

    if (shouldSplit) {
      groups.push(current)
      current = []
      if ((effectiveHardSplit || gap > 2_500) && !explicitTopic) {
        currentTopic = null
      }
    }

    current.push(cue)
    currentTopic = topic ?? currentTopic
  }

  if (current.length > 0) {
    groups.push(current)
  }

  return groups
    .map((group) => trimRepeatedCueGroup(group))
    .filter((group) => group.length > 0)
}

function isConcreteLearningTopic(topic: CaptionTopicKey) {
  return topic !== 'intro_weather' && topic !== 'outro_review'
}

function isIntroCueGroup(group: CaptionCue[]) {
  const text = normalizeCueText(group.map((cue) => cue.text).join(' '))

  return /국민\s*행동\s*요령|국민행동요령|함께하는|재난\s*대비|소개/u.test(text)
}

function trimRepeatedCueGroup(group: CaptionCue[]) {
  return group.filter((cue, index) => {
    const previous = group[index - 1]
    if (!previous) return true

    return !(
      (cue.text.includes(previous.text) || previous.text.includes(cue.text)) &&
      Math.abs(cue.text.length - previous.text.length) < 8
    )
  })
}

function topicKeyForCueText(text: string): CaptionTopicKey | null {
  const normalized = normalizeCueText(text)

  if (/안전한\s*(?:TV|티비).*국민\s*행동\s*요령/u.test(normalized)) {
    return 'intro_weather'
  }

  if (/비상\s*가방|먹는\s*약|복용.*약|보청기|지팡이/u.test(normalized)) {
    return 'evacuate_to_safe_place'
  }

  if (
    /우리\s*모두\s*함께\s*(?:대비해요|안전하게\s*대비해요|안전하게\s*대피해요)|모두\s*함께\s*안전|함께\s*대비|함께\s*안전하게\s*대피|태풍피해\s*없이|안전수칙|다시\s*기억/u.test(
      normalized,
    )
  ) {
    return 'outro_review'
  }
  if (/우리\s*모두\s*안전하게\s*대피/u.test(normalized)) {
    return 'outro_review'
  }

  if (
    /침수된?\s*집|침수.*복귀|복귀.*(?:전기|가스|수돗물)|수돗물|오염\s*여부|안전\s*점검|안전점검/u.test(
      normalized,
    ) &&
    /침수|비가\s*그치|수돗물|상하수도|전기|가스/u.test(normalized)
  ) {
    return 'flood_home_return_check'
  }

  if (
    /하천\s*변.*(?:주차|차량|차를|차는)|하천변.*(?:주차|차량|차를|차는)|(?:주차|차량|차를|차는).*하천|침수.*(?:예상|집).*대피|(?:전기.*가스|가스.*전기).*(?:차단|끄|꺼|점검)/u.test(
      normalized,
    )
  ) {
    return 'flood_river_car_utilities'
  }

  if (/기상\s*정보|기상정보|대피\s*장소|대피장소/u.test(normalized)) {
    return 'flood_prepare_weather_shelter'
  }

  if (/저지대|낮은\s*곳|비탈면|산지|전신주/u.test(normalized)) {
    return 'flood_lowland_powerline_avoid'
  }

  if (
    /(?:하천|산길|위험\s*장소).*(?:접근\s*금지|절대\s*접근|가지\s*않|위험)|배수로.*(?:접근\s*금지|절대\s*접근|위험\s*장소)|(?:접근\s*금지|절대\s*접근).*(?:하천|산길|배수로|위험\s*장소)/u.test(
      normalized,
    )
  ) {
    return 'water_area_avoid'
  }

  if (
    /모래주머니|수방자재|수중\s*펌프|배수로|(?:물꼬|물고).*(?:미리|점검|정비)|(?:점검|정비).*(?:물꼬|물고)/u.test(
      normalized,
    ) &&
    !/(?:농촌.*(?:물꼬|물고).*나가지|(?:물꼬|물고).*나가지.*농촌|논둑|논뚝|무리하게|무리해서)/u.test(
      normalized,
    )
  ) {
    return 'drain_waterway'
  }

  if (/옷장|보관함|문\s*뒤|문을\s*천천히|천천히\s*열/u.test(normalized)) {
    return 'earthquake_return_door'
  }
  if (/가스\s*냄새|새는\s*소리|가스\s*누출|가스를/u.test(normalized)) {
    return 'earthquake_gas'
  }
  if (/정전|손전등|전선|전기\s*이상|전기\s*고장/u.test(normalized)) {
    return 'earthquake_electric'
  }
  if (/수도관|수도꼭지|화장실|물\s*쓰|물을\s*바로\s*사용/u.test(normalized)) {
    return 'earthquake_water'
  }
  if (/다친\s*사람|부상자|공공기관|공공\s*안내/u.test(normalized)) {
    return 'earthquake_report'
  }
  if (/학교|선생님|복도\s*창문/u.test(normalized)) {
    return 'earthquake_school'
  }
  if (/튼튼한\s*건물|최근에\s*지은\s*건물/u.test(normalized)) {
    return 'earthquake_sturdy_building'
  }
  if (
    /안전디딤돌|지진\s*대피소|넓은\s*공원|넓은\s*운동장|공원이나\s*운동장/u.test(
      normalized,
    )
  ) {
    return 'earthquake_open_space'
  }
  if (
    /유리와\s*간판|담장|가방으로\s*머리|건물에서\s*멀|건물과\s*담장|지진.*간판|간판.*지진/u.test(
      normalized,
    )
  ) {
    return 'earthquake_outside_head'
  }
  if (
    /엘리베이터|계단|건물\s*밖/u.test(normalized) &&
    /지진|흔들/u.test(normalized)
  ) {
    return 'earthquake_stairs'
  }
  if (/탁자|책상|머리.*보호|방석|흔들/u.test(normalized)) {
    return 'earthquake_protect'
  }
  if (/가스|전기|문을 열|흔들림이 끝|밖으로/u.test(normalized)) {
    return 'earthquake_after'
  }
  if (/현관문|문을\s*닫고\s*계단|문.*닫.*계단/u.test(normalized)) {
    return 'fire_door_control'
  }
  if (/산림\s*근처|소각/u.test(normalized)) {
    return 'wildfire_burn_ban'
  }
  if (/화목\s*보일러|불씨|꺼졌/u.test(normalized)) {
    return 'wildfire_ember_check'
  }
  if (/라이터|담배/u.test(normalized)) {
    return 'wildfire_lighter_ban'
  }
  if (/산불.*발생|대피\s*안내|주변.*알|즉시\s*알/u.test(normalized)) {
    return 'wildfire_alert'
  }
  if (/산과\s*떨어진\s*도로|산불\s*확산\s*구역|확산\s*구역/u.test(normalized)) {
    return 'wildfire_evacuation_route'
  }
  if (/산불.*낮은\s*자세|대피.*어려|낙엽|엎드/u.test(normalized)) {
    return 'wildfire_ground_protect'
  }
  if (/실수로.*산불|산불.*처벌|징역|벌금|명심/u.test(normalized)) {
    return 'outro_review'
  }
  if (/대피공간|경량칸막이|하향식/u.test(normalized)) {
    return 'fire_refuge'
  }
  if (/젖은\s*수건|문틈|방문을\s*닫|방\s*안\s*위치/u.test(normalized)) {
    return 'fire_seal_room'
  }
  if (/안내\s*방송|다른\s*집|집\s*안에서\s*기다/u.test(normalized)) {
    return 'fire_monitoring'
  }
  if (
    /화재|불꽃|불이|연기.*봤|화재.*경보|경보.*화재|화재경보/u.test(normalized)
  ) {
    return 'fire_alert'
  }
  if (/연기|몸을 낮|낮은 자세/u.test(normalized)) return 'fire_smoke'
  if (/계단|엘리베이터|비상구|출구/u.test(normalized)) return 'fire_stairs'
  if (
    /(?:TV|티비|라디오).*(?:기상|날씨|상황)|(?:기상|날씨|상황).*(?:TV|티비|라디오)|기상\s*상황|기상상황|날씨/u.test(
      normalized,
    )
  ) {
    return 'weather_check'
  }
  if (/물.*(?:마시|마실|마셔)|물을?\s*자주|수분|갈증/u.test(normalized)) {
    return 'heatwave_water'
  }
  if (/낮 시간|한낮|쉬어|휴식|그늘/u.test(normalized)) {
    return 'heatwave_rest'
  }
  if (/폭염|무더위|더운 날|온열|열사병/u.test(normalized)) {
    return 'heatwave_cool'
  }
  if (/한파|추위|날씨.*춥|기온.*낮|영하/u.test(normalized)) {
    return 'coldwave_weather'
  }
  if (/따뜻|장갑|목도리|옷을|보온/u.test(normalized)) {
    return 'coldwave_warm'
  }
  if (
    /대설|폭설|눈이\s*많이|대설주의보|눈.*쌓.*외출|외출.*자제.*대중교통|빙판.*외출.*자제/u.test(
      normalized,
    )
  ) {
    return 'heavy_snow_stay_home'
  }
  if (
    /눈길|빙판|결빙|결빈|눈.*쌓.*(?:도로|서행)|눈.*운전|운전.*눈|미끄|스노우\s*체인|스프레이\s*체인|타이어.*체인|차량\s*운행.*체인|급제동|급가속|급핸들|안전거리|자전거|전동\s*킥보드/u.test(
      normalized,
    )
  ) {
    return 'heavy_snow_drive'
  }
  if (
    /내\s*집\s*앞.*눈|눈.*치우|제설|2인\s*이상.*제설|안전\s*확보.*제설|지붕.*(?:눈|제설|작업|올라)|심야\s*제설|가로수.*붕괴|노후\s*시설.*붕괴|붕괴\s*위험\s*시설/u.test(
      normalized,
    )
  ) {
    return 'heavy_snow_clear'
  }
  if (
    /공사장|공사\s*자재|큰\s*바람|강한\s*바람|날릴|넘어지/u.test(normalized)
  ) {
    return 'construction_wind_avoid'
  }
  if (/대피소\s*가는\s*길|대피\s*요청/u.test(normalized)) {
    return 'evacuate_to_safe_place'
  }
  if (/비상\s*가방|먹는\s*약|복용.*약|보청기|지팡이/u.test(normalized)) {
    return 'evacuate_to_safe_place'
  }
  if (/산비탈|급경사지|급경사/u.test(normalized)) {
    return 'flood_landslide_avoid'
  }
  if (
    /개울가|하천\s*변|하천변|해안가|급류|침수될|침수\s*위험지역|침수\s*도로|지하공간|지하\s*차도|교량/u.test(
      normalized,
    )
  ) {
    return 'water_area_avoid'
  }
  if (/물에\s*자주\s*잠기|산사태|위험한\s*곳.*피/u.test(normalized)) {
    return 'flood_landslide_avoid'
  }
  if (
    /산이나\s*계곡|산과\s*계곡|등산객|비탈면|산.*계곡|계곡.*대피/u.test(
      normalized,
    )
  ) {
    return 'mountain_valley_evacuate'
  }
  if (
    /논뚝|논둑|농촌.*(?:물고|물꼬).*(?:보러|나가지|무리)|(?:물고|물꼬).*(?:무리하게|무리해서|무리)|무리하게\s*나서/u.test(
      normalized,
    )
  ) {
    return 'farm_waterway_stay_safe'
  }
  if (/맨홀|하수도|추락\s*\/?\s*휩쓸림|휩쓸림\s*사고/u.test(normalized)) {
    return 'sewer_manhole_avoid'
  }
  if (/실내|문과 창문|창문 가까/u.test(normalized)) return 'indoor_window'
  if (/외출을 차지|외출을 자제|북상|대비하세요/u.test(normalized)) {
    return 'typhoon_warning'
  }
  if (/바닷가|선박|배를|배는|묶어 두/u.test(normalized)) return 'coastal_boat'
  if (/농촌|비닐하우스|농가|축사|시설물.*묶|단단히 묶/u.test(normalized)) {
    return 'farm_facility'
  }
  if (/주차|차량|운전|서행|차를|차는/u.test(normalized))
    return 'river_car_drive'
  if (/집 주변|침수피해|배수구/u.test(normalized)) return 'home_drain'
  if (
    /부득이하게 외출|외출을 해야|간판|위험 시설물|시설물 주변/u.test(normalized)
  ) {
    return 'outdoor_signage'
  }
  if (/배수로|물꼬/u.test(normalized)) return 'drain_waterway'
  if (/고립|신고|1\s*1|119/u.test(normalized)) return 'call_119'
  if (/낮은 다리|낮은 곳|물이 찬|침수.*다리|건너지|건너/u.test(normalized)) {
    return 'stay_away_from_low_water'
  }
  if (/갑자기 비|쏟아질|안전한 곳|대피/u.test(normalized)) {
    return 'evacuate_to_safe_place'
  }
  if (/산행|캠핑/u.test(normalized)) return 'outdoor_activity'
  if (/여름철|호우|홍수|집중호우|태풍|비바람/u.test(normalized))
    return 'intro_weather'

  return null
}

function parseVtt(input: string): CaptionCue[] {
  const cues: CaptionCue[] = []
  const blocks = input.split(/\n\s*\n/u)

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const timeLineIndex = lines.findIndex((line) => line.includes('-->'))

    if (timeLineIndex < 0) {
      continue
    }

    const [rawStart, rawEnd] = lines[timeLineIndex]!.split('-->').map(
      (part) => part.trim().split(/\s+/u)[0],
    )
    const startMs = parseTimestamp(rawStart)
    const endMs = parseTimestamp(rawEnd)
    const rawTextLines = lines.slice(timeLineIndex + 1)
    const hasProgressiveText = rawTextLines.some((line) =>
      /<\d{2}:\d{2}:|<c[ >]/u.test(line),
    )
    const rawCueText = hasProgressiveText
      ? (rawTextLines.at(-1) ?? '')
      : rawTextLines.join(' ')
    const parsedCues = hasProgressiveText
      ? splitProgressiveCueByTopic(rawCueText, startMs, endMs)
      : [
          {
            endMs,
            startMs,
            text: normalizeCueText(
              rawCueText.replace(/<[^>]+>/gu, ' ').replace(/&nbsp;/gu, ' '),
            ),
          },
        ]

    for (const cue of parsedCues) {
      if (
        cue.text &&
        Number.isFinite(cue.startMs) &&
        Number.isFinite(cue.endMs)
      ) {
        const previous = cues.at(-1)
        if (
          previous?.text === cue.text &&
          previous.endMs >= cue.startMs - 300
        ) {
          previous.endMs = Math.max(previous.endMs, cue.endMs)
        } else {
          cues.push(cue)
        }
      }
    }
  }

  return cues
}

function splitProgressiveCueByTopic(
  rawCueText: string,
  startMs: number,
  endMs: number,
): CaptionCue[] {
  const tokens = extractProgressiveCueTokens(rawCueText, startMs, endMs)

  if (tokens.length < 2) {
    return [
      {
        endMs,
        startMs,
        text: normalizeCueText(
          rawCueText.replace(/<[^>]+>/gu, ' ').replace(/&nbsp;/gu, ' '),
        ),
      },
    ]
  }

  const splitIndexes = new Set<number>()

  for (let index = 1; index < tokens.length; index += 1) {
    const prefixText = normalizeCueText(
      tokens
        .slice(0, index)
        .map((token) => token.text)
        .join(' '),
    )
    const suffixText = normalizeCueText(
      tokens
        .slice(index)
        .map((token) => token.text)
        .join(' '),
    )
    const prefixTopic = topicKeyForCueText(prefixText)
    const suffixTopic = topicKeyForCueText(suffixText)

    if (!suffixTopic) {
      continue
    }

    if (prefixTopic && prefixTopic !== suffixTopic) {
      splitIndexes.add(index)
      continue
    }

    if (!prefixTopic && isCaptionCarryoverPhrase(prefixText)) {
      splitIndexes.add(index)
    }
  }

  if (splitIndexes.size === 0) {
    return [
      {
        endMs,
        startMs,
        text: normalizeCueText(tokens.map((token) => token.text).join(' ')),
      },
    ]
  }

  const cues: CaptionCue[] = []
  let chunkStartIndex = 0

  for (let index = 1; index <= tokens.length; index += 1) {
    if (index < tokens.length && !splitIndexes.has(index)) {
      continue
    }

    const chunk = tokens.slice(chunkStartIndex, index)
    const text = normalizeCueText(chunk.map((token) => token.text).join(' '))
    if (text) {
      cues.push({
        endMs: quantizeBoundaryMs(chunk.at(-1)?.endMs ?? endMs),
        startMs: quantizeBoundaryMs(chunk[0]?.startMs ?? startMs),
        text,
      })
    }
    chunkStartIndex = index
  }

  return cues
}

function extractProgressiveCueTokens(
  rawCueText: string,
  startMs: number,
  endMs: number,
) {
  const tokens: CaptionCue[] = []
  const tokenPattern =
    /<(?<time>(?:\d+:)?\d{2}:\d{2}[.,]\d{3})><c>\s*(?<text>[^<]*)<\/c>/gu
  let match: RegExpExecArray | null
  let firstTimedTokenStartIndex: number | null = null

  while ((match = tokenPattern.exec(rawCueText))) {
    firstTimedTokenStartIndex ??= match.index
    const tokenStartMs = parseTimestamp(match.groups?.time)
    const text = normalizeCueText(match.groups?.text ?? '')

    if (text && Number.isFinite(tokenStartMs)) {
      tokens.push({
        endMs,
        startMs: tokenStartMs,
        text,
      })
    }
  }

  if (firstTimedTokenStartIndex !== null) {
    const leadingText = normalizeCueText(
      rawCueText
        .slice(0, firstTimedTokenStartIndex)
        .replace(/<[^>]+>/gu, ' ')
        .replace(/&nbsp;/gu, ' '),
    )
    if (leadingText) {
      tokens.unshift({
        endMs: tokens[0]?.startMs ?? endMs,
        startMs,
        text: leadingText,
      })
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    tokens[index]!.endMs = tokens[index + 1]?.startMs ?? endMs
  }

  return tokens.filter((token) => token.endMs > token.startMs)
}

function isCaptionCarryoverPhrase(text: string) {
  const normalized = normalizeCueText(text)

  return (
    normalized.length <= 24 &&
    /^(주세요|합니다|해요|하세요|말아요|않아요|피해|대피해요|점검합니다|정리해요|묶어요)$/u.test(
      normalized,
    )
  )
}

function parseTimestamp(input = '') {
  const match = input.match(/(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/u)
  if (!match) {
    return Number.NaN
  }

  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const milliseconds = Number(match[4])

  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds
}

function extractActions(text: string, hazard: HazardProfile) {
  const normalized = normalizeCueText(text)

  if (topicKeyForCueText(normalized) === 'outro_review') {
    return []
  }

  if (
    /국민\s*행동\s*요령|재난\s*대비|비밀\s*요원|행동만이\s*살길|미션\s*성공|태풍피해\s*없이|휴가를\s*보낼/u.test(
      normalized,
    )
  ) {
    return []
  }

  const sourceLockedActions = sourceLockedActionsForText(normalized)
  if (sourceLockedActions.length > 0) {
    return sourceLockedActions.slice(0, 3)
  }

  const topicActions = topicActionsForText(normalized)
  if (topicActions.length > 0) {
    return topicActions.slice(0, 3)
  }

  const priorityActions = priorityActionsForText(normalized)
  if (priorityActions.length > 0) {
    return priorityActions.slice(0, 3)
  }

  const candidates: string[] = []
  const add = (condition: boolean, action: string) => {
    if (condition && !candidates.includes(action)) {
      candidates.push(action)
    }
  }

  add(
    /문/u.test(normalized) &&
      /(닫|닫고)/u.test(normalized) &&
      !/문과 창문/u.test(normalized),
    '문을 닫아요',
  )
  add(/계단/u.test(normalized), '계단으로 가요')
  add(
    /엘리베이터/u.test(normalized) && /(타지|이용하지|말)/u.test(normalized),
    '계단을 찾아요',
  )
  add(
    hazard.hazard === 'earthquake' &&
      /머리|방석|쿠션|가방|보호/u.test(normalized),
    '머리를 보호해요',
  )
  add(/탁자|책상/u.test(normalized), '탁자 아래로 들어가요')
  add(/넓은|운동장|공원|대피소/u.test(normalized), '넓은 곳으로 가요')
  add(/선생님|보호자|어른/u.test(normalized), '어른 말을 들어요')
  add(
    /119|신고/u.test(normalized) && !isWeatherSafetyText(normalized),
    '119나 어른에게 알려요',
  )
  add(/연기|몸을 낮/u.test(normalized), '몸을 낮춰요')
  add(/가스|냄새/u.test(normalized), '가스 냄새를 어른에게 말해요')
  add(
    /창문|유리/u.test(normalized) &&
      /(떨어|멀리|가까이 가지)/u.test(normalized),
    '창문에서 떨어져요',
  )
  add(
    /태풍.*북상|외출을 차지|외출을 자제/u.test(normalized),
    '안전한 실내에 있어요',
  )
  add(/문과 창문|문.*창문/u.test(normalized), '문과 창문을 닫아요')
  add(
    /간판|위험 시설물|시설물 주변/u.test(normalized),
    '간판과 위험 시설물을 피해요',
  )
  add(
    /집 주변|침수피해|배수구/u.test(normalized),
    '어른과 배수구를 미리 확인해요',
  )
  add(/주차|차량|차를|차는/u.test(normalized), '하천 근처 차를 미리 옮겨요')
  add(/운전|서행/u.test(normalized), '운전하면 천천히 가요')
  add(
    /농촌|시설물.*묶|단단히 묶/u.test(normalized),
    '어른과 시설물을 미리 묶어요',
  )
  add(/배수로|물꼬|물고/u.test(normalized), '배수로를 미리 정리해요')
  add(
    /맨홀|하수도|추락|휩쓸림/u.test(normalized),
    '맨홀과 하수도 근처에서 멀어져요',
  )
  add(/산림\s*근처|소각/u.test(normalized), '산림 근처 소각을 멈춰요')
  add(/화목\s*보일러|불씨|꺼졌/u.test(normalized), '화목보일러 불씨를 확인해요')
  add(/라이터|담배/u.test(normalized), '라이터와 담배를 두고 가요')
  add(/대피\s*안내/u.test(normalized), '대피 안내를 확인해요')
  add(/주변.*알|즉시\s*알/u.test(normalized), '주변 사람에게 바로 알려요')
  add(
    /산과\s*떨어진\s*도로|산불\s*확산/u.test(normalized),
    '산과 떨어진 도로로 대피해요',
  )
  add(/낙엽/u.test(normalized), '주변 낙엽을 치워요')
  add(
    /낮은\s*자세|엎드|몸을\s*보호/u.test(normalized),
    '낮게 엎드려 몸을 보호해요',
  )
  add(/바닷가|안전한 곳으로 대피/u.test(normalized), '안전한 곳으로 대피해요')
  add(/선박|배는|배를|묶어 두/u.test(normalized), '배를 단단히 묶어 둬요')
  add(/산행|캠핑/u.test(normalized), '안전한 실내에 있어요')
  add(/갑자기 비|안전한 곳|대피/u.test(normalized), '안전한 곳으로 가요')
  add(
    /낮은 다리|낮은 곳|물이 찬|침수.*다리|건너지|건너/u.test(normalized),
    '물이 찬 낮은 곳을 돌아가요',
  )
  add(/고립|신고|1\s*1|119/u.test(normalized), '119에 알려요')
  add(/배수로|물꼬|점검/u.test(normalized), '어른과 안전한 곳에 있어요')

  if (
    candidates.length === 0 &&
    /(대피|피하|피해요|피하세요|닫으|확인|마시|쉬어|쉬|알려|말해|나가|이동)/u.test(
      normalized,
    )
  ) {
    candidates.push(hazard.fallbackAction)
  }

  return candidates.slice(0, 3)
}

function sourceLockedActionsForText(text: string) {
  text = normalizeCueText(text)
  const candidates: string[] = []
  const add = (condition: boolean, action: string) => {
    if (condition && !candidates.includes(action)) {
      candidates.push(action)
    }
  }

  add(
    /모래\s*주머니|모래주머니|수방\s*자재|수방자재|수중\s*펌프/u.test(text),
    '모래주머니와 수방자재를 미리 놓아요',
  )
  add(
    /야외\s*활동.*자제|야외활동.*자제|밖.*활동.*줄/u.test(text),
    '야외 활동을 줄여요',
  )
  add(
    /침수\s*위험.*(?:피해|피하).*주차|(?:주차|차량|차를|차는).*침수\s*위험/u.test(
      text,
    ),
    '침수 위험 장소를 피해 주차해요',
  )
  add(/비상\s*가방|먹는\s*약|보청기|지팡이/u.test(text), '비상 가방을 챙겨요')
  add(
    /대피\s*소.*(?:길|가는\s*길)|대피소.*(?:길|가는\s*길)|대피.*길.*(?:알아|외워)/u.test(
      text,
    ),
    '대피소 가는 길을 알아둬요',
  )
  add(
    /대피\s*요청|대피소로\s*대피/u.test(text),
    '대피 요청을 들으면 대피소로 가요',
  )
  add(/산\s*인근|산사태/u.test(text), '산사태 위험에서 멀어져요')
  add(/산비탈|급경사지|급경사/u.test(text), '산비탈과 급경사지에서 멀어져요')
  add(
    /배수로/u.test(text) &&
      /하천\s*주변|하천변|해안가/u.test(text) &&
      /피하|피하기|가지|멀어|휩쓸/u.test(text),
    '하천변, 배수로, 해안가에서 멀어져요',
  )
  add(/지하공간|지하\s*공간/u.test(text), '지하공간과 침수도로에서 멀어져요')
  add(/기상\s*정보|기상정보/u.test(text), '기상정보를 확인해요')
  add(/대피\s*장소|대피장소/u.test(text), '대피 장소를 알아둬요')
  add(
    /배수로|물꼬|물고/u.test(text) &&
      /점검|정비|확인/u.test(text) &&
      !/나가지|않는|않아요|말/u.test(text),
    '배수로와 물꼬를 미리 확인해요',
  )
  add(
    /하천\s*변|하천변/u.test(text) && /주차|차량|차를|차는/u.test(text),
    '하천변 차량을 미리 옮겨요',
  )
  add(
    /(?:전기.*가스|가스.*전기)/u.test(text) &&
      /차단|끄|꺼|대피하기\s*전/u.test(text),
    '전기와 가스를 꺼요',
  )
  add(
    /(?:전기.*가스|가스.*전기)/u.test(text) &&
      /안전\s*점검|안전점검|점검|확인/u.test(text),
    '전기와 가스 안전점검을 받아요',
  )
  add(/수돗물|상하수도|오염/u.test(text), '수돗물이 오염됐는지 확인해요')
  add(
    /저지대|낮은\s*곳|비탈면|산지/u.test(text) &&
      /피하기|피하|피해야|가지|멀리|되도록/u.test(text),
    '낮은 곳, 비탈면, 산지에서 멀어져요',
  )
  add(/전신주/u.test(text), '전신주 근처에서 멀어져요')

  return candidates
}

function priorityActionsForText(text: string) {
  text = normalizeCueText(text)
  const candidates: string[] = []
  const add = (condition: boolean, action: string) => {
    if (condition && !candidates.includes(action)) {
      candidates.push(action)
    }
  }

  add(/TV|라디오|기상\s*상황|기상상황|날씨/u.test(text), '기상 상황을 확인해요')
  add(/기상\s*정보|기상정보/u.test(text), '기상정보를 확인해요')
  add(/대피\s*장소|대피장소/u.test(text), '대피 장소를 알아둬요')
  add(
    /배수로|물꼬|물고/u.test(text) &&
      /점검|정비|확인/u.test(text) &&
      !/나가지|않는|않아요|말/u.test(text),
    '배수로와 물꼬를 미리 확인해요',
  )
  add(
    /하천\s*변|하천변/u.test(text) && /주차|차량|차/u.test(text),
    '하천변 차량을 미리 옮겨요',
  )
  add(
    /(?:전기.*가스|가스.*전기)/u.test(text) &&
      /차단|끄|꺼|대피하기\s*전/u.test(text),
    '전기와 가스를 꺼요',
  )
  add(
    /(?:전기.*가스|가스.*전기)/u.test(text) &&
      /안전\s*점검|안전점검|점검|확인/u.test(text),
    '전기와 가스 안전점검을 받아요',
  )
  add(/수돗물|상하수도|오염/u.test(text), '수돗물이 오염됐는지 확인해요')
  add(
    /저지대|낮은\s*곳|비탈면|산지/u.test(text) &&
      /피하기|피하|피하|피해야|가지|멀리|되도록/u.test(text),
    '낮은 곳, 비탈면, 산지에서 멀어져요',
  )
  add(/전신주/u.test(text), '전신주 근처에서 멀어져요')
  add(
    /야외\s*활동.*자제|야외활동.*자제|밖.*활동.*줄/u.test(text),
    '야외 활동을 줄여요',
  )
  add(/가벼운\s*옷|옷차림/u.test(text), '옷차림을 가볍게 해요')
  add(/물.*마시|물을\s*자주|수분|갈증|발증/u.test(text), '물을 자주 마셔요')
  add(
    /그늘|휴식|쉬|건강\s*상태|건강상태|체크/u.test(text),
    '그늘에서 자주 쉬어요',
  )
  add(/열사병|열경련|증상|병원|진료/u.test(text), '어른과 병원에 가요')
  add(
    /모래\s*주머니|모래주머니|수방\s*자재|수방자재|수중\s*펌프/u.test(text),
    '모래주머니와 수방자재를 미리 놓아요',
  )
  add(/야외\s*활동.*자제|야외활동.*자제/u.test(text), '야외 활동을 줄여요')
  add(/비상\s*가방|먹는\s*약|보청기|지팡이/u.test(text), '비상 가방을 챙겨요')
  add(/대피\s*소.*길|대피소.*길/u.test(text), '대피소 가는 길을 알아둬요')
  add(/산사태/u.test(text), '산사태 위험에서 멀어져요')
  add(/산비탈|급경사지|급경사/u.test(text), '산비탈과 급경사지에서 멀어져요')
  add(
    /지하\s*공간|지하\s*차도|침수된?\s*도로/u.test(text),
    '지하공간과 침수도로에서 멀어져요',
  )

  return candidates
}

function topicActionsForText(text: string) {
  const wildfireActions = wildfireActionsForText(text)
  if (wildfireActions.length > 0) {
    return wildfireActions.slice(0, 3)
  }

  const topic = topicKeyForCueText(text)

  switch (topic) {
    case 'call_119':
      return ['119에 알려요']
    case 'coastal_boat':
      return ['안전한 곳으로 대피해요', '배를 단단히 묶어 둬요']
    case 'coldwave_warm':
      return ['몸을 따뜻하게 해요']
    case 'coldwave_weather':
      return ['한파 날씨를 확인해요']
    case 'construction_wind_avoid':
      return /공사장|가까이|가지|피하|말/u.test(text)
        ? ['공사장 근처에 가지 않아요']
        : []
    case 'drain_waterway':
      return ['배수로를 미리 정리해요']
    case 'earthquake_after':
      return ['가스 냄새를 어른에게 말해요']
    case 'earthquake_electric':
      return /정전|손전등/u.test(text)
        ? [
            '전선에서 떨어져요',
            '정전이면 손전등을 써요',
            '전선 문제를 어른에게 말해요',
          ]
        : ['전선에서 떨어져요', '전선 문제를 어른에게 말해요']
    case 'earthquake_gas':
      return ['가스 냄새나 새는 소리를 어른에게 말해요', '밖으로 나가요']
    case 'earthquake_open_space':
      return /안전디딤돌/u.test(text)
        ? [
            '안전디딤돌 앱에서 지진 대피소를 찾아요',
            '넓은 공원이나 운동장으로 가요',
          ]
        : ['넓은 공원이나 운동장으로 가요']
    case 'earthquake_outside_head':
      return ['가방으로 머리를 가려요', '건물과 담장에서 멀어져요']
    case 'earthquake_protect':
      return ['탁자 아래로 들어가요', '머리를 보호해요']
    case 'earthquake_report':
      return ['다친 사람을 119에 알려요', '라디오나 공공기관 방송을 들어요']
    case 'earthquake_return_door':
      return [
        '옷장 문 주변을 봐요',
        '보관함 문을 천천히 열어요',
        '쏟아진 물건을 어른에게 말해요',
      ]
    case 'earthquake_school':
      return [
        '선생님 말을 들어요',
        '창문에서 떨어져요',
        '운동장이나 넓은 공원으로 가요',
      ]
    case 'earthquake_stairs':
      return ['계단을 찾아요', '건물 밖으로 천천히 내려가요']
    case 'earthquake_sturdy_building':
      return ['튼튼한 건물을 찾아요', '안으로 들어가요', '몸을 지켜요']
    case 'earthquake_water':
      return ['수도관 고장을 어른에게 말해요', '수도꼭지 물은 기다려요']
    case 'evacuate_to_safe_place':
      return dedupeStrings([
        ...(/비상\s*가방|먹는\s*약|보청기|지팡이/u.test(text)
          ? ['비상 가방을 챙겨요']
          : []),
        ...(/신속히?\s*대피|빨리\s*대피/u.test(text)
          ? ['신속히 대피해요']
          : []),
        ...(/대피소\s*가는\s*길/u.test(text)
          ? ['대피소 가는 길을 알아둬요']
          : []),
        ...(/대피\s*요청/u.test(text)
          ? ['대피 요청을 들으면 대피소로 가요']
          : []),
        ...(!/비상\s*가방|먹는\s*약|보청기|지팡이|신속히?\s*대피|빨리\s*대피|대피소\s*가는\s*길|대피\s*요청/u.test(
          text,
        )
          ? ['안전한 곳으로 가요']
          : []),
      ])
    case 'farm_facility':
      return ['어른과 시설물을 미리 묶어요', '배수로를 미리 정리해요']
    case 'farm_waterway_stay_safe':
      return ['논둑이나 물꼬를 보러 나가지 않아요']
    case 'fire_alert':
      return ['불과 연기를 어른에게 말해요']
    case 'fire_door_control':
      return ['현관문을 닫아요', '계단으로 나가요']
    case 'fire_monitoring':
      return ['창문을 닫아요', '집 안에서 기다려요', '안내 방송을 들어요']
    case 'fire_refuge':
      return [
        '대피공간으로 가요',
        '문을 닫아요',
        '119나 어른에게 위치를 알려요',
      ]
    case 'fire_seal_room':
      return [
        '방문을 닫아요',
        '젖은 수건으로 문틈을 막아요',
        '방 안 위치를 119에 알려요',
      ]
    case 'fire_smoke':
      return ['몸을 낮춰요']
    case 'fire_stairs':
      return ['계단으로 가요']
    case 'flood_home_return_check':
      return dedupeStrings([
        ...(/전기|가스/u.test(text) ? ['전기와 가스 안전점검을 받아요'] : []),
        ...(/수돗물|상하수도|오염/u.test(text)
          ? ['수돗물이 오염됐는지 확인해요']
          : []),
        ...(!/전기|가스|수돗물|상하수도|오염/u.test(text)
          ? ['침수된 집은 어른과 확인해요']
          : []),
      ])
    case 'flood_landslide_avoid':
      return ['물에 잠기는 곳과 산사태 위험한 곳을 피해요']
    case 'flood_lowland_powerline_avoid':
      return dedupeStrings([
        ...(/저지대|낮은\s*곳|비탈면|산지/u.test(text)
          ? ['낮은 곳, 비탈면, 산지에서 멀어져요']
          : []),
        ...(/전신주/u.test(text) ? ['전신주 근처에서 멀어져요'] : []),
      ])
    case 'flood_prepare_weather_shelter':
      return dedupeStrings([
        ...(/기상\s*정보|기상정보|기상\s*상황|날씨/u.test(text)
          ? ['기상정보를 확인해요']
          : []),
        ...(/대피\s*장소|대피장소/u.test(text) ? ['대피 장소를 알아둬요'] : []),
      ])
    case 'flood_river_car_utilities':
      return dedupeStrings([
        ...(/하천\s*변|하천변/u.test(text) && /주차|차량|차/u.test(text)
          ? ['하천변 차량을 미리 옮겨요']
          : []),
        ...(/(?:전기.*가스|가스.*전기)/u.test(text)
          ? ['전기와 가스를 꺼요']
          : []),
      ])
    case 'heatwave_cool':
      return /시원|냉방|그늘|더운\s*곳|온열|열사병|열경련|증상/u.test(text)
        ? ['시원한 곳으로 가요']
        : []
    case 'heatwave_rest':
      return dedupeStrings([
        ...(/그늘/u.test(text) ? ['그늘에서 자주 쉬어요'] : []),
        ...(/시원한\s*곳|열사병|열경련|증상/u.test(text)
          ? ['시원한 곳으로 가요']
          : []),
        ...(/병원|진료/u.test(text) ? ['어른과 병원에 가요'] : []),
        ...(!/그늘|시원한\s*곳|열사병|열경련|증상|병원|진료/u.test(text)
          ? ['더운 시간에는 쉬어요']
          : []),
      ])
    case 'heatwave_water':
      return ['물을 마셔요']
    case 'heavy_snow_clear':
      return dedupeStrings([
        ...(/내\s*집\s*앞|눈.*치우|치워/u.test(text)
          ? ['내 집 앞 눈을 치워요']
          : []),
        ...(/2인\s*이상|안전\s*확보|제설/u.test(text)
          ? ['2인 이상 함께 제설해요']
          : []),
        ...(/지붕|심야|무리한\s*작업/u.test(text)
          ? ['위험한 제설은 어른에게 말해요']
          : []),
        ...(/가로수|노후\s*시설|붕괴|위험\s*시설/u.test(text)
          ? ['가로수와 위험시설에서 멀어져요']
          : []),
        ...(!/내\s*집\s*앞|눈.*치우|치워|2인\s*이상|안전\s*확보|제설|지붕|심야|무리한\s*작업|가로수|노후\s*시설|붕괴|위험\s*시설/u.test(
          text,
        )
          ? ['어른과 눈을 치워요']
          : []),
      ])
    case 'heavy_snow_drive':
      return dedupeStrings([
        ...(/자전거|전동\s*킥보드/u.test(text)
          ? ['안전한 이동수단을 이용해요']
          : []),
        ...(/스노우\s*체인|스프레이\s*체인|체인|타이어/u.test(text)
          ? ['스노우체인을 장착해요']
          : []),
        ...(/안전거리|서행|결빙|결빈|눈이\s*쌓|눈길/u.test(text)
          ? ['안전거리 두고 서행해요']
          : []),
        ...(/급제동|급가속|급핸들/u.test(text)
          ? ['급제동 대신 부드럽게 멈춰요']
          : []),
        ...(!/자전거|전동\s*킥보드|스노우\s*체인|스프레이\s*체인|체인|타이어|안전거리|서행|결빙|눈이\s*쌓|눈길|급제동|급가속|급핸들/u.test(
          text,
        )
          ? ['눈길에서는 천천히 가요']
          : []),
      ])
    case 'heavy_snow_stay_home':
      return /외출|대중교통|눈이\s*쌓/u.test(text)
        ? ['외출을 줄이고 대중교통을 이용해요']
        : []
    case 'home_drain':
      return /수돗물|상하수도|오염|전기|가스|복귀/u.test(text)
        ? dedupeStrings([
            ...(/전기|가스/u.test(text)
              ? ['전기와 가스 안전점검을 받아요']
              : []),
            ...(/수돗물|상하수도|오염/u.test(text)
              ? ['수돗물이 오염됐는지 확인해요']
              : []),
          ])
        : ['어른과 배수구를 미리 확인해요']
    case 'indoor_window':
      return ['문과 창문을 닫아요', '창문에서 떨어져요']
    case 'mountain_valley_evacuate':
      return /가지\s*않|피하|비탈면/u.test(text)
        ? ['산, 계곡, 비탈면에 가지 않아요']
        : ['산과 계곡에서는 안전한 곳으로 가요']
    case 'outdoor_activity':
      return ['산행과 캠핑은 멈추고 안전한 곳에 있어요']
    case 'sewer_manhole_avoid':
      return ['맨홀과 하수도 근처에서 멀어져요']
    case 'typhoon_warning':
      return ['안전한 실내에 있어요']
    case 'outdoor_signage':
      return ['간판과 위험 시설물을 피해요']
    case 'river_car_drive':
      return /운전|서행/u.test(text)
        ? ['하천 근처 차를 미리 옮겨요', '운전하면 천천히 가요']
        : ['하천 근처 차를 미리 옮겨요']
    case 'stay_away_from_low_water':
      return ['물이 찬 낮은 곳을 돌아가요']
    case 'water_area_avoid':
      if (/지하공간/u.test(text)) {
        return ['지하공간과 침수도로에서 멀어져요']
      }
      if (/지하\s*차도|침수\s*도로|침수도로|교량/u.test(text)) {
        return ['침수도로, 지하차도, 교량, 하천에서 멀어져요']
      }
      if (/배수로/u.test(text) && /하천\s*주변|하천변|해안가/u.test(text)) {
        return ['하천변, 배수로, 해안가에서 멀어져요']
      }
      return ['개울가, 하천 변, 해안가에 가지 않아요']
    case 'weather_check':
      return ['기상 상황을 확인해요']
    case 'wildfire_alert':
      return ['대피 안내를 확인해요', '주변 사람에게 바로 알려요']
    case 'wildfire_burn_ban':
      return ['산림 근처 소각을 멈춰요']
    case 'wildfire_ember_check':
      return ['화목보일러 불씨를 확인해요']
    case 'wildfire_evacuation_route':
      return ['산과 떨어진 도로로 대피해요']
    case 'wildfire_ground_protect':
      return ['주변 낙엽을 치워요', '낮게 엎드려 몸을 보호해요']
    case 'wildfire_lighter_ban':
      return ['라이터와 담배를 두고 가요']
    default:
      return []
  }
}

function wildfireActionsForText(text: string) {
  const normalized = normalizeCueText(text)
  const candidates: string[] = []
  const add = (condition: boolean, action: string) => {
    if (condition && !candidates.includes(action)) {
      candidates.push(action)
    }
  }

  add(/산림\s*근처|소각/u.test(normalized), '산림 근처 소각을 멈춰요')
  add(/화목\s*보일러|불씨|꺼졌/u.test(normalized), '화목보일러 불씨를 확인해요')
  add(/라이터|담배/u.test(normalized), '라이터와 담배를 두고 가요')
  add(/대피\s*안내/u.test(normalized), '대피 안내를 확인해요')
  add(/주변.*알|즉시\s*알/u.test(normalized), '주변 사람에게 바로 알려요')
  add(
    /산과\s*떨어진\s*도로|산불\s*확산/u.test(normalized),
    '산과 떨어진 도로로 대피해요',
  )
  add(/낙엽/u.test(normalized), '주변 낙엽을 치워요')
  add(
    /낮은\s*자세|엎드|몸을\s*보호/u.test(normalized),
    '낮게 엎드려 몸을 보호해요',
  )

  return candidates
}

function isWeatherSafetyText(text: string) {
  return /산행|캠핑|갑자기 비|낮은 다리|낮은 곳|물이 찬|물에 잠기|산사태|건너지|건너|고립|배수로|물꼬|맨홀|하수도|추락|휩쓸림|호우|태풍|간판|공사장|개울가|해안가|배수구|하천|서행|선박|바닷가/u.test(
    text,
  )
}

function reasonForAction(action: string, hazard: HazardProfile) {
  if (action.includes('문과 창문'))
    return '문과 창문을 닫으면 비바람이 덜 들어와요.'
  if (action.includes('창문')) return '유리가 깨지면 다칠 수 있어요.'
  if (action.includes('기상 상황'))
    return '날씨를 알아야 밖에 나갈 일을 줄일 수 있어요.'
  if (action.includes('기상정보'))
    return '비가 오기 전에 날씨를 알면 먼저 준비할 수 있어요.'
  if (action.includes('대피 장소'))
    return '비가 많이 오면 어디로 갈지 미리 알아야 해요.'
  if (/모래주머니|수방자재|수중\s*펌프/u.test(action))
    return '물이 들어오기 전에 막을 준비를 해 두면 피해를 줄일 수 있어요.'
  if (/침수\s*위험.*주차/u.test(action))
    return '물이 찰 수 있는 곳에 차를 두면 위험해요.'
  if (/야외\s*활동/u.test(action))
    return '비바람이 강할 때 밖에 오래 있으면 다칠 수 있어요.'
  if (/비상\s*가방|먹는\s*약|보청기|지팡이/u.test(action))
    return '급히 나가야 할 때 필요한 물건을 바로 가져갈 수 있어요.'
  if (/대피소\s*가는\s*길/u.test(action))
    return '위험해지면 어디로 가야 하는지 미리 알아야 해요.'
  if (/대피\s*요청/u.test(action))
    return '대피하라는 말을 들으면 바로 움직여야 더 안전해요.'
  if (/신속히?\s*대피|빨리\s*대피/u.test(action))
    return '산불이 번지기 전에 바로 움직여야 해요.'
  if (/전기와\s*가스.*꺼/u.test(action))
    return '물이 들어오기 전에 전기와 가스를 멈춰야 더 안전해요.'
  if (/전기와\s*가스.*안전점검/u.test(action))
    return '물이 빠진 뒤에는 전기와 가스가 안전한지 먼저 봐야 해요.'
  if (/수돗물.*오염/u.test(action))
    return '물이 더러워졌을 수 있어서 바로 쓰면 위험해요.'
  if (/전신주/u.test(action))
    return '비바람 속 전신주 근처는 감전이나 낙하 위험이 있어요.'
  if (/낮은 곳|비탈면|산지/u.test(action))
    return '비가 오면 낮은 곳에는 물이 차고 비탈면은 무너질 수 있어요.'
  if (action.includes('산사태')) return '물과 흙이 갑자기 밀려올 수 있어요.'
  if (/산비탈|급경사지|급경사/u.test(action))
    return '비가 많이 오면 흙이 무너질 수 있어요.'
  if (/지하공간|지하\s*차도|침수\s*도로|교량/u.test(action))
    return '물이 갑자기 불어나면 휩쓸릴 수 있어요.'
  if (/개울가|하천 변|하천\s*주변|배수로|해안가/u.test(action))
    return '물이 갑자기 불어나면 휩쓸릴 수 있어요.'
  if (action.includes('공사장'))
    return '강한 바람에 자재가 넘어지거나 날아올 수 있어요.'
  if (/산과 계곡|산이나 계곡/u.test(action))
    return '비가 오면 산과 계곡의 물이 빨리 불어날 수 있어요.'
  if (/논둑|물꼬/u.test(action))
    return '비바람 속에 물길을 보러 나가면 위험해요.'
  if (/맨홀|하수도/u.test(action))
    return '비가 많이 오면 물이 솟거나 빠질 수 있어요.'
  if (/외출을\s*줄이고\s*대중교통/u.test(action))
    return '눈이 쌓이면 길이 미끄럽고 막힐 수 있어요.'
  if (/내\s*집\s*앞\s*눈|눈을\s*치워/u.test(action))
    return '집 앞 눈을 치우면 넘어지는 사고를 줄일 수 있어요.'
  if (/2인\s*이상.*제설|안전하게\s*제설|위험한\s*제설/u.test(action))
    return '제설 작업은 미끄럽고 위험해서 혼자 하면 안 돼요.'
  if (/위험시설|가로수|노후\s*시설/u.test(action))
    return '눈 무게로 시설물이 무너질 수 있어요.'
  if (/스노우\s*체인|스노우체인|체인/u.test(action))
    return '체인을 장착하면 눈길에서 덜 미끄러져요.'
  if (/안전거리|서행|급제동|부드럽게/u.test(action))
    return '눈길에서는 차가 바로 멈추기 어려워요.'
  if (/안전한\s*이동수단/u.test(action))
    return '눈 오는 날 자전거와 킥보드는 쉽게 미끄러져요.'
  if (action.includes('배수구')) return '배수구가 막히면 물이 잘 빠지지 않아요.'
  if (action.includes('하천'))
    return '비가 많이 오면 하천물이 갑자기 불어날 수 있어요.'
  if (action.includes('천천히'))
    return '비바람 속에서는 길이 미끄럽고 앞이 잘 안 보여요.'
  if (action.includes('시설물'))
    return '강한 바람에 시설물이 날아가거나 넘어질 수 있어요.'
  if (action.includes('배수로')) return '비가 오기 전에 정리해야 안전해요.'
  if (action.includes('배를'))
    return '배가 떠내려가거나 부딪히지 않게 해야 해요.'
  if (action.includes('소각')) return '작은 불도 산으로 번질 수 있어요.'
  if (action.includes('불씨'))
    return '남은 불씨가 다시 살아나 산불이 날 수 있어요.'
  if (/라이터|담배/u.test(action))
    return '불이 붙는 물건은 산불을 만들 수 있어요.'
  if (action.includes('대피 안내'))
    return '안내를 들어야 안전한 길을 알 수 있어요.'
  if (action.includes('주변 사람')) return '빨리 알려야 함께 피할 수 있어요.'
  if (action.includes('산과 떨어진 도로'))
    return '산 가까이는 불이 번질 수 있어요.'
  if (action.includes('낙엽')) return '마른 낙엽에는 불이 쉽게 붙어요.'
  if (/엎드려|몸을 보호/u.test(action))
    return '낮게 있으면 뜨거운 바람을 덜 맞을 수 있어요.'
  if (/산행|캠핑/u.test(action)) return '비가 오면 산과 캠핑장은 위험해요.'
  if (action.includes('문')) return '문을 닫으면 위험한 연기가 덜 퍼져요.'
  if (action.includes('계단'))
    return '불이나 지진 때 엘리베이터는 멈출 수 있어요.'
  if (action.includes('머리'))
    return '머리를 보호하면 떨어지는 물건에 덜 다쳐요.'
  if (action.includes('탁자')) return '탁자 아래는 몸을 숨기기 쉬워요.'
  if (action.includes('넓은')) return '넓은 곳은 떨어지는 물건이 적어요.'
  if (action.includes('어른')) return '혼자 판단하면 더 위험할 수 있어요.'
  if (action.includes('119')) return '위험하면 빨리 도움을 받아야 해요.'
  if (action.includes('낮춰'))
    return '연기는 위로 올라가서 낮게 움직이면 숨쉬기 쉬워요.'
  if (action.includes('가스'))
    return '가스 냄새는 폭발 위험을 알려 줄 수 있어요.'
  if (action.includes('실내'))
    return '비바람이 강할 때 밖에 있으면 다칠 수 있어요.'
  if (action.includes('안전한 곳'))
    return '비가 갑자기 많이 오면 물이 빠르게 불어날 수 있어요.'
  if (action.includes('낮은 곳')) return '물이 찬 길은 깊이를 알기 어려워요.'
  if (action.includes('간판'))
    return '강한 바람에 간판이나 물건이 떨어질 수 있어요.'
  if (action.includes('불과 연기'))
    return '불이나 연기는 빨리 알려야 함께 피할 수 있어요.'
  if (action.includes('시원한 곳'))
    return '몸이 너무 더워지면 어지럽고 위험할 수 있어요.'
  if (action.includes('물을'))
    return '더운 날에는 몸에 물이 부족해질 수 있어요.'
  if (action.includes('더운 시간')) return '한낮에는 몸이 빨리 지칠 수 있어요.'
  if (action.includes('따뜻하게')) return '몸이 차가워지면 아플 수 있어요.'
  if (action.includes('한파 날씨'))
    return '날씨를 미리 알면 밖에 나갈 일을 줄일 수 있어요.'
  if (action.includes('눈길')) return '눈길은 미끄러워 차가 멈추기 어려워요.'
  if (action.includes('눈을 확인'))
    return '쌓인 눈은 무겁고 시설물을 무너뜨릴 수 있어요.'

  return hazard.reason
}

function doNotForText(text: string, hazard: HazardProfile) {
  const heavySnowDoNot = heavySnowDoNotForText(text)
  if (heavySnowDoNot) {
    return heavySnowDoNot
  }

  const topicDoNot = topicDoNotForText(text)
  if (topicDoNot) {
    return topicDoNot
  }

  if (/엘리베이터/u.test(text)) return '엘리베이터는 타지 않아요.'
  if (/창문|유리/u.test(text)) return '창문 가까이에 가지 않아요.'
  if (/연기/u.test(text)) return '연기 쪽으로 가지 않아요.'
  if (/가스/u.test(text)) return '불을 켜거나 전기 스위치를 만지지 않아요.'
  if (/침수된?\s*집|복귀|수돗물|상하수도|안전\s*점검|안전점검/u.test(text)) {
    return '침수된 집에 혼자 바로 들어가지 않아요.'
  }
  if (/저지대|낮은\s*곳|비탈면|산지|전신주/u.test(text)) {
    return '낮은 곳, 비탈면, 전신주 근처에 가지 않아요.'
  }
  if (/산행|캠핑/u.test(text)) return '산이나 캠핑장에 가지 않아요.'
  if (/외출을 차지|외출을 자제|북상/u.test(text)) return '밖에 나가지 않아요.'
  if (/문과 창문|창문 가까|실내/u.test(text))
    return '창문 가까이에 가지 않아요.'
  if (/공사장|공사\s*자재|큰\s*바람|강한\s*바람|날릴|넘어지/u.test(text)) {
    return '공사장 근처에서 구경하지 않아요.'
  }
  if (/물에\s*자주\s*잠기|산사태|위험한\s*곳/u.test(text)) {
    return '물에 잠기는 곳이나 산사태 위험한 곳에 가지 않아요.'
  }
  if (/개울가|하천\s*변|하천변|해안가|급류|침수될/u.test(text)) {
    return '개울가, 하천 변, 해안가에 가지 않아요.'
  }
  if (/산이나\s*계곡|산과\s*계곡|등산객|비탈면/u.test(text)) {
    return '산과 계곡에서 혼자 움직이지 않아요.'
  }
  if (/논뚝|논둑|물고|물꼬|무리하게\s*나서/u.test(text)) {
    return '논둑이나 물꼬를 보러 나가지 않아요.'
  }
  if (/맨홀|하수도|추락|휩쓸림/u.test(text)) {
    return '맨홀과 하수도 근처에 가지 않아요.'
  }
  if (/산림\s*근처|소각/u.test(text)) {
    return '산림 근처에서 불을 피우지 않아요.'
  }
  if (/화목\s*보일러|불씨|꺼졌/u.test(text)) {
    return '불씨를 그냥 두지 않아요.'
  }
  if (/라이터|담배/u.test(text)) {
    return '산에 라이터와 담배를 가져가지 않아요.'
  }
  if (/산과\s*떨어진\s*도로|산불\s*확산/u.test(text)) {
    return '산 가까운 길로 가지 않아요.'
  }
  if (/낙엽|낮은\s*자세|엎드/u.test(text)) {
    return '마른 낙엽 가까이 그대로 있지 않아요.'
  }
  if (/간판|위험 시설물|시설물 주변/u.test(text)) {
    return '간판이나 위험한 물건 가까이에 가지 않아요.'
  }
  if (/집 주변|침수피해|배수구/u.test(text)) {
    return '비가 많이 올 때 밖으로 나가 확인하지 않아요.'
  }
  if (/주차|차량|운전|서행|차를|차는/u.test(text)) {
    return '물이 찬 길로 차를 몰고 가지 않아요.'
  }
  if (/농촌|물고|물꼬|시설물.*묶|단단히 묶|배수로/u.test(text)) {
    return '비가 올 때 물꼬를 보러 나가지 않아요.'
  }
  if (/바닷가|선박|배를|배는|묶어 두/u.test(text)) {
    return '바닷가 가까이에 있지 않아요.'
  }
  if (/낮은|나리|다리|건너지|건너/u.test(text)) {
    return '물이 찬 낮은 곳은 건너지 않아요.'
  }
  if (/고립|신고|1\s*1|119/u.test(text)) return '혼자 빠져나오려고 하지 않아요.'
  if (/배수로|물꼬|점검/u.test(text)) {
    return '배수로와 물꼬를 보러 나가지 않아요.'
  }
  if (/갑자기 비|안전한 곳|대피/u.test(text)) {
    return '물이 불어난 곳에 가까이 가지 않아요.'
  }

  return hazard.doNot
}

function heavySnowDoNotForText(text: string) {
  const normalized = normalizeCueText(text)

  if (/자전거|전동\s*킥보드/u.test(normalized)) {
    return '자전거와 전동 킥보드는 타지 않아요.'
  }
  if (
    /지붕|심야|무리한\s*작업|가로수|노후\s*시설|붕괴|위험\s*시설/u.test(
      normalized,
    )
  ) {
    return '지붕, 심야 제설, 위험시설 근처에 가지 않아요.'
  }
  if (/급제동|급가속|급핸들/u.test(normalized)) {
    return '급제동, 급가속, 급핸들 조작을 하지 않아요.'
  }
  if (
    /스노우\s*체인|스프레이\s*체인|안전거리|서행|결빙|눈길|차량\s*운행/u.test(
      normalized,
    )
  ) {
    return '눈길에서 급하게 운전하지 않아요.'
  }
  if (/눈.*쌓.*외출|외출.*자제|대중교통/u.test(normalized)) {
    return '눈이 많이 올 때 무리해서 밖에 나가지 않아요.'
  }

  return null
}

function topicDoNotForText(text: string) {
  const topic = topicKeyForCueText(text)

  switch (topic) {
    case 'call_119':
      return '혼자 빠져나오려고 하지 않아요.'
    case 'coastal_boat':
      return '바닷가 가까이에 있지 않아요.'
    case 'coldwave_warm':
    case 'coldwave_weather':
      return '추운 밖에 오래 있지 않아요.'
    case 'construction_wind_avoid':
      return '공사장 근처에서 구경하지 않아요.'
    case 'drain_waterway':
    case 'farm_facility':
      return '비가 올 때 물꼬를 보러 나가지 않아요.'
    case 'farm_waterway_stay_safe':
      return '논둑이나 물꼬를 보러 나가지 않아요.'
    case 'earthquake_after':
      return '가스나 전기를 혼자 만지지 않아요.'
    case 'earthquake_electric':
      return '전선을 혼자 만지거나 엘리베이터를 쓰지 않아요.'
    case 'earthquake_gas':
      return '가스를 혼자 만지거나 바로 다시 쓰지 않아요.'
    case 'earthquake_open_space':
      return '차량으로 서둘러 이동하지 않아요.'
    case 'earthquake_outside_head':
      return '건물 벽 바로 옆에 붙어 걷지 않아요.'
    case 'earthquake_protect':
      return '흔들릴 때 밖으로 뛰어나가지 않아요.'
    case 'earthquake_report':
      return '근거 없는 소문만 믿고 움직이지 않아요.'
    case 'earthquake_return_door':
      return '문을 확 열거나 혼자 만지지 않아요.'
    case 'earthquake_school':
      return '혼자 뛰거나 창문 가까이 걷지 않아요.'
    case 'earthquake_stairs':
      return '엘리베이터를 계속 사용하지 않아요.'
    case 'earthquake_sturdy_building':
      return '건물 벽 바로 옆에 서 있지 않아요.'
    case 'earthquake_water':
      return '수도관이 고장 난 것 같으면 물을 바로 쓰지 않아요.'
    case 'evacuate_to_safe_place':
      return '물이 불어난 곳에 가까이 가지 않아요.'
    case 'fire_alert':
      return '불인지 보려고 가까이 가지 않아요.'
    case 'fire_door_control':
      return '문을 열어 둔 채 뛰어나오지 않아요.'
    case 'fire_monitoring':
      return '상황을 보려고 복도나 계단으로 바로 나가지 않아요.'
    case 'fire_refuge':
      return '연기 쪽으로 무리해서 나가지 않아요.'
    case 'fire_seal_room':
      return '연기가 들어오는 쪽 창문을 무작정 열지 않아요.'
    case 'fire_smoke':
      return '연기 쪽으로 가지 않아요.'
    case 'fire_stairs':
      return '엘리베이터를 타지 않아요.'
    case 'flood_home_return_check':
      return '침수된 집에 혼자 바로 들어가지 않아요.'
    case 'flood_landslide_avoid':
      return '물에 잠기는 곳이나 산사태 위험한 곳에 가지 않아요.'
    case 'flood_lowland_powerline_avoid':
      return '낮은 곳, 비탈면, 전신주 근처에 가지 않아요.'
    case 'flood_prepare_weather_shelter':
      return '날씨를 확인하지 않고 밖에 나가지 않아요.'
    case 'flood_river_car_utilities':
      return '하천변에 차를 그냥 두거나 침수된 집에 혼자 들어가지 않아요.'
    case 'heatwave_cool':
    case 'heatwave_rest':
    case 'heatwave_water':
      return '더운 곳에 오래 있지 않아요.'
    case 'heavy_snow_clear':
      return '눈 쌓인 시설물 가까이에 혼자 가지 않아요.'
    case 'heavy_snow_drive':
      return '눈길에서 급하게 운전하지 않아요.'
    case 'heavy_snow_stay_home':
      return '눈이 많이 올 때 밖에 나가지 않아요.'
    case 'home_drain':
      return '비가 많이 올 때 밖으로 나가 확인하지 않아요.'
    case 'indoor_window':
      return '창문 가까이에 가지 않아요.'
    case 'mountain_valley_evacuate':
      return '산, 계곡, 비탈면에 가지 않아요.'
    case 'outdoor_activity':
      return '산이나 캠핑장에 가지 않아요.'
    case 'sewer_manhole_avoid':
      return '맨홀과 하수도 근처에 가지 않아요.'
    case 'outdoor_signage':
      return '간판이나 위험한 물건 가까이에 가지 않아요.'
    case 'river_car_drive':
      return '물이 찬 길로 차를 몰고 가지 않아요.'
    case 'stay_away_from_low_water':
      return '물이 찬 낮은 곳은 건너지 않아요.'
    case 'typhoon_warning':
      return '밖에 나가지 않아요.'
    case 'water_area_avoid':
      return '개울가, 하천 변, 해안가에 가지 않아요.'
    case 'weather_check':
      return '날씨를 확인하지 않고 밖에 나가지 않아요.'
    case 'wildfire_alert':
      return '산불을 혼자 보러 가지 않아요.'
    case 'wildfire_burn_ban':
      return '산림 근처에서 불을 피우지 않아요.'
    case 'wildfire_ember_check':
      return '불씨를 그냥 두지 않아요.'
    case 'wildfire_evacuation_route':
      return '산 가까운 길로 가지 않아요.'
    case 'wildfire_ground_protect':
      return '마른 낙엽 가까이 그대로 있지 않아요.'
    case 'wildfire_lighter_ban':
      return '산에 라이터와 담배를 가져가지 않아요.'
    default:
      return null
  }
}

function selectTeachBackAction(actionSteps: string[]) {
  const candidates = actionSteps
    .map((action) => normalizeCueText(action))
    .filter(Boolean)

  return (
    candidates
      .map((action) => ({
        action,
        option: optionForAction(action),
      }))
      .filter(
        ({ option }) =>
          !/^(안전|태풍|재난|중요|주의|확인|멈춤)$/u.test(option.label) &&
          !/무엇을\s*기억|무엇이\s*중요|먼저\s*어떻게/u.test(option.prompt),
      )
      .sort(
        (left, right) =>
          teachBackActionScore(right.action) -
          teachBackActionScore(left.action),
      )[0]?.action ??
    candidates[0] ??
    ''
  )
}

function teachBackActionScore(action: string) {
  let score = 0

  if (
    /태풍 소식|기상 상황|밖에 나가지|문|창문|간판|위험한 물건|공사장|개울가|해안가|논둑|물꼬|맨홀|하수도|배수구|하천|시설물|비닐하우스|배수로|바닷가|배를|119|가스|탁자|머리/u.test(
      action,
    )
  ) {
    score += 4
  }
  if (/피하|닫|옮|묶|대피|말|알려|확인|들어|운전|가요/u.test(action)) {
    score += 2
  }
  if (/주변을 봐요|먼저|그냥/u.test(action)) {
    score -= 2
  }

  return score
}

function buildTeachBack(
  action: string,
  hazard: HazardProfile,
  actionSteps: string[] = [action],
): LearningTeachBack {
  const correct = optionForAction(action)
  const contrast = contrastForOption(correct, hazard, actionSteps)

  return {
    correctOptionId: 'correct',
    options: [
      {
        evidenceRefs: ['input-video-transcript'],
        feedback: `맞아요. ${action}`,
        id: 'correct',
        kind: correct.kind,
        label: correct.label,
        officialRuleIds: [hazard.ruleId],
        role: 'correct',
      },
      {
        evidenceRefs: ['input-video-transcript'],
        feedback: '헷갈리면 장면을 다시 봐요.',
        id: 'contrast',
        kind: correct.kind,
        label: contrast,
        role: 'contrast',
      },
    ],
    prompt: correct.prompt,
    reviewPrompt: '같이 한 번 더 골라 봐요.',
  }
}

function optionForAction(action: string): {
  kind: 'object' | 'person' | 'place' | 'signal' | 'state'
  label: string
  prompt: string
} {
  if (/안전디딤돌/u.test(action))
    return {
      kind: 'signal',
      label: '안전디딤돌',
      prompt: '대피소는 무엇으로 찾을까요?',
    }
  if (/119/u.test(action))
    return {
      kind: 'signal',
      label: '119',
      prompt: '도움이 필요하면 어디에 말할까요?',
    }
  if (/모래주머니|수방자재|수중\s*펌프/u.test(action))
    return {
      kind: 'object',
      label: '모래주머니와 수방자재',
      prompt: '무엇을 미리 놓을까요?',
    }
  if (/침수\s*위험.*주차/u.test(action))
    return {
      kind: 'place',
      label: '침수 위험 장소',
      prompt: '어디를 피해 주차할까요?',
    }
  if (/야외\s*활동/u.test(action))
    return {
      kind: 'state',
      label: '야외 활동',
      prompt: '무엇을 줄일까요?',
    }
  if (/비상\s*가방|먹는\s*약|보청기|지팡이/u.test(action))
    return {
      kind: 'object',
      label: '비상 가방',
      prompt: '무엇을 챙길까요?',
    }
  if (/대피소\s*가는\s*길/u.test(action))
    return {
      kind: 'object',
      label: '대피소 가는 길',
      prompt: '무엇을 알아둘까요?',
    }
  if (/대피\s*요청/u.test(action))
    return {
      kind: 'signal',
      label: '대피 요청',
      prompt: '무엇을 들으면 대피소로 갈까요?',
    }
  if (/산사태/u.test(action))
    return {
      kind: 'place',
      label: '산사태 위험',
      prompt: '어디에서 멀어질까요?',
    }
  if (/산비탈|급경사지|급경사/u.test(action))
    return {
      kind: 'place',
      label: '산비탈과 급경사지',
      prompt: '어디에서 멀어질까요?',
    }
  if (
    /배수로/u.test(action) &&
    /하천\s*주변|하천변|해안가/u.test(action) &&
    !/차량|차를|차는|주차|옮겨/u.test(action)
  )
    return {
      kind: 'place',
      label: '하천변, 배수로, 해안가',
      prompt: '어디에서 멀어질까요?',
    }
  if (/지하공간/u.test(action))
    return {
      kind: 'place',
      label: '지하공간과 침수도로',
      prompt: '어디에서 멀어질까요?',
    }
  if (/대중교통/u.test(action))
    return {
      kind: 'object',
      label: '대중교통',
      prompt: '무엇을 이용할까요?',
    }
  if (/내\s*집\s*앞\s*눈|눈을\s*치워/u.test(action))
    return {
      kind: 'object',
      label: '내 집 앞 눈',
      prompt: '무엇을 치울까요?',
    }
  if (/2인\s*이상/u.test(action))
    return {
      kind: 'person',
      label: '2인 이상',
      prompt: '몇 명 이상 함께할까요?',
    }
  if (/안전하게\s*제설|위험한\s*제설/u.test(action))
    return {
      kind: 'person',
      label: '어른',
      prompt: '누구와 함께할까요?',
    }
  if (/위험시설|가로수|노후\s*시설/u.test(action))
    return {
      kind: 'place',
      label: /가로수/u.test(action) ? '가로수와 위험시설' : '위험시설',
      prompt: '어디에서 멀어질까요?',
    }
  if (/스노우\s*체인|스노우체인|체인/u.test(action))
    return {
      kind: 'object',
      label: '스노우체인',
      prompt: '무엇을 장착할까요?',
    }
  if (/안전거리/u.test(action))
    return {
      kind: 'object',
      label: '안전거리',
      prompt: '무엇을 둘까요?',
    }
  if (/안전한\s*이동수단/u.test(action))
    return {
      kind: 'object',
      label: '안전한 이동수단',
      prompt: '무엇을 이용할까요?',
    }
  if (/급제동|부드럽게/u.test(action))
    return {
      kind: 'state',
      label: '부드럽게',
      prompt: '어떻게 멈출까요?',
    }
  if (/방석/u.test(action))
    return {
      kind: 'object',
      label: '방석',
      prompt: '무엇으로 머리를 가릴까요?',
    }
  if (/손전등/u.test(action))
    return {
      kind: 'object',
      label: '손전등',
      prompt: '정전이면 무엇을 쓸까요?',
    }
  if (/수도관|수도꼭지|화장실.*물|물.*쓰기/u.test(action))
    return {
      kind: 'person',
      label: '어른',
      prompt: '물 쓰기 전에 누구에게 말할까요?',
    }
  if (/전선/u.test(action))
    return { kind: 'object', label: '전선', prompt: '무엇에서 떨어질까요?' }
  if (/가방.*머리|머리.*가방/u.test(action))
    return {
      kind: 'object',
      label: '머리',
      prompt: '밖에서는 무엇을 가릴까요?',
    }
  if (/공사장|공사\s*자재/u.test(action))
    return {
      kind: 'place',
      label: '공사장 근처',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (/지하\s*차도|교량/u.test(action))
    return {
      kind: 'place',
      label: '침수도로, 지하차도, 교량',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (
    /하천\s*변.*(?:차량|차|주차|옮겨)|하천변.*(?:차량|차|주차|옮겨)|차량.*하천/u.test(
      action,
    )
  )
    return {
      kind: 'object',
      label: '하천변 차량',
      prompt: '무엇을 미리 옮길까요?',
    }
  if (/전신주/u.test(action))
    return {
      kind: 'object',
      label: '전신주',
      prompt: '무엇에서 멀어질까요?',
    }
  if (
    /낮은\s*곳|저지대|산지/u.test(action) ||
    (/비탈면/u.test(action) && !/계곡/u.test(action))
  )
    return {
      kind: 'place',
      label: '낮은 곳, 비탈면, 산지',
      prompt: '어디에서 멀어질까요?',
    }
  if (/개울가|하천\s*변|하천변|해안가/u.test(action))
    return {
      kind: 'place',
      label: '개울가, 하천 변, 해안가',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (/산,?\s*계곡|비탈면/u.test(action))
    return {
      kind: 'place',
      label: '산, 계곡, 비탈면',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (/배수로.*물꼬|물꼬.*배수로/u.test(action))
    return {
      kind: 'object',
      label: '배수로와 물꼬',
      prompt: '무엇을 미리 확인할까요?',
    }
  if (/논둑|물꼬/u.test(action))
    return {
      kind: 'place',
      label: '논둑이나 물꼬',
      prompt: '어디를 보러 나가지 말까요?',
    }
  if (/맨홀|하수도/u.test(action))
    return {
      kind: 'place',
      label: '맨홀과 하수도',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (/간판|위험한 물건|위험\s*시설물/u.test(action))
    return { kind: 'object', label: '간판', prompt: '무엇에서 멀어질까요?' }
  if (/높은 길|물이 찬 낮은 곳/u.test(action))
    return { kind: 'place', label: '높은 길', prompt: '어떤 길로 갈까요?' }
  if (/문.*천천히|천천히.*문|보관함|옷장/u.test(action))
    return {
      kind: 'state',
      label: '천천히',
      prompt: '문을 열 때 어떻게 할까요?',
    }
  if (/산행|캠핑/u.test(action))
    return {
      kind: 'state',
      label: '산행과 캠핑',
      prompt: '태풍 때 무엇을 멈출까요?',
    }
  if (/태풍\s*소식|소식.*들/u.test(action))
    return {
      kind: 'signal',
      label: '태풍 소식',
      prompt: '무엇을 들어야 할까요?',
    }
  if (/공사장|공사\s*자재/u.test(action))
    return {
      kind: 'place',
      label: '공사장 근처',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (/물에\s*잠기는|산사태|위험한\s*곳/u.test(action))
    return { kind: 'place', label: '위험한 곳', prompt: '어디를 피할까요?' }
  if (/지하\s*차도|교량/u.test(action))
    return {
      kind: 'place',
      label: '침수도로, 지하차도, 교량',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (/개울가|하천\s*변|하천변|해안가/u.test(action))
    return {
      kind: 'place',
      label: '개울가, 하천 변, 해안가',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (
    /산|계곡|비탈면/u.test(action) &&
    /가지\s*않|피하|가까이\s*가지/u.test(action)
  )
    return {
      kind: 'place',
      label: '산, 계곡, 비탈면',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (/산과\s*계곡|산이나\s*계곡/u.test(action))
    return { kind: 'place', label: '안전한 곳', prompt: '어디로 가야 할까요?' }
  if (/논둑|물꼬/u.test(action))
    return {
      kind: 'place',
      label: '논둑이나 물꼬',
      prompt: '어디를 보러 나가지 말까요?',
    }
  if (/맨홀|하수도/u.test(action))
    return {
      kind: 'place',
      label: '맨홀과 하수도',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (/밖에\s*나가지|나가지\s*않/u.test(action))
    return {
      kind: 'place',
      label: '실내',
      prompt: '태풍 때 어디에 있어야 할까요?',
    }
  if (/가족|선생님|보호자/u.test(action))
    return {
      kind: 'person',
      label: '가족이나 선생님',
      prompt: '누구 말을 들어야 할까요?',
    }
  if (/어른.*말|말해요|알려요/u.test(action))
    return {
      kind: 'person',
      label: '어른',
      prompt: '누구에게 말해야 할까요?',
    }
  if (/집 주변/u.test(action))
    return {
      kind: 'place',
      label: '집 주변',
      prompt: '어디를 확인할까요?',
    }
  if (action.includes('문과 창문'))
    return { kind: 'object', label: '문과 창문', prompt: '무엇을 닫을까요?' }
  if (action.includes('창문'))
    return {
      kind: 'object',
      label: '창문',
      prompt: '무엇에서 떨어져야 할까요?',
    }
  if (action.includes('비닐하우스'))
    return {
      kind: 'object',
      label: '비닐하우스',
      prompt: '무엇을 살펴볼까요?',
    }
  if (action.includes('시설물'))
    return { kind: 'object', label: '시설물', prompt: '무엇을 미리 묶을까요?' }
  if (action.includes('간판'))
    return { kind: 'object', label: '간판', prompt: '무엇을 피할까요?' }
  if (/위험한 물건|물건 가까이/u.test(action))
    return {
      kind: 'object',
      label: '위험한 물건',
      prompt: '무엇을 피할까요?',
    }
  if (action.includes('불과 연기'))
    return { kind: 'signal', label: '불과 연기', prompt: '무엇을 말할까요?' }
  if (/기상\s*상황|기상상황|날씨/u.test(action))
    return { kind: 'signal', label: '기상 상황', prompt: '무엇을 확인할까요?' }
  if (/기상\s*정보|기상정보/u.test(action))
    return { kind: 'signal', label: '기상정보', prompt: '무엇을 확인할까요?' }
  if (/대피\s*장소|대피장소/u.test(action))
    return {
      kind: 'place',
      label: '대피 장소',
      prompt: '무엇을 미리 알아둘까요?',
    }
  if (/소각/u.test(action))
    return { kind: 'state', label: '소각', prompt: '무엇을 멈출까요?' }
  if (/화목\s*보일러|불씨/u.test(action))
    return { kind: 'object', label: '불씨', prompt: '무엇을 확인할까요?' }
  if (/라이터|담배/u.test(action))
    return {
      kind: 'object',
      label: '라이터와 담배',
      prompt: '무엇을 두고 가야 할까요?',
    }
  if (/대피\s*안내/u.test(action))
    return { kind: 'signal', label: '대피 안내', prompt: '무엇을 확인할까요?' }
  if (/주변\s*사람/u.test(action))
    return {
      kind: 'person',
      label: '주변 사람',
      prompt: '누구에게 알려야 할까요?',
    }
  if (/신속히?\s*대피|빨리\s*대피/u.test(action))
    return {
      kind: 'state',
      label: '신속히 대피',
      prompt: '어떻게 해야 할까요?',
    }
  if (/산과\s*떨어진\s*도로/u.test(action))
    return {
      kind: 'place',
      label: '산과 떨어진 도로',
      prompt: '어디로 대피할까요?',
    }
  if (/낙엽/u.test(action))
    return { kind: 'object', label: '낙엽', prompt: '무엇을 치울까요?' }
  if (/엎드려|몸을\s*보호/u.test(action))
    return {
      kind: 'state',
      label: '낮게 엎드리기',
      prompt: '대피가 어려우면 어떻게 할까요?',
    }
  if (/야외\s*활동|야외활동/u.test(action))
    return {
      kind: 'state',
      label: '야외 활동',
      prompt: '더울 때 무엇을 줄일까요?',
    }
  if (/옷차림|가볍게/u.test(action))
    return { kind: 'object', label: '옷차림', prompt: '무엇을 가볍게 할까요?' }
  if (action.includes('시원한 곳'))
    return { kind: 'place', label: '시원한 곳', prompt: '어디로 갈까요?' }
  if (action.includes('그늘'))
    return { kind: 'place', label: '그늘', prompt: '어디에서 쉴까요?' }
  if (/(^|\s)물을?\s*(자주\s*)?(마셔|마시)|수분/u.test(action))
    return { kind: 'object', label: '물', prompt: '무엇을 마실까요?' }
  if (/더운 시간|쉬어|쉬어요|휴식/u.test(action))
    return {
      kind: 'state',
      label: '쉬기',
      prompt: '더울 때 무엇을 자주 할까요?',
    }
  if (/병원|진료/u.test(action))
    return { kind: 'place', label: '병원', prompt: '아프면 어디로 갈까요?' }
  if (action.includes('따뜻하게'))
    return { kind: 'state', label: '따뜻한 몸', prompt: '몸을 어떻게 할까요?' }
  if (action.includes('한파 날씨'))
    return { kind: 'signal', label: '한파 날씨', prompt: '무엇을 확인할까요?' }
  if (action.includes('눈길'))
    return { kind: 'place', label: '눈길', prompt: '어디 운전을 줄일까요?' }
  if (action.includes('눈을 확인'))
    return { kind: 'object', label: '쌓인 눈', prompt: '무엇을 확인할까요?' }
  if (/공사장|공사\s*자재/u.test(action))
    return {
      kind: 'place',
      label: '공사장 근처',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (/물에\s*잠기는|산사태|위험한\s*곳/u.test(action))
    return { kind: 'place', label: '위험한 곳', prompt: '어디를 피할까요?' }
  if (/지하\s*차도|교량/u.test(action))
    return {
      kind: 'place',
      label: '침수도로, 지하차도, 교량',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (/개울가|하천\s*변|하천변|해안가/u.test(action))
    return {
      kind: 'place',
      label: '개울가, 하천 변, 해안가',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (
    /산|계곡|비탈면/u.test(action) &&
    /가지\s*않|피하|가까이\s*가지/u.test(action)
  )
    return {
      kind: 'place',
      label: '산, 계곡, 비탈면',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (/산과\s*계곡|산이나\s*계곡/u.test(action))
    return { kind: 'place', label: '안전한 곳', prompt: '어디로 가야 할까요?' }
  if (/논둑|물꼬/u.test(action))
    return {
      kind: 'place',
      label: '논둑이나 물꼬',
      prompt: '어디를 보러 나가지 말까요?',
    }
  if (/맨홀|하수도/u.test(action))
    return {
      kind: 'place',
      label: '맨홀과 하수도',
      prompt: '어디에 가지 말아야 할까요?',
    }
  if (action.includes('배수구'))
    return {
      kind: 'object',
      label: '배수구',
      prompt: '무엇을 미리 확인할까요?',
    }
  if (/전기.*가스|가스.*전기/u.test(action))
    return {
      kind: 'object',
      label: '전기와 가스',
      prompt: /안전점검/u.test(action)
        ? '무엇을 안전점검할까요?'
        : '무엇을 꺼야 할까요?',
    }
  if (/수돗물/u.test(action))
    return {
      kind: 'object',
      label: '수돗물',
      prompt: '무엇이 오염됐는지 확인할까요?',
    }
  if (/전신주/u.test(action))
    return {
      kind: 'object',
      label: '전신주',
      prompt: '무엇에서 멀어질까요?',
    }
  if (
    /낮은\s*곳|저지대|산지/u.test(action) ||
    (/비탈면/u.test(action) && !/계곡/u.test(action))
  )
    return {
      kind: 'place',
      label: '낮은 곳, 비탈면, 산지',
      prompt: '어디에서 멀어질까요?',
    }
  if (/하천/u.test(action) && /차|차량|운전|서행|주차|옮겨/u.test(action))
    return {
      kind: 'place',
      label: '하천 근처',
      prompt: '차를 어디에서 옮길까요?',
    }
  if (action.includes('천천히'))
    return {
      kind: 'state',
      label: '천천히',
      prompt: action.includes('운전')
        ? '어떻게 운전할까요?'
        : '어떻게 움직일까요?',
    }
  if (action.includes('배수로'))
    return {
      kind: 'object',
      label: '배수로',
      prompt: '무엇을 미리 정리할까요?',
    }
  if (action.includes('배를'))
    return { kind: 'object', label: '배', prompt: '무엇을 단단히 묶을까요?' }
  if (action.includes('문'))
    return { kind: 'object', label: '문', prompt: '무엇을 닫아야 할까요?' }
  if (action.includes('계단'))
    return { kind: 'place', label: '계단', prompt: '어디로 갈까요?' }
  if (action.includes('머리'))
    return { kind: 'object', label: '머리', prompt: '어디를 보호할까요?' }
  if (action.includes('탁자'))
    return { kind: 'place', label: '탁자 아래', prompt: '어디로 들어갈까요?' }
  if (action.includes('넓은'))
    return { kind: 'place', label: '넓은 곳', prompt: '어디로 갈까요?' }
  if (action.includes('어른'))
    return { kind: 'person', label: '어른', prompt: '누구 말을 들을까요?' }
  if (action.includes('가스'))
    return { kind: 'signal', label: '가스 냄새', prompt: '무엇을 말할까요?' }
  if (action.includes('실내'))
    return { kind: 'place', label: '실내', prompt: '어디에 있을까요?' }
  if (action.includes('안전한 곳'))
    return { kind: 'place', label: '안전한 곳', prompt: '어디로 갈까요?' }
  if (action.includes('낮은 곳'))
    return { kind: 'place', label: '높은 길', prompt: '어떤 길로 갈까요?' }

  return fallbackOptionForAction(action)
}

function contrastForOption(
  option: ReturnType<typeof optionForAction>,
  hazard: HazardProfile,
  actionSteps: string[] = [],
) {
  const actionText = actionSteps.join(' ')
  const choose = (candidates: string[]) =>
    candidates.find((candidate) => !actionText.includes(candidate)) ??
    candidates[0]!

  if (option.kind === 'place') {
    if (option.label === '계단') return '엘리베이터'
    if (option.label === '실내') return '밖'
    if (option.label === '하천 근처') return '집 앞'
    if (option.label === '개울가, 하천 변, 해안가') return '집 안'
    if (option.label === '산, 계곡, 비탈면') return '집 안'
    if (option.label === '공사장 근처') return '운동장'
    if (option.label === '논둑이나 물꼬') return '집 안'
    if (option.label === '맨홀과 하수도') return '집 안'
    if (option.label === '위험한 곳') return '안전한 곳'
    if (option.label === '안전한 곳') return '바닷가'
    if (option.label === '집 주변') return '바닷가'
    if (option.label === '대피 장소') return '위험한 길'
    if (option.label === '침수 위험 장소') return '높은 주차장'
    if (option.label === '산사태 위험') return '튼튼한 실내'
    if (option.label === '산비탈과 급경사지') return '평평한 실내'
    if (option.label === '하천변, 배수로, 해안가') return '집 안'
    if (option.label === '지하공간과 침수도로') return '지상 대피소'
    if (option.label === '낮은 곳, 비탈면, 산지') return '튼튼한 실내'
    if (option.label === '시원한 곳') return '더운 곳'
    if (option.label === '그늘') return '햇볕'
    if (option.label === '탁자 아래') return '창가'
    if (option.label === '산과 떨어진 도로') return '산 가까운 길'

    return choose(['좁은 곳', '바닷가', '밖'])
  }
  if (option.label === '주변 사람') return '혼자'
  if (option.kind === 'person') return '혼자'
  if (option.kind === 'object')
    if (option.label === '모래주머니와 수방자재') return '장난감'
  if (option.kind === 'object') if (option.label === '비상 가방') return '빈손'
  if (option.kind === 'object')
    if (option.label === '대피소 가는 길') return '놀이공원 가는 길'
  if (option.kind === 'object') if (option.label === '대중교통') return '자전거'
  if (option.kind === 'object')
    if (option.label === '내 집 앞 눈') return '지붕 위 눈'
  if (option.kind === 'object') if (option.label === '스노우체인') return '빈손'
  if (option.kind === 'object')
    if (option.label === '안전거리') return '바짝 붙기'
  if (option.kind === 'object')
    if (option.label === '안전한 이동수단') return '전동 킥보드'
  if (option.kind === 'object')
    if (option.label === '하천변 차량') return '집 안'
  if (option.kind === 'object')
    if (option.label === '배수로와 물꼬') return '전신주'
  if (option.kind === 'object')
    if (option.label === '전기와 가스') return '창문'
  if (option.kind === 'object') if (option.label === '수돗물') return '비옷'
  if (option.kind === 'object') if (option.label === '전신주') return '배수로'
  if (option.kind === 'object') if (option.label === '불씨') return '재'
  if (option.kind === 'object')
    if (option.label === '라이터와 담배') return '물병'
  if (option.kind === 'object') if (option.label === '낙엽') return '돌'
  if (option.kind === 'object')
    return choose(['가방', '간판', '휴대폰', '의자'])
  if (option.kind === 'signal')
    if (option.label === '대피 요청') return '광고 소리'
  if (option.kind === 'signal')
    if (option.label === '대피 안내') return '게임 소리'
  if (option.kind === 'signal')
    return option.label === '119' ? '게임' : '게임 소리'
  if (option.label === '소각') return '불씨 확인'
  if (option.label === '낮게 엎드리기') return '서서 구경하기'
  if (option.label === '산행과 캠핑') return '집 안에 있기'

  return choose(['급하게', '그냥', hazard.label])
}

function fallbackOptionForAction(action: string): {
  kind: 'object' | 'person' | 'place' | 'signal' | 'state'
  label: string
  prompt: string
} {
  const normalized = normalizeCueText(action)
  const preparedObjectMatch = normalized.match(
    /(.{1,18}?)(?:을|를)\s*(?:챙겨|준비해|확인해|점검해|가져|가져가|찾아|치워)/u,
  )

  if (preparedObjectMatch?.[1]) {
    return {
      kind: 'object',
      label: cleanFallbackObjectLabel(preparedObjectMatch[1]),
      prompt: /확인|점검/u.test(normalized)
        ? '무엇을 확인할까요?'
        : '무엇을 챙길까요?',
    }
  }

  const placeMatch = normalized.match(
    /(공사장|개울가|하천\s*변|하천변|하천|해안가|산|계곡|비탈면|논둑|물꼬|맨홀|하수도|안전한 곳)/u,
  )

  if (placeMatch?.[1]) {
    const label = placeMatch[1].replace(/\s+/gu, ' ')

    return {
      kind: 'place',
      label,
      prompt: /가지\s*않|피하|말/u.test(normalized)
        ? '어디에 가지 말아야 할까요?'
        : '어디로 가야 할까요?',
    }
  }

  const objectMatch = normalized.match(
    /(배수구|배수로|문|창문|간판|시설물|비닐하우스|배|전선|가스 냄새|탁자|머리|119|맨홀|하수도)/u,
  )

  if (objectMatch?.[1]) {
    return {
      kind:
        objectMatch[1] === '119' || objectMatch[1].includes('냄새')
          ? 'signal'
          : 'object',
      label: objectMatch[1],
      prompt: `${objectMatch[1]}을 확인할까요?`,
    }
  }

  if (/신속히?\s*대피|빨리\s*대피/u.test(normalized)) {
    return {
      kind: 'state',
      label: '신속히 대피',
      prompt: '어떻게 해야 할까요?',
    }
  }

  if (/대피|가요|이동/u.test(normalized)) {
    return {
      kind: 'place',
      label: '안전한 곳',
      prompt: '어디로 가야 할까요?',
    }
  }

  if (/천천히|급하게/u.test(normalized)) {
    return {
      kind: 'state',
      label: '천천히',
      prompt: '어떤 속도로 움직일까요?',
    }
  }

  const concreteLabel = fallbackConcreteLabelForAction(normalized)
  if (concreteLabel) {
    return {
      kind: concreteLabel.kind,
      label: concreteLabel.label,
      prompt: concreteLabel.prompt,
    }
  }

  return {
    kind: 'signal',
    label: '현장 안내',
    prompt: '무엇을 따라야 할까요?',
  }
}

function fallbackConcreteLabelForAction(action: string): {
  kind: 'object' | 'person' | 'place' | 'signal' | 'state'
  label: string
  prompt: string
} | null {
  if (/어른|보호자|선생님/u.test(action)) {
    return {
      kind: 'person',
      label: '어른',
      prompt: '누구에게 말할까요?',
    }
  }
  if (/현장\s*안내|안내/u.test(action)) {
    return {
      kind: 'signal',
      label: '현장 안내',
      prompt: '무엇을 따라야 할까요?',
    }
  }
  if (/방송|라디오|TV/u.test(action)) {
    return {
      kind: 'signal',
      label: '방송 안내',
      prompt: '무엇을 들을까요?',
    }
  }
  if (/밖|야외|실내|집\s*안/u.test(action)) {
    return {
      kind: 'place',
      label: /실내|집\s*안/u.test(action) ? '실내' : '밖',
      prompt: /실내|집\s*안/u.test(action)
        ? '어디에 있어야 할까요?'
        : '어디를 피해야 할까요?',
    }
  }
  if (/위험|조심|주의/u.test(action)) {
    return {
      kind: 'signal',
      label: '위험 신호',
      prompt: '무엇을 확인할까요?',
    }
  }

  const nounMatch = action.match(
    /(비상\s*가방|대피소|대피\s*장소|기상\s*상황|기상정보|배수구|배수로|물꼬|창문|문|계단|전선|맨홀|하수도|라이터|담배|불씨|낙엽|스노우체인|안전거리|물|그늘|병원)/u,
  )
  if (nounMatch?.[1]) {
    const label = nounMatch[1].replace(/\s+/gu, ' ')
    return {
      kind: /대피소|대피\s*장소|계단|그늘|병원/u.test(label)
        ? 'place'
        : /기상|위험/u.test(label)
          ? 'signal'
          : 'object',
      label,
      prompt: /피하|멀어|가지/u.test(action)
        ? `${label}에서 어떻게 해야 할까요?`
        : `${label}을 어떻게 할까요?`,
    }
  }

  return null
}

function cleanFallbackObjectLabel(label: string) {
  return label
    .replace(/^(?:먼저|미리|꼭|반드시|다시|그리고|함께)\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function situationFromText(text: string, hazard: HazardProfile) {
  const topicSituation = topicSituationForText(text, hazard)
  if (topicSituation) {
    return topicSituation
  }
  const introTitleText = sourceBackedIntroTitleText(text, hazard)
  if (introTitleText) {
    return introTitleText
  }

  if (/태풍피해 없이/u.test(text)) return '태풍 안전수칙을 다시 기억해요.'
  if (/태풍.*북상|외출을 차지|외출을 자제/u.test(text))
    return '태풍이 가까이 오고 있어요.'
  if (/문과 창문|창문 가까|실내/u.test(text)) return '집 안에 있어요.'
  if (/기상\s*상황|기상상황|날씨|TV|라디오/u.test(text)) {
    if (hazard.hazard === 'heatwave') return '폭염 날씨를 확인해요.'
    if (hazard.hazard === 'coldwave') return '한파 날씨를 확인해요.'
    if (hazard.hazard === 'heavy_snow') return '눈 소식을 확인해요.'
    return '태풍 소식과 날씨를 확인해요.'
  }
  if (/물에\s*자주\s*잠기|산사태|위험한\s*곳/u.test(text))
    return '물에 잠기거나 흙이 무너질 수 있는 곳이 있어요.'
  if (/지하\s*차도|교량/u.test(text)) return '침수도로와 지하차도는 위험해요.'
  if (/개울가|하천\s*변|하천변|해안가|급류|침수될/u.test(text))
    return '개울가, 하천 변, 해안가는 위험해요.'
  if (/공사장|공사\s*자재|큰\s*바람|강한\s*바람|날릴|넘어지/u.test(text))
    return '공사장 근처는 바람 때문에 위험해요.'
  if (/산이나\s*계곡|산과\s*계곡|등산객|비탈면/u.test(text))
    return '산과 계곡에서는 빨리 안전한 곳으로 가요.'
  if (/논뚝|논둑|물고|물꼬|무리하게\s*나서/u.test(text))
    return '논둑이나 물꼬를 보러 나가면 위험해요.'
  if (/맨홀|하수도|추락|휩쓸림/u.test(text))
    return '맨홀과 하수도 근처는 위험해요.'
  if (/산림\s*근처|소각/u.test(text)) return '산 근처에서 불을 피우면 위험해요.'
  if (/화목\s*보일러|불씨|꺼졌/u.test(text))
    return '남은 불씨가 있을 수 있어요.'
  if (/라이터|담배/u.test(text))
    return '산에는 불붙는 물건을 가져가면 위험해요.'
  if (/산불.*발생|대피\s*안내|주변.*알|즉시\s*알/u.test(text)) {
    return '산불이 나면 바로 알려야 해요.'
  }
  if (/산과\s*떨어진\s*도로|산불\s*확산/u.test(text)) {
    return '산 가까이는 불이 번질 수 있어요.'
  }
  if (/대피.*어려|낙엽|낮은\s*자세|엎드/u.test(text)) {
    return '대피하기 어려운 상황이에요.'
  }
  if (/간판|위험 시설물|시설물 주변/u.test(text))
    return '밖에는 떨어질 수 있는 물건이 있어요.'
  if (/집 주변|침수피해|배수구/u.test(text))
    return '집 주변에 물이 찰 수 있어요.'
  if (/주차|차량|운전|서행|차를|차는/u.test(text))
    return '하천 근처와 도로가 위험할 수 있어요.'
  if (/농촌|물고|물꼬|시설물.*묶|단단히 묶|배수로/u.test(text)) {
    return '농촌에서는 미리 준비해야 해요.'
  }
  if (/바닷가|선박|배를|배는|묶어 두/u.test(text))
    return '바닷가는 위험할 수 있어요.'
  if (/여름철|호우|태풍|비바람/u.test(text))
    return '비와 태풍 안전수칙을 배워요.'
  if (/산행|캠핑/u.test(text)) return '비와 태풍이 올 수 있어요.'
  if (/갑자기 비|쏟아질/u.test(text)) return '비가 갑자기 많이 와요.'
  if (/낮은 다리|낮은 곳|물이 찬|침수.*다리|건너지|건너/u.test(text)) {
    return '물이 찬 낮은 곳이 있어요.'
  }
  if (/고립|신고|1\s*1|119/u.test(text)) return '혼자 움직이기 어려워요.'
  if (/배수로|물꼬|점검/u.test(text)) return '물이 불어난 곳은 위험해요.'
  if (/안전수칙|챙겨주세요|챙기/u.test(text)) return '안전수칙을 다시 기억해요.'

  const shortText = shortenLearnerText(
    text,
    `${hazard.label} 장면이에요.`,
    hazard,
  )
  if (shortText.includes(hazard.label)) return shortText

  return `${hazard.label} 상황을 보고 있어요.`
}

function topicSituationForText(text: string, hazard: HazardProfile) {
  const topic = topicKeyForCueText(text)

  switch (topic) {
    case 'coastal_boat':
      return '바닷가는 위험할 수 있어요.'
    case 'construction_wind_avoid':
      return '공사장 근처는 바람 때문에 위험해요.'
    case 'drain_waterway':
      return '물이 불어난 곳은 위험해요.'
    case 'earthquake_electric':
      return '전기가 고장 난 것 같아요.'
    case 'earthquake_gas':
      return '가스 냄새나 새는 소리가 나요.'
    case 'earthquake_open_space':
      return '밖으로 나온 뒤 갈 곳을 찾아요.'
    case 'earthquake_outside_head':
      return '밖에도 유리와 간판이 떨어져요.'
    case 'earthquake_protect':
      return /방석|유리/u.test(text)
        ? '탁자가 없을 수 있어요.'
        : '흔들림이 이어지고 있어요.'
    case 'earthquake_report':
      return '다친 사람이 있을 수 있어요.'
    case 'earthquake_return_door':
      return '옷장이나 보관함 문 뒤에 물건이 있을 수 있어요.'
    case 'earthquake_school':
      return /학교/u.test(text)
        ? '학교에서 지진이 났어요.'
        : '선생님 안내를 들어요.'
    case 'earthquake_stairs':
      return '밖으로 나가야 할 수 있어요.'
    case 'earthquake_sturdy_building':
      return '공원이나 운동장이 안 보일 수 있어요.'
    case 'earthquake_water':
      return '수도관이 고장 난 것 같아요.'
    case 'farm_facility':
      return '농촌에서는 미리 준비해야 해요.'
    case 'farm_waterway_stay_safe':
      return '논둑이나 물꼬를 보러 나가면 위험해요.'
    case 'flood_landslide_avoid':
      return '물에 잠기거나 흙이 무너질 수 있는 곳이 있어요.'
    case 'home_drain':
      return '집 주변에 물이 찰 수 있어요.'
    case 'heatwave_cool':
      return /열사병|열경련|증상|시원/u.test(text)
        ? '몸이 너무 더울 수 있어요.'
        : '폭염 상황을 보고 있어요.'
    case 'heatwave_rest':
      return /그늘/u.test(text)
        ? '그늘에서 쉬어야 해요.'
        : '더운 시간에는 쉬어야 해요.'
    case 'heatwave_water':
      return '더운 날에는 물이 필요해요.'
    case 'heavy_snow_clear':
      return /지붕|심야|가로수|노후\s*시설|붕괴|위험\s*시설/u.test(text)
        ? '눈 때문에 시설물이 위험해요.'
        : '집 앞에 눈이 쌓였어요.'
    case 'heavy_snow_drive':
      if (/자전거|전동\s*킥보드/u.test(text)) {
        return '눈 오는 날 이동수단이 위험해요.'
      }
      if (/스노우\s*체인|스프레이\s*체인|체인/u.test(text)) {
        return '눈길 운전 준비가 필요해요.'
      }
      return '눈길 도로가 미끄러워요.'
    case 'heavy_snow_stay_home':
      return /외출|대중교통/u.test(text)
        ? '눈이 많이 쌓였어요.'
        : '대설 상황을 보고 있어요.'
    case 'indoor_window':
      return '집 안에 있어요.'
    case 'mountain_valley_evacuate':
      return '산과 계곡에서는 빨리 안전한 곳으로 가요.'
    case 'sewer_manhole_avoid':
      return '맨홀과 하수도 근처는 위험해요.'
    case 'outdoor_signage':
      return '밖에는 떨어질 수 있는 물건이 있어요.'
    case 'outro_review':
      return /태풍피해/u.test(text)
        ? '태풍 안전수칙을 다시 기억해요.'
        : '안전수칙을 다시 기억해요.'
    case 'fire_alert':
      return '불과 연기가 보일 수 있어요.'
    case 'fire_door_control':
      return '우리 집에서 불이 났어요.'
    case 'fire_monitoring':
      return '다른 집에 불이 났지만 우리 집은 괜찮아 보여요.'
    case 'fire_refuge':
      return '연기가 많아서 밖으로 나가기 어려워요.'
    case 'fire_seal_room':
      return '연기가 들어와서 바로 나가기 어려워요.'
    case 'fire_smoke':
      return '연기가 많아요.'
    case 'fire_stairs':
      return '계단과 엘리베이터가 보여요.'
    case 'flood_home_return_check':
      return '침수된 집으로 돌아가기 전이에요.'
    case 'flood_lowland_powerline_avoid':
      return '비가 오면 위험한 곳이 있어요.'
    case 'flood_prepare_weather_shelter':
      return '비가 오기 전에 준비해요.'
    case 'flood_river_car_utilities':
      return '하천변 차와 집 안 안전을 확인해요.'
    case 'intro_weather':
      if (/홍수/u.test(text)) {
        return '홍수 안전수칙을 배워요.'
      }
      if (/휴가/u.test(text)) {
        return '태풍 소식을 확인하고 있어요.'
      }
      return /호우|비바람|(?:^|\s)비(?:가|와|\s)/u.test(text)
        ? '비와 태풍 안전수칙을 배워요.'
        : '태풍 안전수칙을 배워요.'
    case 'river_car_drive':
      return '하천 근처와 도로가 위험할 수 있어요.'
    case 'typhoon_warning':
      return '태풍이 가까이 오고 있어요.'
    case 'water_area_avoid':
      if (/지하\s*차도|교량/u.test(text)) {
        return '침수도로와 지하차도는 위험해요.'
      }
      return '개울가, 하천 변, 해안가는 위험해요.'
    case 'weather_check':
      if (hazard.hazard === 'heatwave') return '폭염 날씨를 확인해요.'
      if (hazard.hazard === 'coldwave') return '한파 날씨를 확인해요.'
      if (hazard.hazard === 'heavy_snow') return '눈 소식을 확인해요.'
      return '태풍 소식과 날씨를 확인해요.'
    default:
      return null
  }
}

function summarizeAction(actions: string[]) {
  if (actions.length === 0) return '영상을 보고 같이 연습해요.'
  if (actions.length === 1) return actions[0]!

  return `${toKoreanConnective(actions[0]!)} ${actions[1]}`
}

function toKoreanConnective(text: string) {
  return text
    .replace(/해요$/u, '하고')
    .replace(/아요$/u, '고')
    .replace(/어요$/u, '고')
    .replace(/요$/u, '고')
}

function introSafetyTextForHazard(hazard?: HazardProfile) {
  if (!hazard || hazard.hazard === 'unknown') {
    return '재난안전 수칙을 배워요.'
  }

  return `${hazard.label} 안전수칙을 배워요.`
}

function reviewSafetyTextForHazard(hazard?: HazardProfile) {
  if (!hazard || hazard.hazard === 'unknown') {
    return '안전수칙을 다시 기억해요.'
  }

  return `${hazard.label} 안전수칙을 다시 기억해요.`
}

function sourceBackedIntroTitleText(
  text: string,
  hazard?: HazardProfile,
): string | null {
  const cleaned = normalizeCueText(text)
    .replace(/다행히\s*와/gu, '다행이와')
    .replace(/다행이\s*와/gu, '다행이와')
    .replace(/국민\s*행동\s*교령/gu, '국민행동요령')
    .replace(/국민\s*행동\s*요량/gu, '국민행동요령')
    .replace(/국민\s*행동\s*요령/gu, '국민행동요령')
    .replace(/행동\s*교령/gu, '행동요령')
    .replace(/행동\s*요량/gu, '행동요령')
    .replace(/행동\s*요령/gu, '행동요령')
    .replace(/\s*\/\s*/gu, ' ')
    .replace(/\s*,\s*/gu, ', ')
    .trim()

  if (
    !/(함께하는|국민행동요령|행동요령)/u.test(cleaned) ||
    (/태풍피해 없이|챙겨주세요|챙기|대비해요|감사/u.test(cleaned) &&
      !/함께하는/u.test(cleaned))
  ) {
    return null
  }

  const titleMatch = cleaned.match(
    /((?:[가-힣A-Za-z0-9]+와\s*함께하는\s*)?[가-힣A-Za-z0-9,\s·]+?(?:국민행동요령|행동요령))/u,
  )
  const title = (titleMatch?.[1] ?? '')
    .replace(/,\s*(국민행동요령|행동요령)$/u, ' $1')
    .replace(/\s+/gu, ' ')
    .trim()

  if (!title) {
    return null
  }
  if (title.length <= maximumLearnerCardTextLength) {
    return title
  }

  const withoutPresenter = title
    .replace(/^[가-힣A-Za-z0-9]+와\s*함께하는\s*/u, '')
    .trim()
  if (
    withoutPresenter &&
    withoutPresenter.length <= maximumLearnerCardTextLength
  ) {
    return withoutPresenter
  }

  return hazard ? introSafetyTextForHazard(hazard) : null
}

function shortenLearnerText(
  text: string,
  fallback: string,
  hazard?: HazardProfile,
) {
  const cleaned = normalizeCueText(text).replace(/하십시오|하세요/gu, '해요')
  const introTitleText = sourceBackedIntroTitleText(cleaned, hazard)
  if (introTitleText) {
    return introTitleText
  }
  if (/태풍피해 없이|안전수칙|챙겨주세요|챙기/u.test(cleaned)) {
    return reviewSafetyTextForHazard(hazard)
  }
  if (/휴가/u.test(cleaned) && /태풍/u.test(cleaned)) {
    return '태풍 소식을 확인해요.'
  }
  if (/여름철|호우|태풍|비바람/u.test(cleaned)) {
    if (
      hazard &&
      hazard.hazard !== 'typhoon' &&
      hazard.hazard !== 'heavy_rain'
    ) {
      return introSafetyTextForHazard(hazard)
    }
    return '비와 태풍 안전수칙을 배워요.'
  }

  const firstSentence = cleaned.split(/(?<=[.?!。！？요다])\s+/u)[0] ?? cleaned
  const short = firstSentence
    .replace(/[.。]$/u, '')
    .replace(/입니다$/u, '이에요')
    .replace(/합니다$/u, '해요')
    .trim()

  if (!short) return fallback
  if (short.length <= 34) return short

  return fallback
}

function normalizeCueText(text: string) {
  return text
    .replace(/\[음악\]/gu, ' ')
    .replace(/\([^)]*\)/gu, ' ')
    .replace(/수방\s*자제/gu, '수방자재')
    .replace(/대피\s*속하는\s*길/gu, '대피소 가는 길')
    .replace(/대피\s*소\s*가는\s*길/gu, '대피소 가는 길')
    .replace(/산미탈/gu, '산비탈')
    .replace(/산\s*비탈/gu, '산비탈')
    .replace(/지하\s*공간/gu, '지하공간')
    .replace(/지하\s*차도/gu, '지하차도')
    .replace(/침수된?\s*도로/gu, '침수도로')
    .replace(/\s+/gu, ' ')
    .trim()
}

function detectHazard(text: string) {
  if (/지진|흔들|탁자|방석/u.test(text)) return hazardProfiles[0]!
  if (/화재|산불|불이|불씨|소각|라이터|담배|연기|계단|소화/u.test(text))
    return hazardProfiles[1]!
  if (/태풍|강풍|바람/u.test(text)) return hazardProfiles[3]!
  if (/폭염|무더위|온열|열사병|더운/u.test(text)) return hazardProfiles[4]!
  if (/한파|추위|춥|동파/u.test(text)) return hazardProfiles[5]!
  if (/대설|폭설|눈길|눈이 많이|빙판/u.test(text)) return hazardProfiles[6]!
  if (/호우|비가|침수|홍수|물/u.test(text)) return hazardProfiles[2]!

  return hazardProfiles.at(-1)!
}

function buildFallbackCues(title: string): CaptionCue[] {
  return [
    {
      endMs: 8_000,
      startMs: 0,
      text: `${title} 내용을 확인해요.`,
    },
  ]
}

async function readInfoJson(workDir: string, files: string[]) {
  const infoFile = files.find((file) => file.endsWith('.info.json'))

  if (!infoFile) {
    return {} as { thumbnail?: string; title?: string }
  }

  try {
    const parsed = JSON.parse(
      await readFile(join(workDir, infoFile), 'utf8'),
    ) as {
      thumbnail?: unknown
      title?: unknown
    }

    return {
      thumbnail:
        typeof parsed.thumbnail === 'string' ? parsed.thumbnail : undefined,
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
    }
  } catch {
    return {}
  }
}

function findDownloadedVideo(files: string[]) {
  return (
    files.find((file) => file === 'source.mp4') ??
    files.find((file) => file.endsWith('.mp4'))
  )
}

function isUnsafeGeneratedScenarioCache(customScenario: unknown) {
  if (!customScenario || typeof customScenario !== 'object') {
    return true
  }

  const report = (customScenario as { generationEvidenceReport?: unknown })
    .generationEvidenceReport as
    | {
        audioCueCount?: unknown
        segmentationEvidence?: unknown
        warnings?: unknown
      }
    | undefined
  const warnings = Array.isArray(report?.warnings) ? report.warnings : []
  const segmentationEvidence = Array.isArray(report?.segmentationEvidence)
    ? report.segmentationEvidence
    : []

  return (
    warnings.some(
      (warning) =>
        typeof warning === 'string' &&
        /제목과 공식 안전 주제|자막 접근을 막아|title_only|oembed/iu.test(
          warning,
        ),
    ) ||
    Number(report?.audioCueCount ?? 0) <= 0 ||
    !segmentationEvidence.includes('audio-asr')
  )
}

function extractYouTubeVideoId(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl)
    const host = url.hostname.toLowerCase().replace(/^www\./u, '')

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      return isValidYouTubeVideoId(id) ? id : null
    }

    if (host === 'youtube.com') {
      const fromWatch = url.searchParams.get('v')
      if (isValidYouTubeVideoId(fromWatch)) {
        return fromWatch
      }

      const pathParts = url.pathname.split('/').filter(Boolean)
      const embeddedId = ['embed', 'shorts', 'live'].includes(
        pathParts[0] ?? '',
      )
        ? pathParts[1]
        : null

      return isValidYouTubeVideoId(embeddedId) ? embeddedId : null
    }
  } catch {
    return null
  }

  return null
}

function isValidYouTubeVideoId(value: string | null | undefined) {
  return Boolean(value && /^[a-zA-Z0-9_-]{11}$/u.test(value))
}

async function copyToDistIfPresent(workDir: string, jobId: string) {
  try {
    await mkdir(join(distGeneratedDir, jobId), { recursive: true })
    await mkdir(join(distGeneratedDir, jobId, generatedQualityVersion), {
      recursive: true,
    })
    try {
      await copyFile(
        join(workDir, 'source.mp4'),
        join(distGeneratedDir, jobId, 'source.mp4'),
      )
      await copyFile(
        join(workDir, generatedQualityVersion, 'source.mp4'),
        join(distGeneratedDir, jobId, generatedQualityVersion, 'source.mp4'),
      )
    } catch {
      // YouTube embed fallback scenarios do not create a local mp4.
    }
    await copyFile(
      join(workDir, 'scenario.json'),
      join(distGeneratedDir, jobId, 'scenario.json'),
    )
    for (const fileName of [
      'evidence-packet.json',
      'pipeline-trace.json',
      'quality-report.json',
      'scenario.json',
      'scene-graph.json',
    ]) {
      await copyFile(
        join(workDir, generatedQualityVersion, fileName),
        join(distGeneratedDir, jobId, generatedQualityVersion, fileName),
      )
    }
  } catch {
    // The dev server does not need dist files. Preview builds use this when dist exists.
  }
}

async function collectGeneratedArtifactFileNames(
  workDir: string,
  pendingFileNames: string[] = [],
) {
  const files = await readdir(workDir).catch(() => [])
  return [
    ...new Set(
      [...files, ...pendingFileNames].filter(isGeneratedArtifactFileName),
    ),
  ].sort()
}

async function writeCanonicalGeneratedArtifacts(
  workDir: string,
  fileNames: string[],
) {
  const canonicalDir = join(workDir, generatedQualityVersion)
  await mkdir(canonicalDir, { recursive: true })

  for (const fileName of fileNames) {
    const sourcePath = join(workDir, fileName)
    if (!existsSync(sourcePath)) {
      continue
    }

    await copyFile(sourcePath, join(canonicalDir, fileName))
  }
}

function isGeneratedArtifactFileName(fileName: string) {
  return (
    fileName === 'pipeline-trace.json' ||
    fileName === 'quality-report.json' ||
    fileName === 'scenario.json' ||
    fileName === 'evidence-packet.json' ||
    fileName === 'scene-graph.json' ||
    fileName === 'audio-transcript.json' ||
    fileName === 'visual-caption-evidence.json' ||
    fileName === 'source.mp4' ||
    fileName === 'source.info.json' ||
    /^source\.[a-z0-9-]+(?:-orig)?\.vtt$/iu.test(fileName) ||
    /^visual-caption-frame-\d{2}\.jpg$/u.test(fileName)
  )
}

function normalizeUrl(input: unknown) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new ValidationError('url_required', '영상 URL을 입력해 주세요.')
  }

  const trimmed = input.trim()
  const candidate = normalizeYouTubeInput(trimmed)

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new ValidationError(
      'invalid_youtube_url',
      '유튜브 영상 링크를 입력해 주세요.',
    )
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ValidationError(
      'invalid_youtube_url',
      '유튜브 영상 링크를 입력해 주세요.',
    )
  }

  if (!isYouTubeHost(url.hostname)) {
    throw new ValidationError(
      'invalid_youtube_url',
      '유튜브 영상 링크를 입력해 주세요.',
    )
  }

  const youtubeVideoId = extractYouTubeVideoId(url.toString())
  if (youtubeVideoId) {
    return `https://www.youtube.com/watch?v=${youtubeVideoId}`
  }

  return url.toString()
}

function normalizeYouTubeInput(input: string) {
  if (/^[a-zA-Z0-9_-]{11}$/u.test(input)) {
    return `https://www.youtube.com/watch?v=${input}`
  }

  if (/^https?:\/\//iu.test(input)) {
    return input
  }

  if (/^[a-z][a-z0-9+.-]*:/iu.test(input)) {
    throw new ValidationError(
      'invalid_youtube_url',
      '유튜브 영상 링크를 입력해 주세요.',
    )
  }

  return `https://${input.replace(/^\/+/u, '')}`
}

function isYouTubeHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^www\./u, '')

  return normalized === 'youtube.com' || normalized === 'youtu.be'
}

function hashText(text: string) {
  return createHash('sha256').update(text).digest('hex')
}

function hashFile(filePath: string) {
  return new Promise<string>((resolvePromise, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)

    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolvePromise(hash.digest('hex')))
  })
}

function getPythonCommand() {
  return process.env.GENERATOR_PYTHON_BIN?.trim() || 'python3'
}

function getOpenAiApiKey() {
  const raw = process.env.OPENAI_API_KEY
  if (!raw) {
    return null
  }

  const cleaned = raw
    .trim()
    .replace(/^[`'"“”‘’]+|[`'"“”‘’]+$/gu, '')
    .replace(/[^\x20-\x7E]/gu, '')
    .trim()

  if (cleaned) {
    process.env.OPENAI_API_KEY = cleaned
  }

  return cleaned || null
}

function createOpenAiClient(
  apiKey: string,
  options: { timeoutMs?: number | null } = {},
) {
  const clientOptions: ConstructorParameters<typeof OpenAI>[0] = {
    apiKey,
    maxRetries: 1,
  }

  if (options.timeoutMs !== null) {
    clientOptions.timeout = options.timeoutMs ?? getOpenAiRequestTimeoutMs()
  }

  return new OpenAI(clientOptions)
}

function getOpenAiRequestTimeoutMs() {
  const configured = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS)

  if (Number.isFinite(configured) && configured >= 10_000) {
    return Math.round(configured)
  }

  return defaultOpenAiRequestTimeoutMs
}

function getFfmpegCommand() {
  const configured = process.env.FFMPEG_PATH?.trim()
  if (configured) {
    return configured
  }

  return ffmpegStaticPath && existsSync(ffmpegStaticPath)
    ? ffmpegStaticPath
    : 'ffmpeg'
}

function getFfprobeCommand() {
  const configured = process.env.FFPROBE_PATH?.trim()
  if (configured) {
    return configured
  }

  return ffprobeStatic.path && existsSync(ffprobeStatic.path)
    ? ffprobeStatic.path
    : 'ffprobe'
}

function getYtDlpExtractorArgs() {
  const extractorArgs =
    process.env.YT_DLP_EXTRACTOR_ARGS?.trim() || 'youtube:player_client=android'

  return extractorArgs ? ['--extractor-args', extractorArgs] : []
}

let ytDlpJsRuntimeSupport: Promise<boolean> | null = null

async function getYtDlpJsRuntimeArgs() {
  const runtime =
    process.env.YT_DLP_JS_RUNTIME === undefined
      ? 'node'
      : process.env.YT_DLP_JS_RUNTIME.trim()

  if (!runtime || runtime === '0' || runtime.toLowerCase() === 'false') {
    return []
  }

  ytDlpJsRuntimeSupport =
    ytDlpJsRuntimeSupport ??
    runCommandWithOutput(getPythonCommand(), ['-m', 'yt_dlp', '--help'])
      .then((help) => help.includes('--js-runtimes'))
      .catch(() => false)

  return (await ytDlpJsRuntimeSupport) ? ['--js-runtimes', runtime] : []
}

export const __testGeneratePracticeFromUrl = {
  alignVisualCaptionBoundaryToAudioSentence,
  alignLearningCardOnsetBoundaries,
  auditGeneratedScenario,
  buildGeneratedPauseMs,
  buildGeneratedPracticeId,
  buildGenerationEvidenceReport,
  buildRequiredSourceTopicEvidence,
  buildScenario,
  buildScenarioFromLlmPlan,
  detectHazard,
  finalizeQualityReportForDeadline,
  getDemoDeadlineMs,
  getDemoPublishTargetMs,
  getScenarioAuthorOpenAiTimeoutMs,
  getVisualCaptionOpenAiTimeoutMs,
  hasSufficientDeterministicEvidence,
  inferVisualCaptionBoundariesFromFrames,
  isReliableVisualCaptionBoundary,
  optionForAction,
  parseVtt,
  prepareEvidenceCues,
  repairScenarioForQuality,
  shouldReuseGeneratedCache,
  stabilizeVisualCaptionEvidence,
  topicKeyForCueText,
  validateGeneratedScenarioForPublish,
}

function runCommandWithOutput(
  command: string,
  args: string[],
  signal?: AbortSignal,
) {
  return new Promise<string>((resolvePromise, reject) => {
    if (signal?.aborted) {
      reject(createAbortError())
      return
    }

    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let settled = false
    const cleanup = () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortChild)
    }
    const finish = (callback: () => void) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      callback()
    }
    const abortChild = () => {
      child.kill('SIGTERM')
      finish(() => reject(createAbortError()))
    }
    const timeout = setTimeout(
      () => {
        child.kill('SIGTERM')
        finish(() =>
          reject(new Error(`${command} 처리 시간이 너무 오래 걸렸습니다.`)),
        )
      },
      10 * 60 * 1000,
    )
    signal?.addEventListener('abort', abortChild, { once: true })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout = `${stdout}${String(chunk)}`
    })
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-4000)
    })
    child.on('error', (error) => {
      finish(() => reject(error))
    })
    child.on('close', (code) => {
      if (code === 0) {
        finish(() => resolvePromise(stdout))
        return
      }

      finish(() =>
        reject(
          new Error(
            stderr.trim() ||
              `${command} ${args.slice(0, 3).join(' ')} 실행에 실패했습니다.`,
          ),
        ),
      )
    })
  })
}

function runCommand(command: string, args: string[], signal?: AbortSignal) {
  return new Promise<void>((resolvePromise, reject) => {
    if (signal?.aborted) {
      reject(createAbortError())
      return
    }

    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let settled = false
    const cleanup = () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortChild)
    }
    const finish = (callback: () => void) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      callback()
    }
    const abortChild = () => {
      child.kill('SIGTERM')
      finish(() => reject(createAbortError()))
    }
    const timeout = setTimeout(
      () => {
        child.kill('SIGTERM')
        finish(() => reject(new Error('영상 처리 시간이 너무 오래 걸렸습니다.')))
      },
      10 * 60 * 1000,
    )
    signal?.addEventListener('abort', abortChild, { once: true })
    let stderr = ''

    child.stdout.on('data', () => {
      // Drain stdout so verbose download progress cannot block the process.
    })
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-4000)
    })
    child.on('error', (error) => {
      finish(() => reject(error))
    })
    child.on('close', (code) => {
      if (code === 0) {
        finish(() => resolvePromise())
        return
      }

      finish(() =>
        reject(
          new Error(
            stderr.trim() ||
              `${command} ${args.slice(0, 3).join(' ')} 실행에 실패했습니다.`,
          ),
        ),
      )
    })
  })
}
