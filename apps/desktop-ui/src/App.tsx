import { useMemo, useState } from 'react'
import {
  Ear,
  Mic,
  MonitorPlay,
  RotateCcw,
  ScreenShare,
  ShieldAlert,
  Square,
} from 'lucide-react'

import { buildExplanation, buildVoiceReply } from '@ansimtrack/llm-orchestrator'
import { voiceIntentLabels, type VoiceIntent } from '@ansimtrack/shared-types'

import { LiveCapturePreview } from './components/LiveCapturePreview'
import { ShadowVideoStage } from './components/ShadowVideoStage'
import {
  capturePermissionLabels,
  captureStatusLabels,
} from './lib/capture-contract'
import { demoScenarios } from './lib/mock-session'
import { useCaptureController } from './lib/useCaptureController'
import { cn, formatClock, formatPercent } from './lib/utils'

type TrackKey = 'basic' | 'easy' | 'action' | 'reason' | 'caregiver' | 'report'

const trackLabels: Record<TrackKey, string> = {
  basic: '기본',
  easy: '쉬운말',
  action: '지금 할 일',
  reason: '이유',
  caregiver: '보호자',
  report: '신고',
}

const defaultVoiceReply = '버튼으로 현재 세그먼트를 다시 들을 수 있습니다.'
const initialScenario = demoScenarios[0]
const initialExplanation = buildExplanation({
  segment: initialScenario.segment,
  matchedRules: initialScenario.matchedRules,
})

function App() {
  const [scenarioId, setScenarioId] = useState(initialScenario.id)
  const [selectedTrack, setSelectedTrack] = useState<TrackKey>(
    getPreferredTrack(initialExplanation),
  )
  const [showEvidence, setShowEvidence] = useState(true)
  const [panicMode, setPanicMode] = useState(false)
  const [voiceReply, setVoiceReply] = useState(defaultVoiceReply)
  const capture = useCaptureController()

  const scenario = useMemo(
    () =>
      demoScenarios.find((item) => item.id === scenarioId) ?? demoScenarios[0],
    [scenarioId],
  )

  const explanation = useMemo(
    () =>
      buildExplanation({
        segment: scenario.segment,
        matchedRules: scenario.matchedRules,
      }),
    [scenario],
  )

  const availableTracks = useMemo(
    () =>
      (
        Object.entries(explanation.tracks) as Array<
          [TrackKey, string | undefined]
        >
      ).filter(([, value]) => Boolean(value)) as Array<[TrackKey, string]>,
    [explanation],
  )

  const currentRule = scenario.matchedRules[0]
  const selectedTrackText =
    explanation.tracks[selectedTrack] ??
    explanation.tracks.easy ??
    explanation.tracks.basic

  const handleVoice = (intent: VoiceIntent) => {
    const reply = buildVoiceReply({ explanation, intent })
    setVoiceReply(reply.text)
  }

  const handleScenarioToggle = () => {
    const nextId =
      scenario.id === 'grounded-fire' ? 'review-earthquake' : 'grounded-fire'
    const nextScenario =
      demoScenarios.find((item) => item.id === nextId) ?? demoScenarios[0]
    const nextExplanation = buildExplanation({
      segment: nextScenario.segment,
      matchedRules: nextScenario.matchedRules,
    })

    setScenarioId(nextId)
    setSelectedTrack(getPreferredTrack(nextExplanation))
    setVoiceReply(defaultVoiceReply)
    setPanicMode(false)
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-4 md:px-6 xl:px-8">
        <header className="grid gap-4 border-b border-[var(--line)] pb-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-md bg-[var(--ink)] px-3 py-1 text-sm font-semibold text-white">
                <ShieldAlert className="size-4" />
                안심트랙 Live
              </span>
              <StatusPill
                tone={scenario.segment.hazard === 'fire' ? 'danger' : 'calm'}
              >
                {scenario.segment.hazard === 'fire' ? '화재 인식' : '지진 검토'}
              </StatusPill>
              <StatusPill
                tone={
                  explanation.safetyMode === 'grounded' ? 'grounded' : 'review'
                }
              >
                {explanation.safetyMode === 'grounded'
                  ? '공식 근거 연결됨'
                  : '공식 확인 우선'}
              </StatusPill>
            </div>
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                4초 Shadow Player로 행동 판단을 붙잡아 줍니다.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)] md:text-base">
                행동 지시는 공식 재난행동요령에 근거할 때만 보여 줍니다. 확신이
                낮으면 공식 원문 확인을 먼저 안내합니다.
              </p>
            </div>
          </div>

          <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <Metric
              title="현재 세션"
              value={
                capture.state.activeSession?.displayName ??
                capture.state.selectedSource?.displayName ??
                scenario.session.displayName ??
                '데모 모니터'
              }
            />
            <Metric title="세그먼트 지연" value="04.0초" />
            <Metric
              title="신뢰도"
              value={formatPercent(scenario.segment.confidence)}
            />
          </section>
        </header>

        <main className="mt-4 grid flex-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.9fr)]">
          <section className="flex min-h-0 flex-col gap-4">
            <section className="panel-edge flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    캡처 시작
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                    브라우저 공유는 보조 기능입니다. 데스크톱 권한이 가능하면
                    현재 모니터 읽기를 우선하고, live preview lane은 replay
                    lane과 분리합니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    icon={<MonitorPlay className="size-4" />}
                    onClick={capture.actions.startNativeMonitor}
                    variant="primary"
                  >
                    현재 모니터 읽기 시작
                  </ActionButton>
                  <ActionButton
                    icon={<ScreenShare className="size-4" />}
                    onClick={capture.actions.startBrowserFallback}
                  >
                    브라우저 공유 시작
                  </ActionButton>
                  <ActionButton
                    disabled={!capture.state.activeSession}
                    icon={<Square className="size-4" />}
                    onClick={() =>
                      capture.actions.stopCapture(
                        '사용자가 live preview 캡처를 중지했습니다.',
                      )
                    }
                  >
                    캡처 중지
                  </ActionButton>
                  <ActionButton
                    icon={<RotateCcw className="size-4" />}
                    onClick={handleScenarioToggle}
                  >
                    저신뢰 데모 전환
                  </ActionButton>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <StatusPill tone={getCaptureTone(capture.state.status)}>
                  {captureStatusLabels[capture.state.status]}
                </StatusPill>
                <StatusPill tone={getPermissionTone(capture.state.permission)}>
                  {capturePermissionLabels[capture.state.permission]}
                </StatusPill>
                <StatusPill tone="neutral">
                  {capture.state.bootstrap.platform}
                </StatusPill>
              </div>

              <div className="flex flex-wrap gap-2">
                {capture.state.sources.map((source) => (
                  <button
                    key={source.id}
                    className={cn(
                      'rounded-md border px-3 py-2 text-left text-sm transition',
                      capture.state.selectedSourceId === source.id
                        ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                        : 'border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--ink)]/40',
                    )}
                    onClick={() => capture.actions.selectSource(source.id)}
                    type="button"
                  >
                    <span className="block font-medium">
                      {source.displayName}
                    </span>
                    <span
                      className={cn(
                        'mt-1 block text-xs',
                        capture.state.selectedSourceId === source.id
                          ? 'text-white/72'
                          : 'text-[var(--muted)]',
                      )}
                    >
                      {source.priority === 'primary' ? '우선 경로' : 'fallback'}{' '}
                      · {source.ready ? '준비됨' : '준비 중'}
                    </span>
                  </button>
                ))}
              </div>

              <LiveCapturePreview
                notice={capture.state.notice}
                selectedSource={capture.state.selectedSource}
                session={capture.state.activeSession}
                status={capture.state.status}
                stream={capture.state.previewStream}
              />
            </section>

            <section className="panel-edge flex min-h-[520px] flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    Shadow Player
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                    {scenario.segment.phaseLabel}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone="neutral">
                    {scenario.session.hasAudio ? '오디오 있음' : '오디오 없음'}
                  </StatusPill>
                  <StatusPill tone="neutral">
                    {formatClock(scenario.segment.startMs)} -{' '}
                    {formatClock(scenario.segment.endMs)}
                  </StatusPill>
                </div>
              </div>

              <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <ShadowVideoStage
                  key={scenario.id}
                  onToggleEvidence={() => setShowEvidence((value) => !value)}
                  onTogglePanic={() => setPanicMode((value) => !value)}
                  panicMode={panicMode}
                  scenario={scenario}
                />

                <aside className="flex flex-col gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    선택형 트랙
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableTracks.map(([track, value]) => (
                      <button
                        key={track}
                        className={cn(
                          'rounded-md border px-3 py-2 text-sm font-medium transition',
                          selectedTrack === track
                            ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                            : 'border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--ink)]/40',
                        )}
                        onClick={() => setSelectedTrack(track)}
                        type="button"
                      >
                        {trackLabels[track]}
                        <span className="sr-only">{value}</span>
                      </button>
                    ))}
                  </div>

                  <div className="rounded-md border border-[var(--line)] bg-white px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      선택된 설명
                    </p>
                    <p className="mt-3 text-lg font-semibold leading-8 text-[var(--ink)]">
                      {selectedTrackText}
                    </p>
                  </div>

                  <div className="grid gap-2 rounded-md border border-[var(--line)] bg-white px-4 py-4 text-sm text-[var(--muted)]">
                    <div>
                      <p className="font-semibold text-[var(--ink)]">이유</p>
                      <p className="mt-1 leading-6">
                        {explanation.tracks.reason}
                      </p>
                    </div>
                    {explanation.doNot ? (
                      <div>
                        <p className="font-semibold text-[var(--ink)]">
                          하지 말 것
                        </p>
                        <p className="mt-1 leading-6">{explanation.doNot}</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="font-semibold text-[var(--ink)]">
                        세그먼트 상태
                      </p>
                      <p className="mt-1 leading-6">
                        {scenario.segment.confidence < 0.72
                          ? '저신뢰 fallback으로 action을 숨겼습니다.'
                          : '공식 rule id가 있어 action과 report를 보여 줍니다.'}
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
            </section>
          </section>

          <section className="flex min-h-0 flex-col gap-4">
            <section className="panel-edge">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    현재 세그먼트
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                    {scenario.segment.title}
                  </h2>
                </div>
                <StatusPill tone={panicMode ? 'danger' : 'neutral'}>
                  {panicMode ? 'Panic 모드 켜짐' : '기본 설명 모드'}
                </StatusPill>
              </div>

              {explanation.safetyMode === 'review_official' ? (
                <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  근거가 약해서 행동 문장은 숨기고 공식 행동요령 확인을 먼저
                  안내합니다.
                </div>
              ) : null}

              <div className="mt-4 grid gap-4">
                {panicMode ? (
                  <section className="rounded-md border border-[var(--line)] bg-white px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Panic Mode
                    </p>
                    <div className="mt-4 grid gap-4 text-balance">
                      <PanicLine title="지금">
                        {explanation.tracks.action ??
                          '공식 원문을 먼저 확인하세요'}
                      </PanicLine>
                      <PanicLine title="금지">
                        {explanation.doNot ??
                          '근거가 약하면 행동 지시를 확정하지 않습니다'}
                      </PanicLine>
                      <PanicLine title="신고">
                        {explanation.tracks.report ??
                          '필요하면 공식 근거 패널을 열어 신고 문장을 확인하세요'}
                      </PanicLine>
                    </div>
                  </section>
                ) : (
                  <section className="rounded-md border border-[var(--line)] bg-white px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Segment Card
                    </p>
                    <p className="mt-3 text-2xl font-semibold leading-9 text-[var(--ink)]">
                      {selectedTrackText}
                    </p>
                    <dl className="mt-4 grid gap-3 text-sm text-[var(--muted)]">
                      <MetaRow label="재난 유형">
                        {scenario.segment.hazard === 'fire' ? '화재' : '지진'}
                      </MetaRow>
                      <MetaRow label="phase">{scenario.segment.phase}</MetaRow>
                      <MetaRow label="rule id">
                        {scenario.segment.officialRuleIds.join(', ') || '없음'}
                      </MetaRow>
                    </dl>
                  </section>
                )}

                <section className="rounded-md border border-[var(--line)] bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Voice Prompt Bar
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                        버튼 intent가 먼저입니다. 음성 입력이 없어도 같은 흐름을
                        시연할 수 있습니다.
                      </p>
                    </div>
                    <Mic className="size-5 text-[var(--muted)]" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(Object.keys(voiceIntentLabels) as VoiceIntent[]).map(
                      (intent) => (
                        <ActionButton
                          key={intent}
                          icon={<Ear className="size-4" />}
                          onClick={() => handleVoice(intent)}
                        >
                          {voiceIntentLabels[intent]}
                        </ActionButton>
                      ),
                    )}
                  </div>
                  <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--soft)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Transcript
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                      {voiceReply}
                    </p>
                  </div>
                </section>
              </div>
            </section>

            {showEvidence ? (
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
                  <StatusPill tone="neutral">
                    {currentRule ? 'rule 연결됨' : '공식 선택 필요'}
                  </StatusPill>
                </div>

                {currentRule ? (
                  <div className="mt-4 grid gap-4">
                    <div className="rounded-md border border-[var(--line)] bg-white px-4 py-4">
                      <dl className="grid gap-3 text-sm text-[var(--muted)]">
                        <MetaRow label="rule id">{currentRule.rule_id}</MetaRow>
                        <MetaRow label="phase">{currentRule.phase}</MetaRow>
                        <MetaRow label="출처">
                          {currentRule.source_title}
                        </MetaRow>
                        <MetaRow label="선택 이유">
                          OCR/ASR와 장면 객체가 현재 phase와 맞아서 이 규칙을
                          우선 사용합니다.
                        </MetaRow>
                      </dl>
                    </div>
                    <div className="rounded-md border border-[var(--line)] bg-white px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        공식 문장 재구성
                      </p>
                      <div className="mt-3 grid gap-3 text-sm leading-6 text-[var(--ink)]">
                        <EvidenceLine label="행동">
                          {currentRule.action}
                        </EvidenceLine>
                        {currentRule.do_not ? (
                          <EvidenceLine label="금지">
                            {currentRule.do_not}
                          </EvidenceLine>
                        ) : null}
                        <EvidenceLine label="이유">
                          {currentRule.why}
                        </EvidenceLine>
                        {currentRule.report_script ? (
                          <EvidenceLine label="신고">
                            {currentRule.report_script}
                          </EvidenceLine>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
                    공식 행동요령 선택이 아직 확정되지 않아 action track을
                    숨겼습니다.
                  </div>
                )}
              </section>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  )
}

function ActionButton({
  children,
  disabled = false,
  icon,
  onClick,
  variant = 'default',
}: {
  children: React.ReactNode
  disabled?: boolean
  icon: React.ReactNode
  onClick: () => void | Promise<void>
  variant?: 'default' | 'primary' | 'danger'
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition',
        disabled && 'cursor-not-allowed opacity-50',
        variant === 'primary' &&
          'border-rose-700 bg-rose-700 text-white hover:border-rose-800 hover:bg-rose-800',
        variant === 'danger' &&
          'border-[var(--ink)] bg-[var(--ink)] text-white hover:opacity-92',
        variant === 'default' &&
          'border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--ink)]/40',
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {children}
    </button>
  )
}

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'danger' | 'calm' | 'grounded' | 'review' | 'neutral'
}) {
  const toneClass = {
    danger: 'bg-rose-50 text-rose-800 ring-rose-200',
    calm: 'bg-teal-50 text-teal-800 ring-teal-200',
    grounded: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    review: 'bg-amber-50 text-amber-900 ring-amber-200',
    neutral: 'bg-white text-[var(--ink)] ring-[var(--line)]',
  }[tone]

  return (
    <span
      className={cn(
        'inline-flex rounded-md px-3 py-1 text-sm font-medium ring-1',
        toneClass,
      )}
    >
      {children}
    </span>
  )
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {title}
      </p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-[var(--ink)]">
        {value}
      </p>
    </section>
  )
}

function MetaRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[88px_1fr]">
      <dt className="font-semibold text-[var(--ink)]">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function EvidenceLine({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[64px_1fr]">
      <div className="font-semibold text-[var(--muted)]">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function PanicLine({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--soft)] px-4 py-3">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {title}
      </p>
      <p className="mt-2 text-2xl font-semibold leading-9 text-[var(--ink)]">
        {children}
      </p>
    </div>
  )
}

function getCaptureTone(status: string) {
  switch (status) {
    case 'running':
      return 'calm'
    case 'error':
      return 'danger'
    default:
      return 'neutral'
  }
}

function getPermissionTone(permission: string) {
  switch (permission) {
    case 'granted':
      return 'grounded'
    case 'denied':
      return 'review'
    case 'unsupported':
      return 'danger'
    default:
      return 'neutral'
  }
}

function getPreferredTrack(
  explanation: ReturnType<typeof buildExplanation>,
): TrackKey {
  if (explanation.tracks.action) {
    return 'action'
  }

  if (explanation.tracks.easy) {
    return 'easy'
  }

  return 'basic'
}

export default App
