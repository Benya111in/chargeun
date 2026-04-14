import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import {
  Ear,
  Mic,
  MonitorPlay,
  RotateCcw,
  ScreenShare,
  ShieldAlert,
  Square,
} from 'lucide-react'

import {
  applySafetyGuardrails,
  buildGroundedExplanation,
  buildSegmentFromPerception,
  buildVoiceReply,
  matchGroundedRules,
} from '@ansimtrack/llm-orchestrator'
import {
  type CaptureSession,
  type SegmentExplanation,
  voiceIntentLabels,
  type VoiceIntent,
} from '@ansimtrack/shared-types'

import { DemoRunbookPanel } from './components/DemoRunbookPanel'
import { EvidenceDrawer } from './components/EvidenceDrawer'
import { LiveCapturePreview } from './components/LiveCapturePreview'
import {
  PrivacyConsentDialog,
  PrivacyControlPanel,
} from './components/PrivacyControlPanel'
import { ShadowVideoStage } from './components/ShadowVideoStage'
import { demoRunbookSteps, prerecordedBackupSessions } from './lib/demo-runbook'
import {
  capturePermissionLabels,
  captureStatusLabels,
} from './lib/capture-contract'
import {
  appendSessionLogEntry,
  clearLocalRuntimeFiles,
  exportDemoArtifact,
  loadAppRuntimeState,
  saveLiveAnalysisSnapshot,
  saveAppRuntimeState,
} from './lib/desktop-bridge'
import {
  buildPersistedSessionMeta,
  defaultAppRuntimeState,
  type PrivacyPrefsState,
} from './lib/demo-runtime'
import { buildLiveAnalysis, summarizePacket } from './lib/live-analysis'
import { demoScenarios } from './lib/mock-session'
import { liveRuleCatalog } from './lib/rule-catalog'
import { useCaptureController } from './lib/useCaptureController'
import { cn, formatClock, formatPercent } from './lib/utils'
import { useVoicePlayback } from './lib/voice-playback'

type TrackKey = 'basic' | 'easy' | 'action' | 'reason' | 'caregiver' | 'report'
type PendingCaptureStart = 'browser' | 'native'

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
const initialExplanation = buildGroundedExplanation({
  evidence: initialScenario.perceptionPacket,
  rules: initialScenario.rules,
  segment: buildSegmentFromPerception({
    packet: initialScenario.perceptionPacket,
    rules: initialScenario.rules,
  }),
})

function App() {
  const [demoMode, setDemoMode] = useState<'backup-replay' | 'live-priority'>(
    'live-priority',
  )
  const [activeRunbookStepId, setActiveRunbookStepId] = useState(
    demoRunbookSteps[0]?.id ?? 'problem',
  )
  const [scenarioId, setScenarioId] = useState(initialScenario.id)
  const [requestedTrack, setRequestedTrack] = useState<TrackKey>(
    getPreferredTrack(initialExplanation),
  )
  const [showEvidence, setShowEvidence] = useState(true)
  const [panicMode, setPanicMode] = useState(false)
  const [privacyPrefs, setPrivacyPrefs] = useState<PrivacyPrefsState>(
    defaultAppRuntimeState.privacyPrefs,
  )
  const [privacyNotice, setPrivacyNotice] = useState(
    '기본 모드는 로컬 처리 우선이며 장기 저장은 꺼져 있습니다.',
  )
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false)
  const [pendingCaptureStart, setPendingCaptureStart] =
    useState<PendingCaptureStart | null>(null)
  const [cacheBusy, setCacheBusy] = useState(false)
  const [artifactBusy, setArtifactBusy] = useState(false)
  const [artifactNotice, setArtifactNotice] = useState(
    '발표 자료 export를 실행하면 현재 시연 상태 JSON과 스크린샷을 저장합니다.',
  )
  const [runtimeHydrated, setRuntimeHydrated] = useState(false)
  const [restoredRuntimeState, setRestoredRuntimeState] = useState(
    defaultAppRuntimeState,
  )
  const [voiceReply, setVoiceReply] = useState(defaultVoiceReply)
  const capture = useCaptureController()
  const voicePlayback = useVoicePlayback()
  const appExportRef = useRef<HTMLDivElement | null>(null)
  const previousSessionIdRef = useRef<string | null>(null)
  const previousLoggedSessionRef = useRef<CaptureSession | null>(null)
  const sessionLogMetaRef = useRef<{
    selectedSourceId: string | null
    selectedTrack: TrackKey
    voiceEnabled: boolean
  }>({
    selectedSourceId: null,
    selectedTrack: 'action',
    voiceEnabled: false,
  })

  const scenario = useMemo(
    () =>
      demoScenarios.find((item) => item.id === scenarioId) ?? demoScenarios[0],
    [scenarioId],
  )

  const demoSegment = useMemo(
    () => ({
      ...buildSegmentFromPerception({
        packet: scenario.perceptionPacket,
        rules: scenario.rules,
      }),
      title: scenario.title,
      phaseLabel: scenario.phaseLabel,
    }),
    [scenario],
  )

  const demoRuleMatches = useMemo(
    () =>
      matchGroundedRules({
        evidence: scenario.perceptionPacket,
        rules: scenario.rules,
        segment: demoSegment,
      }),
    [demoSegment, scenario],
  )
  const demoGroundedExplanation = useMemo(
    () =>
      buildGroundedExplanation({
        evidence: scenario.perceptionPacket,
        rules: scenario.rules,
        segment: demoSegment,
      }),
    [demoSegment, scenario],
  )
  const liveAnalysis = useMemo(
    () =>
      buildLiveAnalysis({
        captureInput: capture.state.captureInput,
        rules: liveRuleCatalog,
        session: capture.state.activeSession,
      }),
    [capture.state.activeSession, capture.state.captureInput],
  )
  const analysis = useMemo(
    () =>
      liveAnalysis ?? {
        cacheKey: scenario.id,
        explanation: demoGroundedExplanation,
        overlaySummary: scenario.overlaySummary,
        overlayTargets: scenario.overlayTargets,
        packet: scenario.perceptionPacket,
        packetSummary: summarizePacket(scenario.perceptionPacket),
        phaseLabel: demoSegment.phaseLabel,
        plan: null,
        ruleMatches: demoRuleMatches,
        segment: demoSegment,
        videoCaption: scenario.videoCaption,
      },
    [
      demoGroundedExplanation,
      demoRuleMatches,
      demoSegment,
      liveAnalysis,
      scenario.id,
      scenario.overlaySummary,
      scenario.overlayTargets,
      scenario.perceptionPacket,
      scenario.videoCaption,
    ],
  )
  const safetyView = useMemo(
    () =>
      applySafetyGuardrails({
        evidenceVisible: showEvidence,
        explanation: analysis.explanation,
        panicMode,
        privacyConsent: capture.state.activeSession
          ? privacyPrefs.captureConsent
          : true,
        segment: analysis.segment,
      }),
    [
      analysis.explanation,
      analysis.segment,
      capture.state.activeSession,
      panicMode,
      privacyPrefs.captureConsent,
      showEvidence,
    ],
  )
  const explanation = safetyView.explanation
  const safetyWarnings = safetyView.warnings
  const activeRunbookStep = useMemo(
    () =>
      demoRunbookSteps.find((step) => step.id === activeRunbookStepId) ??
      demoRunbookSteps[0] ??
      null,
    [activeRunbookStepId],
  )

  const shadowScenario = useMemo(
    () => ({
      id: liveAnalysis
        ? `live-${capture.state.activeSession?.id ?? 'preview'}`
        : scenario.id,
      overlaySummary: analysis.overlaySummary,
      overlayTargets: analysis.overlayTargets,
      segment: {
        endMs: analysis.segment.endMs,
        hazard: analysis.segment.hazard,
        startMs: analysis.segment.startMs,
        title: analysis.segment.title,
      },
      videoCaption: analysis.videoCaption,
    }),
    [analysis, capture.state.activeSession?.id, liveAnalysis, scenario.id],
  )
  const segment = analysis.segment
  const ruleMatches = analysis.ruleMatches
  const isLiveAnalysis = Boolean(liveAnalysis)

  const availableTracks = useMemo(
    () =>
      (
        Object.entries(explanation.tracks) as Array<
          [TrackKey, string | undefined]
        >
      ).filter(([, value]) => Boolean(value)) as Array<[TrackKey, string]>,
    [explanation],
  )
  const selectedTrack = explanation.tracks[requestedTrack]
    ? requestedTrack
    : getPreferredTrack(explanation)

  const selectedTrackText =
    explanation.tracks[selectedTrack] ??
    explanation.tracks.easy ??
    explanation.tracks.basic
  const lastSessionMeta =
    buildPersistedSessionMeta(capture.state.activeSession) ??
    restoredRuntimeState.lastSession

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const nextState = await loadAppRuntimeState()
      if (cancelled) {
        return
      }

      setRestoredRuntimeState(nextState)
      setDemoMode(nextState.demoMode)
      setScenarioId(nextState.scenarioId)
      if (isTrackKey(nextState.selectedTrack)) {
        setRequestedTrack(nextState.selectedTrack)
      }
      setShowEvidence(nextState.showEvidence)
      setPanicMode(nextState.panicMode)
      setPrivacyPrefs(nextState.privacyPrefs)
      if (nextState.lastSession?.displayName) {
        setArtifactNotice(
          `이전 세션 메타데이터를 복원했습니다: ${nextState.lastSession.displayName}`,
        )
      }
      setRuntimeHydrated(true)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!runtimeHydrated) {
      return
    }

    const nextState = {
      demoMode,
      lastSession: lastSessionMeta,
      panicMode,
      privacyPrefs,
      scenarioId,
      selectedSourceId: capture.state.selectedSourceId || null,
      selectedTrack: requestedTrack,
      showEvidence,
      updatedAt: Date.now(),
    }

    const timer = window.setTimeout(() => {
      setRestoredRuntimeState(nextState)
      void saveAppRuntimeState(nextState)
    }, 180)

    return () => window.clearTimeout(timer)
  }, [
    capture.state.selectedSourceId,
    demoMode,
    lastSessionMeta,
    panicMode,
    privacyPrefs,
    requestedTrack,
    runtimeHydrated,
    scenarioId,
    showEvidence,
  ])

  useEffect(() => {
    sessionLogMetaRef.current = {
      selectedSourceId: capture.state.selectedSourceId || null,
      selectedTrack: requestedTrack,
      voiceEnabled: voicePlayback.state.available,
    }
  }, [
    capture.state.selectedSourceId,
    requestedTrack,
    voicePlayback.state.available,
  ])

  useEffect(() => {
    const currentSession = capture.state.activeSession
    const previousSession = previousLoggedSessionRef.current

    if (previousSession && previousSession.id !== currentSession?.id) {
      const meta = sessionLogMetaRef.current
      void appendSessionLogEntry({
        endedAt: Date.now(),
        selectedSourceId: meta.selectedSourceId,
        selectedTrack: meta.selectedTrack,
        session: previousSession,
        voiceEnabled: meta.voiceEnabled,
      })
    }

    if (currentSession && previousSession?.id !== currentSession.id) {
      void appendSessionLogEntry({
        selectedSourceId: capture.state.selectedSourceId || null,
        selectedTrack: requestedTrack,
        session: currentSession,
        voiceEnabled: voicePlayback.state.available,
      })
    }

    previousLoggedSessionRef.current = currentSession
  }, [
    capture.state.activeSession,
    capture.state.selectedSourceId,
    requestedTrack,
    voicePlayback.state.available,
  ])

  useEffect(() => {
    const activeSession = capture.state.activeSession
    if (!liveAnalysis || !activeSession) {
      return
    }

    const timer = window.setTimeout(() => {
      void saveLiveAnalysisSnapshot({
        createdAt: Date.now(),
        explanation,
        packetSummary: liveAnalysis.packetSummary,
        plan: liveAnalysis.plan,
        segment,
        session: {
          selectedSourceId: capture.state.selectedSourceId || null,
          selectedTrack: requestedTrack,
          session: activeSession,
          voiceEnabled: voicePlayback.state.available,
        },
        sourceId: capture.state.selectedSourceId || null,
      })
    }, 220)

    return () => window.clearTimeout(timer)
  }, [
    capture.state.activeSession,
    capture.state.selectedSourceId,
    explanation,
    liveAnalysis,
    requestedTrack,
    segment,
    voicePlayback.state.available,
  ])

  const clearRuntimeCache = useCallback(
    async (reason: 'auto-stop' | 'manual') => {
      setCacheBusy(true)
      const result = await clearLocalRuntimeFiles()
      setCacheBusy(false)

      if (result.status === 'cleared') {
        setPrivacyNotice(`로컬 캐시를 정리했습니다. 대상 경로: ${result.path}`)
        return
      }

      if (result.status === 'browser-preview') {
        setPrivacyNotice(
          '브라우저 데모에서는 파일 캐시를 직접 지우지 않습니다. Tauri 실행 시 로컬 runtime 정리가 활성화됩니다.',
        )
        return
      }

      if (result.status === 'error') {
        setPrivacyNotice(
          '로컬 캐시를 지우지 못했습니다. 파일 권한과 runtime 경로를 확인해 주세요.',
        )
        return
      }

      setPrivacyNotice(
        reason === 'auto-stop'
          ? `종료 후 정리할 로컬 캐시가 없었습니다. 대상 경로: ${result.path}`
          : `현재 지울 로컬 캐시가 없습니다. 대상 경로: ${result.path}`,
      )
    },
    [],
  )

  useEffect(() => {
    const currentSessionId = capture.state.activeSession?.id ?? null
    const previousSessionId = previousSessionIdRef.current

    if (previousSessionId && !currentSessionId && privacyPrefs.clearOnStop) {
      const timer = window.setTimeout(() => {
        void clearRuntimeCache('auto-stop')
      }, 0)

      previousSessionIdRef.current = currentSessionId
      return () => window.clearTimeout(timer)
    }

    previousSessionIdRef.current = currentSessionId
  }, [
    capture.state.activeSession?.id,
    clearRuntimeCache,
    privacyPrefs.clearOnStop,
  ])

  const handleVoice = (intent: VoiceIntent) => {
    const reply = buildVoiceReply({ explanation, intent })
    setVoiceReply(reply.text)
    voicePlayback.speak(reply.text)
  }

  const startCaptureWithConsent = async (mode: PendingCaptureStart) => {
    setShowEvidence(true)
    setDemoMode('live-priority')
    if (mode === 'native') {
      await capture.actions.startNativeMonitor()
    } else {
      await capture.actions.startBrowserFallback()
    }

    setPrivacyNotice(
      privacyPrefs.retainCapturedMedia
        ? '캡처를 시작했습니다. 장기 저장 opt-in이 켜져 있어 종료 후 자동 삭제는 꺼져 있습니다.'
        : '캡처를 시작했습니다. 기본은 로컬 처리 우선이며 장기 저장은 꺼져 있습니다.',
    )
  }

  const requestCaptureStart = async (mode: PendingCaptureStart) => {
    if (!privacyPrefs.captureConsent) {
      setPendingCaptureStart(mode)
      setPrivacyModalOpen(true)
      setPrivacyNotice('화면 캡처는 사용자의 동의가 있어야 시작됩니다.')
      return
    }

    await startCaptureWithConsent(mode)
  }

  const handleConsentConfirm = async () => {
    const nextAction = pendingCaptureStart
    setPrivacyPrefs((current) => ({
      ...current,
      captureConsent: true,
    }))
    setPrivacyModalOpen(false)
    setPendingCaptureStart(null)
    setPrivacyNotice(
      '캡처 동의가 확인되었습니다. 기본 모드는 로컬 처리 우선으로 유지됩니다.',
    )

    if (nextAction) {
      await startCaptureWithConsent(nextAction)
    }
  }

  const handleToggleRetainCapturedMedia = (next: boolean) => {
    setPrivacyPrefs((current) => ({
      ...current,
      clearOnStop: next ? false : current.clearOnStop,
      retainCapturedMedia: next,
    }))
    setPrivacyNotice(
      next
        ? '장기 저장 opt-in을 켰습니다. 종료 후 자동 삭제는 꺼집니다.'
        : '장기 저장을 껐습니다. 로컬 처리 우선 기본값으로 돌아갑니다.',
    )
  }

  const handleToggleClearOnStop = (next: boolean) => {
    setPrivacyPrefs((current) => ({
      ...current,
      clearOnStop: next,
      retainCapturedMedia: next ? false : current.retainCapturedMedia,
    }))
    setPrivacyNotice(
      next
        ? '종료 시 캐시 자동 삭제를 켰습니다. 장기 저장 opt-in은 꺼집니다.'
        : '종료 후 캐시를 남기도록 변경했습니다. 필요할 때 수동으로 지우세요.',
    )
  }

  const handleStopCapture = async () => {
    await capture.actions.stopCapture(
      privacyPrefs.clearOnStop
        ? '캡처를 중지했습니다. 종료 후 캐시 정리를 이어서 확인합니다.'
        : '캡처를 중지했습니다.',
    )
  }

  const handleExportArtifacts = async () => {
    setArtifactBusy(true)

    try {
      const screenshotDataUrl = appExportRef.current
        ? await toPng(appExportRef.current, {
            backgroundColor: '#f5f1ea',
            cacheBust: true,
            pixelRatio: 1.5,
          })
        : undefined

      const result = await exportDemoArtifact({
        artifactName: `${
          isLiveAnalysis
            ? `live-${capture.state.activeSession?.id ?? 'capture'}`
            : scenario.id
        }-${activeRunbookStep?.id ?? 'demo'}`,
        payload: {
          activeRunbookStep,
          analysisSource: isLiveAnalysis ? 'live-capture' : 'demo-scenario',
          capture: {
            lastSession: lastSessionMeta,
            selectedSourceId: capture.state.selectedSourceId,
            status: capture.state.status,
          },
          demoMode,
          explanation,
          packetSummary: analysis.packetSummary,
          privacyPrefs,
          ruleMatches: ruleMatches.map((match) => ({
            matchedSignals: match.matchedSignals,
            ruleId: match.rule.rule_id,
            score: match.score,
            sourceTitle: match.rule.source_title,
          })),
          safetyWarnings,
          scenario: {
            id: isLiveAnalysis
              ? `live-${capture.state.activeSession?.id ?? 'capture'}`
              : scenario.id,
            overlaySummary: analysis.overlaySummary,
            title: segment.title,
          },
          segment,
          selectedTrack,
          voiceReply,
        },
        screenshotDataUrl,
      })

      setArtifactNotice(
        result.screenshotPath
          ? `발표 자료를 저장했습니다. JSON: ${result.jsonPath} / PNG: ${result.screenshotPath}`
          : `발표 자료 JSON을 저장했습니다: ${result.jsonPath}`,
      )
    } catch {
      setArtifactNotice(
        '발표 자료 export를 완료하지 못했습니다. 브라우저 권한과 파일 경로를 확인해 주세요.',
      )
    } finally {
      setArtifactBusy(false)
    }
  }

  const handleSelectRunbookStep = (stepId: string) => {
    const step = demoRunbookSteps.find((candidate) => candidate.id === stepId)
    if (!step) {
      return
    }

    setActiveRunbookStepId(step.id)
    if (step.scenarioId) {
      setScenarioId(step.scenarioId)
    }
    if (step.preferredTrack) {
      setRequestedTrack(step.preferredTrack as TrackKey)
    }
    if (typeof step.showEvidence === 'boolean') {
      setShowEvidence(step.showEvidence)
    }
    if (typeof step.panicMode === 'boolean') {
      setPanicMode(step.panicMode)
    }
    setVoiceReply(defaultVoiceReply)
  }

  const handleSelectBackupSession = (sessionId: string) => {
    const session = prerecordedBackupSessions.find(
      (candidate) => candidate.id === sessionId,
    )
    if (!session) {
      return
    }

    setDemoMode('backup-replay')
    setScenarioId(session.scenarioId)
    if (session.preferredTrack) {
      setRequestedTrack(session.preferredTrack as TrackKey)
    }
    if (typeof session.showEvidence === 'boolean') {
      setShowEvidence(session.showEvidence)
    }
    if (typeof session.panicMode === 'boolean') {
      setPanicMode(session.panicMode)
    }
    setActiveRunbookStepId('live-fire')
    setVoiceReply(defaultVoiceReply)
  }

  const handleOpenEvidenceShortcut = () => {
    setShowEvidence(true)
    setRequestedTrack('reason')
    setActiveRunbookStepId('evidence')
  }

  const handleScenarioToggle = () => {
    const nextId =
      scenario.id === 'grounded-fire' ? 'review-earthquake' : 'grounded-fire'
    const nextScenario =
      demoScenarios.find((item) => item.id === nextId) ?? demoScenarios[0]
    const nextExplanation = buildGroundedExplanation({
      evidence: nextScenario.perceptionPacket,
      rules: nextScenario.rules,
      segment: buildSegmentFromPerception({
        packet: nextScenario.perceptionPacket,
        rules: nextScenario.rules,
      }),
    })

    setScenarioId(nextId)
    setRequestedTrack(getPreferredTrack(nextExplanation))
    setVoiceReply(defaultVoiceReply)
    setPanicMode(false)
  }

  return (
    <div
      className="min-h-screen bg-[var(--surface)] text-[var(--ink)]"
      ref={appExportRef}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-4 md:px-6 xl:px-8">
        <header className="grid gap-4 border-b border-[var(--line)] pb-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-md bg-[var(--ink)] px-3 py-1 text-sm font-semibold text-white">
                <ShieldAlert className="size-4" />
                안심트랙 Live
              </span>
              <StatusPill
                tone={
                  segment.hazard === 'fire'
                    ? 'danger'
                    : segment.hazard === 'earthquake'
                      ? 'calm'
                      : 'review'
                }
              >
                {getHazardBadgeLabel(segment.hazard)}
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
              <StatusPill
                tone={demoMode === 'backup-replay' ? 'review' : 'neutral'}
              >
                {demoMode === 'backup-replay' ? 'backup replay' : '라이브 우선'}
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
                lastSessionMeta?.displayName ??
                scenario.session.displayName ??
                '데모 모니터'
              }
            />
            <Metric title="세그먼트 지연" value="04.0초" />
            <Metric title="신뢰도" value={formatPercent(segment.confidence)} />
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
                    onClick={() => requestCaptureStart('native')}
                    variant="primary"
                  >
                    현재 모니터 읽기 시작
                  </ActionButton>
                  <ActionButton
                    icon={<ScreenShare className="size-4" />}
                    onClick={() => requestCaptureStart('browser')}
                  >
                    브라우저 공유 시작
                  </ActionButton>
                  <ActionButton
                    disabled={!capture.state.activeSession}
                    icon={<Square className="size-4" />}
                    onClick={handleStopCapture}
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
                captureInput={capture.state.captureInput}
                nativePreview={capture.state.nativePreview}
                notice={capture.state.notice}
                selectedSource={capture.state.selectedSource}
                session={capture.state.activeSession}
                status={capture.state.status}
                stream={capture.state.previewStream}
              />

              <PrivacyControlPanel
                cacheBusy={cacheBusy}
                cacheNotice={privacyNotice}
                captureConsent={privacyPrefs.captureConsent}
                clearOnStop={privacyPrefs.clearOnStop}
                onClearCache={() => clearRuntimeCache('manual')}
                onOpenConsent={() => setPrivacyModalOpen(true)}
                onToggleClearOnStop={handleToggleClearOnStop}
                onToggleRetainCapturedMedia={handleToggleRetainCapturedMedia}
                retainCapturedMedia={privacyPrefs.retainCapturedMedia}
              />
            </section>

            <section className="panel-edge flex min-h-[520px] flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    Shadow Player
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                    {segment.phaseLabel}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone="neutral">
                    {(capture.state.activeSession?.hasAudio ??
                    scenario.session.hasAudio)
                      ? '오디오 있음'
                      : '오디오 없음'}
                  </StatusPill>
                  <StatusPill tone="neutral">
                    {formatClock(segment.startMs)} -{' '}
                    {formatClock(segment.endMs)}
                  </StatusPill>
                </div>
              </div>

              <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <ShadowVideoStage
                  key={shadowScenario.id}
                  onToggleEvidence={() => setShowEvidence((value) => !value)}
                  onTogglePanic={() => setPanicMode((value) => !value)}
                  panicMode={panicMode}
                  scenario={shadowScenario}
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
                        onClick={() => setRequestedTrack(track)}
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
                        {segment.confidence < 0.72
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
            <DemoRunbookPanel
              activeStepId={activeRunbookStep?.id ?? activeRunbookStepId}
              artifactBusy={artifactBusy}
              artifactNotice={artifactNotice}
              backupSessions={prerecordedBackupSessions}
              currentScenarioTitle={segment.title}
              demoMode={demoMode}
              lastSessionLabel={lastSessionMeta?.displayName}
              onExportArtifacts={handleExportArtifacts}
              onOpenEvidence={handleOpenEvidenceShortcut}
              onSelectBackupSession={handleSelectBackupSession}
              onSelectStep={handleSelectRunbookStep}
              onSetDemoMode={setDemoMode}
              showEvidence={showEvidence}
              steps={demoRunbookSteps}
            />
            <section className="panel-edge">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    현재 세그먼트
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                    {segment.title}
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

              {safetyWarnings.length > 0 ? (
                <div className="mt-4 grid gap-2">
                  {safetyWarnings.map((warning) => (
                    <NoticeBanner
                      key={warning}
                      tone={warning.includes('캡처 동의') ? 'danger' : 'review'}
                    >
                      {warning}
                    </NoticeBanner>
                  ))}
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
                        {getHazardName(segment.hazard)}
                      </MetaRow>
                      <MetaRow label="phase">{segment.phase}</MetaRow>
                      <MetaRow label="rule id">
                        {segment.officialRuleIds.join(', ') || '없음'}
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
                    <div className="flex items-center gap-2">
                      <StatusPill
                        tone={
                          voicePlayback.state.speaking ? 'grounded' : 'neutral'
                        }
                      >
                        {voicePlayback.state.speaking
                          ? '음성 재생 중'
                          : voicePlayback.state.available
                            ? 'TTS 대기'
                            : '텍스트만'}
                      </StatusPill>
                      <Mic className="size-5 text-[var(--muted)]" />
                    </div>
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
                    <ActionButton
                      disabled={!voicePlayback.state.speaking}
                      icon={<Square className="size-4" />}
                      onClick={voicePlayback.stop}
                    >
                      음성 중지
                    </ActionButton>
                  </div>
                  <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--soft)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Transcript
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                      {voiceReply}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                      {voicePlayback.state.notice}
                    </p>
                  </div>
                </section>
              </div>
            </section>

            {showEvidence ? (
              <EvidenceDrawer
                packet={analysis.packet}
                reviewMode={explanation.safetyMode === 'review_official'}
                ruleMatches={ruleMatches}
                segment={segment}
              />
            ) : null}
          </section>
        </main>

        <PrivacyConsentDialog
          clearOnStop={privacyPrefs.clearOnStop}
          onClose={() => {
            setPrivacyModalOpen(false)
            setPendingCaptureStart(null)
          }}
          onConfirm={handleConsentConfirm}
          open={privacyModalOpen}
          pendingActionLabel={getPendingCaptureActionLabel(pendingCaptureStart)}
          retainCapturedMedia={privacyPrefs.retainCapturedMedia}
        />
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

function NoticeBanner({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'danger' | 'review'
}) {
  const toneClass = {
    danger: 'border-rose-200 bg-rose-50 text-rose-900',
    review: 'border-amber-300 bg-amber-50 text-amber-900',
  }[tone]

  return (
    <div
      className={cn('rounded-md border px-4 py-3 text-sm leading-6', toneClass)}
    >
      {children}
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

function getPreferredTrack(explanation: SegmentExplanation): TrackKey {
  if (explanation.tracks.action) {
    return 'action'
  }

  if (explanation.tracks.easy) {
    return 'easy'
  }

  return 'basic'
}

function getHazardBadgeLabel(hazard: string) {
  switch (hazard) {
    case 'fire':
      return '화재 인식'
    case 'earthquake':
      return '지진 검토'
    default:
      return '공식 검토'
  }
}

function getHazardName(hazard: string) {
  switch (hazard) {
    case 'fire':
      return '화재'
    case 'earthquake':
      return '지진'
    default:
      return '미확정'
  }
}

function getPendingCaptureActionLabel(
  pendingAction: PendingCaptureStart | null,
) {
  switch (pendingAction) {
    case 'native':
      return '동의하고 현재 모니터 읽기 시작'
    case 'browser':
      return '동의하고 브라우저 공유 시작'
    default:
      return '동의하고 계속'
  }
}

function isTrackKey(value: string): value is TrackKey {
  return value in trackLabels
}

export default App
