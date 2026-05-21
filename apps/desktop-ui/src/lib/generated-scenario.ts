import { learningScenarios, type TheaterShow } from './demo-theater-content'
import { isLocalSeasonalEnabled } from './local-seasonal'

export const generatedScenarioStorageKey = 'chagunchagun.generated-scenarios.v1'

export type GeneratedScenarioRecord = {
  baseScenarioId: string
  createdAt: string
  id: string
  sourceUrl: string
  topicLabel: string
  version: 1
}

export type UrlScenarioMatch = {
  scenarioId: string
  topicLabel: string
}

const fallbackScenarioId = 'fire-grounded-flow'

const keywordMatches: Array<{
  keywords: string[]
  match: UrlScenarioMatch
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
): GeneratedScenarioRecord {
  const normalizedUrl = normalizeScenarioUrl(sourceUrl)
  const match = matchUrlToScenario(normalizedUrl)

  return {
    baseScenarioId: match.scenarioId,
    createdAt: new Date().toISOString(),
    id: `generated-${hashUrl(normalizedUrl)}`,
    sourceUrl: normalizedUrl,
    topicLabel: match.topicLabel,
    version: 1,
  }
}

export function matchUrlToScenario(sourceUrl: string): UrlScenarioMatch {
  const haystack = decodeURIComponent(sourceUrl).toLowerCase()

  for (const item of keywordMatches) {
    if (item.keywords.some((keyword) => includesKeyword(haystack, keyword))) {
      return normalizeMatch(item.match)
    }
  }

  return {
    scenarioId: fallbackScenarioId,
    topicLabel: '재난안전 연습',
  }
}

export function normalizeScenarioUrl(sourceUrl: string) {
  const url = new URL(sourceUrl.trim())

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('http 또는 https 링크만 사용할 수 있습니다.')
  }

  return url.toString()
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
  return loadGeneratedScenarioRecords().find((record) => record.id === id) ?? null
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
  const baseScenario = resolveBaseScenario(record.baseScenarioId)

  if (!baseScenario) {
    return null
  }

  return {
    ...baseScenario,
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

function normalizeMatch(match: UrlScenarioMatch): UrlScenarioMatch {
  const scenario = resolveBaseScenario(match.scenarioId)

  if (scenario) {
    return match
  }

  return {
    scenarioId: fallbackScenarioId,
    topicLabel: '재난안전 연습',
  }
}

function resolveBaseScenario(scenarioId: string) {
  const scenario =
    learningScenarios.find((item) => item.id === scenarioId) ??
    learningScenarios.find((item) => item.id === fallbackScenarioId) ??
    null

  if (scenario?.localOnly && !isLocalSeasonalEnabled()) {
    return (
      learningScenarios.find((item) => item.id === fallbackScenarioId) ?? null
    )
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
    typeof record.createdAt === 'string'
  )
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
