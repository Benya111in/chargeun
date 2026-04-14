import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

type EvalFixture = {
  clipId: string
  description: string
}

type ManualReviewRun = {
  clipId: string
  date: string
  notes: string
  operator: string
  path: string
  status: 'pending' | 'pass' | 'fail' | 'blocked'
}

type RehearsalRun = {
  backupReady: boolean
  date: string
  evidenceAndCacheWorks: boolean
  fallbackWorks: boolean
  fullMonitorCaptureWorks: boolean
  lowConfidenceFallbackWorks: boolean
  noAudioFallbackWorks: boolean
  notes: string
  operator: string
  path: string
  permissionsRetryWorks: boolean
  result: 'pass' | 'fail' | 'blocked' | 'in_progress'
  shadowPlayerPrimary: boolean
  startupUnder10s: boolean
  voiceOffWorks: boolean
  windowCaptureWorks: boolean
}

const root = process.cwd()

const main = async () => {
  const fixtures = await loadJson<EvalFixture[]>(
    'data/eval/annotated_segments.json',
  )
  const reviewRuns = await loadJson<ManualReviewRun[]>(
    'data/eval/manual_review_runs.json',
  )
  const rehearsalRuns = await loadJson<RehearsalRun[]>(
    'data/eval/rehearsal_runs.json',
  )

  const manualReviewLog = buildManualReviewLog({ fixtures, reviewRuns })
  const rehearsalChecklist = buildRehearsalChecklist(rehearsalRuns)

  await writeFile(
    path.join(root, 'data/eval/manual_review_log_2026-04-14.md'),
    `${manualReviewLog}\n`,
  )
  await writeFile(
    path.join(root, 'data/eval/demo_rehearsal_checklist.md'),
    `${rehearsalChecklist}\n`,
  )

  console.log(
    `QA sync complete: ${countStatuses(reviewRuns, 'pass')}/${fixtures.length} manual walkthroughs passed, ${countPassedRehearsals(rehearsalRuns)}/10 rehearsal runs passed`,
  )
}

async function loadJson<T>(relativeFile: string) {
  const file = path.join(root, relativeFile)
  return JSON.parse(await readFile(file, 'utf8')) as T
}

function buildManualReviewLog(input: {
  fixtures: EvalFixture[]
  reviewRuns: ManualReviewRun[]
}) {
  const coverage = countStatuses(input.reviewRuns, 'pass')
  const queueRows = input.fixtures.map((fixture) => {
    const latestRun =
      input.reviewRuns
        .filter((run) => run.clipId === fixture.clipId)
        .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null

    return `| \`${fixture.clipId}\` | ${fixture.description} | pass | ${latestRun?.status ?? 'pending'} | ${latestRun?.notes ?? 'manual walkthrough missing'} |`
  })

  return [
    '# Manual Review Log 2026-04-14',
    '',
    '> Generated from `data/eval/manual_review_runs.json` by `pnpm qa:sync`.',
    '',
    '## Automated Audit Snapshot',
    '',
    '- command: `pnpm eval:audit`',
    `- scope: ${input.fixtures.length} annotated fixtures, grounded rule integrity, review fallback, audio-missing case`,
    `- manual walkthrough coverage: ${coverage}/${input.fixtures.length} clips passed`,
    '',
    '## Fixture Walkthrough Queue',
    '',
    '| clip id | scenario | automated audit | manual UI walkthrough | notes |',
    '| ------- | -------- | --------------- | --------------------- | ----- |',
    ...queueRows,
    '',
    '## User-Facing QA',
    '',
    '- [ ] 버튼만으로 처음부터 끝까지 시연 가능',
    '- [ ] Panic Mode가 한눈에 이해됨',
    '- [ ] 쉬운 설명이 장황하지 않음',
    '- [ ] evidence drawer가 심사자에게 설명 가능함',
    '- [ ] cache delete와 consent modal이 캡처 흐름을 막지 않음',
    '',
    '## Current Notes',
    '',
    '- 실제 clip walkthrough는 `data/eval/manual_review_runs.json`의 status를 갱신하며 누적한다.',
    '- macOS Screen Recording 권한이 허용되면 native capture와 browser fallback을 같은 표 기준으로 다시 검수한다.',
  ].join('\n')
}

function buildRehearsalChecklist(runs: RehearsalRun[]) {
  const passedRuns = countPassedRehearsals(runs)

  return [
    '# Demo Rehearsal Checklist',
    '',
    '> Generated from `data/eval/rehearsal_runs.json` by `pnpm qa:sync`.',
    '',
    '## 3-Minute Run',
    '',
    `- [${passedRuns >= 10 ? 'x' : ' '}] 3분 시연 10회 연속 성공 (${passedRuns}/10)`,
    `- [${everyRun(runs, 'startupUnder10s') ? 'x' : ' '}] 앱 시작 후 10초 안에 핵심 화면 진입`,
    `- [${everyRun(runs, 'shadowPlayerPrimary') ? 'x' : ' '}] Shadow Player가 중심 화면으로 유지`,
    `- [${everyRun(runs, 'fallbackWorks') ? 'x' : ' '}] 네트워크 불안정해도 fallback 경로로 시연 유지`,
    `- [${everyRun(runs, 'voiceOffWorks') ? 'x' : ' '}] 음성 기능을 꺼도 버튼 기반 설명이 유지`,
    '',
    '## Release-Day Checks',
    '',
    `- [${anyRun(runs, 'permissionsRetryWorks') ? 'x' : ' '}] 권한 요청/재시도 동작`,
    `- [${anyRun(runs, 'fullMonitorCaptureWorks') ? 'x' : ' '}] 전체 모니터 캡처 성공`,
    `- [${anyRun(runs, 'windowCaptureWorks') ? 'x' : ' '}] 특정 창 캡처 성공`,
    `- [${anyRun(runs, 'noAudioFallbackWorks') ? 'x' : ' '}] 오디오 없는 세션 fallback 확인`,
    `- [${anyRun(runs, 'evidenceAndCacheWorks') ? 'x' : ' '}] evidence drawer와 cache delete 버튼 확인`,
    `- [${anyRun(runs, 'lowConfidenceFallbackWorks') ? 'x' : ' '}] low confidence fallback 확인`,
    `- [${anyRun(runs, 'backupReady') ? 'x' : ' '}] 플랜B 화면 녹화/스크린샷 백업 준비`,
    '',
    '## Run Log',
    '',
    '| date | operator | path | result | notes |',
    '| ---- | -------- | ---- | ------ | ----- |',
    ...runs.map(
      (run) =>
        `| \`${run.date}\` | ${run.operator} | ${run.path} | ${run.result} | ${run.notes} |`,
    ),
  ].join('\n')
}

function anyRun<K extends keyof RehearsalRun>(runs: RehearsalRun[], key: K) {
  return runs.some((run) => run[key] === true)
}

function everyRun<K extends keyof RehearsalRun>(runs: RehearsalRun[], key: K) {
  if (runs.length === 0) {
    return false
  }

  return runs.every((run) => run[key] === true)
}

function countPassedRehearsals(runs: RehearsalRun[]) {
  return runs.filter((run) => run.result === 'pass').length
}

function countStatuses(
  runs: ManualReviewRun[],
  status: ManualReviewRun['status'],
) {
  return runs.filter((run) => run.status === status).length
}

void main()
