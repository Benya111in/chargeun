import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Link2,
  LoaderCircle,
  Server,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'

import { appHref } from './lib/routes'
import {
  clearStoredGeneratorApiBase,
  getGeneratorApiConfig,
  loadStoredGeneratorAccessCode,
  persistGeneratorApiBase,
  persistGeneratorAccessCode,
  requestGeneratedPracticeFromApi,
} from './lib/url-generator-api'

const generationSteps = [
  '생성 작업을 서버에 등록합니다.',
  '맥북 작업자가 유튜브 영상과 자막을 가져옵니다.',
  '음성이 끝나는 지점을 찾습니다.',
  '화면 자막과 장면이 바뀌는 지점을 봅니다.',
  'GPT-5.5가 장면별 학습 화면을 작성합니다.',
  '재난안전 표현과 쉬운말 품질을 검사합니다.',
  '학습자가 볼 수 있는 연습 화면으로 저장합니다.',
]
const safetyNotice =
  '이 페이지는 연습 자료를 만드는 곳입니다. 실제 위험할 때는 119·112, 주변 어른, 현장 안내를 먼저 따르세요.'
const minimumGenerationDisplayMs = 8_000

export default function UrlGeneratorPage() {
  const initialConfig = useMemo(() => getGeneratorApiConfig(), [])
  const initialAccessCode = useMemo(() => loadStoredGeneratorAccessCode(), [])
  const [accessCode, setAccessCode] = useState(initialAccessCode)
  const [apiBaseDraft, setApiBaseDraft] = useState(initialConfig.apiBase)
  const [apiConfig, setApiConfig] = useState(initialConfig)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(
    null,
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [notice, setNotice] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    if (!isGenerating || !generationStartedAt) {
      return
    }

    const update = () => {
      const elapsedMs = Date.now() - generationStartedAt
      setElapsedSeconds(Math.floor(elapsedMs / 1000))
      setStepIndex(
        Math.min(generationSteps.length - 1, Math.floor(elapsedMs / 3_000)),
      )
    }

    update()
    const intervalId = window.setInterval(update, 450)

    return () => window.clearInterval(intervalId)
  }, [generationStartedAt, isGenerating])

  const canSubmit =
    sourceUrl.trim().length > 0 && !isGenerating && !apiConfig.requiresRemoteApi

  const handleApiBaseSave = () => {
    persistGeneratorApiBase(apiBaseDraft)
    const nextConfig = getGeneratorApiConfig()
    setApiConfig(nextConfig)
    setApiBaseDraft(nextConfig.apiBase)
    setNotice(
      nextConfig.requiresRemoteApi
        ? 'API 서버 주소를 저장하지 못했습니다. https 주소를 입력해 주세요.'
        : '생성 API 서버 주소를 저장했습니다.',
    )
  }

  const handleApiBaseClear = () => {
    clearStoredGeneratorApiBase()
    const nextConfig = getGeneratorApiConfig()
    setApiConfig(nextConfig)
    setApiBaseDraft('')
    setNotice(
      nextConfig.requiresRemoteApi
        ? '저장된 API 서버 주소를 지웠습니다. GitHub Pages에서는 새 주소가 필요합니다.'
        : '저장된 API 서버 주소를 지웠습니다.',
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!canSubmit) {
      setNotice(
        apiConfig.requiresRemoteApi
          ? '먼저 생성 API 서버 주소를 연결해 주세요.'
          : '유튜브 주소를 입력해 주세요.',
      )
      return
    }

    try {
      setNotice('')
      setElapsedSeconds(0)
      setGenerationStartedAt(Date.now())
      setIsGenerating(true)
      setStepIndex(0)
      persistGeneratorAccessCode(accessCode)

      const generationPromise = requestGeneratedPracticeFromApi(
        sourceUrl,
        accessCode,
      )
      const [generationResult] = await Promise.allSettled([
        generationPromise,
        wait(minimumGenerationDisplayMs),
      ] as const)

      if (generationResult.status === 'rejected') {
        throw generationResult.reason
      }

      const { record } = generationResult.value
      window.location.href = appHref(`/scenario/${record.id}`)
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : '영상을 학습 화면으로 만들지 못했습니다.',
      )
      setGenerationStartedAt(null)
      setIsGenerating(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7f2] text-[#151713]">
      <section className="mx-auto grid min-h-screen w-full max-w-[1180px] items-center gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_410px]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-950">
            <Sparkles className="size-4" />새 영상 생성 페이지
          </div>
          <h1 className="mt-6 max-w-4xl text-[clamp(2.25rem,6vw,4.9rem)] font-semibold leading-[1.04] tracking-tight">
            유튜브 링크를 넣으면
            <br />
            장면별 연습 화면을
            <br />
            새로 만듭니다.
          </h1>
          <p className="mt-6 max-w-3xl text-xl font-semibold leading-9 text-[#596257]">
            기존 체험 페이지와 분리된 생성 전용 화면입니다. API key를 브라우저에
            보내지 않고, 연결된 작업자가 영상 자막과 프레임 근거를 읽어
            느린학습자용 학습 화면을 만듭니다.
          </p>

          <form
            className="mt-8 max-w-4xl rounded-md border border-[#dfe4da] bg-white p-5 shadow-[0_18px_60px_rgba(21,23,19,0.06)]"
            onSubmit={handleSubmit}
          >
            <label className="text-xl font-semibold" htmlFor="new-video-url">
              새 재난안전 영상 URL
            </label>
            <p className="mt-2 text-base font-semibold leading-7 text-[#596257]">
              유튜브 주소를 그대로 넣어 주세요. 생성에는 시간이 걸릴 수 있고,
              품질 검사에 막히면 바로 보여 주지 않습니다.
            </p>
            <div className="mt-4 flex gap-3">
              <div className="relative min-w-0 flex-1">
                <Link2 className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-[#596257]" />
                <input
                  className="min-h-16 w-full rounded-md border border-[#dfe4da] bg-[#f7f8f4] py-4 pl-14 pr-4 text-lg font-semibold text-[#151713] outline-none transition focus:border-[#151713]"
                  disabled={isGenerating}
                  id="new-video-url"
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="youtube.com/watch?v=..."
                  type="text"
                  value={sourceUrl}
                />
              </div>
              <button
                className="inline-flex min-h-16 shrink-0 items-center justify-center gap-2 rounded-md border border-[#151713] bg-[#151713] px-7 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!canSubmit}
                type="submit"
              >
                만들기
                <ArrowRight className="size-5" />
              </button>
            </div>
            <label
              className="mt-4 block text-sm font-semibold text-[#596257]"
              htmlFor="generator-access-code"
            >
              생성 비밀번호
            </label>
            <input
              className="mt-2 min-h-12 w-full rounded-md border border-[#dfe4da] bg-[#f7f8f4] px-4 text-base font-semibold text-[#151713] outline-none transition focus:border-[#151713]"
              disabled={isGenerating}
              id="generator-access-code"
              onChange={(event) => setAccessCode(event.target.value)}
              placeholder="공유받은 비밀번호를 입력하세요"
              type="password"
              value={accessCode}
            />
            <p className="mt-2 text-sm font-semibold leading-6 text-[#596257]">
              비밀번호가 맞으면 연결된 작업자가 생성합니다. 브라우저에는 API
              key를 저장하지 않습니다.
            </p>
            {notice ? (
              <p className="mt-3 text-base font-semibold leading-7 text-rose-700">
                {notice}
              </p>
            ) : null}
          </form>

          <div className="mt-6 grid max-w-4xl gap-3 md:grid-cols-3">
            <ProcessCard title="분석">
              자막, 음성 문장 끝, 화면 자막 변화를 같이 봅니다.
            </ProcessCard>
            <ProcessCard title="생성">
              상황, 해야 할 일, 이유, 하지 말 일을 분리합니다.
            </ProcessCard>
            <ProcessCard title="검사">
              긴 장면, 빠진 내용, 애매한 질문은 막습니다.
            </ProcessCard>
          </div>
        </div>

        <aside className="grid gap-4">
          <section className="rounded-md border border-amber-300 bg-amber-50 p-5 text-amber-950">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="size-5" />
              먼저 기억해요
            </div>
            <p className="mt-4 text-2xl font-semibold leading-9">
              {safetyNotice}
            </p>
          </section>

          <section className="rounded-md border border-[#dfe4da] bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#596257]">
              <Server className="size-5" />
              생성 API 연결
            </div>
            <p className="mt-3 text-base font-semibold leading-7">
              {apiConfig.requiresRemoteApi
                ? 'GitHub Pages에서는 서버 주소가 필요합니다.'
                : apiConfig.apiBase
                  ? `연결됨: ${apiConfig.apiBase}`
                  : '로컬 또는 같은 주소의 API를 사용합니다.'}
            </p>
            <label
              className="mt-4 block text-sm font-semibold text-[#596257]"
              htmlFor="generator-api-base"
            >
              API 서버 주소
            </label>
            <div className="mt-2 flex gap-2">
              <input
                className="min-h-11 min-w-0 flex-1 rounded-md border border-[#dfe4da] bg-[#f7f8f4] px-3 text-sm font-semibold outline-none focus:border-[#151713]"
                id="generator-api-base"
                onChange={(event) => setApiBaseDraft(event.target.value)}
                placeholder="https://your-api.example.com"
                type="url"
                value={apiBaseDraft}
              />
              <button
                className="rounded-md border border-[#151713] bg-[#151713] px-3 text-sm font-semibold text-white"
                onClick={handleApiBaseSave}
                type="button"
              >
                저장
              </button>
            </div>
            <button
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#596257] underline underline-offset-4"
              onClick={handleApiBaseClear}
              type="button"
            >
              <KeyRound className="size-4" />
              저장된 주소 지우기
            </button>
          </section>

          <a
            className="link-button justify-center bg-white"
            href={appHref('/')}
          >
            기존 체험 페이지로 돌아가기
          </a>
        </aside>
      </section>
      {isGenerating ? (
        <GenerationDialog
          elapsedSeconds={elapsedSeconds}
          stepIndex={stepIndex}
        />
      ) : null}
    </main>
  )
}

function ProcessCard({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <section className="rounded-md border border-[#dfe4da] bg-white p-4">
      <div className="flex items-center gap-2 text-base font-semibold">
        <CheckCircle2 className="size-5 text-emerald-700" />
        {title}
      </div>
      <p className="mt-2 text-sm font-semibold leading-6 text-[#596257]">
        {children}
      </p>
    </section>
  )
}

function GenerationDialog({
  elapsedSeconds,
  stepIndex,
}: {
  elapsedSeconds: number
  stepIndex: number
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/46 px-4">
      <section
        aria-live="polite"
        className="w-full max-w-xl rounded-md border border-[#dfe4da] bg-white p-6 text-[#151713] shadow-[0_24px_80px_rgba(0,0,0,0.22)]"
      >
        <div className="flex items-center gap-3">
          <LoaderCircle className="size-7 animate-spin" />
          <div>
            <p className="text-sm font-semibold text-[#596257]">
              새 영상으로 학습 화면을 만들고 있어요
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              끝까지 검사한 뒤에만 보여 줍니다.
            </h2>
            <p className="mt-1 text-sm font-semibold text-[#596257]">
              {elapsedSeconds}초째 처리 중입니다.
            </p>
          </div>
        </div>
        <ol className="mt-5 grid gap-2">
          {generationSteps.map((step, index) => (
            <li
              className={`rounded-md border px-4 py-3 text-base font-semibold ${
                index <= stepIndex
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                  : 'border-[#dfe4da] bg-[#f7f8f4] text-[#596257]'
              }`}
              key={step}
            >
              {step}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
