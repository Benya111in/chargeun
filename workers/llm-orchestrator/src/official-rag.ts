import type {
  HazardType,
  OfficialRetrievalRequest,
  OfficialRetrievalResult,
  OfficialSourceChunk,
  OfficialSourceMatch,
} from '@ansimtrack/shared-types'

const defaultLimit = 3

export const retrieveOfficialSources = (
  chunks: OfficialSourceChunk[],
  request: OfficialRetrievalRequest,
): OfficialRetrievalResult => {
  const hazard = request.hazard

  if (hazard === 'unknown') {
    return { matches: [] }
  }

  const queryTokens = tokenize([
    request.phase ?? '',
    request.queryText ?? '',
    ...(request.ruleIds ?? []),
  ])
  const ruleIds = new Set(request.ruleIds ?? [])
  const matches = chunks
    .filter((chunk) => chunk.reviewStatus === 'approved')
    .filter((chunk) => chunk.hazard === hazard)
    .map((chunk) =>
      scoreChunk({
        chunk,
        hazard,
        phase: request.phase,
        queryTokens,
        ruleIds,
      }),
    )
    .filter((match) => match.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.chunk.chunkId.localeCompare(right.chunk.chunkId)
    })

  return {
    matches: matches.slice(0, request.limit ?? defaultLimit),
  }
}

function scoreChunk(input: {
  chunk: OfficialSourceChunk
  hazard: Exclude<HazardType, 'unknown'>
  phase?: string
  queryTokens: Set<string>
  ruleIds: Set<string>
}): OfficialSourceMatch {
  const matchedRuleIds = input.chunk.ruleIds.filter((ruleId) =>
    input.ruleIds.has(ruleId),
  )
  const matchedKeywords = input.chunk.keywords.filter((keyword) =>
    input.queryTokens.has(normalizeToken(keyword)),
  )
  let score = 0

  if (input.phase && input.chunk.phase === input.phase) {
    score += 4
  } else if (input.phase && input.chunk.phase.includes(input.phase)) {
    score += 1.5
  }

  score += matchedRuleIds.length * 8
  score += matchedKeywords.length * 1.2

  if (input.chunk.audience === 'learner') {
    score += 0.6
  }

  return {
    chunk: input.chunk,
    matchedKeywords,
    matchedRuleIds,
    score: Number(score.toFixed(3)),
  }
}

function tokenize(values: string[]) {
  return new Set(
    values
      .flatMap((value) => value.split(/[\s,./|()[\]{}:;!?·\-]+/u))
      .map(normalizeToken)
      .filter(Boolean),
  )
}

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, '')
    .replace(/[^0-9a-z가-힣_]/gu, '')
}
