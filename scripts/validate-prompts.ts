import { readFileSync } from 'node:fs'
import path from 'node:path'

type PromptCheck = {
  checks: Array<{ label: string; pattern: RegExp }>
  file: string
}

const rootDir = process.cwd()

const promptChecks: PromptCheck[] = [
  {
    file: 'prompts/README.md',
    checks: [
      { label: 'runtime prompt set section', pattern: /## Runtime Prompt Set/ },
      { label: 'codex prompt set section', pattern: /## Codex Prompt Set/ },
      { label: 'validation command', pattern: /pnpm prompts:validate/ },
    ],
  },
  {
    file: 'prompts/segment-reasoner.md',
    checks: [
      { label: 'strict json guidance', pattern: /strict JSON/i },
      {
        label: 'candidate rules guidance',
        pattern: /candidate official rules/i,
      },
      { label: 'review fallback guidance', pattern: /review_official/i },
    ],
  },
  {
    file: 'prompts/track-generator.md',
    checks: [
      { label: 'one action per segment', pattern: /One action per segment/i },
      { label: 'easy track constraint', pattern: /two sentences/i },
      { label: 'omit action report fallback', pattern: /omit action\/report/i },
    ],
  },
  {
    file: 'prompts/voice-reexplainer.md',
    checks: [
      { label: 'grounded segment scope', pattern: /current grounded segment/i },
      {
        label: 'official review fallback',
        pattern: /official-review guidance/i,
      },
      { label: 'single short answer', pattern: /one short answer only/i },
    ],
  },
  {
    file: 'prompts/codex/01-repository-bootstrap.md',
    checks: [
      { label: 'pnpm workspace', pattern: /pnpm workspace monorepo/ },
      { label: 'desktop app bootstrap', pattern: /apps\/desktop-ui/ },
      { label: 'desktop run target', pattern: /pnpm dev:desktop/ },
    ],
  },
  {
    file: 'prompts/codex/02-macos-capture.md',
    checks: [
      { label: 'screen capture kit', pattern: /ScreenCaptureKit/ },
      { label: 'frame event', pattern: /frame event with timestamp/ },
      { label: 'audio event', pattern: /audio event with timestamp/ },
    ],
  },
  {
    file: 'prompts/codex/03-shadow-player.md',
    checks: [
      { label: '4 second delay', pattern: /4초 지연/ },
      { label: 'ring buffer', pattern: /링버퍼/ },
      {
        label: 'lane separation',
        pattern: /live preview 와 replay lane 을 분리/,
      },
    ],
  },
  {
    file: 'prompts/codex/04-rules-kb.md',
    checks: [
      { label: 'fire rules file', pattern: /fire_rules\.json/ },
      { label: 'earthquake rules file', pattern: /earthquake_rules\.json/ },
      { label: 'rule id field', pattern: /rule_id/ },
    ],
  },
  {
    file: 'prompts/codex/05-perception-pipeline.md',
    checks: [
      { label: '1fps sampling', pattern: /1fps/ },
      { label: 'perception packet', pattern: /PerceptionPacket/ },
      { label: 'audio missing fallback', pattern: /audio 없을 때도 동작/ },
    ],
  },
  {
    file: 'prompts/codex/06-hazard-segment-engine.md',
    checks: [
      { label: 'hazard classes', pattern: /fire \/ earthquake \/ unknown/ },
      { label: 'low confidence fallback', pattern: /low confidence fallback/ },
      { label: 'segment output', pattern: /Segment 객체/ },
    ],
  },
  {
    file: 'prompts/codex/07-multi-track-generator.md',
    checks: [
      { label: 'basic track', pattern: /basic/ },
      {
        label: 'action grounding restriction',
        pattern: /action 은 rule grounding 없으면 생성 금지/,
      },
      { label: 'zod validation', pattern: /zod validation/ },
    ],
  },
  {
    file: 'prompts/codex/08-ui-implementation.md',
    checks: [
      { label: 'panic mode', pattern: /Panic Mode/ },
      { label: 'evidence drawer', pattern: /Evidence Drawer/ },
      { label: 'presentation resolution', pattern: /1920x1080/ },
    ],
  },
  {
    file: 'prompts/codex/09-voice-intents.md',
    checks: [
      { label: 'repeat intent', pattern: /다시 말해줘/ },
      { label: 'tts priority', pattern: /2\) TTS/ },
      {
        label: 'no ungrounded action',
        pattern: /grounding 없는 행동 추가 금지/,
      },
    ],
  },
  {
    file: 'prompts/codex/10-demo-mode-and-rehearsal.md',
    checks: [
      {
        label: 'prerecorded fallback',
        pattern: /prerecorded sample session fallback/,
      },
      { label: 'demo reset', pattern: /demo reset/ },
      { label: 'screenshot export', pattern: /screenshot\/export/ },
    ],
  },
]

let failureCount = 0

for (const promptCheck of promptChecks) {
  const filePath = path.join(rootDir, promptCheck.file)
  const content = readFileSync(filePath, 'utf8')
  const missingLabels = promptCheck.checks
    .filter(({ pattern }) => !pattern.test(content))
    .map(({ label }) => label)

  if (missingLabels.length > 0) {
    failureCount += 1
    console.error(`[missing] ${promptCheck.file}: ${missingLabels.join(', ')}`)
    continue
  }

  console.log(`[ok] ${promptCheck.file}`)
}

if (failureCount > 0) {
  console.error(
    `\nPrompt validation failed: ${failureCount} file(s) missing required content.`,
  )
  process.exit(1)
}

console.log(`\nPrompt validation passed for ${promptChecks.length} file(s).`)
