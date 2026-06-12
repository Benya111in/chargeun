import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  Bot,
  CircleAlert,
  Clock3,
  Database,
  FileCheck2,
  Link2,
  MessageSquareText,
  ScanLine,
  ShieldCheck,
  XCircle,
} from 'lucide-react'

import { appHref } from './lib/routes'
import {
  localGeneratorApiBase,
  type GenerationJobProgress,
  requestGeneratedPracticeFromApi,
} from './lib/url-generator-api'

const progressSteps = [
  '영상을 가져와요',
  '오디오 문장 끝을 찾아요',
  '화면 자막 변화를 맞춰요',
  '학습 카드를 만들어요',
  '문제와 품질을 검사해요',
  '완성본을 열어요',
]

const statusStepIndex: Record<GenerationJobProgress['status'], number> = {
  blocked: 4,
  canceled: 4,
  failed: 4,
  needs_repair: 4,
  processing: 2,
  published: 5,
  queued: 0,
}

type VisibleAgentKey = 'easy' | 'quality' | 'rag' | 'video'

type VisibleAgent = {
  accent: string
  bg: string
  border: string
  key: VisibleAgentKey
  label: string
  number: string
  outputLabel: string
  subtitle: string
  techLabel: string
  toolIcon: React.ReactNode
}

type AgentLogEntry = {
  agentKey: VisibleAgentKey
  createdAtMs: number
  message: string
  sourceKey?: string
  status: GenerationJobProgress['status']
  type: 'issue' | 'progress'
}

const visibleAgents: VisibleAgent[] = [
  {
    accent: '#00a9e0',
    bg: '#effbff',
    border: '#8fdcf5',
    key: 'video',
    label: '영상 분석 Agent',
    number: '01',
    outputLabel: 'MULTI-TRACK SCENE CONTRACT',
    subtitle: '프레임·직접 ASR·화면 OCR·컷 변화를 같은 시간축에 묶습니다.',
    techLabel: 'source.mp4 · audio-asr · visual-ocr · scene graph',
    toolIcon: <ScanLine className="size-3.5" />,
  },
  {
    accent: '#00aa8a',
    bg: '#effbf7',
    border: '#8cddcf',
    key: 'rag',
    label: '재난안전 검토 Agent',
    number: '02',
    outputLabel: 'OFFICIAL RAG x RULE GATE',
    subtitle: '공식 근거와 충돌하는 행동만 막고, 영상 키워드는 덮어쓰지 않습니다.',
    techLabel: 'official corpus · rule match · contradiction check',
    toolIcon: <ShieldCheck className="size-3.5" />,
  },
  {
    accent: '#f5b62f',
    bg: '#fff9e5',
    border: '#ffd66f',
    key: 'easy',
    label: '쉬운말 변환 Agent',
    number: '03',
    outputLabel: 'EASY READ OUTPUT SCHEMA',
    subtitle: '상황·해야 할 일·이유·하지 말아요·확인 질문을 쉬운말 스키마로 고정합니다.',
    techLabel: 'source lock · short sentence · one action',
    toolIcon: <MessageSquareText className="size-3.5" />,
  },
  {
    accent: '#ff6868',
    bg: '#fff3f3',
    border: '#ffaaa6',
    key: 'quality',
    label: '품질검사 Agent',
    number: '04',
    outputLabel: 'LLM-as-a-JUDGE · REPAIR LOOP',
    subtitle: 'issue code로 실패 원인을 고정하고 담당 Agent 수리 루프로 되돌립니다.',
    techLabel: 'source coverage · one answer · playback · publish',
    toolIcon: <FileCheck2 className="size-3.5" />,
  },
]

export default function UrlGeneratorV2Page() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [generationAbortController, setGenerationAbortController] =
    useState<AbortController | null>(null)
  const [generationProgress, setGenerationProgress] =
    useState<GenerationJobProgress | null>(null)
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [notice, setNotice] = useState('')
  const [readyScenarioHref, setReadyScenarioHref] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)

  useEffect(() => {
    if (!isGenerating || !startedAt) {
      return
    }

    const intervalId = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 500)

    return () => window.clearInterval(intervalId)
  }, [isGenerating, startedAt])

  const currentStepIndex = useMemo(() => {
    const timedStep = Math.min(
      progressSteps.length - 2,
      Math.floor(elapsedSeconds / 5),
    )

    if (!generationProgress) {
      return timedStep
    }

    return Math.max(timedStep, statusStepIndex[generationProgress.status])
  }, [elapsedSeconds, generationProgress])

  const canSubmit =
    sourceUrl.trim().length > 0 && !isGenerating && !readyScenarioHref

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!sourceUrl.trim()) {
      setNotice('유튜브 주소를 먼저 넣어 주세요.')
      return
    }

    try {
      const initialProgress: GenerationJobProgress = {
        message: '로컬 생성기가 새 작업을 준비하고 있습니다.',
        stage: 'prepare',
        status: 'queued',
      }
      setElapsedSeconds(0)
      setGenerationProgress(initialProgress)
      setAgentLogs(appendGenerationProgressLog([], initialProgress))
      setIsGenerating(true)
      setNotice('')
      setReadyScenarioHref('')
      setStartedAt(Date.now())

      const abortController = new AbortController()
      setGenerationAbortController(abortController)

      const { record } = await requestGeneratedPracticeFromApi(
        sourceUrl,
        '',
        {
          apiBase: localGeneratorApiBase,
          onProgress: (nextProgress) => {
            setGenerationProgress(nextProgress)
            setAgentLogs((currentLogs) =>
              appendGenerationProgressLog(currentLogs, nextProgress),
            )
          },
          signal: abortController.signal,
          timeoutMs: null,
        },
      )

      await waitForAgentOverlayFlush()
      if (abortController.signal.aborted) {
        return
      }
      const publishedProgress: GenerationJobProgress = {
        message:
          '완성본이 준비됐습니다. 에이전트 작업 로그를 확인한 뒤 학습을 시작할 수 있습니다.',
        stage: 'publisher_agent',
        status: 'published',
      }
      setGenerationProgress(publishedProgress)
      setAgentLogs((currentLogs) =>
        appendGenerationProgressLog(currentLogs, publishedProgress),
      )
      setGenerationAbortController(null)
      setIsGenerating(false)
      setReadyScenarioHref(appHref(`/scenario/${record.id}`))
    } catch (error) {
      const aborted =
        isAbortError(error)
      setNotice(
        aborted
          ? '생성을 취소했습니다.'
          : error instanceof Error
            ? error.message
            : '영상을 학습 화면으로 만들지 못했습니다.',
      )
      setGenerationAbortController(null)
      setGenerationProgress(null)
      setAgentLogs([])
      setIsGenerating(false)
      setReadyScenarioHref('')
      setStartedAt(null)
    }
  }

  const handleCancel = () => {
    generationAbortController?.abort()
    setGenerationAbortController(null)
    setGenerationProgress(null)
    setAgentLogs([])
    setIsGenerating(false)
    setReadyScenarioHref('')
    setNotice('생성을 취소했습니다.')
    setStartedAt(null)
  }

  const handleStartLearning = () => {
    if (readyScenarioHref) {
      window.location.href = readyScenarioHref
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#effffb] text-[#06251f] [word-break:keep-all]">
      <section className="project-title-stage relative flex min-h-screen w-full flex-col items-center justify-center px-5 py-8">
        <ProjectRoamingAgents />
        <ProjectTitle />

        <form
          className="relative z-10 mt-8 w-full max-w-[1010px] rounded-[28px] border-2 border-[#a9ded2] bg-white/90 p-4 shadow-[0_34px_100px_rgba(0,105,85,0.18)] backdrop-blur sm:mt-10 sm:p-5"
          onSubmit={handleSubmit}
        >
          <label className="sr-only" htmlFor="generator-v2-url">
            새 재난안전 영상 URL
          </label>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
            <div className="relative min-w-0">
              <Link2 className="pointer-events-none absolute left-5 top-1/2 size-7 -translate-y-1/2 text-[#0b7465]" />
              <input
                autoComplete="off"
                autoFocus
                className="min-h-[82px] w-full rounded-[18px] border-2 border-[#acd9ce] bg-[#f8fffc] py-4 pl-16 pr-4 text-[clamp(1.05rem,2.2vw,1.55rem)] font-black text-[#071c18] outline-none transition placeholder:text-[#8aa29b] focus:border-[#008b78] focus:bg-white"
                disabled={isGenerating}
                id="generator-v2-url"
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                type="url"
                value={sourceUrl}
              />
            </div>
            <button
              className="project-submit-button group inline-flex min-h-[82px] items-center justify-center gap-3 rounded-[18px] border-2 border-[#071c18] bg-[#071c18] px-6 text-2xl font-black text-white shadow-[0_12px_0_#b9eadb] transition hover:-translate-y-0.5 hover:shadow-[0_16px_0_#b9eadb] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!canSubmit}
              type="submit"
            >
              만들기
              <ArrowRight className="size-7 transition group-hover:translate-x-1" />
            </button>
          </div>

          {notice ? (
            <div className="mt-4 flex gap-3 rounded-2xl border border-[#f0b6a8] bg-[#fff0ed] p-4 text-base font-extrabold leading-7 text-[#9b2f24]">
              <CircleAlert className="mt-0.5 size-5 shrink-0" />
              <p>{notice}</p>
            </div>
          ) : null}
        </form>
      </section>

      {isGenerating || readyScenarioHref ? (
        <GenerationOverlay
          elapsedSeconds={elapsedSeconds}
          isReady={Boolean(readyScenarioHref)}
          logs={agentLogs}
          onCancel={handleCancel}
          onStartLearning={handleStartLearning}
          progress={generationProgress}
          readyScenarioHref={readyScenarioHref}
          startedAt={startedAt}
          stepIndex={currentStepIndex}
        />
      ) : null}
    </main>
  )
}

function ProjectTitle() {
  return (
    <h1 className="project-title-lockup relative z-10 mx-auto max-w-[1540px] text-center font-black leading-[0.94] tracking-normal">
      <span className="project-title-kicker">
        느린학습자의 <span className="project-title-red">안전한 라이프</span>를 위한
      </span>
      <span className="project-title-main">
        <span>차근차근 재난 안전</span>
        <span>AI 도우미</span>
      </span>
    </h1>
  )
}

function ProjectRoamingAgents() {
  return (
    <div aria-hidden="true" className="project-roaming-agents">
      {visibleAgents.map((agent) => (
        <span
          className={`project-roaming-agent project-roaming-agent--${agent.key}`}
          key={agent.key}
          style={
            {
              '--agent-accent': agent.accent,
              '--agent-bg': agent.bg,
              '--agent-border': agent.border,
            } as React.CSSProperties
          }
        >
          <AgentRobotIcon toolIcon={agent.toolIcon} />
        </span>
      ))}
    </div>
  )
}

function waitForAgentOverlayFlush() {
  return new Promise((resolve) => window.setTimeout(resolve, 3_000))
}

function GenerationOverlay({
  elapsedSeconds,
  isReady,
  logs,
  onCancel,
  onStartLearning,
  progress,
  readyScenarioHref,
  startedAt,
  stepIndex,
}: {
  elapsedSeconds: number
  isReady: boolean
  logs: AgentLogEntry[]
  onCancel: () => void
  onStartLearning: () => void
  progress: GenerationJobProgress | null
  readyScenarioHref: string
  startedAt: number | null
  stepIndex: number
}) {
  const activeAgentKey = getActiveAgentKey(progress, stepIndex, elapsedSeconds)
  const rejectedAgentKeys = getRejectedAgentKeys(progress)
  const currentMessage =
    (isReady
      ? '모든 에이전트가 작업을 마쳤습니다. 로그를 확인한 뒤 학습을 시작하세요.'
      : progress?.message) ??
    '영상 분석, 장면 분할, 학습 카드 생성을 준비하고 있습니다.'

  return (
    <div className="fixed inset-0 z-50 bg-[#061412]/82 p-2 text-[#12221e] backdrop-blur-sm sm:p-4">
      <section
        aria-live="polite"
        className="relative mx-auto flex h-[calc(100vh-16px)] w-full max-w-[1640px] flex-col overflow-hidden rounded-2xl border border-[#b9efe4] bg-[#f8fffc] shadow-[0_30px_100px_rgba(0,0,0,0.34)] sm:h-[calc(100vh-32px)]"
      >
        <header className="flex flex-col gap-3 border-b border-[#cceee5] bg-white px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="agent-command-icon relative inline-flex size-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[#95d9ca] bg-[#e9faf5] text-[#126b57]">
              <Bot className="size-8" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-normal text-[#287966] sm:text-base">
                Local Multi-Agent Generation Room
              </p>
              <h2 className="mt-0.5 text-[clamp(1.9rem,3.4vw,3.6rem)] font-black leading-[0.95] text-[#12221e]">
                에이전트들이 학습 화면을 만들고 있어요.
              </h2>
              <p className="mt-2 line-clamp-1 text-base font-extrabold leading-tight text-[#4d625b] sm:text-lg">
                {currentMessage}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-[auto_auto] items-center gap-2 sm:flex">
            <div className="rounded-xl border border-[#d8eee7] bg-[#f1fbf7] px-3 py-2">
              <p className="text-xs font-black text-[#5c756c] sm:text-sm">진행 시간</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xl font-black text-[#14241f] sm:text-2xl">
                <Clock3 className="size-5 text-[#257765]" />
                {elapsedSeconds}초
              </p>
            </div>
            <div className="rounded-xl border border-[#d8eee7] bg-[#f1fbf7] px-3 py-2">
              <p className="text-xs font-black text-[#5c756c] sm:text-sm">현재 상태</p>
              <p className="mt-0.5 text-xl font-black leading-tight text-[#14241f] sm:text-2xl">
                {getStatusTitle(progress?.status)}
              </p>
            </div>
            {isReady ? (
              <div className="col-span-2 rounded-xl border border-[#b9efe4] bg-[#e9faf5] px-4 py-2 text-center text-base font-black text-[#126b57] sm:col-span-1">
                로그 확인 가능
              </div>
            ) : (
              <button
                className="col-span-2 min-h-14 rounded-xl border-2 border-[#12221e] bg-white px-5 text-lg font-black text-[#12221e] transition hover:bg-[#edf8f1] sm:col-span-1"
                onClick={onCancel}
                type="button"
              >
                생성 취소
              </button>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
          <div className="grid h-full min-h-0 gap-2 lg:grid-cols-2 lg:grid-rows-2">
            {visibleAgents.map((agent) => (
              <AgentWorkPanel
                active={agent.key === activeAgentKey}
                agent={agent}
                key={agent.key}
                logs={logs}
                rejecting={rejectedAgentKeys.includes(agent.key)}
                startedAt={startedAt}
              />
            ))}
          </div>
        </div>

        {isReady && readyScenarioHref ? (
          <CompletionLauncher onStartLearning={onStartLearning} />
        ) : null}
      </section>
    </div>
  )
}

function CompletionLauncher({
  onStartLearning,
}: {
  onStartLearning: () => void
}) {
  return (
    <div className="agent-completion-launcher">
      <div className="agent-completion-card">
        <p className="text-base font-black uppercase tracking-normal text-[#126b57] sm:text-lg">
          Publish Complete
        </p>
        <h3 className="mt-1 text-[clamp(2.1rem,4vw,4.2rem)] font-black leading-none text-[#12221e]">
          학습 화면이 완성됐어요.
        </h3>
        <p className="mx-auto mt-3 max-w-2xl text-base font-extrabold leading-7 text-[#4d625b] sm:text-xl">
          에이전트들이 남긴 실제 작업 로그를 확인한 뒤 시작 버튼을 눌러
          결과물을 열어보세요.
        </p>
        <button
          className="learning-cta-glow agent-completion-button mt-6"
          onClick={onStartLearning}
          type="button"
        >
          <span>학습 시작하기</span>
          <ArrowRight className="size-9" />
        </button>
      </div>
    </div>
  )
}

function AgentWorkPanel({
  active,
  agent,
  logs,
  rejecting,
  startedAt,
}: {
  active: boolean
  agent: VisibleAgent
  logs: AgentLogEntry[]
  rejecting: boolean
  startedAt: number | null
}) {
  const agentLogLines = getAgentVisibleLogs(agent.key, logs, startedAt)

  return (
    <section
      className={[
        'agent-work-panel relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border-2 bg-white p-3 shadow-[0_16px_42px_rgba(14,38,34,0.08)]',
        active ? 'agent-work-panel--active' : '',
        rejecting ? 'agent-work-panel--rejecting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--agent-accent': agent.accent,
          '--agent-bg': agent.bg,
          '--agent-border': agent.border,
        } as React.CSSProperties
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className="inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1"
            style={{
              backgroundColor: agent.bg,
              borderColor: agent.border,
              color: agent.accent,
            }}
          >
            <span
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-black text-white"
              style={{ backgroundColor: agent.accent }}
            >
              {agent.number}
            </span>
            <p className="truncate text-[clamp(1.15rem,1.8vw,1.8rem)] font-black leading-tight text-[#12221e]">
              {agent.label}
            </p>
          </div>
          <p
            className="mt-3 line-clamp-2 text-[clamp(1.55rem,2.6vw,2.65rem)] font-black italic leading-[0.92]"
            style={{ color: agent.accent }}
          >
            {agent.outputLabel}
          </p>
          <p className="mt-2 line-clamp-2 text-base font-extrabold leading-tight text-[#253b34] sm:text-xl">
            {agent.subtitle}
          </p>
        </div>

        <div
          className="agent-bot-medal relative inline-flex size-16 shrink-0 items-center justify-center rounded-full border-2 bg-white shadow-[0_14px_30px_rgba(18,34,30,0.12)]"
          style={{ borderColor: agent.border, color: agent.accent }}
        >
          <AgentRobotIcon toolIcon={agent.toolIcon} />
        </div>
      </div>

      {rejecting ? (
        <div className="agent-reject-stamp">
          <XCircle className="size-4" />
          통과 거부 · 수리 요청
        </div>
      ) : null}

      <div className="mt-2 min-h-0 flex-1">
        <div
          className="flex h-full min-h-0 flex-col rounded-xl border p-3"
          style={{ backgroundColor: agent.bg, borderColor: agent.border }}
        >
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/70 bg-white/75 p-3">
            <p className="flex items-center gap-2 text-sm font-black uppercase text-[#5b6f67] sm:text-base">
              <Database className="size-5" />
              Real Server Log Stream
            </p>
            <div className="agent-log-stream mt-2 min-h-0 flex-1 overflow-hidden rounded-lg bg-[#0c1715] px-3 py-2 text-[#dff9f2]">
              <div className="flex h-full flex-col justify-end gap-1">
                {agentLogLines.map((line) => (
                  <p
                    className="agent-log-row truncate border-b border-white/10 pb-1 text-[0.68rem] font-black leading-snug sm:text-xs"
                    key={line.id}
                  >
                    {line.text}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-2 truncate rounded-lg border border-[#e2ddd1] bg-white px-3 py-2 text-xs font-black uppercase leading-tight text-[#5d6f68] sm:text-sm">
        {agent.techLabel}
      </p>
    </section>
  )
}

function AgentRobotIcon({ toolIcon }: { toolIcon: React.ReactNode }) {
  return (
    <span aria-hidden className="agent-robot">
      <span className="agent-robot-antenna" />
      <span className="agent-robot-head">
        <span className="agent-robot-eye agent-robot-eye--left" />
        <span className="agent-robot-eye agent-robot-eye--right" />
        <span className="agent-robot-mouth" />
      </span>
      <span className="agent-robot-arm agent-robot-arm--left" />
      <span className="agent-robot-arm agent-robot-arm--right" />
      <span className="agent-robot-body">
        <span className="agent-robot-tool">{toolIcon}</span>
      </span>
      <span className="agent-robot-spark agent-robot-spark--one" />
      <span className="agent-robot-spark agent-robot-spark--two" />
      <span className="agent-robot-spark agent-robot-spark--three" />
    </span>
  )
}

function getStatusTitle(status: GenerationJobProgress['status'] | undefined) {
  switch (status) {
    case 'queued':
      return '작업 등록 중'
    case 'processing':
      return '영상 분석 중'
    case 'needs_repair':
      return '자동 수리 중'
    case 'published':
      return '완성본 준비 완료'
    case 'canceled':
      return '생성 취소됨'
    case 'blocked':
      return '품질 검사 중단'
    case 'failed':
      return '생성 실패'
    default:
      return '생성 준비 중'
  }
}

function appendGenerationProgressLog(
  currentLogs: AgentLogEntry[],
  progress: GenerationJobProgress,
) {
  const now = Date.now()
  const nextLogs = [...currentLogs]
  const message = progress.message?.trim()
  const progressEvents = Array.isArray(progress.progressEvents)
    ? progress.progressEvents
    : []

  if (progressEvents.length > 0) {
    for (const event of progressEvents) {
      const eventMessage = event.message?.trim()
      if (!eventMessage) {
        continue
      }
      const eventStatus = event.status ?? progress.status
      const eventCreatedAtMs = Date.parse(event.at ?? '')

      nextLogs.push({
        agentKey: getAgentKeyForProgress({
          message: eventMessage,
          stage: event.stage ?? null,
          status: eventStatus,
        }),
        createdAtMs: Number.isFinite(eventCreatedAtMs)
          ? eventCreatedAtMs
          : now,
        message: `서버 ${formatProgressStage(event.stage)}: ${eventMessage}`,
        sourceKey:
          typeof event.sequence === 'number'
            ? `progress-event:${event.sequence}`
            : `progress-event:${event.stage ?? 'unknown'}:${eventMessage}`,
        status: eventStatus,
        type: 'progress',
      })

      const eventDetails = Array.isArray(event.details) ? event.details : []
      eventDetails.forEach((detail, detailIndex) => {
        const detailMessage = detail.trim()
        if (!detailMessage) {
          return
        }

        nextLogs.push({
          agentKey: getAgentKeyForProgress({
            message: eventMessage,
            stage: event.stage ?? null,
            status: eventStatus,
          }),
          createdAtMs: Number.isFinite(eventCreatedAtMs)
            ? eventCreatedAtMs + detailIndex + 1
            : now + detailIndex + 1,
          message: `↳ ${detailMessage}`,
          sourceKey:
            typeof event.sequence === 'number'
              ? `progress-event:${event.sequence}:detail:${detailIndex}`
              : `progress-event:${event.stage ?? 'unknown'}:${eventMessage}:detail:${detailIndex}:${detailMessage}`,
          status: eventStatus,
          type: 'progress',
        })
      })
    }
  } else if (message) {
    nextLogs.push({
      agentKey: getAgentKeyForProgress(progress),
      createdAtMs: now,
      message: `서버 ${formatProgressStage(progress.stage)}: ${message}`,
      sourceKey: `progress-current:${progress.stage ?? 'unknown'}:${message}`,
      status: progress.status,
      type: 'progress',
    })
  } else {
    nextLogs.push({
      agentKey: getAgentKeyForProgress(progress),
      createdAtMs: now,
      message: `서버 status: ${getStatusTitle(progress.status)}`,
      sourceKey: `progress-status:${progress.status}`,
      status: progress.status,
      type: 'progress',
    })
  }

  for (const issue of extractQualityIssues(progress.qualityReport)) {
    nextLogs.push({
      agentKey: getAgentKeyForIssueCode(issue.code),
      createdAtMs: now,
      message: `품질 issue: ${issue.code}${issue.message ? ` · ${issue.message}` : ''}`,
      sourceKey: `quality-issue:${issue.code}:${issue.message ?? ''}`,
      status: progress.status,
      type: 'issue',
    })
  }

  return dedupeRecentLogs(nextLogs).slice(-220)
}

function dedupeRecentLogs(logs: AgentLogEntry[]) {
  const result: AgentLogEntry[] = []
  const seenSourceKeys = new Set<string>()

  for (const log of logs) {
    if (log.sourceKey) {
      if (seenSourceKeys.has(log.sourceKey)) {
        continue
      }
      seenSourceKeys.add(log.sourceKey)
    }

    const previous = result[result.length - 1]
    if (
      previous &&
      previous.agentKey === log.agentKey &&
      previous.message === log.message &&
      previous.status === log.status &&
      previous.type === log.type
    ) {
      continue
    }

    result.push(log)
  }

  return result
}

function getAgentVisibleLogs(
  agentKey: VisibleAgentKey,
  logs: AgentLogEntry[],
  startedAt: number | null,
) {
  const filteredLogs = logs
    .filter((log) => log.agentKey === agentKey)
    .slice(-14)

  if (filteredLogs.length === 0) {
    return [
      {
        id: `${agentKey}-empty`,
        text: '아직 이 Agent로 전달된 실제 서버 로그가 없습니다.',
      },
    ]
  }

  return filteredLogs.map((log) => ({
    id: `${log.createdAtMs}-${log.agentKey}-${log.type}-${log.message}`,
    text: `${formatLogOffset(log.createdAtMs, startedAt)} · ${log.message}`,
  }))
}

function formatLogOffset(createdAtMs: number, startedAt: number | null) {
  if (!startedAt) {
    return new Date(createdAtMs).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return `t+${Math.max(0, Math.round((createdAtMs - startedAt) / 1000))}s`
}

function getActiveAgentKey(
  progress: GenerationJobProgress | null,
  stepIndex: number,
  elapsedSeconds: number,
): VisibleAgentKey {
  if (progress) {
    const agentKey = getAgentKeyForProgress(progress)
    if (agentKey) {
      return agentKey
    }
  }

  const cycle: VisibleAgentKey[] =
    stepIndex <= 2
      ? ['video', 'video', 'rag', 'easy', 'quality']
      : ['rag', 'easy', 'quality', 'video']

  return cycle[Math.floor(elapsedSeconds / 4) % cycle.length] ?? 'video'
}

function getAgentKeyForProgress(
  progress: GenerationJobProgress,
): VisibleAgentKey {
  const stage = progress.stage ?? ''
  const message = progress.message ?? ''

  if (
    /ground|rag|rule|official|contradiction|재난안전|공식|근거|충돌/iu.test(
      stage,
    )
  ) {
    return 'rag'
  }

  if (
    /author|scenario|card|easy|language|deterministic|finalizer|fallback|학습|카드|쉬운말/iu.test(
      stage,
    )
  ) {
    return 'easy'
  }

  if (
    /critic|quality|judge|repair|publish|publisher|검사|품질|수리|완성/iu.test(
      stage,
    )
  ) {
    return 'quality'
  }

  if (
    /prepare|video|download|probe|audio|asr|scene|cut|visual|caption|ocr|evidence|frame|boundary|영상|오디오|화면|자막/iu.test(
      stage,
    )
  ) {
    return 'video'
  }

  if (
    progress.status === 'needs_repair' ||
    progress.status === 'blocked' ||
    progress.status === 'failed' ||
    /품질|검사|수리|repair|publish|완성|finalizer|통과/iu.test(message)
  ) {
    return 'quality'
  }

  if (/RAG|공식|근거|rule|ground|충돌|재난안전/iu.test(message)) {
    return 'rag'
  }

  if (/카드|쉬운말|문장|질문|선택지|해야 할 일|하지 말아요|학습/iu.test(message)) {
    return 'easy'
  }

  return 'video'
}

function formatProgressStage(stage: string | null | undefined) {
  if (!stage) {
    return 'progress'
  }

  return stage.replace(/[_-]+/gu, ' ')
}

function getAgentKeyForIssueCode(code: string): VisibleAgentKey {
  if (/official|ground|rag|rule|contradiction|ungrounded/iu.test(code)) {
    return 'rag'
  }

  if (/keyword|source|learner_text|easy|language/iu.test(code)) {
    return 'easy'
  }

  if (/audio|scene|segment|intro|outro|boundary|caption|topic/iu.test(code)) {
    return 'video'
  }

  return 'quality'
}

function getRejectedAgentKeys(
  progress: GenerationJobProgress | null,
): VisibleAgentKey[] {
  if (!progress) {
    return []
  }

  const issueCodes = extractQualityIssueCodes(progress.qualityReport)
  const rejected = new Set<VisibleAgentKey>()

  if (progress.status === 'needs_repair') {
    rejected.add('quality')
  }

  if (
    issueCodes.some((code) =>
      /official|ground|rag|rule|contradiction|ungrounded/iu.test(code),
    )
  ) {
    rejected.add('rag')
  }

  if (
    issueCodes.some((code) =>
      /quiz|teach|answer|question|generic|ambiguous/iu.test(code),
    )
  ) {
    rejected.add('quality')
  }

  if (
    issueCodes.some((code) =>
      /keyword|source|learner_text|easy|language/iu.test(code),
    )
  ) {
    rejected.add('easy')
  }

  if (
    issueCodes.some((code) =>
      /audio|scene|segment|intro|outro|boundary|caption|topic/iu.test(code),
    )
  ) {
    rejected.add('video')
  }

  return [...rejected]
}

function extractQualityIssueCodes(report: Record<string, unknown> | null | undefined) {
  return extractQualityIssues(report)
    .map((issue) => issue.code)
    .filter((code): code is string => Boolean(code))
}

function extractQualityIssues(report: Record<string, unknown> | null | undefined) {
  const rawIssues = Array.isArray(report?.issues) ? report.issues : []

  return rawIssues
    .map((issue) => {
      if (!issue || typeof issue !== 'object') {
        return null
      }

      const record = issue as Record<string, unknown>
      return {
        code: typeof record.code === 'string' ? record.code : '',
        message: typeof record.message === 'string' ? record.message : '',
      }
    })
    .filter((issue): issue is { code: string; message: string } =>
      Boolean(issue && (issue.code || issue.message)),
    )
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message === 'Aborted')
  )
}
