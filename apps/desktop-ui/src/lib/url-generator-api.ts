import type { GeneratedScenarioRecord } from './generated-scenario'

const generatorApiBaseStorageKey = 'chagunchagun.generator-api-base.v1'
const generatorAccessCodeSessionKey = 'chagunchagun.generator-access-code.v1'

export type GeneratorApiConfig = {
  apiBase: string
  configuredFrom: 'env' | 'query' | 'same-origin' | 'storage'
  requiresRemoteApi: boolean
}

export function getGeneratorApiConfig(): GeneratorApiConfig {
  const queryApiBase = readApiBaseFromQuery()
  if (queryApiBase) {
    persistGeneratorApiBase(queryApiBase)

    return {
      apiBase: queryApiBase,
      configuredFrom: 'query',
      requiresRemoteApi: false,
    }
  }

  const envApiBase = normalizeApiBase(import.meta.env.VITE_GENERATOR_API_BASE)
  if (envApiBase) {
    return {
      apiBase: envApiBase,
      configuredFrom: 'env',
      requiresRemoteApi: false,
    }
  }

  const storedApiBase = loadStoredGeneratorApiBase()
  if (storedApiBase) {
    return {
      apiBase: storedApiBase,
      configuredFrom: 'storage',
      requiresRemoteApi: false,
    }
  }

  return {
    apiBase: '',
    configuredFrom: 'same-origin',
    requiresRemoteApi: isGitHubPagesHost(),
  }
}

export function persistGeneratorApiBase(input: string) {
  const apiBase = normalizeApiBase(input)

  if (!apiBase || typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(generatorApiBaseStorageKey, apiBase)
}

export function clearStoredGeneratorApiBase() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(generatorApiBaseStorageKey)
}

export function loadStoredGeneratorAccessCode() {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.sessionStorage.getItem(generatorAccessCodeSessionKey) ?? ''
}

export function persistGeneratorAccessCode(input: string) {
  if (typeof window === 'undefined') {
    return
  }

  const trimmed = input.trim()

  if (trimmed) {
    window.sessionStorage.setItem(generatorAccessCodeSessionKey, trimmed)
  } else {
    window.sessionStorage.removeItem(generatorAccessCodeSessionKey)
  }
}

export async function requestGeneratedPracticeFromApi(
  sourceUrl: string,
  accessCode = '',
): Promise<{
  record: GeneratedScenarioRecord
}> {
  const config = getGeneratorApiConfig()

  if (config.requiresRemoteApi) {
    throw new Error(
      'GitHub Pages는 API key를 안전하게 보관할 수 없습니다. 생성 API 서버 주소를 먼저 연결해 주세요.',
    )
  }

  const response = await fetch(
    `${config.apiBase}/api/generate-practice-from-url`,
    {
      body: JSON.stringify({ sourceUrl }),
      headers: {
        'content-type': 'application/json',
        ...(accessCode.trim()
          ? {
              'x-generator-code': accessCode.trim(),
            }
          : {}),
      },
      method: 'POST',
    },
  )

  let payload: {
    message?: string
    record?: GeneratedScenarioRecord
  } = {}

  try {
    payload = (await response.json()) as typeof payload
  } catch {
    // GitHub Pages returns HTML for missing /api routes. Surface a useful error.
  }

  if (!response.ok || !payload.record) {
    throw new Error(
      payload.message ??
        '생성 API 서버에서 학습 화면을 만들지 못했습니다. 서버 주소와 API key 설정을 확인해 주세요.',
    )
  }

  return { record: payload.record }
}

function readApiBaseFromQuery() {
  if (typeof window === 'undefined') {
    return ''
  }

  const searchParams = new URLSearchParams(window.location.search)
  const hashQuery = window.location.hash.split('?')[1]
  const hashParams = new URLSearchParams(hashQuery ?? '')

  return normalizeApiBase(
    searchParams.get('apiBase') ??
      searchParams.get('generatorApiBase') ??
      hashParams.get('apiBase') ??
      hashParams.get('generatorApiBase') ??
      '',
  )
}

function loadStoredGeneratorApiBase() {
  if (typeof window === 'undefined') {
    return ''
  }

  return normalizeApiBase(
    window.localStorage.getItem(generatorApiBaseStorageKey) ?? '',
  )
}

function normalizeApiBase(input: unknown) {
  if (typeof input !== 'string') {
    return ''
  }

  const trimmed = input.trim().replace(/\/+$/u, '')
  if (!trimmed) {
    return ''
  }

  try {
    const url = new URL(trimmed)

    if (
      url.protocol !== 'https:' &&
      url.hostname !== 'localhost' &&
      url.hostname !== '127.0.0.1'
    ) {
      return ''
    }

    return url.toString().replace(/\/+$/u, '')
  } catch {
    return ''
  }
}

function isGitHubPagesHost() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.location.hostname.endsWith('github.io')
}
