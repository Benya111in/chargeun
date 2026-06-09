import { learningScenarios, type TheaterShow } from './demo-theater-content'
import { isLocalSeasonalEnabled } from './local-seasonal'

export const generatedScenarioStorageKey = 'chagunchagun.generated-scenarios.v1'
export const acceptedGeneratedPipelineVersion = 'url-multi-agent-quality-v20'

export type GeneratedScenarioRecord = {
  baseScenarioId: string
  createdAt: string
  customScenario?: TheaterShow
  generatedArtifactManifest?: TheaterShow['generatedArtifactManifest']
  id: string
  matchBasis: 'metadata' | 'url'
  sourceUrl: string
  sourceTitle?: string
  thumbnailUrl?: string
  topicLabel: string
  version: 1
}

export type UrlScenarioMatch = {
  matchBasis: 'metadata' | 'url'
  scenarioId: string
  topicLabel: string
}

export type VideoMetadata = {
  thumbnailUrl?: string
  title?: string
}

const keywordMatches: Array<{
  keywords: string[]
  match: Omit<UrlScenarioMatch, 'matchBasis'>
}> = [
  {
    keywords: ['지진', 'earthquake', 'quake', 'seismic'],
    match: {
      scenarioId: 'earthquake-protect-flow',
      topicLabel: '지진 대피 연습',
    },
  },
  {
    keywords: ['태풍', 'typhoon', 'hurricane', 'storm'],
    match: {
      scenarioId: 'typhoon-safety-flow',
      topicLabel: '태풍 안전 연습',
    },
  },
  {
    keywords: ['호우', '집중호우', 'flood', 'rain', 'heavy-rain'],
    match: {
      scenarioId: 'heavy-rain-safety-flow',
      topicLabel: '비가 많이 올 때 연습',
    },
  },
  {
    keywords: ['폭염', 'heat', 'hot', 'heatwave'],
    match: {
      scenarioId: 'heatwave-safety-flow',
      topicLabel: '폭염 안전 연습',
    },
  },
  {
    keywords: ['한파', 'cold', 'freeze', 'coldwave'],
    match: {
      scenarioId: 'coldwave-safety-flow',
      topicLabel: '한파 안전 연습',
    },
  },
  {
    keywords: ['대설', 'snow', 'blizzard'],
    match: {
      scenarioId: 'heavy-snow-safety-flow',
      topicLabel: '눈이 많이 올 때 연습',
    },
  },
  {
    keywords: ['화재', '불', 'fire', 'smoke'],
    match: {
      scenarioId: 'fire-grounded-flow',
      topicLabel: '화재 대피 연습',
    },
  },
]

export function createGeneratedScenarioRecord(
  sourceUrl: string,
  metadata: VideoMetadata = {},
): GeneratedScenarioRecord {
  const normalizedUrl = normalizeScenarioUrl(sourceUrl)
  const match = matchUrlToScenario(normalizedUrl, metadata.title ?? '')

  if (!match) {
    throw new Error(
      '영상 제목에서 재난 주제를 찾지 못했어요. 화재, 지진, 태풍처럼 주제가 보이는 영상 링크를 넣어 주세요.',
    )
  }

  return {
    baseScenarioId: match.scenarioId,
    createdAt: new Date().toISOString(),
    id: `generated-${hashUrl(normalizedUrl)}`,
    matchBasis: match.matchBasis,
    sourceUrl: normalizedUrl,
    sourceTitle: metadata.title,
    thumbnailUrl: metadata.thumbnailUrl,
    topicLabel: match.topicLabel,
    version: 1,
  }
}

export async function createGeneratedScenarioRecordFromUrl(sourceUrl: string) {
  const normalizedUrl = normalizeScenarioUrl(sourceUrl)
  const urlMatch = matchUrlToScenario(normalizedUrl)

  if (urlMatch) {
    return createGeneratedScenarioRecord(normalizedUrl)
  }

  const metadata = await fetchVideoMetadata(normalizedUrl)

  return createGeneratedScenarioRecord(normalizedUrl, metadata)
}

export function matchUrlToScenario(
  sourceUrl: string,
  metadataText = '',
): UrlScenarioMatch | null {
  const urlText = decodeURIComponent(sourceUrl).toLowerCase()
  const metadataHaystack = metadataText.toLowerCase()

  for (const item of keywordMatches) {
    if (item.keywords.some((keyword) => includesKeyword(urlText, keyword))) {
      return normalizeMatch({ ...item.match, matchBasis: 'url' })
    }

    if (
      metadataHaystack &&
      item.keywords.some((keyword) =>
        includesKeyword(metadataHaystack, keyword),
      )
    ) {
      return normalizeMatch({ ...item.match, matchBasis: 'metadata' })
    }
  }

  return null
}

export function normalizeScenarioUrl(sourceUrl: string) {
  const url = new URL(normalizeYouTubeInput(sourceUrl.trim()))

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('http 또는 https 링크만 사용할 수 있습니다.')
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
    throw new Error('http 또는 https 링크만 사용할 수 있습니다.')
  }

  return `https://${input.replace(/^\/+/u, '')}`
}

export function saveGeneratedScenario(record: GeneratedScenarioRecord) {
  if (typeof window === 'undefined') {
    return
  }

  const records = loadGeneratedScenarioRecords().filter(
    (item) => item.id !== record.id,
  )
  const nextRecords = [record, ...records].slice(0, 8)

  window.localStorage.setItem(
    generatedScenarioStorageKey,
    JSON.stringify(nextRecords),
  )
}

export function loadGeneratedScenario(id: string) {
  return (
    loadGeneratedScenarioRecords().find((record) => record.id === id) ?? null
  )
}

export function loadGeneratedScenarioRecords(): GeneratedScenarioRecord[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(generatedScenarioStorageKey)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(isGeneratedScenarioRecord)
  } catch {
    return []
  }
}

export function toGeneratedTheaterShow(record: GeneratedScenarioRecord) {
  if (record.customScenario) {
    if (
      isUnsafeGeneratedCustomScenario(record.customScenario) ||
      !isPublishableGeneratedCustomScenario(record.customScenario)
    ) {
      return null
    }

    return {
      ...record.customScenario,
      generatedSourceTitle:
        record.customScenario.generatedSourceTitle ?? record.sourceTitle,
      generatedSourceUrl:
        record.customScenario.generatedSourceUrl ?? record.sourceUrl,
      generatedThumbnailUrl:
        record.customScenario.generatedThumbnailUrl ?? record.thumbnailUrl,
      generatedTopicLabel:
        record.customScenario.generatedTopicLabel ?? record.topicLabel,
      id: record.id,
      practiceSequence: false,
      showOnHome: false,
      title: record.customScenario.title || 'URL로 만든 연습',
    } satisfies TheaterShow
  }

  const baseScenario = resolveBaseScenario(record.baseScenarioId)

  if (!baseScenario) {
    return null
  }

  return {
    ...baseScenario,
    generatedSourceTitle: record.sourceTitle,
    generatedSourceUrl: record.sourceUrl,
    generatedThumbnailUrl: record.thumbnailUrl,
    generatedTopicLabel: record.topicLabel,
    homeNote:
      '입력한 영상 링크를 바탕으로 장면별 학습 화면을 만든 미리보기입니다.',
    homeTitle: 'URL로 만든 연습',
    id: record.id,
    note: `${record.topicLabel}으로 바로 연습할 수 있게 정리했습니다.`,
    practiceSequence: false,
    showOnHome: false,
    title: 'URL로 만든 연습',
  } satisfies TheaterShow
}

function isUnsafeGeneratedCustomScenario(scenario: TheaterShow) {
  const report = scenario.generationEvidenceReport
  const warnings = report?.warnings ?? []

  return warnings.some((warning) =>
    /제목과 공식 안전 주제|자막 접근을 막아|title_only|oembed/iu.test(warning),
  )
}

function isPublishableGeneratedCustomScenario(scenario: TheaterShow) {
  const candidate = scenario as TheaterShow & {
    generatedArtifactManifest?: { qualityVersion?: string }
    generationPipelineTrace?: { agentRuns?: unknown; pipelineVersion?: string }
    generationQualityReport?: {
      groundingPassed?: boolean
      passed?: boolean
      sourceCoveragePassed?: boolean
      uiPlaybackPassed?: boolean
    }
  }

  return (
    candidate.generationQualityReport?.passed === true &&
    candidate.generationQualityReport.groundingPassed === true &&
    candidate.generationQualityReport.sourceCoveragePassed === true &&
    candidate.generationQualityReport.uiPlaybackPassed === true &&
    candidate.generationPipelineTrace?.pipelineVersion ===
      acceptedGeneratedPipelineVersion &&
    Array.isArray(candidate.generationPipelineTrace.agentRuns) &&
    candidate.generatedArtifactManifest?.qualityVersion === 'quality-v1'
  )
}

function normalizeMatch(match: UrlScenarioMatch): UrlScenarioMatch | null {
  const scenario = resolveBaseScenario(match.scenarioId)

  if (scenario) {
    return match
  }

  return null
}

function resolveBaseScenario(scenarioId: string) {
  const scenario =
    learningScenarios.find((item) => item.id === scenarioId) ?? null

  if (scenario?.localOnly && !isLocalSeasonalEnabled()) {
    return null
  }

  return scenario
}

function isGeneratedScenarioRecord(
  value: unknown,
): value is GeneratedScenarioRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    record.version === 1 &&
    typeof record.id === 'string' &&
    record.id.startsWith('generated-') &&
    typeof record.sourceUrl === 'string' &&
    typeof record.baseScenarioId === 'string' &&
    typeof record.topicLabel === 'string' &&
    typeof record.createdAt === 'string' &&
    (record.matchBasis === undefined ||
      record.matchBasis === 'url' ||
      record.matchBasis === 'metadata')
  )
}

async function fetchVideoMetadata(sourceUrl: string): Promise<VideoMetadata> {
  try {
    const response = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(sourceUrl)}`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    )

    if (!response.ok) {
      return {}
    }

    const payload = (await response.json()) as {
      thumbnail_url?: unknown
      title?: unknown
    }

    return {
      thumbnailUrl:
        typeof payload.thumbnail_url === 'string'
          ? payload.thumbnail_url
          : undefined,
      title: typeof payload.title === 'string' ? payload.title : undefined,
    }
  } catch {
    return {}
  }
}

function includesKeyword(haystack: string, keyword: string) {
  const normalizedKeyword = keyword.toLowerCase()

  if (/^[a-z0-9-]+$/u.test(normalizedKeyword)) {
    const escapedKeyword = normalizedKeyword.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )
    return new RegExp(`(^|[^a-z0-9])${escapedKeyword}([^a-z0-9]|$)`, 'u').test(
      haystack,
    )
  }

  return haystack.includes(normalizedKeyword)
}

function hashUrl(sourceUrl: string) {
  let hash = 2166136261

  for (let index = 0; index < sourceUrl.length; index += 1) {
    hash ^= sourceUrl.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}
