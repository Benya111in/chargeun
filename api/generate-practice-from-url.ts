import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
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

import {
  ValidationError,
  assertMethod,
  assertSameOrigin,
  readJsonBody,
  sendJson,
} from './_shared'

type HazardType =
  | 'earthquake'
  | 'fire'
  | 'heavy_rain'
  | 'typhoon'
  | 'unknown'

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
  packet: PerceptionPacket
  practiceMode: 'action' | 'intro'
  primarySourceTitle: string | null
  requiredLearnerKeywords: string[]
  ruleMatches: []
  safetyWarnings: string[]
  safetyNotice: string
  segment: Segment
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
]

export default async function handler(req: any, res: any) {
  if (!assertMethod(req, res, ['POST']) || !assertSameOrigin(req, res)) {
    return
  }

  try {
    const body = await readJsonBody(req)
    const sourceUrl = normalizeUrl(body?.sourceUrl)
    const generated = await generatePracticeFromUrl(sourceUrl)

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

async function generatePracticeFromUrl(sourceUrl: string) {
  const jobId = `generated-${hashText(sourceUrl).slice(0, 12)}`
  const workDir = join(publicGeneratedDir, jobId)

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

  const cues = captionFile
    ? parseVtt(await readFile(join(workDir, captionFile), 'utf8'))
    : buildFallbackCues(info.title ?? '입력한 재난안전 영상')
  const title = info.title ?? '입력한 재난안전 영상'
  const hazard = detectHazard(`${title}\n${cues.map((cue) => cue.text).join('\n')}`)
  const scenario = buildScenario({
    cues,
    hazard,
    jobId,
    sourceTitle: title,
    sourceUrl,
    videoSrc: `/generated/${jobId}/source.mp4`,
  })

  await writeFile(
    join(workDir, 'scenario.json'),
    JSON.stringify(scenario, null, 2),
  )
  await copyToDistIfPresent(workDir, jobId)

  return {
    record: {
      baseScenarioId: 'local-generated-video',
      createdAt: new Date().toISOString(),
      customScenario: scenario,
      id: jobId,
      matchBasis: 'metadata',
      sourceTitle: title,
      sourceUrl,
      thumbnailUrl: info.thumbnail,
      topicLabel: `${hazard.label} 영상 학습`,
      version: 1,
    },
  }
}

async function downloadVideo(sourceUrl: string, workDir: string) {
  await runCommand('python3', [
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

function buildScenario(input: {
  cues: CaptionCue[]
  hazard: HazardProfile
  jobId: string
  sourceTitle: string
  sourceUrl: string
  videoSrc: string
}) {
  const groups = groupCues(input.cues)
  const segments = groups.map((group, index) =>
    buildSegment({
      cueGroup: group,
      hazard: input.hazard,
      index,
      jobId: input.jobId,
      sourceTitle: input.sourceTitle,
      sourceUrl: input.sourceUrl,
    }),
  )

  return {
    accentClassName: 'bg-emerald-400',
    generatedSourceTitle: input.sourceTitle,
    generatedSourceUrl: input.sourceUrl,
    generatedTopicLabel: `${input.hazard.label} 영상 학습`,
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

function buildSegment(input: {
  cueGroup: CaptionCue[]
  hazard: HazardProfile
  index: number
  jobId: string
  sourceTitle: string
  sourceUrl: string
}): GeneratedPracticeSegment {
  const text = normalizeCueText(input.cueGroup.map((cue) => cue.text).join(' '))
  const startMs = input.cueGroup[0]?.startMs ?? input.index * 10_000
  const endMs = Math.max(
    input.cueGroup.at(-1)?.endMs ?? startMs + 8_000,
    startMs + 2_000,
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
      : `${input.hazard.label} 내용을 듣고 있어요.`
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
    doNot: practiceMode === 'action' ? doNotForText(text, input.hazard) : undefined,
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
      ...actionSteps.map((action) => ({ kind: 'action' as const, text: action })),
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
      correction: '자동 생성된 문구가 어색하면 선생님이 쉬운 말로 다시 말합니다.',
      observe: '학습자가 장면과 행동을 구분하는지 봅니다.',
      prompt: teachBack?.prompt ?? '무슨 내용인지 같이 말해 봅니다.',
      script: text,
    },
    teachBack,
  }
}

function groupCues(cues: CaptionCue[]) {
  const normalized = cues.filter((cue) => cue.text.trim().length > 0)
  if (normalized.length === 0) {
    return buildFallbackCues('재난안전 영상을 보고 있어요.').map((cue) => [cue])
  }

  const groups: CaptionCue[][] = []
  let current: CaptionCue[] = []

  for (const cue of normalized) {
    const currentStart = current[0]?.startMs ?? cue.startMs
    const previous = current.at(-1)
    const gap = previous ? cue.startMs - previous.endMs : 0
    const wouldBeLong = cue.endMs - currentStart > 24_000

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

    const [rawStart, rawEnd] = lines[timeLineIndex]!.split('-->').map((part) =>
      part.trim().split(/\s+/u)[0],
    )
    const startMs = parseTimestamp(rawStart)
    const endMs = parseTimestamp(rawEnd)
    const rawCueText = lines.slice(timeLineIndex + 1).join(' ')

    // YouTube auto captions include progressive word-by-word cue blocks. The
    // following stable duplicate cue contains the completed phrase, so skip the
    // progressive block to avoid repeated, broken learner text.
    if (/<\d{2}:\d{2}:|<c[ >]/u.test(rawCueText)) {
      continue
    }

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
  const candidates: string[] = []
  const add = (condition: boolean, action: string) => {
    if (condition && !candidates.includes(action)) {
      candidates.push(action)
    }
  }

  add(/문/u.test(text) && /(닫|닫고)/u.test(text), '문을 닫아요')
  add(/계단/u.test(text), '계단으로 가요')
  add(/엘리베이터/u.test(text) && /(타지|이용하지|말)/u.test(text), '계단을 찾아요')
  add(/머리|방석|쿠션|가방/u.test(text), '머리를 보호해요')
  add(/탁자|책상/u.test(text), '탁자 아래로 들어가요')
  add(/넓은|운동장|공원|대피소/u.test(text), '넓은 곳으로 가요')
  add(/선생님|보호자|어른/u.test(text), '어른 말을 들어요')
  add(/119|신고/u.test(text), '119나 어른에게 알려요')
  add(/연기|몸을 낮/u.test(text), '몸을 낮춰요')
  add(/가스|냄새/u.test(text), '가스 냄새를 어른에게 말해요')
  add(/창문|유리/u.test(text) && /(떨어|멀리|가까이 가지)/u.test(text), '창문에서 떨어져요')

  if (candidates.length === 0 && /(하세요|해요|갑니다|가세요|대피|피하)/u.test(text)) {
    candidates.push(hazard.fallbackAction)
  }

  return candidates.slice(0, 3)
}

function reasonForAction(action: string, hazard: HazardProfile) {
  if (action.includes('문')) return '문을 닫으면 위험한 연기가 덜 퍼져요.'
  if (action.includes('계단')) return '불이나 지진 때 엘리베이터는 멈출 수 있어요.'
  if (action.includes('머리')) return '머리를 보호하면 떨어지는 물건에 덜 다쳐요.'
  if (action.includes('탁자')) return '탁자 아래는 몸을 숨기기 쉬워요.'
  if (action.includes('넓은')) return '넓은 곳은 떨어지는 물건이 적어요.'
  if (action.includes('어른')) return '혼자 판단하면 더 위험할 수 있어요.'
  if (action.includes('119')) return '위험하면 빨리 도움을 받아야 해요.'
  if (action.includes('낮춰')) return '연기는 위로 올라가서 낮게 움직이면 숨쉬기 쉬워요.'
  if (action.includes('가스')) return '가스 냄새는 폭발 위험을 알려 줄 수 있어요.'
  if (action.includes('창문')) return '유리가 깨지면 다칠 수 있어요.'

  return hazard.reason
}

function doNotForText(text: string, hazard: HazardProfile) {
  if (/엘리베이터/u.test(text)) return '엘리베이터는 타지 않아요.'
  if (/창문|유리/u.test(text)) return '창문 가까이에 가지 않아요.'
  if (/연기/u.test(text)) return '연기 쪽으로 가지 않아요.'
  if (/가스/u.test(text)) return '불을 켜거나 전기 스위치를 만지지 않아요.'

  return hazard.doNot
}

function buildTeachBack(action: string, hazard: HazardProfile): LearningTeachBack {
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
  if (action.includes('문')) return { kind: 'object', label: '문', prompt: '무엇을 볼까요?' }
  if (action.includes('계단')) return { kind: 'place', label: '계단', prompt: '어디로 갈까요?' }
  if (action.includes('머리')) return { kind: 'object', label: '머리', prompt: '어디를 보호할까요?' }
  if (action.includes('탁자')) return { kind: 'place', label: '탁자 아래', prompt: '어디로 들어갈까요?' }
  if (action.includes('넓은')) return { kind: 'place', label: '넓은 곳', prompt: '어디로 갈까요?' }
  if (action.includes('어른')) return { kind: 'person', label: '어른', prompt: '누구 말을 들을까요?' }
  if (action.includes('119')) return { kind: 'signal', label: '119', prompt: '도움이 필요하면 무엇을 기억할까요?' }
  if (action.includes('가스')) return { kind: 'signal', label: '가스 냄새', prompt: '무엇을 말할까요?' }
  if (action.includes('창문')) return { kind: 'object', label: '창문', prompt: '무엇에서 떨어질까요?' }

  return { kind: 'state', label: '안전', prompt: '무엇을 기억할까요?' }
}

function contrastForOption(
  option: ReturnType<typeof optionForAction>,
  hazard: HazardProfile,
) {
  if (option.kind === 'place') return option.label === '계단' ? '엘리베이터' : '좁은 곳'
  if (option.kind === 'person') return '혼자'
  if (option.kind === 'object') return option.label === '문' ? '창문' : '가방'
  if (option.kind === 'signal') return option.label === '119' ? '게임' : '냄새 없음'

  return hazard.label
}

function situationFromText(text: string, hazard: HazardProfile) {
  const shortText = shortenLearnerText(text, `${hazard.label} 장면이에요.`)
  if (shortText.includes(hazard.label)) return shortText

  return `${hazard.label} 상황을 보고 있어요.`
}

function summarizeAction(actions: string[]) {
  if (actions.length === 0) return '영상을 보고 같이 연습해요.'
  if (actions.length === 1) return actions[0]!

  return `${actions[0]!.replace(/요$/u, '')}고 ${actions[1]}`
}

function shortenLearnerText(text: string, fallback: string) {
  const cleaned = normalizeCueText(text)
    .replace(/하십시오|하세요/gu, '해요')
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
  if (/호우|비가|침수|홍수|물/u.test(text)) return hazardProfiles[2]!
  if (/태풍|강풍|바람/u.test(text)) return hazardProfiles[3]!

  return hazardProfiles[1]!
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
    const parsed = JSON.parse(await readFile(join(workDir, infoFile), 'utf8')) as {
      thumbnail?: unknown
      title?: unknown
    }

    return {
      thumbnail: typeof parsed.thumbnail === 'string' ? parsed.thumbnail : undefined,
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
    }
  } catch {
    return {}
  }
}

function findDownloadedVideo(files: string[]) {
  return files.find((file) => file === 'source.mp4') ?? files.find((file) => file.endsWith('.mp4'))
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
    await copyFile(join(workDir, 'source.mp4'), join(distGeneratedDir, jobId, 'source.mp4'))
    await copyFile(join(workDir, 'scenario.json'), join(distGeneratedDir, jobId, 'scenario.json'))
  } catch {
    // The dev server does not need dist files. Preview builds use this when dist exists.
  }
}

function normalizeUrl(input: unknown) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new ValidationError('url_required', '영상 URL을 입력해 주세요.')
  }

  const url = new URL(input.trim())
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ValidationError('invalid_url', 'http 또는 https 영상 링크만 사용할 수 있습니다.')
  }

  return url.toString()
}

function hashText(text: string) {
  return createHash('sha256').update(text).digest('hex')
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('영상 처리 시간이 너무 오래 걸렸습니다.'))
    }, 10 * 60 * 1000)
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
