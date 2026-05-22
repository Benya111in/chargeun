import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
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

type HazardType = 'earthquake' | 'fire' | 'heavy_rain' | 'typhoon' | 'unknown'

type LearningTeachBackOption = {
  evidenceRefs: string[]
  feedback: string
  id: string
  kind: 'object' | 'person' | 'place' | 'signal' | 'state'
  label: string
  officialRuleIds?: string[]
  role: 'contrast' | 'correct'
}

type LearningTeachBack = {
  correctOptionId: string
  options: LearningTeachBackOption[]
  prompt: string
  reviewPrompt: string
}

type PerceptionPacket = Record<string, unknown>
type Segment = Record<string, unknown>
type SegmentExplanation = Record<string, unknown>
type StructuredLearningExplanation = Record<string, unknown>

type CaptionCue = {
  endMs: number
  startMs: number
  text: string
}

const captionTopicKeys = [
  'call_119',
  'coastal_boat',
  'drain_waterway',
  'evacuate_to_safe_place',
  'farm_facility',
  'home_drain',
  'indoor_window',
  'intro_weather',
  'outdoor_signage',
  'outdoor_activity',
  'outro_review',
  'river_car_drive',
  'stay_away_from_low_water',
  'typhoon_warning',
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
  issues: GeneratedQualityIssue[]
  passed: boolean
  score: number
  sourceTopicCount: number
  version: 'url_generation_lrs_v1'
}

type GenerationEvidenceReport = {
  audioCueCount: number
  expandedCueCount: number
  frameBoundaryPrecisionMs: 10
  generationModel?: string
  sceneCutCandidatesMs: number[]
  segmentationEvidence: Array<
    | 'audio-caption'
    | 'gpt-5.5-scenario-authoring'
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
  visualCaptionFrameCount: number
  warnings: string[]
}

type VideoProbe = {
  durationMs: number | null
  frameRate: number | null
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
const boundaryPrecisionMs = 10
const defaultGenerationModel = 'gpt-5.5'
const generatedVisualTailGuardMs = 350
const generatedVisualTailWindowMs = 1_800
const maxVisualCaptionFrames = 36
const visualCaptionBoundaryConfidenceThreshold = 0.65
const visualCaptionBoundaryMarginMs = 900

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
      enum: ['earthquake', 'fire', 'heavy_rain', 'typhoon', 'unknown'],
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

async function generatePracticeFromUrl(sourceUrl: string, req?: any) {
  const jobId = `generated-${hashText(sourceUrl).slice(0, 12)}`
  const workDir = join(publicGeneratedDir, jobId)
  const publicAssetBaseUrl = getPublicGeneratorApiBase(req)

  await rm(workDir, { force: true, recursive: true })
  await mkdir(workDir, { recursive: true })

  await downloadVideo(sourceUrl, workDir)

  const files = await readdir(workDir)
  const info = await readInfoJson(workDir, files)
  const videoFile = findDownloadedVideo(files)
  const captionFile = findCaptionFile(files)

  if (!videoFile) {
    throw new Error('다운로드한 영상 파일을 찾지 못했습니다.')
  }

  const sourceVideoPath = join(workDir, videoFile)
  const stableVideoPath = join(workDir, 'source.mp4')
  if (basename(sourceVideoPath) !== 'source.mp4') {
    await copyFile(sourceVideoPath, stableVideoPath)
  }

  if (!captionFile) {
    throw new Error(
      '자막이나 음성 텍스트 근거가 없어 자동 생성하지 않았습니다. 이 경로는 대충 만든 fallback 설명을 보여 주지 않습니다.',
    )
  }

  const videoProbe = await probeVideo(stableVideoPath).catch(() => ({
    durationMs: null,
    frameRate: null,
  }))
  const rawCues = parseVtt(await readFile(join(workDir, captionFile), 'utf8'))
  if (rawCues.length === 0) {
    throw new Error(
      '읽을 수 있는 자막/오디오 문장이 없어 자동 생성하지 않았습니다.',
    )
  }

  const sceneCutCandidatesMs = await detectSceneCuts(
    stableVideoPath,
    workDir,
  ).catch(() => [])
  const title = info.title ?? '입력한 재난안전 영상'
  const generationModel =
    process.env.OPENAI_GENERATION_MODEL?.trim() || defaultGenerationModel
  const visualCaptionEvidence = await extractVisualCaptionEvidenceWithOpenAI({
    generationModel,
    rawCues,
    sceneCutCandidatesMs,
    stableVideoPath,
    videoProbe,
    workDir,
  })
  const visualCaptionBoundaryMs = visualCaptionEvidence.boundaries
    .filter(isReliableVisualCaptionBoundary)
    .map((boundary) => boundary.recommendedBoundaryMs)
  const cues = prepareEvidenceCues(rawCues, [
    ...sceneCutCandidatesMs,
    ...visualCaptionBoundaryMs,
  ])
  const evidenceReport = buildGenerationEvidenceReport({
    cues,
    rawCues,
    sceneCutCandidatesMs,
    visualCaptionEvidence,
    videoProbe,
  })
  let qualityFeedback = ''
  let scenarioWithQuality:
    | (ReturnType<typeof buildScenarioFromLlmPlan> & {
        generationQualityReport: GeneratedQualityReport
      })
    | null = null
  let lastQualityReport: GeneratedQualityReport | null = null

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const scenarioPlan = await generateScenarioPlanWithOpenAI({
      cues,
      evidenceReport,
      generationModel,
      qualityFeedback,
      sceneCutCandidatesMs,
      sourceTitle: title,
      sourceUrl,
      videoProbe,
    })
    const scenario = buildScenarioFromLlmPlan({
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
      videoSrc: buildGeneratedAssetUrl(publicAssetBaseUrl, jobId, 'source.mp4'),
    })
    const qualityReport = auditGeneratedScenario(
      scenario,
      cues,
      scenario.generationEvidenceReport,
    )
    lastQualityReport = qualityReport

    if (qualityReport.passed) {
      scenarioWithQuality = {
        ...scenario,
        generationQualityReport: qualityReport,
      }
      break
    }

    qualityFeedback = [
      'Previous full scenario passed JSON validation but failed local learning-quality validation.',
      formatQualityFailureForModel(qualityReport),
      'Regenerate the full scenario and preserve every source audio topic in at least one teacherGuide.script and learner-facing scene.',
      'Do not merge any mandatory visual caption split boundary into one segment.',
    ].join('\n')
  }

  if (!scenarioWithQuality) {
    throw new Error(
      lastQualityReport
        ? formatQualityFailure(lastQualityReport)
        : 'GPT-5.5 제작 결과가 학습 품질 검사를 통과하지 못했습니다.',
    )
  }

  await writeFile(
    join(workDir, 'scenario.json'),
    JSON.stringify(scenarioWithQuality, null, 2),
  )
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

function buildScenarioFromLlmPlan(input: {
  evidenceReport: GenerationEvidenceReport
  hazard: HazardProfile
  jobId: string
  plan: LlmScenarioPlan
  sourceTitle: string
  sourceUrl: string
  videoSrc: string
}) {
  const segments = input.plan.segments.map((segment, index) =>
    buildSegmentFromLlmPlan({
      hazard: input.hazard,
      index,
      jobId: input.jobId,
      plan: segment,
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
    homeNote: 'GPT-5.5가 입력 영상 근거를 읽고 만든 장면별 학습 화면입니다.',
    homeTitle: input.plan.title || 'URL로 만든 연습',
    id: input.jobId,
    note:
      input.plan.note ||
      '영상 자막과 프레임 근거를 바탕으로 만든 학습 화면입니다.',
    posterSrc: '/demo/fire-grounded-02.jpg',
    practiceSequence: false,
    segments,
    showOnHome: false,
    title: input.plan.title || 'URL로 만든 연습',
    videoSrc: input.videoSrc,
  }
}

async function generateScenarioPlanWithOpenAI(input: {
  cues: CaptionCue[]
  evidenceReport: GenerationEvidenceReport
  generationModel: string
  qualityFeedback?: string
  sceneCutCandidatesMs: number[]
  sourceTitle: string
  sourceUrl: string
  videoProbe: VideoProbe
}): Promise<LlmScenarioPlan> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY가 설정되어 있지 않아 GPT-5.5 제작 에이전트를 실행하지 않았습니다.',
    )
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
  let validationFeedback = ''
  const requiredSourceTopics = buildRequiredSourceTopicEvidence(input.cues)
  if (input.qualityFeedback) {
    validationFeedback = input.qualityFeedback
  }
  let lastError: unknown

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await client.responses.create({
      input: buildScenarioPlanPrompt(input, validationFeedback),
      model: input.generationModel,
      text: {
        format: {
          name: 'slowlearner_url_scenario_plan',
          schema: llmScenarioPlanSchema,
          strict: true,
          type: 'json_schema',
        },
      },
    } as any)

    const outputText =
      (response as any).output_text ??
      (response as any).output
        ?.flatMap((item: any) => item.content ?? [])
        .map((content: any) => content.text ?? '')
        .join('\n')

    if (!outputText) {
      lastError = new Error('GPT-5.5 제작 에이전트가 빈 결과를 반환했습니다.')
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
      lastError = error
      validationFeedback = [
        'Previous generated JSON failed local validation.',
        `Validation error: ${error instanceof Error ? error.message : String(error)}`,
        'Regenerate the full scenario. Do not return only the changed segment.',
        'Fix all segment overlaps, invalid durations, missing action cards, ambiguous answers, and hard learner-facing words.',
      ].join('\n')
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('GPT-5.5 제작 결과가 검증을 통과하지 못했습니다.')
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
        'You are the GPT-5.5 production agent for a Korean disaster-safety learning tool for slow learners.',
        'You must author the complete learning scenario. The server only validates; it does not fill missing education content.',
        'Use only the provided transcript/audio cues and scene-cut evidence. Do not invent disaster instructions not supported by the input.',
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
                audioCues: input.cues.map((cue, index) => ({
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
                visualCaptionFrames:
                  input.evidenceReport.visualCaptionFrameCount,
              },
              outputRules: [
                'hazardType must be one of earthquake, fire, heavy_rain, typhoon, unknown.',
                'The final scenario must include at least minimumSegments segments.',
                'Every requiredSourceTopics item must appear in at least one segment teacherGuide.script and be reflected in learnerPrompt, learnerExplanation, actionSteps, doNot, or actionReasons.',
                'Every segment must include sourceTopicKeys. Use only the requiredSourceTopics.topic values covered by that segment time range. Use [] only for pure intro/outro scenes.',
                'Every requiredSourceTopics.topic must appear in at least one segment.sourceTopicKeys. Do not invent topic keys.',
                'Every meaningful audio cue must be covered by at least one segment time window. Do not skip spoken guidance just because the caption text is noisy.',
                'mandatoryVisualSplitBoundaries are hard scene-segmentation constraints. For each item, at least one segment boundary must be within 900ms of recommendedBoundaryMs.',
                'Never create one segment whose startMs is more than 900ms before a mandatoryVisualSplitBoundary.recommendedBoundaryMs and whose endMs is more than 900ms after it.',
                'If a mandatory visual split makes a short scene, keep the short scene. Do not merge it into the previous or next topic.',
                'High-confidence visualCaptionBoundaries with changeType=new_topic are strong split points. Use recommendedBoundaryMs as a segment boundary because it has already been aligned to the nearest completed narration sentence.',
                'If on-screen Korean captions change to a different education line while narration continues, split after the nearest completed audio sentence and preserve both caption topics in separate learner-facing scenes.',
                'Each segment startMs/endMs must use 10ms precision and stay inside evidence time ranges.',
                'Intro/outro segments may have no action cards. Action scenes must have 1-3 actionSteps, doNot, actionReasons, and exactly one correct answer option.',
                'Use answer questions as reinforcement, not a trick test. Still exactly one option must be correct.',
                'learnerSequence must start with one situation card, then action cards in order.',
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
  hazard: HazardProfile
  index: number
  jobId: string
  plan: LlmScenarioSegment
  sceneCutCandidatesMs: number[]
  sourceTitle: string
  sourceUrl: string
}): GeneratedPracticeSegment {
  const startMs = quantizeBoundaryMs(input.plan.startMs)
  const endMs = quantizeBoundaryMs(input.plan.endMs)
  const pauseMs = buildGeneratedPauseMs({
    endMs,
    sceneCutCandidatesMs: input.sceneCutCandidatesMs,
    startMs,
  })
  const actionSteps = input.plan.actionSteps.slice(0, 3)
  const sourceTopicKeys = input.plan.sourceTopicKeys.filter(isCaptionTopicKey)
  const practiceMode =
    input.plan.practiceMode === 'action' && actionSteps.length > 0
      ? 'action'
      : 'intro'
  const segmentId = `${input.jobId}-segment-${input.index + 1}`
  const narrationText = input.plan.teacherGuide.script
  const teachBack =
    practiceMode === 'action'
      ? buildTeachBackFromPlan(input.plan, input.hazard)
      : null
  const answerOptions =
    teachBack?.options.map((option) => ({
      ...option,
      correct: option.id === teachBack.correctOptionId,
    })) ?? []
  const packet: PerceptionPacket = {
    asrText: narrationText,
    keyframes: [],
    objectHints: [],
    ocrTokens: [],
    sessionId: input.jobId,
    tEndMs: endMs,
    tStartMs: startMs,
    uiElements: [],
  }
  const segment: Segment = {
    confidence: 0.88,
    endMs,
    hazard: input.hazard.hazard,
    id: segmentId,
    officialRuleIds: [input.hazard.ruleId],
    phase: input.hazard.phase,
    sessionId: input.jobId,
    startMs,
  }
  const explanation: SegmentExplanation = {
    doNot: practiceMode === 'action' ? input.plan.doNot : undefined,
    overlayTargets: [],
    safetyMode: 'grounded',
    segmentId,
    tracks: {
      action: actionSteps.join(' / ') || undefined,
      basic: narrationText,
      easy: input.plan.learnerExplanation,
      reason: input.plan.actionReasons[0] ?? input.hazard.reason,
    },
  }
  const structuredExplanation: StructuredLearningExplanation = {
    evidence: {
      asrEvidence: [
        {
          confidence: 0.9,
          endMs,
          startMs,
          text: narrationText,
        },
      ],
      modelInference: [
        {
          basedOn: ['asr', 'visual-scene-cut', 'gpt-5.5'],
          claim: 'GPT-5.5가 입력 영상 근거로 학습 장면을 작성했습니다.',
        },
      ],
      ocrEvidence: [],
      ruleEvidence: [
        {
          matchedText: narrationText.slice(0, 180),
          ruleId: input.hazard.ruleId,
          sourceName: '입력 영상 자막과 GPT-5.5 구조화 결과',
          sourceUrl: input.sourceUrl,
          title: input.sourceTitle,
        },
      ],
      visualEvidence: [],
    },
    segment: {
      confidence: 0.88,
      decisionPoint: input.plan.learnerExplanation,
      endMs,
      hazard: input.hazard.hazard,
      phase: input.hazard.phase,
      segmentId,
      sessionId: input.jobId,
      sourceId: input.sourceUrl,
      startMs,
      status: practiceMode === 'action' ? 'validated' : 'draft',
    },
    suppressedCandidates:
      practiceMode === 'action'
        ? [
            {
              candidate: input.plan.doNot,
              category: 'unsafe_action',
              evidenceRefs: ['gpt-5.5-plan', 'input-video-transcript'],
              reason: 'GPT-5.5가 하지 말아야 할 행동으로 분리했습니다.',
            },
          ]
        : [],
    tracks: {
      action:
        practiceMode === 'action'
          ? {
              cards: actionSteps.map((label, actionIndex) => ({
                label,
                officialRuleIds: [input.hazard.ruleId],
                order: actionIndex + 1,
              })),
            }
          : undefined,
      doNot:
        practiceMode === 'action'
          ? {
              officialRuleIds: [input.hazard.ruleId],
              text: input.plan.doNot,
            }
          : undefined,
      easy: {
        maxReadingLevel: 'very_easy',
        text: input.plan.learnerExplanation,
      },
      reason: {
        officialRuleIds: [input.hazard.ruleId],
        text: input.plan.actionReasons[0] ?? input.hazard.reason,
      },
      teachBack: teachBack ?? undefined,
    },
    validation: {
      hasGroundedAction: practiceMode === 'action',
      learnerSafe: true,
      requiresHumanReview: false,
      schemaValid: true,
      warnings: [
        'GPT-5.5 자동 생성 결과입니다. 공유 전 사람이 검토해야 합니다.',
      ],
    },
    version: 'slowlearner_multitrack_v1',
  }

  return {
    actionReasons: input.plan.actionReasons,
    actionSteps,
    answerOptions,
    checkQuestion: teachBack?.prompt ?? '',
    description: input.plan.learnerExplanation,
    endMs,
    explanation,
    id: segmentId,
    label: input.plan.learnerExplanation,
    learnerExplanation: input.plan.learnerExplanation,
    learnerPrompt: input.plan.learnerPrompt,
    learnerSequence: input.plan.learnerSequence,
    narration: [
      {
        endMs,
        source: 'audio',
        startMs,
        text: narrationText,
      },
    ],
    pauseMs,
    packet,
    practiceMode,
    primarySourceTitle: input.sourceTitle,
    requiredLearnerKeywords: input.plan.requiredLearnerKeywords,
    ruleMatches: [],
    safetyNotice,
    safetyWarnings: practiceMode === 'action' ? [input.plan.doNot] : [],
    segment,
    sourceTopicKeys,
    startMs,
    structuredExplanation,
    teacherGuide: input.plan.teacherGuide,
    teachBack,
  }
}

function buildTeachBackFromPlan(
  plan: LlmScenarioSegment,
  hazard: HazardProfile,
): LearningTeachBack {
  const options = plan.answerOptions
  const correctIndex = options.findIndex((option) => option.correct)
  const correctOptionId =
    correctIndex >= 0 ? `option-${correctIndex + 1}` : 'option-1'

  return {
    correctOptionId,
    options: options.map((option, index) => ({
      evidenceRefs: ['gpt-5.5-plan', 'input-video-transcript'],
      feedback: option.feedback,
      id: `option-${index + 1}`,
      kind: option.kind,
      label: option.label,
      officialRuleIds: option.correct ? [hazard.ruleId] : undefined,
      role: option.correct ? 'correct' : 'contrast',
    })),
    prompt: plan.checkQuestion,
    reviewPrompt: '같이 한 번 더 골라 봐요.',
  }
}

function hazardProfileForType(hazardType: HazardType) {
  return (
    hazardProfiles.find((profile) => profile.hazard === hazardType) ??
    hazardProfiles.at(-1)!
  )
}

function buildGeneratedPauseMs(input: {
  endMs: number
  sceneCutCandidatesMs: number[]
  startMs: number
}) {
  const latestSafeCut = input.sceneCutCandidatesMs
    .filter(
      (cutMs) =>
        cutMs > input.startMs + 1_500 &&
        cutMs < input.endMs &&
        input.endMs - cutMs <= generatedVisualTailWindowMs,
    )
    .at(-1)

  if (latestSafeCut === undefined) {
    return undefined
  }

  return quantizeBoundaryMs(
    Math.max(input.startMs + 700, latestSafeCut - generatedVisualTailGuardMs),
  )
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
        'gpt-5.5-scenario-authoring' as const,
      ]),
    ],
    stages: [
      ...report.stages,
      {
        evidence: `${segmentCount} GPT-authored learning segments from strict JSON schema`,
        name: 'gpt-5.5-scenario-authoring',
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
    throw new Error('GPT-5.5 제작 결과에 장면이 없습니다.')
  }

  const allowedTopicSet = new Set(allowedSourceTopics)
  let previousEndMs = -1
  for (const [index, segment] of plan.segments.entries()) {
    if (
      !Number.isFinite(segment.startMs) ||
      !Number.isFinite(segment.endMs) ||
      segment.endMs <= segment.startMs
    ) {
      throw new Error(`GPT-5.5 장면 ${index + 1}의 시간이 올바르지 않습니다.`)
    }

    if (segment.startMs < previousEndMs - 100) {
      throw new Error(`GPT-5.5 장면 ${index + 1}이 앞 장면과 겹칩니다.`)
    }
    previousEndMs = segment.endMs

    if (segment.endMs - segment.startMs > 30_000) {
      throw new Error(`GPT-5.5 장면 ${index + 1}이 30초를 넘습니다.`)
    }

    if (segment.actionSteps.length > 3) {
      throw new Error(`GPT-5.5 장면 ${index + 1}의 행동 카드가 너무 많습니다.`)
    }

    if (!Array.isArray(segment.sourceTopicKeys)) {
      throw new Error(`GPT-5.5 장면 ${index + 1}에 원본 토픽 표시가 없습니다.`)
    }

    for (const topic of segment.sourceTopicKeys) {
      if (!isCaptionTopicKey(topic)) {
        throw new Error(
          `GPT-5.5 장면 ${index + 1}의 원본 토픽 ${topic}은 허용되지 않습니다.`,
        )
      }

      if (allowedTopicSet.size > 0 && !allowedTopicSet.has(topic)) {
        throw new Error(
          `GPT-5.5 장면 ${index + 1}의 원본 토픽 ${topic}은 이 영상 근거에 없습니다.`,
        )
      }
    }

    if (segment.practiceMode === 'action') {
      if (segment.actionSteps.length === 0) {
        throw new Error(`GPT-5.5 장면 ${index + 1}에 행동 카드가 없습니다.`)
      }

      if (!segment.doNot.trim()) {
        throw new Error(`GPT-5.5 장면 ${index + 1}에 하지 말아요가 없습니다.`)
      }

      const correctCount = segment.answerOptions.filter(
        (option) => option.correct,
      ).length
      if (correctCount !== 1) {
        throw new Error(`GPT-5.5 장면 ${index + 1}의 정답이 1개가 아닙니다.`)
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

  return [...byTopic.entries()].map(([topic, entries]) => ({
    cueIndexes: entries.map((entry) => entry.index),
    evidenceText: entries
      .map((entry) => entry.text)
      .join(' ')
      .slice(0, 260),
    learnerKeywords: learnerKeywordsForTopic(topic),
    label: topicLabelForPrompt(topic),
    topic,
    timeRangeMs: {
      endMs: Math.max(...entries.map((entry) => entry.endMs)),
      startMs: Math.min(...entries.map((entry) => entry.startMs)),
    },
  }))
}

function topicLabelForPrompt(topic: CaptionTopicKey) {
  const labels: Record<CaptionTopicKey, string> = {
    call_119: '119 또는 주변 어른에게 알리기',
    coastal_boat: '바닷가와 배 안전',
    drain_waterway: '배수로와 물꼬',
    evacuate_to_safe_place: '안전한 곳으로 대피하기',
    farm_facility: '농촌 시설물과 비닐하우스',
    home_drain: '집 주변 배수구 확인',
    indoor_window: '실내 문과 창문',
    intro_weather: '비와 태풍 소개',
    outdoor_activity: '산행과 캠핑 피하기',
    outdoor_signage: '밖의 간판과 위험한 물건',
    outro_review: '마지막 복습',
    river_car_drive: '하천 근처 차와 운전',
    stay_away_from_low_water: '물이 찬 낮은 곳 피하기',
    typhoon_warning: '태풍 소식과 외출 줄이기',
  }

  return labels[topic]
}

function learnerKeywordsForTopic(topic: CaptionTopicKey) {
  const keywords: Record<CaptionTopicKey, string[]> = {
    call_119: ['119', '어른', '알리기'],
    coastal_boat: ['바닷가', '배', '묶기'],
    drain_waterway: ['배수로', '물꼬'],
    evacuate_to_safe_place: ['안전한 곳', '대피'],
    farm_facility: ['농촌', '비닐하우스', '시설물'],
    home_drain: ['집 주변', '배수구'],
    indoor_window: ['문', '창문', '창문 가까이 가지 않기'],
    intro_weather: ['비', '태풍'],
    outdoor_activity: ['산', '캠핑', '가지 않기'],
    outdoor_signage: ['간판', '위험한 물건', '피하기'],
    outro_review: ['다시 기억하기'],
    river_car_drive: ['하천', '차', '천천히 운전'],
    stay_away_from_low_water: ['물이 찬 곳', '건너지 않기'],
    typhoon_warning: ['태풍', '밖에 나가지 않기'],
  }

  return keywords[topic]
}

async function downloadVideo(sourceUrl: string, workDir: string) {
  await runCommand(getPythonCommand(), [
    '-m',
    'yt_dlp',
    '--no-playlist',
    '--write-auto-subs',
    '--write-subs',
    '--write-info-json',
    '--sub-langs',
    'ko,ko-KR,ko.*',
    '--convert-subs',
    'vtt',
    '--merge-output-format',
    'mp4',
    '-f',
    'bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4][height<=720]/b[height<=720]/best[height<=720]/best',
    '-o',
    join(workDir, 'source.%(ext)s'),
    sourceUrl,
  ])
}

async function probeVideo(videoPath: string): Promise<VideoProbe> {
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
  ])
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

async function detectSceneCuts(videoPath: string, workDir: string) {
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
  ])

  const text = await readFile(sceneFile, 'utf8')
  const cuts = Array.from(text.matchAll(/pts_time:([0-9.]+)/gu))
    .map((match) => quantizeBoundaryMs(Number(match[1]) * 1000))
    .filter((ms) => Number.isFinite(ms) && ms > 0)

  return compactCloseBoundaries(cuts, 1_500).slice(0, 80)
}

async function extractVisualCaptionEvidenceWithOpenAI(input: {
  generationModel: string
  rawCues: CaptionCue[]
  sceneCutCandidatesMs: number[]
  stableVideoPath: string
  videoProbe: VideoProbe
  workDir: string
}): Promise<VisualCaptionEvidence> {
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
    stableVideoPath: input.stableVideoPath,
    workDir: input.workDir,
  })

  if (sampledFrames.length < 2) {
    return {
      boundaries: [],
      frames: [],
      warnings: [
        '화면 자막 비교에 필요한 프레임을 충분히 추출하지 못했습니다.',
      ],
    }
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
    const response = await client.responses.create({
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
                  audioCueEndsMs: input.rawCues.map((cue, index) => ({
                    endMs: cue.endMs,
                    index,
                    startMs: cue.startMs,
                    text: normalizeCueText(cue.text).slice(0, 140),
                  })),
                  instructions: [
                    'Frames are provided in the same order as sampleFrames.',
                    'Read large Korean text, lower-third captions, banners, and action-rule cards visible in the video frame.',
                    'A boundary is changeType=new_topic only when the visible caption changes to a different action, place, warning, or education topic.',
                    'If the text only animates, repeats, or moves without a topic change, use changeType=same_topic.',
                    'For recommendedBoundaryMs, choose the nearest audio cue end at or after the visual text change when available. Otherwise use the frame change time.',
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
    } as any)

    const outputText =
      (response as any).output_text ??
      (response as any).output
        ?.flatMap((item: any) => item.content ?? [])
        .map((content: any) => content.text ?? '')
        .join('\n')

    if (!outputText) {
      return {
        boundaries: [],
        frames: [],
        warnings: ['GPT-5.5가 화면 자막 분석 결과를 반환하지 않았습니다.'],
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
    return {
      boundaries: [],
      frames: sampledFrames.map((frame) => ({
        confidence: 0,
        hasLearningCaption: false,
        index: frame.index,
        normalizedCaption: '',
        tsMs: frame.tsMs,
        visibleCaption: '',
      })),
      warnings: [
        `화면 자막 분석을 완료하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
      ],
    }
  }
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
    candidates.push(cutMs - 220)
    candidates.push(cutMs + 220)
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
  stableVideoPath: string
  workDir: string
}) {
  const frames: Array<{ imageRef: string; index: number; tsMs: number }> = []

  for (const [index, tsMs] of input.sampleTimesMs.entries()) {
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
      ])

      const bytes = await readFile(outputPath)
      frames.push({
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

  const boundaries = Array.isArray(input.raw.boundaries)
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
            recommendedBoundaryMs: alignVisualCaptionBoundaryToAudioSentence(
              timeMs,
              input.rawCues,
              durationMs,
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

  return {
    boundaries: compactVisualCaptionBoundaries(boundaries),
    frames,
    warnings: Array.isArray(input.raw.warnings)
      ? input.raw.warnings
          .map((warning) => normalizeCueText(warning))
          .slice(0, 8)
      : [],
  }
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

function alignVisualCaptionBoundaryToAudioSentence(
  timeMs: number,
  rawCues: CaptionCue[],
  durationMs: number,
) {
  const futureCueEnd = rawCues
    .map((cue) => cue.endMs)
    .filter((endMs) => endMs >= timeMs - 250 && endMs <= timeMs + 7_000)
    .sort((a, b) => a - b)[0]

  if (futureCueEnd !== undefined) {
    return quantizeBoundaryMs(clampMs(futureCueEnd, durationMs))
  }

  const nearestCueEnd = rawCues
    .map((cue) => cue.endMs)
    .filter((endMs) => Math.abs(endMs - timeMs) <= 900)
    .sort((a, b) => Math.abs(a - timeMs) - Math.abs(b - timeMs))[0]

  return quantizeBoundaryMs(clampMs(nearestCueEnd ?? timeMs, durationMs))
}

function isReliableVisualCaptionBoundary(boundary: VisualCaptionBoundary) {
  return (
    boundary.changeType === 'new_topic' &&
    boundary.confidence >= visualCaptionBoundaryConfidenceThreshold
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
    ['audio-caption']

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
        evidence: `${input.rawCues.length} caption/audio cues`,
        name: 'audio-caption-parse',
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
    visualCaptionFrameCount: input.visualCaptionEvidence?.frames.length ?? 0,
    warnings,
  }
}

function countSentenceBoundaries(cues: CaptionCue[]) {
  return cues.reduce(
    (count, cue) =>
      count + Math.max(0, splitCaptionTextIntoParts(cue.text, 2).length - 1),
    0,
  )
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
  const groups = groupCues(input.cues, input.frameCutsMs)
  const segments = groups.map((group, index) =>
    buildSegment({
      cueGroup: group,
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
    note: '영상 자막과 시간을 기준으로 새로 나눈 학습 화면입니다.',
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
): GeneratedQualityReport {
  const issues: GeneratedQualityIssue[] = []
  const sourceTopics = extractSourceTopics(cues)
  const sourceTopicEvidence = buildRequiredSourceTopicEvidence(cues)
  const sourceDurationMs =
    Math.max(...cues.map((cue) => cue.endMs), 0) -
    Math.min(...cues.map((cue) => cue.startMs), 0)
  const expectedMinimumSegments =
    sourceTopics.size >= 3
      ? Math.min(
          12,
          Math.max(sourceTopics.size, Math.floor(sourceDurationMs / 15_000)),
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
      '자막/오디오 문장 근거가 없습니다.',
    )
  }

  if (
    sourceTopics.size >= 3 &&
    scenario.segments.length < expectedMinimumSegments
  ) {
    addIssue(
      'blocker',
      'too_few_segments_for_audio_topics',
      `자막/오디오 주제가 ${sourceTopics.size}개인데 장면이 ${scenario.segments.length}개뿐입니다.`,
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
      `자막/오디오 문장 "${normalizeCueText(uncoveredCue.text).slice(0, 40)}"이 학습 장면 시간에 포함되지 않았습니다.`,
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
        `자막/오디오 주제 ${topicLabelForPrompt(topicEvidence.topic)}가 학습 장면에 남지 않았습니다.`,
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

    if (mergedSegment) {
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
    const previous = scenario.segments[index - 1]

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

    if (segment.actionSteps.length > 3) {
      addIssue(
        'blocker',
        'too_many_actions',
        '한 장면에 행동 카드가 4개 이상입니다.',
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

    if (segment.practiceMode === 'action' && !hasGeneratedDoNotTrack(segment)) {
      addIssue(
        'blocker',
        'missing_do_not_track',
        '행동 장면인데 하지 말아요 트랙이 없습니다.',
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

    if (new Set(segment.actionSteps).size !== segment.actionSteps.length) {
      addIssue(
        'blocker',
        'duplicate_action_cards',
        '같은 행동 카드가 한 장면에 반복됩니다.',
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

      if (/알려요/u.test(action) && !/(119|어른|선생님|보호자)/u.test(action)) {
        addIssue(
          'blocker',
          'unclear_report_action',
          '알려요 행동에는 누구에게 알리는지 들어가야 합니다.',
          segment.id,
        )
      }
    }

    if (topics.size > 2) {
      addIssue(
        'warning',
        'mixed_topic_segment',
        '한 장면 안에 여러 판단 주제가 섞였을 수 있습니다.',
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

  return {
    analysisDepth: evidenceReport,
    checkedAt: new Date().toISOString(),
    issues,
    passed: blockerCount === 0,
    score: Math.max(0, 100 - blockerCount * 25 - warningCount * 5),
    sourceTopicCount: sourceTopics.size,
    version: 'url_generation_lrs_v1',
  }
}

function hasGeneratedDoNotTrack(segment: GeneratedPracticeSegment) {
  const structuredExplanation = segment.structuredExplanation as {
    tracks?: { doNot?: unknown }
  }

  return Boolean(structuredExplanation.tracks?.doNot)
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
        'Keep every audio topic and every important source noun in at least one teacherGuide.script and learner-facing text.',
      ],
    },
    null,
    2,
  )
}

function buildSegment(input: {
  cueGroup: CaptionCue[]
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
  const actions = extractActions(text, input.hazard)
  const practiceMode = actions.length > 0 ? 'action' : 'intro'
  const actionSteps = practiceMode === 'action' ? actions.slice(0, 3) : []
  const actionReasons = actionSteps.map((action) =>
    reasonForAction(action, input.hazard),
  )
  const learnerPrompt =
    practiceMode === 'action'
      ? situationFromText(text, input.hazard)
      : situationFromText(text, input.hazard)
  const learnerExplanation =
    practiceMode === 'action'
      ? summarizeAction(actionSteps)
      : shortenLearnerText(text, `${input.hazard.label} 영상을 보고 있어요.`)
  const segmentId = `${input.jobId}-segment-${input.index + 1}`
  const teachBack =
    practiceMode === 'action'
      ? buildTeachBack(actionSteps[0]!, input.hazard)
      : null
  const answerOptions =
    teachBack?.options.map((option) => ({
      ...option,
      correct: option.id === teachBack.correctOptionId,
    })) ?? []
  const packet: PerceptionPacket = {
    asrText: text,
    keyframes: [],
    objectHints: [],
    ocrTokens: [],
    sessionId: input.jobId,
    tEndMs: endMs,
    tStartMs: startMs,
    uiElements: [],
  }
  const segment: Segment = {
    confidence: 0.72,
    endMs,
    hazard: input.hazard.hazard,
    id: segmentId,
    officialRuleIds: [input.hazard.ruleId],
    phase: input.hazard.phase,
    sessionId: input.jobId,
    startMs,
  }
  const explanation: SegmentExplanation = {
    doNot:
      practiceMode === 'action' ? doNotForText(text, input.hazard) : undefined,
    overlayTargets: [],
    safetyMode: 'grounded',
    segmentId,
    tracks: {
      action: actionSteps.join(' / ') || undefined,
      basic: text,
      easy: learnerExplanation,
      reason: actionReasons[0] ?? input.hazard.reason,
    },
  }
  const structuredExplanation: StructuredLearningExplanation = {
    evidence: {
      asrEvidence: input.cueGroup.map((cue) => ({
        confidence: 0.82,
        endMs: cue.endMs,
        startMs: cue.startMs,
        text: cue.text,
      })),
      modelInference: [
        {
          basedOn: ['asr', 'rule'],
          claim: '입력 영상의 자막을 짧은 학습 카드로 나누었습니다.',
        },
      ],
      ocrEvidence: [],
      ruleEvidence: [
        {
          matchedText: text.slice(0, 180),
          ruleId: input.hazard.ruleId,
          sourceName: '입력 영상 자막',
          sourceUrl: input.sourceUrl,
          title: input.sourceTitle,
        },
      ],
      visualEvidence: [],
    },
    segment: {
      confidence: 0.72,
      decisionPoint: learnerExplanation,
      endMs,
      hazard: input.hazard.hazard,
      phase: input.hazard.phase,
      segmentId,
      sessionId: input.jobId,
      sourceId: input.sourceUrl,
      startMs,
      status: practiceMode === 'action' ? 'validated' : 'draft',
    },
    suppressedCandidates:
      practiceMode === 'action'
        ? [
            {
              candidate: doNotForText(text, input.hazard),
              category: 'unsafe_action',
              evidenceRefs: ['input-video-transcript'],
              reason: '학습자에게 하지 말아야 할 행동으로 따로 보여줍니다.',
            },
          ]
        : [],
    tracks: {
      action:
        practiceMode === 'action'
          ? {
              cards: actionSteps.map((label, actionIndex) => ({
                label,
                officialRuleIds: [input.hazard.ruleId],
                order: actionIndex + 1,
              })),
            }
          : undefined,
      doNot:
        practiceMode === 'action'
          ? {
              officialRuleIds: [input.hazard.ruleId],
              text: doNotForText(text, input.hazard),
            }
          : undefined,
      easy: {
        maxReadingLevel: 'very_easy',
        text: learnerExplanation,
      },
      reason: {
        officialRuleIds: [input.hazard.ruleId],
        text: actionReasons[0] ?? input.hazard.reason,
      },
      teachBack: teachBack ?? undefined,
    },
    validation: {
      hasGroundedAction: practiceMode === 'action',
      learnerSafe: true,
      requiresHumanReview: false,
      schemaValid: true,
      warnings: ['로컬 자동 생성 결과입니다. 공유 전 사람이 검토해야 합니다.'],
    },
    version: 'slowlearner_multitrack_v1',
  }

  return {
    actionReasons,
    actionSteps,
    answerOptions,
    checkQuestion: teachBack?.prompt ?? '',
    description: learnerExplanation,
    endMs,
    explanation,
    id: segmentId,
    label: learnerExplanation,
    learnerExplanation,
    learnerPrompt,
    learnerSequence: [
      { kind: 'situation', text: learnerPrompt },
      ...actionSteps.map((action) => ({
        kind: 'action' as const,
        text: action,
      })),
    ],
    narration: input.cueGroup.map((cue) => ({
      endMs: cue.endMs,
      source: 'audio',
      startMs: cue.startMs,
      text: cue.text,
    })),
    packet,
    practiceMode,
    primarySourceTitle: input.sourceTitle,
    requiredLearnerKeywords: actionSteps.flatMap((action) =>
      action.split(' ').slice(0, 1),
    ),
    ruleMatches: [],
    safetyNotice,
    safetyWarnings:
      practiceMode === 'action' ? [doNotForText(text, input.hazard)] : [],
    segment,
    startMs,
    structuredExplanation,
    teacherGuide: {
      correction:
        '자동 생성된 문구가 어색하면 선생님이 쉬운 말로 다시 말합니다.',
      observe: '학습자가 장면과 행동을 구분하는지 봅니다.',
      prompt: teachBack?.prompt ?? '무슨 내용인지 같이 말해 봅니다.',
      script: text,
    },
    teachBack,
  }
}

function groupCues(cues: CaptionCue[], frameCutsMs: number[] = []) {
  const normalized = splitCuesAtBoundaries(
    expandLongCaptionCues(cues.filter((cue) => cue.text.trim().length > 0)),
    frameCutsMs,
  )
  if (normalized.length === 0) {
    return buildFallbackCues('재난안전 영상을 보고 있어요.').map((cue) => [cue])
  }

  const topicGroups = groupCuesByTopic(normalized)
  if (topicGroups.length >= 3) {
    return topicGroups.slice(0, 28)
  }

  const groups: CaptionCue[][] = []
  let current: CaptionCue[] = []

  for (const cue of normalized) {
    const currentStart = current[0]?.startMs ?? cue.startMs
    const previous = current.at(-1)
    const gap = previous ? cue.startMs - previous.endMs : 0
    const wouldBeLong = cue.endMs - currentStart > maximumGeneratedSegmentMs

    if (current.length > 0 && (gap > 6_000 || wouldBeLong)) {
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

function prepareEvidenceCues(cues: CaptionCue[], frameCutsMs: number[]) {
  return splitCuesAtBoundaries(expandLongCaptionCues(cues), frameCutsMs)
}

function expandLongCaptionCues(cues: CaptionCue[]) {
  return cues.flatMap((cue) => {
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

    const parts = splitCaptionTextIntoParts(
      cue.text,
      innerBoundaries.length + 1,
    )
    if (parts.length <= 1) {
      return [quantizeCue(cue)]
    }

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

function groupCuesByTopic(cues: CaptionCue[]) {
  const distinctTopics = new Set(
    cues.map((cue) => topicKeyForCueText(cue.text)).filter(Boolean),
  )

  if (distinctTopics.size < 3) {
    return []
  }

  const groups: CaptionCue[][] = []
  let current: CaptionCue[] = []
  let currentTopic: CaptionTopicKey | null = null

  for (const cue of cues) {
    const previous = current.at(-1)
    const gap = previous ? cue.startMs - previous.endMs : 0
    const explicitTopic = topicKeyForCueText(cue.text)
    const topic: CaptionTopicKey | null =
      explicitTopic ?? (gap > 2_500 ? null : currentTopic)
    const shouldSplit =
      current.length > 0 &&
      ((topic && currentTopic && topic !== currentTopic) || gap > 2_500)

    if (shouldSplit) {
      groups.push(current)
      current = []
      if (gap > 2_500 && !explicitTopic) {
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

  if (/태풍피해 없이|안전수칙|챙겨주세요|챙기/u.test(normalized))
    return 'outro_review'
  if (/바닷가|선박|배를|배는|묶어 두/u.test(normalized)) return 'coastal_boat'
  if (/농촌|비닐하우스|농가|축사|시설물.*묶|단단히 묶/u.test(normalized)) {
    return 'farm_facility'
  }
  if (/하천|주차|차량|운전|서행/u.test(normalized)) return 'river_car_drive'
  if (/집 주변|침수피해|배수구/u.test(normalized)) return 'home_drain'
  if (
    /부득이하게 외출|외출을 해야|간판|위험 시설물|시설물 주변/u.test(normalized)
  ) {
    return 'outdoor_signage'
  }
  if (/실내|문과 창문|창문 가까/u.test(normalized)) return 'indoor_window'
  if (/외출을 차지|외출을 자제|북상|대비하세요/u.test(normalized)) {
    return 'typhoon_warning'
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
  if (/여름철|호우|태풍|비바람/u.test(normalized)) return 'intro_weather'

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

    const text = normalizeCueText(
      rawCueText.replace(/<[^>]+>/gu, ' ').replace(/&nbsp;/gu, ' '),
    )

    if (text && Number.isFinite(startMs) && Number.isFinite(endMs)) {
      const previous = cues.at(-1)
      if (previous?.text === text && previous.endMs >= startMs - 300) {
        previous.endMs = Math.max(previous.endMs, endMs)
      } else {
        cues.push({ endMs, startMs, text })
      }
    }
  }

  return cues
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
  const topicActions = topicActionsForText(text)
  if (topicActions.length > 0) {
    return topicActions.slice(0, 3)
  }

  const candidates: string[] = []
  const add = (condition: boolean, action: string) => {
    if (condition && !candidates.includes(action)) {
      candidates.push(action)
    }
  }

  add(
    /문/u.test(text) && /(닫|닫고)/u.test(text) && !/문과 창문/u.test(text),
    '문을 닫아요',
  )
  add(/계단/u.test(text), '계단으로 가요')
  add(
    /엘리베이터/u.test(text) && /(타지|이용하지|말)/u.test(text),
    '계단을 찾아요',
  )
  add(
    hazard.hazard === 'earthquake' && /머리|방석|쿠션|가방|보호/u.test(text),
    '머리를 보호해요',
  )
  add(/탁자|책상/u.test(text), '탁자 아래로 들어가요')
  add(/넓은|운동장|공원|대피소/u.test(text), '넓은 곳으로 가요')
  add(/선생님|보호자|어른/u.test(text), '어른 말을 들어요')
  add(
    /119|신고/u.test(text) && !isWeatherSafetyText(text),
    '119나 어른에게 알려요',
  )
  add(/연기|몸을 낮/u.test(text), '몸을 낮춰요')
  add(/가스|냄새/u.test(text), '가스 냄새를 어른에게 말해요')
  add(
    /창문|유리/u.test(text) && /(떨어|멀리|가까이 가지)/u.test(text),
    '창문에서 떨어져요',
  )
  add(/태풍.*북상|외출을 차지|외출을 자제/u.test(text), '안전한 실내에 있어요')
  add(/문과 창문|문.*창문/u.test(text), '문과 창문을 닫아요')
  add(/간판|위험 시설물|시설물 주변/u.test(text), '간판과 위험 시설물을 피해요')
  add(/집 주변|침수피해|배수구/u.test(text), '어른과 배수구를 미리 확인해요')
  add(/하천|주차|차량/u.test(text), '하천 근처 차를 미리 옮겨요')
  add(/운전|서행/u.test(text), '운전하면 천천히 가요')
  add(/농촌|시설물.*묶|단단히 묶/u.test(text), '어른과 시설물을 미리 묶어요')
  add(/배수로|물꼬|물고/u.test(text), '배수로를 미리 정리해요')
  add(/바닷가|안전한 곳으로 대피/u.test(text), '안전한 곳으로 대피해요')
  add(/선박|배는|배를|묶어 두/u.test(text), '배를 단단히 묶어 둬요')
  add(/산행|캠핑/u.test(text), '안전한 실내에 있어요')
  add(/갑자기 비|안전한 곳|대피/u.test(text), '안전한 곳으로 가요')
  add(
    /낮은 다리|낮은 곳|물이 찬|침수.*다리|건너지|건너/u.test(text),
    '물이 찬 낮은 곳을 돌아가요',
  )
  add(/고립|신고|1\s*1|119/u.test(text), '119에 알려요')
  add(/배수로|물꼬|점검/u.test(text), '어른과 안전한 곳에 있어요')

  if (
    candidates.length === 0 &&
    /(하세요|해요|갑니다|가세요|대피|피하)/u.test(text)
  ) {
    candidates.push(hazard.fallbackAction)
  }

  return candidates.slice(0, 3)
}

function topicActionsForText(text: string) {
  const topic = topicKeyForCueText(text)

  switch (topic) {
    case 'call_119':
      return ['119에 알려요']
    case 'coastal_boat':
      return ['안전한 곳으로 대피해요', '배를 단단히 묶어 둬요']
    case 'drain_waterway':
      return ['배수로를 미리 정리해요']
    case 'evacuate_to_safe_place':
      return ['안전한 곳으로 가요']
    case 'farm_facility':
      return ['어른과 시설물을 미리 묶어요', '배수로를 미리 정리해요']
    case 'home_drain':
      return ['어른과 배수구를 미리 확인해요']
    case 'indoor_window':
      return ['문과 창문을 닫아요', '창문에서 떨어져요']
    case 'outdoor_activity':
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
    default:
      return []
  }
}

function isWeatherSafetyText(text: string) {
  return /산행|캠핑|갑자기 비|낮은 다리|낮은 곳|물이 찬|건너지|건너|고립|배수로|물꼬|호우|태풍|간판|배수구|하천|서행|선박|바닷가/u.test(
    text,
  )
}

function reasonForAction(action: string, hazard: HazardProfile) {
  if (action.includes('문과 창문'))
    return '문과 창문을 닫으면 비바람이 덜 들어와요.'
  if (action.includes('창문')) return '유리가 깨지면 다칠 수 있어요.'
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

  return hazard.reason
}

function doNotForText(text: string, hazard: HazardProfile) {
  const topicDoNot = topicDoNotForText(text)
  if (topicDoNot) {
    return topicDoNot
  }

  if (/엘리베이터/u.test(text)) return '엘리베이터는 타지 않아요.'
  if (/창문|유리/u.test(text)) return '창문 가까이에 가지 않아요.'
  if (/연기/u.test(text)) return '연기 쪽으로 가지 않아요.'
  if (/가스/u.test(text)) return '불을 켜거나 전기 스위치를 만지지 않아요.'
  if (/산행|캠핑/u.test(text)) return '산이나 캠핑장에 가지 않아요.'
  if (/외출을 차지|외출을 자제|북상/u.test(text)) return '밖에 나가지 않아요.'
  if (/문과 창문|창문 가까|실내/u.test(text))
    return '창문 가까이에 가지 않아요.'
  if (/간판|위험 시설물|시설물 주변/u.test(text)) {
    return '간판이나 위험한 물건 가까이에 가지 않아요.'
  }
  if (/집 주변|침수피해|배수구/u.test(text)) {
    return '비가 많이 올 때 밖으로 나가 확인하지 않아요.'
  }
  if (/하천|주차|차량|운전|서행/u.test(text)) {
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

function topicDoNotForText(text: string) {
  const topic = topicKeyForCueText(text)

  switch (topic) {
    case 'call_119':
      return '혼자 빠져나오려고 하지 않아요.'
    case 'coastal_boat':
      return '바닷가 가까이에 있지 않아요.'
    case 'drain_waterway':
    case 'farm_facility':
      return '비가 올 때 물꼬를 보러 나가지 않아요.'
    case 'evacuate_to_safe_place':
      return '물이 불어난 곳에 가까이 가지 않아요.'
    case 'home_drain':
      return '비가 많이 올 때 밖으로 나가 확인하지 않아요.'
    case 'indoor_window':
      return '창문 가까이에 가지 않아요.'
    case 'outdoor_activity':
      return '산이나 캠핑장에 가지 않아요.'
    case 'outdoor_signage':
      return '간판이나 위험한 물건 가까이에 가지 않아요.'
    case 'river_car_drive':
      return '물이 찬 길로 차를 몰고 가지 않아요.'
    case 'stay_away_from_low_water':
      return '물이 찬 낮은 곳은 건너지 않아요.'
    case 'typhoon_warning':
      return '밖에 나가지 않아요.'
    default:
      return null
  }
}

function buildTeachBack(
  action: string,
  hazard: HazardProfile,
): LearningTeachBack {
  const correct = optionForAction(action)
  const contrast = contrastForOption(correct, hazard)

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
  if (action.includes('문과 창문'))
    return { kind: 'object', label: '문과 창문', prompt: '무엇을 닫을까요?' }
  if (action.includes('창문'))
    return { kind: 'object', label: '창문', prompt: '무엇에서 떨어질까요?' }
  if (action.includes('간판'))
    return { kind: 'object', label: '간판', prompt: '무엇을 피할까요?' }
  if (action.includes('배수구'))
    return {
      kind: 'object',
      label: '배수구',
      prompt: '무엇을 미리 확인할까요?',
    }
  if (action.includes('하천'))
    return {
      kind: 'place',
      label: '하천 근처',
      prompt: '차를 어디에서 옮길까요?',
    }
  if (action.includes('천천히'))
    return { kind: 'state', label: '천천히', prompt: '어떻게 운전할까요?' }
  if (action.includes('시설물'))
    return { kind: 'object', label: '시설물', prompt: '무엇을 미리 묶을까요?' }
  if (action.includes('배수로'))
    return {
      kind: 'object',
      label: '배수로',
      prompt: '무엇을 미리 정리할까요?',
    }
  if (action.includes('배를'))
    return { kind: 'object', label: '배', prompt: '무엇을 단단히 묶을까요?' }
  if (action.includes('문'))
    return { kind: 'object', label: '문', prompt: '무엇을 볼까요?' }
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
  if (action.includes('119'))
    return {
      kind: 'signal',
      label: '119',
      prompt: '도움이 필요하면 무엇을 기억할까요?',
    }
  if (action.includes('가스'))
    return { kind: 'signal', label: '가스 냄새', prompt: '무엇을 말할까요?' }
  if (action.includes('실내'))
    return { kind: 'place', label: '실내', prompt: '어디에 있을까요?' }
  if (action.includes('안전한 곳'))
    return { kind: 'place', label: '안전한 곳', prompt: '어디로 갈까요?' }
  if (action.includes('낮은 곳'))
    return { kind: 'place', label: '높은 길', prompt: '어떤 길로 갈까요?' }

  return { kind: 'state', label: '안전', prompt: '무엇을 기억할까요?' }
}

function contrastForOption(
  option: ReturnType<typeof optionForAction>,
  hazard: HazardProfile,
) {
  if (option.kind === 'place')
    return option.label === '계단' ? '엘리베이터' : '좁은 곳'
  if (option.kind === 'person') return '혼자'
  if (option.kind === 'object') return option.label === '문' ? '창문' : '가방'
  if (option.kind === 'signal')
    return option.label === '119' ? '게임' : '냄새 없음'

  return hazard.label
}

function situationFromText(text: string, hazard: HazardProfile) {
  const topicSituation = topicSituationForText(text)
  if (topicSituation) {
    return topicSituation
  }

  if (/태풍피해 없이/u.test(text)) return '태풍 안전수칙을 다시 기억해요.'
  if (/태풍.*북상|외출을 차지|외출을 자제/u.test(text))
    return '태풍이 가까이 오고 있어요.'
  if (/문과 창문|창문 가까|실내/u.test(text)) return '집 안에 있어요.'
  if (/간판|위험 시설물|시설물 주변/u.test(text))
    return '밖에는 떨어질 수 있는 물건이 있어요.'
  if (/집 주변|침수피해|배수구/u.test(text))
    return '집 주변에 물이 찰 수 있어요.'
  if (/하천|주차|차량|운전|서행/u.test(text))
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

  const shortText = shortenLearnerText(text, `${hazard.label} 장면이에요.`)
  if (shortText.includes(hazard.label)) return shortText

  return `${hazard.label} 상황을 보고 있어요.`
}

function topicSituationForText(text: string) {
  const topic = topicKeyForCueText(text)

  switch (topic) {
    case 'coastal_boat':
      return '바닷가는 위험할 수 있어요.'
    case 'drain_waterway':
      return '물이 불어난 곳은 위험해요.'
    case 'farm_facility':
      return '농촌에서는 미리 준비해야 해요.'
    case 'home_drain':
      return '집 주변에 물이 찰 수 있어요.'
    case 'indoor_window':
      return '집 안에 있어요.'
    case 'outdoor_signage':
      return '밖에는 떨어질 수 있는 물건이 있어요.'
    case 'outro_review':
      return /태풍피해/u.test(text)
        ? '태풍 안전수칙을 다시 기억해요.'
        : '안전수칙을 다시 기억해요.'
    case 'intro_weather':
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
    default:
      return null
  }
}

function summarizeAction(actions: string[]) {
  if (actions.length === 0) return '영상을 보고 같이 연습해요.'
  if (actions.length === 1) return actions[0]!

  return `${actions[0]!.replace(/요$/u, '')}고 ${actions[1]}`
}

function shortenLearnerText(text: string, fallback: string) {
  const cleaned = normalizeCueText(text).replace(/하십시오|하세요/gu, '해요')
  if (/태풍피해 없이|안전수칙|챙겨주세요|챙기/u.test(cleaned)) {
    return '안전수칙을 다시 기억해요.'
  }
  if (/휴가/u.test(cleaned) && /태풍/u.test(cleaned)) {
    return '태풍 소식을 확인해요.'
  }
  if (/국민행동|교령|태풍/u.test(cleaned) && /행수|펭수|함께/u.test(cleaned)) {
    return '태풍 안전수칙을 배워요.'
  }
  if (/여름철|호우|태풍|비바람/u.test(cleaned)) {
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
    .replace(/\s+/gu, ' ')
    .trim()
}

function detectHazard(text: string) {
  if (/지진|흔들|탁자|방석/u.test(text)) return hazardProfiles[0]!
  if (/화재|불이|연기|계단|소화/u.test(text)) return hazardProfiles[1]!
  if (/태풍|강풍|바람/u.test(text)) return hazardProfiles[3]!
  if (/호우|비가|침수|홍수|물/u.test(text)) return hazardProfiles[2]!

  return hazardProfiles[4]!
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

function findCaptionFile(files: string[]) {
  return (
    files.find((file) => /\.ko[-\w]*\.vtt$/u.test(file)) ??
    files.find((file) => file.endsWith('.vtt'))
  )
}

async function copyToDistIfPresent(workDir: string, jobId: string) {
  try {
    await mkdir(join(distGeneratedDir, jobId), { recursive: true })
    await copyFile(
      join(workDir, 'source.mp4'),
      join(distGeneratedDir, jobId, 'source.mp4'),
    )
    await copyFile(
      join(workDir, 'scenario.json'),
      join(distGeneratedDir, jobId, 'scenario.json'),
    )
  } catch {
    // The dev server does not need dist files. Preview builds use this when dist exists.
  }
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

function getPythonCommand() {
  return process.env.GENERATOR_PYTHON_BIN?.trim() || 'python3'
}

function getFfmpegCommand() {
  return process.env.FFMPEG_PATH?.trim() || ffmpegStaticPath || 'ffmpeg'
}

function getFfprobeCommand() {
  return process.env.FFPROBE_PATH?.trim() || ffprobeStatic.path || 'ffprobe'
}

export const __testGeneratePracticeFromUrl = {
  alignVisualCaptionBoundaryToAudioSentence,
  auditGeneratedScenario,
  buildGeneratedPauseMs,
  buildGenerationEvidenceReport,
  buildRequiredSourceTopicEvidence,
  buildScenario,
  detectHazard,
  parseVtt,
  topicKeyForCueText,
}

function runCommandWithOutput(command: string, args: string[]) {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timeout = setTimeout(
      () => {
        child.kill('SIGTERM')
        reject(new Error(`${command} 처리 시간이 너무 오래 걸렸습니다.`))
      },
      10 * 60 * 1000,
    )
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout = `${stdout}${String(chunk)}`
    })
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-4000)
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolvePromise(stdout)
        return
      }

      reject(
        new Error(
          stderr.trim() ||
            `${command} ${args.slice(0, 3).join(' ')} 실행에 실패했습니다.`,
        ),
      )
    })
  })
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timeout = setTimeout(
      () => {
        child.kill('SIGTERM')
        reject(new Error('영상 처리 시간이 너무 오래 걸렸습니다.'))
      },
      10 * 60 * 1000,
    )
    let stderr = ''

    child.stdout.on('data', () => {
      // Drain stdout so verbose download progress cannot block the process.
    })
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-4000)
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolvePromise()
        return
      }

      reject(
        new Error(
          stderr.trim() ||
            `${command} ${args.slice(0, 3).join(' ')} 실행에 실패했습니다.`,
        ),
      )
    })
  })
}
