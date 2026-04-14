import {
  CheckCheck,
  ClipboardCheck,
  FileWarning,
  TimerReset,
} from 'lucide-react'

import type {
  ManualReviewStatus,
  QaReviewState,
  RehearsalResult,
  RehearsalRunRecord,
} from '../lib/qa-review'
import {
  getManualReviewQueue,
  getLatestRehearsalRun,
  getManualReviewCoverage,
  getReleaseChecklistItems,
  getRehearsalPassCount,
} from '../lib/qa-review'
import { cn } from '../lib/utils'

export function QaReviewPanel({
  busy,
  clipPreviewSrc,
  clipPreviewTitle,
  manualReviewDraft,
  notice,
  onChangeManualReviewDraft,
  onChangeRehearsalDraft,
  onSelectFixture,
  onSubmitManualReview,
  onSubmitRehearsal,
  qaState,
  rehearsalDraft,
  selectedFixtureId,
}: {
  busy: boolean
  clipPreviewSrc: string | null
  clipPreviewTitle: string
  manualReviewDraft: {
    notes: string
    operator: string
    path: string
  }
  notice: string
  onChangeManualReviewDraft: (
    patch: Partial<{
      notes: string
      operator: string
      path: string
    }>,
  ) => void
  onChangeRehearsalDraft: (patch: Partial<RehearsalRunRecord>) => void
  onSelectFixture: (clipId: string) => void
  onSubmitManualReview: (status: ManualReviewStatus) => void | Promise<void>
  onSubmitRehearsal: () => void | Promise<void>
  qaState: QaReviewState
  rehearsalDraft: RehearsalRunRecord
  selectedFixtureId: string | null
}) {
  const coverage = getManualReviewCoverage(qaState)
  const rehearsalPasses = getRehearsalPassCount(qaState)
  const latestRehearsal = getLatestRehearsalRun(qaState)
  const manualReviewQueue = getManualReviewQueue(qaState)
  const releaseChecklist = getReleaseChecklistItems(qaState)
  const nextFixture =
    manualReviewQueue.find((fixture) => fixture.latestRun?.status !== 'pass') ??
    manualReviewQueue[0] ??
    null
  const remainingFixtureCount = manualReviewQueue.filter(
    (fixture) => fixture.latestRun?.status !== 'pass',
  ).length
  const selectedFixture =
    qaState.fixtures.find((fixture) => fixture.clipId === selectedFixtureId) ??
    qaState.fixtures[0] ??
    null

  return (
    <section className="panel-edge">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            QA Workspace
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            실제 clip 검수와 rehearsal 로그
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <SummaryBadge
            tone={
              coverage.passed === coverage.total && coverage.total > 0
                ? 'grounded'
                : 'review'
            }
          >
            manual review {coverage.passed}/{coverage.total}
          </SummaryBadge>
          <SummaryBadge tone={rehearsalPasses >= 10 ? 'grounded' : 'neutral'}>
            rehearsal {rehearsalPasses}/10
          </SummaryBadge>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{notice}</p>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-[var(--ink)]">
            <ClipboardCheck className="size-4" />
            <p className="text-sm font-semibold">fixture walkthrough</p>
          </div>

          <div className="rounded-md border border-[var(--line)] bg-white px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--ink)]">
                다음 walkthrough
              </p>
              <SummaryBadge
                tone={remainingFixtureCount === 0 ? 'grounded' : 'review'}
              >
                remaining {remainingFixtureCount}
              </SummaryBadge>
            </div>
            {nextFixture ? (
              <>
                <p className="mt-2 text-sm font-semibold text-[var(--ink)]">
                  {nextFixture.clipId}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {nextFixture.hazard} · {nextFixture.phase}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {nextFixture.latestRun?.notes ??
                    'actual clip path를 연결하고 근거/음성/발표 흐름을 확인하세요.'}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                등록된 fixture가 아직 없습니다.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            {manualReviewQueue.map((fixture) => {
              const latestRun = fixture.latestRun
              return (
                <button
                  key={fixture.clipId}
                  className={cn(
                    'grid gap-1 rounded-md border px-3 py-3 text-left transition',
                    selectedFixture?.clipId === fixture.clipId
                      ? 'border-[var(--ink)] bg-white'
                      : 'border-[var(--line)] bg-[var(--soft)] hover:border-[var(--ink)]/30',
                  )}
                  onClick={() => onSelectFixture(fixture.clipId)}
                  type="button"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--ink)]">
                      {fixture.clipId}
                    </span>
                    <RunBadge status={latestRun?.status ?? 'pending'} />
                  </div>
                  <span className="text-sm leading-6 text-[var(--muted)]">
                    {fixture.description}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {fixture.hazard} · {fixture.phase} · rule{' '}
                    {fixture.expectedRuleIds.join(', ') || 'none'}
                  </span>
                </button>
              )
            })}
          </div>

          {selectedFixture ? (
            <div className="grid gap-3 rounded-md border border-[var(--line)] bg-white px-4 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Selected Fixture
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--ink)]">
                  {selectedFixture.clipId}
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  {selectedFixture.description}
                </p>
              </div>

              <div className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--ink)]">
                {clipPreviewSrc && isLikelyVideoPath(clipPreviewSrc) ? (
                  <video
                    className="aspect-video w-full bg-black object-contain"
                    controls
                    preload="metadata"
                    src={clipPreviewSrc}
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center px-6 text-center text-sm leading-6 text-white/72">
                    local clip path를 넣으면 여기서 바로 preview 할 수 있습니다.
                  </div>
                )}
              </div>
              <p className="text-xs leading-5 text-[var(--muted)]">
                {clipPreviewSrc
                  ? `${clipPreviewTitle}: ${clipPreviewSrc}`
                  : 'actual clip path가 아직 없습니다.'}
              </p>

              <LabeledInput
                label="operator"
                onChange={(value) =>
                  onChangeManualReviewDraft({ operator: value })
                }
                placeholder="예: slowlearner-1"
                value={manualReviewDraft.operator}
              />
              <LabeledInput
                label="clip path / path label"
                onChange={(value) => onChangeManualReviewDraft({ path: value })}
                placeholder="예: /Users/.../fire-clip-01.mov"
                value={manualReviewDraft.path}
              />
              <LabeledTextarea
                label="notes"
                onChange={(value) =>
                  onChangeManualReviewDraft({ notes: value })
                }
                placeholder="근거 패널, 음성, phase 경계, 발표 멘트 흐름에서 본 점"
                value={manualReviewDraft.notes}
              />
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  busy={busy}
                  onClick={() => onSubmitManualReview('pass')}
                  tone="grounded"
                >
                  pass
                </ActionButton>
                <ActionButton
                  busy={busy}
                  onClick={() => onSubmitManualReview('fail')}
                  tone="danger"
                >
                  fail
                </ActionButton>
                <ActionButton
                  busy={busy}
                  onClick={() => onSubmitManualReview('blocked')}
                  tone="review"
                >
                  blocked
                </ActionButton>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-[var(--ink)]">
            <TimerReset className="size-4" />
            <p className="text-sm font-semibold">3-minute rehearsal</p>
          </div>

          <div className="grid gap-3 rounded-md border border-[var(--line)] bg-white px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--ink)]">
                release checklist snapshot
              </p>
              <SummaryBadge
                tone={
                  releaseChecklist.every((item) => item.status === 'ready')
                    ? 'grounded'
                    : 'review'
                }
              >
                {
                  releaseChecklist.filter((item) => item.status === 'ready')
                    .length
                }
                /{releaseChecklist.length}
              </SummaryBadge>
            </div>
            <div className="grid gap-2">
              {releaseChecklist.map((item) => (
                <ChecklistRow
                  detail={item.detail}
                  key={item.id}
                  label={item.label}
                  status={item.status}
                />
              ))}
            </div>
          </div>

          <div className="rounded-md border border-[var(--line)] bg-white px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--ink)]">
                최근 rehearsal 상태
              </p>
              <SummaryBadge
                tone={
                  latestRehearsal?.result === 'pass'
                    ? 'grounded'
                    : latestRehearsal?.result === 'fail'
                      ? 'danger'
                      : 'review'
                }
              >
                {latestRehearsal?.result ?? 'pending'}
              </SummaryBadge>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {latestRehearsal?.notes ??
                '권한/실제 clip이 준비되면 run log를 계속 누적합니다.'}
            </p>
          </div>

          <div className="grid gap-3 rounded-md border border-[var(--line)] bg-white px-4 py-4">
            <LabeledInput
              label="operator"
              onChange={(value) => onChangeRehearsalDraft({ operator: value })}
              placeholder="예: slowlearner-1"
              value={rehearsalDraft.operator}
            />
            <LabeledInput
              label="path"
              onChange={(value) => onChangeRehearsalDraft({ path: value })}
              placeholder="예: actual clip + native capture"
              value={rehearsalDraft.path}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleField
                checked={rehearsalDraft.startupUnder10s}
                label="10초 안 진입"
                onChange={(checked) =>
                  onChangeRehearsalDraft({ startupUnder10s: checked })
                }
              />
              <ToggleField
                checked={rehearsalDraft.shadowPlayerPrimary}
                label="Shadow 중심"
                onChange={(checked) =>
                  onChangeRehearsalDraft({ shadowPlayerPrimary: checked })
                }
              />
              <ToggleField
                checked={rehearsalDraft.fallbackWorks}
                label="fallback 유지"
                onChange={(checked) =>
                  onChangeRehearsalDraft({ fallbackWorks: checked })
                }
              />
              <ToggleField
                checked={rehearsalDraft.voiceOffWorks}
                label="voice off 유지"
                onChange={(checked) =>
                  onChangeRehearsalDraft({ voiceOffWorks: checked })
                }
              />
              <ToggleField
                checked={rehearsalDraft.permissionsRetryWorks}
                label="권한 재시도"
                onChange={(checked) =>
                  onChangeRehearsalDraft({ permissionsRetryWorks: checked })
                }
              />
              <ToggleField
                checked={rehearsalDraft.fullMonitorCaptureWorks}
                label="전체 모니터"
                onChange={(checked) =>
                  onChangeRehearsalDraft({ fullMonitorCaptureWorks: checked })
                }
              />
              <ToggleField
                checked={rehearsalDraft.windowCaptureWorks}
                label="특정 창"
                onChange={(checked) =>
                  onChangeRehearsalDraft({ windowCaptureWorks: checked })
                }
              />
              <ToggleField
                checked={rehearsalDraft.noAudioFallbackWorks}
                label="무음 fallback"
                onChange={(checked) =>
                  onChangeRehearsalDraft({ noAudioFallbackWorks: checked })
                }
              />
              <ToggleField
                checked={rehearsalDraft.evidenceAndCacheWorks}
                label="근거/캐시"
                onChange={(checked) =>
                  onChangeRehearsalDraft({ evidenceAndCacheWorks: checked })
                }
              />
              <ToggleField
                checked={rehearsalDraft.lowConfidenceFallbackWorks}
                label="저신뢰 fallback"
                onChange={(checked) =>
                  onChangeRehearsalDraft({
                    lowConfidenceFallbackWorks: checked,
                  })
                }
              />
              <ToggleField
                checked={rehearsalDraft.backupReady}
                label="플랜B 준비"
                onChange={(checked) =>
                  onChangeRehearsalDraft({ backupReady: checked })
                }
              />
            </div>
            <LabeledTextarea
              label="notes"
              onChange={(value) => onChangeRehearsalDraft({ notes: value })}
              placeholder="버벅임, 음성, 근거 설명, 발표 흐름에서 보인 리스크"
              value={rehearsalDraft.notes}
            />
            <div className="flex flex-wrap gap-2">
              {(
                ['pass', 'in_progress', 'blocked', 'fail'] as RehearsalResult[]
              ).map((result) => (
                <button
                  key={result}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm font-medium transition',
                    rehearsalDraft.result === result
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                      : 'border-[var(--line)] bg-[var(--soft)] text-[var(--ink)] hover:border-[var(--ink)]/40',
                  )}
                  onClick={() => onChangeRehearsalDraft({ result })}
                  type="button"
                >
                  {result}
                </button>
              ))}
            </div>
            <ActionButton
              busy={busy}
              onClick={onSubmitRehearsal}
              tone="neutral"
            >
              rehearsal log 추가
            </ActionButton>
          </div>

          <div className="grid gap-2">
            {qaState.rehearsalRuns
              .slice()
              .reverse()
              .slice(0, 4)
              .map((run, index) => (
                <div
                  key={`${run.date}-${run.operator}-${index}`}
                  className="rounded-md border border-[var(--line)] bg-[var(--soft)] px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--ink)]">
                      {run.date} · {run.operator}
                    </span>
                    <RunBadge status={run.result} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">{run.path}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    {run.notes}
                  </p>
                </div>
              ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function LabeledInput({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string
  onChange: (value: string) => void
  placeholder: string
  value: string
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </span>
      <input
        className="rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  )
}

function LabeledTextarea({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string
  onChange: (value: string) => void
  placeholder: string
  value: string
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </span>
      <textarea
        className="min-h-[96px] rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  )
}

function ToggleField({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--soft)] px-3 py-2 text-sm text-[var(--ink)]">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  )
}

function ActionButton({
  busy,
  children,
  onClick,
  tone,
}: {
  busy: boolean
  children: React.ReactNode
  onClick: () => void | Promise<void>
  tone: 'danger' | 'grounded' | 'neutral' | 'review'
}) {
  const toneClass = {
    danger: 'border-rose-700 bg-rose-700 text-white',
    grounded: 'border-emerald-700 bg-emerald-700 text-white',
    neutral: 'border-[var(--ink)] bg-[var(--ink)] text-white',
    review: 'border-amber-500 bg-amber-50 text-amber-900',
  }[tone]

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition',
        busy && 'cursor-not-allowed opacity-50',
        toneClass,
      )}
      disabled={busy}
      onClick={onClick}
      type="button"
    >
      {busy ? (
        <TimerReset className="size-4" />
      ) : (
        <CheckCheck className="size-4" />
      )}
      {children}
    </button>
  )
}

function SummaryBadge({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'danger' | 'grounded' | 'neutral' | 'review'
}) {
  const toneClass = {
    danger: 'bg-rose-50 text-rose-800',
    grounded: 'bg-emerald-50 text-emerald-800',
    neutral: 'bg-white text-[var(--ink)]',
    review: 'bg-amber-50 text-amber-900',
  }[tone]

  return (
    <span
      className={cn(
        'inline-flex rounded-md px-3 py-1 text-sm font-medium',
        toneClass,
      )}
    >
      {children}
    </span>
  )
}

function RunBadge({
  status,
}: {
  status: ManualReviewStatus | RehearsalResult
}) {
  const toneClass =
    status === 'pass'
      ? 'bg-emerald-50 text-emerald-800'
      : status === 'fail'
        ? 'bg-rose-50 text-rose-800'
        : status === 'blocked'
          ? 'bg-amber-50 text-amber-900'
          : 'bg-white text-[var(--ink)]'

  const Icon =
    status === 'pass'
      ? CheckCheck
      : status === 'fail'
        ? FileWarning
        : status === 'blocked'
          ? FileWarning
          : ClipboardCheck

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
        toneClass,
      )}
    >
      <Icon className="size-3.5" />
      {status}
    </span>
  )
}

function ChecklistRow({
  detail,
  label,
  status,
}: {
  detail: string
  label: string
  status: 'pending' | 'ready'
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-[var(--line)] bg-[var(--soft)] px-3 py-2">
      <div className="grid gap-1">
        <p className="text-sm font-medium text-[var(--ink)]">{label}</p>
        <p className="text-xs leading-5 text-[var(--muted)]">{detail}</p>
      </div>
      <SummaryBadge tone={status === 'ready' ? 'grounded' : 'review'}>
        {status}
      </SummaryBadge>
    </div>
  )
}

function isLikelyVideoPath(path: string) {
  return /\.(mp4|mov|m4v|webm|ogg)$/i.test(path)
}
