export const generatedPipelineVersion = 'url-multi-agent-quality-v20'

export type GenerationAgentName =
  | 'critic-agent'
  | 'evidence-agent'
  | 'grounding-agent'
  | 'publisher-agent'
  | 'repair-coordinator'
  | 'scenario-author-agent'
  | 'scene-agent'

export type GenerationAgentRun = {
  agent: GenerationAgentName
  completedAt: string
  issueCodes?: string[]
  startedAt: string
  status: 'blocked' | 'needs_repair' | 'passed' | 'skipped'
  summary: string
}

export type GenerationIssueRouting = {
  issueCode: string
  routeTo: GenerationAgentName
}

export type GenerationPipelineTrace = {
  agentRuns: GenerationAgentRun[]
  artifactManifest?: Record<string, unknown>
  attempts: number
  issueRouting: GenerationIssueRouting[]
  pipelineVersion: typeof generatedPipelineVersion
  publishedAt?: string
}

export type GenerationQualityIssueLike = {
  code?: unknown
  severity?: unknown
}

export type GenerationQualityReportLike = {
  groundingPassed?: unknown
  passed?: unknown
  sourceCoveragePassed?: unknown
  uiPlaybackPassed?: unknown
  version?: unknown
}

export function createGenerationPipelineTrace(): GenerationPipelineTrace {
  return {
    agentRuns: [],
    attempts: 0,
    issueRouting: [],
    pipelineVersion: generatedPipelineVersion,
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
    code === 'intro_has_direct_action_evidence' ||
    code === 'incomplete_audio_fragment' ||
    code === 'topic_action_semantic_mismatch'
  ) {
    return 'scene-agent'
  }

  if (code === 'ungrounded_action' || code === 'missing_official_rule') {
    return 'grounding-agent'
  }

  if (
    code === 'learner_text_not_easy' ||
    code === 'learner_text_too_long' ||
    code === 'learner_sequence_action_mismatch' ||
    code === 'learner_sequence_shape_invalid' ||
    code === 'low_quality_teach_back' ||
    code === 'bad_answer_option' ||
    code === 'missing_required_keyword' ||
    code === 'missing_required_keyword_in_ui' ||
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
    Array.isArray(value.agentRuns)
  )
}

export function isPublishableQualityReport(
  value: unknown,
): value is GenerationQualityReportLike {
  return (
    isRecord(value) &&
    value.passed === true &&
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
    Array.isArray(value.files)
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
