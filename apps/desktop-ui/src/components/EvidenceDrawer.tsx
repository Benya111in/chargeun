import type { GroundedRuleMatch } from '@ansimtrack/llm-orchestrator'
import type { PerceptionPacket, Segment } from '@ansimtrack/shared-types'

import { cn, formatPercent } from '../lib/utils'

export function EvidenceDrawer({
  packet,
  reviewMode,
  ruleMatches,
  segment,
}: {
  packet: PerceptionPacket
  reviewMode: boolean
  ruleMatches: GroundedRuleMatch[]
  segment: Pick<
    Segment,
    'confidence' | 'endMs' | 'hazard' | 'officialRuleIds' | 'phase' | 'startMs'
  >
}) {
  const primaryMatch = ruleMatches[0]

  return (
    <section className="panel-edge">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Source Evidence
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            근거 패널
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DrawerBadge tone={reviewMode ? 'review' : 'grounded'}>
            {reviewMode ? '공식 확인 우선' : 'grounded'}
          </DrawerBadge>
          <DrawerBadge tone="neutral">{ruleMatches.length}개 후보</DrawerBadge>
        </div>
      </div>

      <div className="mt-5 grid gap-5">
        <section className="grid gap-3 border-b border-[var(--line)] pb-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <EvidenceMetric label="재난">
              {getHazardName(segment.hazard)}
            </EvidenceMetric>
            <EvidenceMetric label="phase">{segment.phase}</EvidenceMetric>
            <EvidenceMetric label="신뢰도">
              {formatPercent(segment.confidence)}
            </EvidenceMetric>
            <EvidenceMetric label="window">
              {Math.max(0, segment.endMs - segment.startMs) / 1000}s
            </EvidenceMetric>
          </div>
          {primaryMatch ? (
            <div className="grid gap-2">
              <p className="text-sm font-semibold text-[var(--ink)]">
                선택된 규칙: {primaryMatch.rule.rule_id}
              </p>
              <p className="text-sm leading-6 text-[var(--muted)]">
                출처: {primaryMatch.rule.source_title}
              </p>
              <p className="text-sm leading-6 text-[var(--muted)]">
                {primaryMatch.rule.why}
              </p>
              <div className="flex flex-wrap gap-2">
                {primaryMatch.matchedSignals.map((signal) => (
                  <SignalChip key={signal} signal={signal} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm leading-6 text-[var(--muted)]">
              grounding evidence가 부족해 action track을 숨기고 공식 확인 모드로
              유지합니다.
            </p>
          )}
        </section>

        <section className="grid gap-4 border-b border-[var(--line)] pb-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-3">
            <DrawerSectionTitle>관찰 신호</DrawerSectionTitle>
            <EvidenceBlock label="ASR">
              {packet.asrText || '음성 근거 없음'}
            </EvidenceBlock>
            <EvidenceList
              emptyLabel="OCR 근거 없음"
              items={packet.ocrTokens}
              label="OCR"
            />
            <EvidenceList
              emptyLabel="UI label 없음"
              items={packet.uiElements.map((item) => item.label)}
              label="UI"
            />
            <EvidenceList
              emptyLabel="Object hint 없음"
              items={packet.objectHints.map((item) => item.label)}
              label="Objects"
            />
          </div>

          <div className="grid gap-3">
            <DrawerSectionTitle>Packet 상태</DrawerSectionTitle>
            <div className="grid gap-2 text-sm text-[var(--muted)]">
              <MetaLine label="session">{packet.sessionId}</MetaLine>
              <MetaLine label="time">
                {packet.tStartMs} - {packet.tEndMs}
              </MetaLine>
              <MetaLine label="keyframes">{packet.keyframes.length}개</MetaLine>
              <MetaLine label="grounded ids">
                {segment.officialRuleIds.join(', ') || '없음'}
              </MetaLine>
            </div>
            <div className="rounded-md bg-[var(--soft)] px-3 py-3 text-sm leading-6 text-[var(--muted)]">
              실제 live capture 연결 전까지는 demo packet을 사용하지만,
              grounding과 fallback 로직은 같은 경로를 탑니다.
            </div>
          </div>
        </section>

        <section className="grid gap-3">
          <DrawerSectionTitle>규칙 후보</DrawerSectionTitle>
          {ruleMatches.length > 0 ? (
            <div className="grid gap-3">
              {ruleMatches.map((match, index) => (
                <div
                  key={match.rule.rule_id}
                  className={cn(
                    'grid gap-2 rounded-md border px-3 py-3 text-sm',
                    index === 0
                      ? 'border-[var(--ink)] bg-white'
                      : 'border-[var(--line)] bg-[var(--soft)]',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-[var(--ink)]">
                      {match.rule.rule_id}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      <span>{match.rule.phase}</span>
                      <span>score {match.score.toFixed(1)}</span>
                    </div>
                  </div>
                  <p className="leading-6 text-[var(--ink)]">
                    {match.rule.action}
                  </p>
                  <p className="text-sm leading-6 text-[var(--muted)]">
                    {match.rule.source_title}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {match.matchedSignals.map((signal) => (
                      <SignalChip
                        key={`${match.rule.rule_id}-${signal}`}
                        signal={signal}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-[var(--muted)]">
              현재 packet만으로는 공식 rule candidate를 안정적으로 고르지
              못했습니다.
            </p>
          )}
        </section>
      </div>
    </section>
  )
}

function EvidenceMetric({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="rounded-md bg-white px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-[var(--ink)]">{children}</p>
    </div>
  )
}

function DrawerSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
      {children}
    </p>
  )
}

function EvidenceBlock({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold text-[var(--ink)]">{label}</p>
      <div className="rounded-md bg-white px-3 py-3 text-sm leading-6 text-[var(--muted)]">
        {children}
      </div>
    </div>
  )
}

function EvidenceList({
  emptyLabel,
  items,
  label,
}: {
  emptyLabel: string
  items: string[]
  label: string
}) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold text-[var(--ink)]">{label}</p>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={`${label}-${item}`}
              className="inline-flex rounded-md bg-white px-3 py-2 text-sm text-[var(--ink)]"
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">{emptyLabel}</p>
      )}
    </div>
  )
}

function MetaLine({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[84px_1fr]">
      <span className="font-semibold text-[var(--ink)]">{label}</span>
      <span>{children}</span>
    </div>
  )
}

function SignalChip({ signal }: { signal: string }) {
  const [prefix, ...rest] = signal.split(':')
  const value = rest.join(':')
  const label =
    {
      continuity: '연속성',
      evidence: '근거',
      phase: 'phase',
      segment: 'segment',
      when: 'when',
    }[prefix] ?? prefix

  return (
    <span className="inline-flex rounded-md border border-[var(--line)] bg-white px-2 py-1 text-xs text-[var(--muted)]">
      {label} · {value}
    </span>
  )
}

function DrawerBadge({
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

function getHazardName(hazard: Segment['hazard']) {
  switch (hazard) {
    case 'fire':
      return '화재'
    case 'earthquake':
      return '지진'
    default:
      return '미확정'
  }
}
