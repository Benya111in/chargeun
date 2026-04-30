import { BookOpenText, Clapperboard, ShieldQuestion } from 'lucide-react'

import type {
  DemoRunbookStep,
  PrerecordedBackupSession,
} from '../lib/demo-runbook'
import { cn } from '../lib/utils'

export function DemoRunbookPanel({
  activeStepId,
  artifactBusy,
  artifactNotice,
  backupSessions,
  currentScenarioTitle,
  demoMode,
  lastSessionLabel,
  onExportArtifacts,
  onOpenEvidence,
  onSelectBackupSession,
  onSelectStep,
  onSetDemoMode,
  selectedBackupSessionId,
  showEvidence,
  steps,
}: {
  activeStepId: string
  artifactBusy: boolean
  artifactNotice: string
  backupSessions: PrerecordedBackupSession[]
  currentScenarioTitle: string
  demoMode: 'backup-replay' | 'live-priority'
  lastSessionLabel?: string
  onExportArtifacts: () => void | Promise<void>
  onOpenEvidence: () => void
  onSelectBackupSession: (sessionId: string) => void
  onSelectStep: (stepId: string) => void
  onSetDemoMode: (mode: 'backup-replay' | 'live-priority') => void
  selectedBackupSessionId: string | null
  showEvidence: boolean
  steps: DemoRunbookStep[]
}) {
  return (
    <section className="panel-edge">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Demo Mode
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            시연 런북과 백업 경로
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <ModeButton
            active={demoMode === 'live-priority'}
            onClick={() => onSetDemoMode('live-priority')}
          >
            라이브 우선
          </ModeButton>
          <ModeButton
            active={demoMode === 'backup-replay'}
            onClick={() => onSetDemoMode('backup-replay')}
          >
            백업 재생
          </ModeButton>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <PanelBadge tone={demoMode === 'backup-replay' ? 'review' : 'grounded'}>
          {demoMode === 'backup-replay' ? '플랜 B 대기 중' : '라이브 우선 시연'}
        </PanelBadge>
        <PanelBadge tone={showEvidence ? 'grounded' : 'neutral'}>
          {showEvidence ? '근거 패널 열림' : '근거 패널 닫힘'}
        </PanelBadge>
        <PanelBadge tone="neutral">{currentScenarioTitle}</PanelBadge>
        {lastSessionLabel ? (
          <PanelBadge tone="neutral">최근 세션 · {lastSessionLabel}</PanelBadge>
        ) : null}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-3">
          {steps.map((step) => (
            <button
              key={step.id}
              className={cn(
                'grid gap-1 rounded-md border px-4 py-3 text-left transition',
                activeStepId === step.id
                  ? 'border-[var(--ink)] bg-white'
                  : 'border-[var(--line)] bg-[var(--soft)] hover:border-[var(--ink)]/30',
              )}
              onClick={() => onSelectStep(step.id)}
              type="button"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                {step.timeWindow}
              </span>
              <span className="text-sm font-semibold text-[var(--ink)]">
                {step.title}
              </span>
              <span className="text-sm leading-6 text-[var(--muted)]">
                {step.cue}
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-3">
          <div className="rounded-md bg-[var(--soft)] px-4 py-4">
            <div className="flex items-center gap-2 text-[var(--ink)]">
              <BookOpenText className="size-4" />
              <p className="text-sm font-semibold">Q&A 바로가기</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              근거 패널을 바로 열어 어떤 rule에서 설명이 왔는지 즉시 보여
              줍니다.
            </p>
            <button
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:border-[var(--ink)]/40"
              onClick={onOpenEvidence}
              type="button"
            >
              <ShieldQuestion className="size-4" />
              근거 패널 바로 열기
            </button>
          </div>

          <div className="rounded-md bg-[var(--soft)] px-4 py-4">
            <div className="flex items-center gap-2 text-[var(--ink)]">
              <Clapperboard className="size-4" />
              <p className="text-sm font-semibold">발표 자료 export</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              현재 시연 상태를 JSON과 PNG로 저장해 플랜 B 자료로 남깁니다.
            </p>
            <button
              className={cn(
                'mt-3 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition',
                artifactBusy
                  ? 'cursor-not-allowed border-[var(--line)] bg-white text-[var(--muted)]'
                  : 'border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--ink)]/40',
              )}
              disabled={artifactBusy}
              onClick={onExportArtifacts}
              type="button"
            >
              <Clapperboard className="size-4" />
              {artifactBusy ? 'export 중' : '발표 자료 저장'}
            </button>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              {artifactNotice}
            </p>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2 text-[var(--ink)]">
              <Clapperboard className="size-4" />
              <p className="text-sm font-semibold">미리 준비한 백업</p>
            </div>
            {backupSessions.map((session) => {
              const isSelected =
                demoMode === 'backup-replay' &&
                selectedBackupSessionId === session.id

              return (
                <button
                  key={session.id}
                  className={cn(
                    'grid gap-1 rounded-md border px-3 py-3 text-left transition',
                    isSelected
                      ? 'border-[var(--ink)] bg-white'
                      : demoMode === 'backup-replay'
                        ? 'border-[var(--line)] bg-white hover:border-[var(--ink)]/40'
                        : 'border-[var(--line)] bg-[var(--soft)] hover:border-[var(--ink)]/30',
                  )}
                  onClick={() => onSelectBackupSession(session.id)}
                  type="button"
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold text-[var(--ink)]">
                    {session.title}
                    {isSelected ? (
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                        선택됨
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {session.trigger}
                  </span>
                  <span className="text-sm leading-6 text-[var(--muted)]">
                    {session.note}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'rounded-md border px-3 py-2 text-sm font-medium transition',
        active
          ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
          : 'border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--ink)]/40',
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function PanelBadge({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'grounded' | 'neutral' | 'review'
}) {
  const toneClass = {
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
