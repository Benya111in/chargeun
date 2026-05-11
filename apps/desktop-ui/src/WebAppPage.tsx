import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  LockKeyhole,
  MonitorPlay,
  PanelRightOpen,
  Play,
  ShieldAlert,
  Square,
} from 'lucide-react'

import {
  applySafetyGuardrails,
  type GroundedRuleMatch,
} from '@ansimtrack/llm-orchestrator'
import type {
  HazardType,
  PerceptionPacket,
  Segment,
  SegmentExplanation,
} from '@ansimtrack/shared-types'

import { EvidenceDrawer } from './components/EvidenceDrawer'
import { ShadowVideoStage } from './components/ShadowVideoStage'
import {
  buildLiveAnalysisFromPacket,
  summarizePacket,
} from './lib/live-analysis'
import { liveRuleCatalog } from './lib/rule-catalog'
import { useWebAudioTranscription } from './lib/useWebAudioTranscription'
import { useWebCaptureController } from './lib/useWebCaptureController'
import { useWebPerceptionAnalysis } from './lib/useWebPerceptionAnalysis'
import { cn, formatClock, formatPercent } from './lib/utils'
import {
  getWebApiHealth,
  sendClientEvent,
  type WebApiHealth,
} from './lib/web-analysis-api'
import {
  isDesktopBrowserForLiveCapture,
  loadStoredBetaCode,
  saveStoredBetaCode,
} from './lib/web-runtime'

type TrackKey = 'easy' | 'action' | 'reason' | 'caregiver' | 'report'

const trackLabels: Record<TrackKey, string> = {
  action: '지금 할 일',
  caregiver: '보호자',
  easy: '쉬운말',
  reason: '이유',
  report: '신고',
}

const placeholderPacket: PerceptionPacket = {
  asrText: '',
  keyframes: [],
  objectHints: [],
  ocrTokens: [],
  sessionId: 'web-waiting',
  tEndMs: 4_000,
  tStartMs: 0,
  uiElements: [],
}

const placeholderSegment = {
  confidence: 0.2,
  endMs: 4_000,
  hazard: 'unknown' as HazardType,
  id: 'web-waiting-segment',
  officialRuleIds: [],
  phase: 'waiting',
  phaseLabel: '분석 대기',
  sessionId: 'web-waiting',
  startMs: 0,
  title: '화면을 공유하면 장면을 읽습니다',
}

const placeholderExplanation: SegmentExplanation = {
  overlayTargets: [],
  safetyMode: 'review_official',
  segmentId: placeholderSegment.id,
  tracks: {
    basic: '화면 공유를 시작하면 현재 장면을 읽습니다.',
    easy: '화면 공유를 시작해 주세요. 위험한 행동은 확실할 때만 알려 줍니다.',
    reason:
      '공식 재난행동요령과 현재 화면 단서가 함께 맞을 때만 행동 문장을 보여 줍니다.',
  },
}

function WebAppPage() {
  const [betaCode, setBetaCode] = useState(() => loadStoredBetaCode())
  const [betaInput, setBetaInput] = useState(betaCode)
  const [health, setHealth] = useState<WebApiHealth | null>(null)
  const [healthMessage, setHealthMessage] = useState(
    '분석 서버 상태를 확인하는 중입니다.',
  )
  const [panicMode, setPanicMode] = useState(false)
  const [requestedTrack, setRequestedTrack] = useState<TrackKey>('easy')
  const [showEvidence, setShowEvidence] = useState(false)
  const capture = useWebCaptureController()
  const betaReady = betaCode.trim().length > 0
  const desktopReady = isDesktopBrowserForLiveCapture()
  const audio = useWebAudioTranscription({
    betaCode,
    enabled: betaReady && Boolean(capture.state.activeSession),
    session: capture.state.activeSession,
    stream: capture.state.previewStream,
  })
  const webPerception = useWebPerceptionAnalysis({
    asrText: audio.asrText,
    betaCode,
    captureInput: capture.state.captureInput,
    enabled: betaReady,
  })

  useEffect(() => {
    let cancelled = false

    void getWebApiHealth()
      .then((nextHealth) => {
        if (cancelled) {
          return
        }

        setHealth(nextHealth)
        setHealthMessage(
          nextHealth.status === 'ready'
            ? `분석 서버 준비됨 · ${nextHealth.models.analysis}`
            : '분석 서버에 OpenAI API key가 설정되지 않았습니다.',
        )
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setHealthMessage(
          error instanceof Error
            ? error.message
            : '분석 서버 상태를 확인하지 못했습니다.',
        )
      })

    return () => {
      cancelled = true
    }
  }, [])

  const liveAnalysis = useMemo(() => {
    if (!webPerception.packet || !capture.state.activeSession) {
      return null
    }

    return buildLiveAnalysisFromPacket({
      packet: webPerception.packet,
      rules: liveRuleCatalog,
      session: capture.state.activeSession,
    })
  }, [capture.state.activeSession, webPerception.packet])

  const analysis = useMemo(() => {
    if (liveAnalysis) {
      return liveAnalysis
    }

    return {
      cacheKey: 'web-waiting',
      explanation: placeholderExplanation,
      overlaySummary: '화면 공유 대기',
      overlayTargets: [],
      packet: placeholderPacket,
      packetSummary: summarizePacket(placeholderPacket),
      phaseLabel: placeholderSegment.phaseLabel,
      plan: null,
      ruleMatches: [] as GroundedRuleMatch[],
      segment: placeholderSegment,
      videoCaption:
        '브라우저 화면공유를 시작하면 화면 일부가 분석 서버로 전송될 수 있습니다.',
    }
  }, [liveAnalysis])

  const safetyView = useMemo(
    () =>
      applySafetyGuardrails({
        evidenceVisible: showEvidence,
        explanation: analysis.explanation,
        panicMode,
        privacyConsent: betaReady,
        segment: analysis.segment,
      }),
    [
      analysis.explanation,
      analysis.segment,
      betaReady,
      panicMode,
      showEvidence,
    ],
  )
  const explanation = safetyView.explanation
  const segment = analysis.segment
  const availableTracks = useMemo(
    () =>
      (Object.entries(trackLabels) as Array<[TrackKey, string]>).filter(
        ([track]) => Boolean(explanation.tracks[track]),
      ),
    [explanation.tracks],
  )
  const selectedTrack = explanation.tracks[requestedTrack]
    ? requestedTrack
    : (availableTracks[0]?.[0] ?? 'easy')
  const selectedTrackText =
    explanation.tracks[selectedTrack] ??
    explanation.tracks.easy ??
    explanation.tracks.basic
  const shadowScenario = useMemo(
    () => ({
      emptyFrameMessage:
        '화면 공유를 시작하면 4초 늦은 화면이 여기에 나타납니다.',
      id: liveAnalysis
        ? `web-live-${analysis.cacheKey}`
        : capture.state.activeSession
          ? 'web-capturing'
          : 'web-waiting',
      overlaySummary: analysis.overlaySummary,
      overlayTargets: analysis.overlayTargets,
      playbackMode: capture.state.captureInput.frameWindow.length
        ? ('live' as const)
        : ('waiting' as const),
      segment: {
        endMs: segment.endMs,
        hazard: segment.hazard,
        startMs: segment.startMs,
        title: segment.title,
      },
      videoCaption: analysis.videoCaption,
    }),
    [
      analysis.cacheKey,
      analysis.overlaySummary,
      analysis.overlayTargets,
      analysis.videoCaption,
      capture.state.activeSession,
      capture.state.captureInput.frameWindow.length,
      liveAnalysis,
      segment,
    ],
  )

  const handleSaveBetaCode = () => {
    const nextCode = betaInput.trim()
    setBetaCode(nextCode)
    saveStoredBetaCode(nextCode)
  }

  const handleStartShare = async () => {
    if (!betaReady) {
      return
    }

    const result = await capture.actions.startScreenShare()
    if (!result.ok) {
      sendClientEvent({
        eventType: 'screen-share-start-failed',
        message: result.notice,
        route: '/',
      })
    }
  }

  const liveEnabled = Boolean(capture.state.activeSession)

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-4 py-4 md:px-6 xl:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-md bg-[var(--ink)] px-3 py-1 text-sm font-semibold text-white">
              <ShieldAlert className="size-4" />
              안심트랙 Live Lab
            </span>
            <StatusPill
              tone={health?.status === 'ready' ? 'grounded' : 'review'}
            >
              {healthMessage}
            </StatusPill>
            <StatusPill tone={betaReady ? 'grounded' : 'review'}>
              {betaReady ? '베타 코드 연결됨' : '베타 코드 필요'}
            </StatusPill>
          </div>
        </header>

        <main className="grid flex-1 gap-4 py-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)]">
          <section className="flex flex-col gap-4">
            <section className="panel-edge">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    실험 기능
                  </p>
                  <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
                    화면공유 AI 분석을 테스트합니다.
                  </h1>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted)]">
                    이 화면은 실험실 기능입니다. 실제 학습은 안심트랙 연습
                    홈에서 검수된 재난안전 장면으로 진행해 주세요.
                  </p>
                </div>

                <div className="grid gap-3">
                  <BetaAccessForm
                    betaInput={betaInput}
                    betaReady={betaReady}
                    onChange={setBetaInput}
                    onSubmit={handleSaveBetaCode}
                  />
                  <div className="grid gap-2">
                    <StepLine
                      active={betaReady}
                      icon={<LockKeyhole className="size-4" />}
                    >
                      베타 코드를 입력합니다.
                    </StepLine>
                    <StepLine
                      active={liveEnabled}
                      icon={<MonitorPlay className="size-4" />}
                    >
                      화면 공유를 시작합니다.
                    </StepLine>
                    <StepLine
                      active={Boolean(liveAnalysis)}
                      icon={<Eye className="size-4" />}
                    >
                      쉬운 설명을 골라 봅니다.
                    </StepLine>
                  </div>
                </div>
              </div>

              {!desktopReady ? (
                <NoticeBanner tone="review">
                  모바일에서는 화면 공유 분석을 사용할 수 없습니다. 데스크톱
                  Chrome에서 열어 주세요.
                </NoticeBanner>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton
                  disabled={!betaReady || !desktopReady || liveEnabled}
                  icon={<Play className="size-4" />}
                  onClick={handleStartShare}
                  variant="primary"
                >
                  화면 공유 시작
                </ActionButton>
                <ActionButton
                  disabled={!liveEnabled}
                  icon={<Square className="size-4" />}
                  onClick={() => void capture.actions.stopCapture()}
                >
                  화면 공유 중지
                </ActionButton>
                <ActionButton
                  icon={<ShieldAlert className="size-4" />}
                  onClick={() => setPanicMode((value) => !value)}
                  variant={panicMode ? 'danger' : 'default'}
                >
                  Panic Mode
                </ActionButton>
                <ActionButton
                  icon={<PanelRightOpen className="size-4" />}
                  onClick={() => setShowEvidence((value) => !value)}
                >
                  근거 보기
                </ActionButton>
                <a className="link-button" href="/">
                  연습 홈으로 가기
                </a>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Metric title="공유 상태" value={capture.state.notice} />
                <Metric
                  title="분석 상태"
                  value={webPerception.message ?? '대기 중'}
                />
                <Metric
                  title="음성 상태"
                  value={audio.message ?? '오디오 없음도 정상입니다'}
                />
              </div>
            </section>

            <section className="panel-edge flex min-h-[560px] flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    Shadow Player
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                    {analysis.phaseLabel}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone={liveEnabled ? 'grounded' : 'neutral'}>
                    {liveEnabled ? '화면 공유 중' : '화면 공유 전'}
                  </StatusPill>
                  <StatusPill tone="neutral">
                    {formatClock(segment.startMs)} -{' '}
                    {formatClock(segment.endMs)}
                  </StatusPill>
                </div>
              </div>

              <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <ShadowVideoStage
                  captureInput={capture.state.captureInput}
                  onToggleEvidence={() => setShowEvidence((value) => !value)}
                  onTogglePanic={() => setPanicMode((value) => !value)}
                  panicMode={panicMode}
                  scenario={shadowScenario}
                />

                <aside className="flex flex-col gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    선택형 설명
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableTracks.map(([track, label]) => (
                      <button
                        key={track}
                        className={cn(
                          'rounded-md border px-3 py-2 text-sm font-medium transition',
                          selectedTrack === track
                            ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                            : 'border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--ink)]/40',
                        )}
                        onClick={() => setRequestedTrack(track)}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-md border border-[var(--line)] bg-white px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      지금 볼 설명
                    </p>
                    <p className="mt-3 text-2xl font-semibold leading-9 text-[var(--ink)]">
                      {selectedTrackText}
                    </p>
                  </div>

                  {panicMode ? (
                    <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-4 text-rose-950">
                      <p className="text-sm font-semibold">Panic Mode</p>
                      <p className="mt-2 text-xl font-semibold leading-8">
                        {explanation.tracks.action ??
                          '확실하지 않아요. 현장 안내와 119를 먼저 확인해요.'}
                      </p>
                    </div>
                  ) : null}

                  {safetyView.warnings.length ? (
                    <div className="grid gap-2">
                      {safetyView.warnings.map((warning) => (
                        <NoticeBanner key={warning} tone="review">
                          {warning}
                        </NoticeBanner>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid gap-2 rounded-md border border-[var(--line)] bg-white px-4 py-4 text-sm text-[var(--muted)]">
                    <MetaRow label="재난">
                      {getHazardLabel(segment.hazard)}
                    </MetaRow>
                    <MetaRow label="신뢰도">
                      {formatPercent(segment.confidence)}
                    </MetaRow>
                    <MetaRow label="근거">
                      {segment.officialRuleIds.join(', ') || '공식 확인 전'}
                    </MetaRow>
                  </div>
                </aside>
              </div>
            </section>
          </section>

          <aside className="flex flex-col gap-4">
            <section className="panel-edge">
              <div className="flex items-center gap-2">
                {liveAnalysis ? (
                  <CheckCircle2 className="size-5 text-emerald-700" />
                ) : (
                  <AlertTriangle className="size-5 text-amber-600" />
                )}
                <h2 className="text-xl font-semibold">안내</h2>
              </div>
              <div className="mt-4 grid gap-3 text-sm leading-6 text-[var(--muted)]">
                <p>화면 일부가 분석 서버로 전송될 수 있습니다.</p>
                <p>서버는 행동지시를 만들지 않고 화면 단서만 추출합니다.</p>
                <p>응급 상황에서는 119와 현장 안내를 우선하세요.</p>
              </div>
            </section>

            {showEvidence ? (
              <EvidenceDrawer
                packet={analysis.packet}
                reviewMode={explanation.safetyMode === 'review_official'}
                ruleMatches={analysis.ruleMatches}
                segment={segment}
              />
            ) : null}
          </aside>
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

function BetaAccessForm({
  betaInput,
  betaReady,
  onChange,
  onSubmit,
}: {
  betaInput: string
  betaReady: boolean
  onChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <form
      className="rounded-md border border-[var(--line)] bg-white px-4 py-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <label className="text-sm font-semibold text-[var(--ink)]">
        베타 접근 코드
      </label>
      <div className="mt-2 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border border-[var(--line)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]/30"
          onChange={(event) => onChange(event.target.value)}
          placeholder="코드 입력"
          type="password"
          value={betaInput}
        />
        <button
          className="rounded-md border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-sm font-medium text-white"
          type="submit"
        >
          저장
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
        {betaReady
          ? '이 브라우저에만 저장됩니다.'
          : '코드가 없으면 실험 분석은 사용할 수 없습니다.'}
      </p>
    </form>
  )
}

function StepLine({
  active,
  children,
  icon,
}: {
  active: boolean
  children: React.ReactNode
  icon: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-[var(--line)] bg-white text-[var(--muted)]',
      )}
    >
      {icon}
      {children}
    </div>
  )
}

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'danger' | 'grounded' | 'neutral' | 'review'
}) {
  const toneClass = {
    danger: 'bg-rose-50 text-rose-800 ring-rose-200',
    grounded: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    neutral: 'bg-white text-[var(--ink)] ring-[var(--line)]',
    review: 'bg-amber-50 text-amber-900 ring-amber-200',
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
    <section className="rounded-md border border-[var(--line)] bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {title}
      </p>
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-[var(--ink)]">
        {value}
      </p>
    </section>
  )
}

function MetaRow({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[72px_1fr]">
      <dt className="font-semibold text-[var(--ink)]">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function NoticeBanner({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'review'
}) {
  const toneClass = {
    review: 'border-amber-300 bg-amber-50 text-amber-900',
  }[tone]

  return (
    <div
      className={cn(
        'mt-3 rounded-md border px-4 py-3 text-sm leading-6',
        toneClass,
      )}
    >
      {children}
    </div>
  )
}

function getHazardLabel(hazard: Segment['hazard']) {
  switch (hazard) {
    case 'fire':
      return '화재'
    case 'earthquake':
      return '지진'
    default:
      return '공식 확인 전'
  }
}

export default WebAppPage
