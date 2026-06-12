export const generatedPipelineVersion = 'url-multi-agent-quality-v21'
export const generatedQualityContractVersion = 'url-quality-contract-v1'

export type GenerationAgentName =
  | 'critic-agent'
  | 'easy-language-agent'
  | 'evidence-agent'
  | 'grounding-agent'
  | 'publisher-agent'
  | 'quiz-agent'
  | 'repair-coordinator'
  | 'scenario-author-agent'
  | 'scene-agent'
  | 'source-lock-agent'

export type GenerationAgentRun = {
  agent: GenerationAgentName
  completedAt: string
  issueCodes?: string[]
  startedAt: string
  status: 'blocked' | 'needs_repair' | 'passed' | 'skipped'
  summary: string
}

export type GenerationStageTiming = {
  completedAt: string
  durationMs: number
  stage: string
  startedAt: string
}

export type GenerationIssueRouting = {
  issueCode: string
  routeTo: GenerationAgentName
}

export type GenerationPipelineTrace = {
  agentRuns: GenerationAgentRun[]
  artifactManifest?: Record<string, unknown>
  attempts: number
  deadlineMode?:
    | 'deadline_finalizer'
    | 'forced_publish'
    | 'normal'
    | 'timeboxed_repair'
  finalizationReason?: string
  issueRouting: GenerationIssueRouting[]
  pipelineVersion: typeof generatedPipelineVersion
  qualityContractVersion: typeof generatedQualityContractVersion
  publishedAt?: string
  remainingMs?: number
  stageTimings: GenerationStageTiming[]
  waivedHardIssues?: GenerationQualityIssueLike[]
  waivedSoftIssues?: GenerationQualityIssueLike[]
}

export type GenerationQualityIssueLike = {
  code?: unknown
  severity?: unknown
}

export type GenerationQualityReportLike = {
  groundingPassed?: unknown
  passed?: unknown
  qualityContractVersion?: unknown
  sourceCoveragePassed?: unknown
  uiPlaybackPassed?: unknown
  version?: unknown
}

export function createGenerationPipelineTrace(): GenerationPipelineTrace {
  return {
    agentRuns: [],
    attempts: 0,
    deadlineMode: 'normal',
    issueRouting: [],
    pipelineVersion: generatedPipelineVersion,
    qualityContractVersion: generatedQualityContractVersion,
    stageTimings: [],
  }
}

export function recordGenerationAgentRun(
  trace: GenerationPipelineTrace,
  run: Omit<GenerationAgentRun, 'completedAt' | 'startedAt'> & {
    completedAt?: string
    startedAt?: string
  },
) {
  const now = new Date().toISOString()
  trace.agentRuns.push({
    ...run,
    completedAt: run.completedAt ?? now,
    startedAt: run.startedAt ?? now,
  })
}

export function routeGenerationIssues(
  issues: GenerationQualityIssueLike[],
): GenerationIssueRouting[] {
  const seen = new Set<string>()
  const routes: GenerationIssueRouting[] = []

  for (const issue of issues) {
    if (issue.severity !== 'blocker' || typeof issue.code !== 'string') {
      continue
    }

    const key = `${issue.code}:${agentForIssueCode(issue.code)}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    routes.push({
      issueCode: issue.code,
      routeTo: agentForIssueCode(issue.code),
    })
  }

  return routes
}

export function agentForIssueCode(code: string): GenerationAgentName {
  if (
    code === 'missing_audio_topic' ||
    code === 'too_few_segments_for_audio_topics' ||
    code === 'uncovered_audio_cue' ||
    code === 'visual_caption_boundary_merged' ||
    code === 'mixed_topic_segment' ||
    code === 'mixed_action_topic_segment' ||
    code === 'action_missing_source_topic' ||
    code === 'intro_mixed_with_action' ||
    code === 'outro_mixed_with_action' ||
    code === 'intro_has_direct_action_evidence' ||
    code === 'incomplete_audio_fragment' ||
    code === 'topic_action_semantic_mismatch'
  ) {
    return 'scene-agent'
  }

  if (
    code === 'official_contradiction' ||
    code === 'rag_overwrite' ||
    code === 'ungrounded_action' ||
    code === 'missing_official_rule'
  ) {
    return 'grounding-agent'
  }

  if (
    code === 'source_keyword_erased' ||
    code === 'source_locked_action_missing' ||
    code === 'missing_required_keyword' ||
    code === 'missing_required_keyword_in_ui' ||
    code === 'hallucinated_source_keyword'
  ) {
    return 'source-lock-agent'
  }

  if (
    code === 'generic_quiz' ||
    code === 'low_quality_teach_back' ||
    code === 'bad_answer_option' ||
    code === 'ambiguous_question'
  ) {
    return 'quiz-agent'
  }

  if (code === 'learner_text_not_easy' || code === 'learner_text_too_long') {
    return 'easy-language-agent'
  }

  if (
    code === 'learner_sequence_action_mismatch' ||
    code === 'learner_sequence_shape_invalid' ||
    code === 'negative_action_card' ||
    code === 'repeated_action_scene' ||
    code === 'too_many_action_reasons' ||
    code === 'unclear_tell_action' ||
    code === 'unclear_report_action' ||
    code === 'intro_has_action_content'
  ) {
    return 'critic-agent'
  }

  if (
    code === 'invalid_time_window' ||
    code === 'overlapping_time_window' ||
    code === 'segment_too_long'
  ) {
    return 'scene-agent'
  }

  return 'scenario-author-agent'
}

export function isCurrentPipelineTrace(value: unknown) {
  return (
    isRecord(value) &&
    value.pipelineVersion === generatedPipelineVersion &&
    value.qualityContractVersion === generatedQualityContractVersion &&
    Array.isArray(value.agentRuns)
  )
}

export function isPublishableQualityReport(
  value: unknown,
): value is GenerationQualityReportLike {
  return (
    isRecord(value) &&
    value.passed === true &&
    value.qualityContractVersion === generatedQualityContractVersion &&
    value.groundingPassed === true &&
    value.sourceCoveragePassed === true &&
    value.uiPlaybackPassed === true
  )
}

export function isCanonicalArtifactManifest(value: unknown) {
  return (
    isRecord(value) &&
    value.qualityVersion === 'quality-v1' &&
    typeof value.scenarioJsonUrl === 'string' &&
    typeof value.sourceVideoUrl === 'string' &&
    Array.isArray(value.files) &&
    manifestContainsFile(value, 'scenario.json') &&
    manifestContainsFile(value, 'source.mp4') &&
    manifestContainsFile(value, 'quality-report.json') &&
    manifestContainsFile(value, 'pipeline-trace.json') &&
    manifestContainsFile(value, 'evidence-packet.json') &&
    manifestContainsFile(value, 'scene-graph.json')
  )
}

export function isPublishableGeneratedScenario(value: unknown) {
  return (
    isRecord(value) &&
    isPublishableQualityReport(value.generationQualityReport) &&
    isCurrentPipelineTrace(value.generationPipelineTrace) &&
    isCanonicalArtifactManifest(value.generatedArtifactManifest)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function manifestContainsFile(value: Record<string, unknown>, name: string) {
  return (
    Array.isArray(value.files) &&
    value.files.some(
      (file) =>
        isRecord(file) && file.name === name && typeof file.url === 'string',
    )
  )
}
