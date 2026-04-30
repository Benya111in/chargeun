import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  applySafetyGuardrails,
  buildGroundedExplanation,
  buildSegmentFromPerception,
} from '../workers/llm-orchestrator/src/index.ts'
import {
  perceptionPacketSchema,
  ruleRecordSchema,
  type HazardType,
  type PerceptionPacket,
  type SafetyMode,
  type RuleRecord,
} from '../packages/shared-types/src/index.ts'

type EvalFixture = {
  clipId: string
  description: string
  expectedRuleIds: string[]
  expectedSafetyMode: SafetyMode
  forbiddenAction: string
  hasAudio: boolean
  hazard: HazardType
  idealSegmentEndMs: number
  idealSegmentStartMs: number
  overlayTargets: string[]
  packet: PerceptionPacket
  phase: string
}

type AuditCheck = {
  label: string
  ok: boolean
  details?: string
}

const root = process.cwd()

const main = async () => {
  const fixtures = await loadEvalFixtures()
  const rulesByHazard = await loadRulesByHazard()

  let passed = 0

  for (const fixture of fixtures) {
    const rules =
      fixture.hazard === 'fire'
        ? rulesByHazard.fire
        : fixture.hazard === 'earthquake'
          ? rulesByHazard.earthquake
          : []

    const segment = buildSegmentFromPerception({
      packet: fixture.packet,
      rules,
    })
    const explanation = buildGroundedExplanation({
      evidence: fixture.packet,
      rules,
      segment,
    })
    const guarded = applySafetyGuardrails({
      evidenceVisible: true,
      explanation,
      panicMode: false,
      privacyConsent: true,
      segment,
    })

    const behaviorText = [
      guarded.explanation.tracks.action,
      guarded.explanation.tracks.report,
      guarded.explanation.doNot,
    ]
      .filter(Boolean)
      .join(' ')
    const actualOverlayLabels = guarded.explanation.overlayTargets.map(
      (target) => target.label,
    )

    const checks: AuditCheck[] = [
      {
        label: 'hazard',
        ok: segment.hazard === fixture.hazard,
        details: `${segment.hazard} vs ${fixture.hazard}`,
      },
      {
        label: 'phase',
        ok: segment.phase === fixture.phase,
        details: `${segment.phase} vs ${fixture.phase}`,
      },
      {
        label: 'rule ids',
        ok: sameStringSet(segment.officialRuleIds, fixture.expectedRuleIds),
        details: `${segment.officialRuleIds.join(', ') || 'none'} vs ${fixture.expectedRuleIds.join(', ') || 'none'}`,
      },
      {
        label: 'overlay targets',
        ok: fixture.overlayTargets.every((expectedOverlay) =>
          actualOverlayLabels.some((label) => label.includes(expectedOverlay)),
        ),
        details: `${actualOverlayLabels.join(', ') || 'none'} vs ${fixture.overlayTargets.join(', ') || 'none'}`,
      },
      {
        label: 'safety mode',
        ok: guarded.explanation.safetyMode === fixture.expectedSafetyMode,
        details: `${guarded.explanation.safetyMode} vs ${fixture.expectedSafetyMode}`,
      },
      {
        label: 'forbidden action absent',
        ok: !behaviorText.includes(fixture.forbiddenAction),
        details: fixture.forbiddenAction,
      },
      {
        label: 'audio fallback',
        ok: fixture.hasAudio || fixture.packet.asrText.length === 0,
        details: fixture.hasAudio ? 'audio present' : 'visual-only fixture',
      },
      {
        label: 'review fallback contract',
        ok:
          fixture.expectedSafetyMode !== 'review_official' ||
          guarded.explanation.tracks.action === undefined,
        details:
          fixture.expectedSafetyMode === 'review_official'
            ? 'action hidden'
            : 'grounded clip',
      },
    ]

    const failedChecks = checks.filter((check) => !check.ok)
    const ok = failedChecks.length === 0
    if (ok) {
      passed += 1
    }

    console.log(
      `\n[${ok ? 'PASS' : 'FAIL'}] ${fixture.clipId} - ${fixture.description}`,
    )
    console.log(
      `  expected overlays: ${fixture.overlayTargets.join(', ') || 'none'}`,
    )

    for (const check of checks) {
      console.log(
        `  - ${check.ok ? 'ok' : 'x '} ${check.label}${check.details ? ` (${check.details})` : ''}`,
      )
    }
  }

  console.log(`\nGrounding audit: ${passed}/${fixtures.length} fixtures passed`)

  if (passed !== fixtures.length) {
    process.exit(1)
  }
}

const loadEvalFixtures = async () => {
  const file = path.join(root, 'data', 'eval', 'annotated_segments.json')
  const raw = await readFile(file, 'utf8')
  const parsed = JSON.parse(raw) as EvalFixture[]

  return parsed.map((fixture) => ({
    ...fixture,
    packet: perceptionPacketSchema.parse(fixture.packet),
  }))
}

const loadRulesByHazard = async (): Promise<{
  earthquake: RuleRecord[]
  fire: RuleRecord[]
}> => {
  const fire = await loadRules(
    path.join(root, 'data', 'rules', 'fire_rules.json'),
  )
  const earthquake = await loadRules(
    path.join(root, 'data', 'rules', 'earthquake_rules.json'),
  )

  return { earthquake, fire }
}

const loadRules = async (file: string) => {
  const raw = await readFile(file, 'utf8')
  return ruleRecordSchema.array().parse(JSON.parse(raw))
}

const sameStringSet = (actual: string[], expected: string[]) => {
  if (actual.length !== expected.length) {
    return false
  }

  const actualSet = new Set(actual)
  return expected.every((value) => actualSet.has(value))
}

void main()
