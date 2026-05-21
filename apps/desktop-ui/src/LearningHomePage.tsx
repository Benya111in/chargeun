import { useState, type FormEvent } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Link2,
  LoaderCircle,
  ShieldAlert,
} from 'lucide-react'

import { appHref } from './lib/routes'
import { isLocalSeasonalEnabled } from './lib/local-seasonal'
import {
  saveGeneratedScenario,
  type GeneratedScenarioRecord,
} from './lib/generated-scenario'

const safetyNotice =
  '이 앱은 연습용입니다. 실제로 위험할 때는 119·112, 주변 어른, 현장 안내를 먼저 따르세요.'
const generationSteps = [
  '영상 파일과 자막을 가져오고 있어요.',
  '타임스탬프를 보고 장면을 나누고 있어요.',
  '쉬운 말과 카드 화면을 새로 만들고 있어요.',
]

export default function LearningHomePage() {
  const [sourceUrl, setSourceUrl] = useState('')
  const [generationStepIndex, setGenerationStepIndex] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [urlError, setUrlError] = useState('')

  const handleUrlSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isGenerating) {
      return
    }

    try {
      setUrlError('')
      setGenerationStepIndex(0)
      setIsGenerating(true)

      for (let index = 0; index < generationSteps.length; index += 1) {
        setGenerationStepIndex(index)
        await wait(520)
      }

      const { record } = await requestGeneratedPractice(sourceUrl)

      saveGeneratedScenario(record)
      window.location.href = appHref(`/scenario/${record.id}`)
    } catch (error) {
      setUrlError(
        error instanceof Error
          ? error.message
          : '링크를 확인하지 못했어요. 다시 입력해 주세요.',
      )
      setIsGenerating(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8f4] text-[#151713]">
      <section className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col justify-center px-5 py-8 md:px-8">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div>
            <p className="mb-3 text-base font-semibold text-[#596257]">
              차근차근 AI 도우미
            </p>
            <h1 className="max-w-5xl text-[clamp(3rem,6.2vw,4.8rem)] font-semibold leading-[1.03] tracking-tight">
              재난 영상을 멈춰 보고,
              <br />
              쉬운 말과 카드로
              <br />
              연습해요.
            </h1>
            <p className="mt-5 max-w-3xl text-lg font-semibold leading-8 text-[#596257]">
              빠르게 지나가는 화재와 지진 영상을 한 장면씩 멈춥니다. 장면을
              보고, 해야 할 일을 읽고, 짧은 질문에 답하면서 연습합니다.
            </p>

            <div className="mt-7">
              <a
                className="learning-cta-glow inline-flex min-h-16 items-center gap-3 rounded-md border border-[#151713] bg-[#151713] px-8 py-4 text-2xl font-semibold text-white"
                href={appHref('/scenario/fire-grounded-flow')}
              >
                학습 체험하기
                <ArrowRight className="size-6" />
              </a>
            </div>

            <form
              className="mt-5 max-w-3xl rounded-md border border-[#dfe4da] bg-white p-4 shadow-sm"
              onSubmit={handleUrlSubmit}
            >
              <label
                className="text-base font-semibold"
                htmlFor="disaster-video-url"
              >
                재난안전 영상 링크로 연습 만들기
              </label>
              <p className="mt-1 text-sm font-semibold leading-6 text-[#596257]">
                유튜브나 공공기관 영상 주소를 넣으면 영상 자막과 시간을 읽고
                새 장면별 학습 화면을 바로 만들어요.
              </p>
              <div className="mt-3 flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#596257]" />
                  <input
                    className="min-h-12 w-full rounded-md border border-[#dfe4da] bg-[#f7f8f4] py-3 pl-10 pr-3 text-base font-semibold text-[#151713] outline-none transition focus:border-[#151713]"
                    disabled={isGenerating}
                    id="disaster-video-url"
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    type="url"
                    value={sourceUrl}
                  />
                </div>
                <button
                  className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-md border border-[#151713] bg-[#151713] px-5 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isGenerating || sourceUrl.trim().length === 0}
                  type="submit"
                >
                  만들기
                </button>
              </div>
              {urlError ? (
                <p className="mt-2 text-sm font-semibold leading-6 text-rose-700">
                  {urlError}
                </p>
              ) : null}
            </form>

            <div className="mt-7 grid max-w-3xl gap-3 md:grid-cols-3">
              <IntroPoint title="짧게 봐요">한 장면만 보고 멈춰요.</IntroPoint>
              <IntroPoint title="순서대로 읽어요">
                상황과 행동을 나누어 봐요.
              </IntroPoint>
              <IntroPoint title="다시 연습해요">
                헷갈리면 같은 장면을 다시 봐요.
              </IntroPoint>
            </div>

            {isLocalSeasonalEnabled() ? (
              <a
                className="mt-5 inline-flex text-sm font-semibold text-[#596257] underline underline-offset-4"
                href={appHref('/local-seasonal')}
              >
                로컬 전용 새 재난 주제 보기
              </a>
            ) : null}
          </div>

          <aside className="rounded-md border border-amber-300 bg-amber-50 p-5 text-amber-950">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="size-5" />
              연습 전에 기억해요
            </div>
            <p className="mt-4 text-2xl font-semibold leading-9">
              {safetyNotice}
            </p>
          </aside>
        </div>
      </section>
      {isGenerating ? (
        <GenerationDialog stepIndex={generationStepIndex} />
      ) : null}
    </main>
  )
}

function IntroPoint({
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

function GenerationDialog({ stepIndex }: { stepIndex: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/46 px-4">
      <section
        aria-live="polite"
        className="w-full max-w-lg rounded-md border border-[#dfe4da] bg-white p-6 text-[#151713] shadow-[0_24px_80px_rgba(0,0,0,0.22)]"
      >
        <div className="flex items-center gap-3">
          <LoaderCircle className="size-7 animate-spin" />
          <div>
            <p className="text-sm font-semibold text-[#596257]">
              학습 화면을 만들고 있어요
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              잠시만 기다려 주세요.
            </h2>
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
              {index + 1}. {step}
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

async function requestGeneratedPractice(sourceUrl: string): Promise<{
  record: GeneratedScenarioRecord
}> {
  const response = await fetch('/api/generate-practice-from-url', {
    body: JSON.stringify({ sourceUrl }),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  const payload = (await response.json()) as {
    message?: string
    record?: GeneratedScenarioRecord
  }

  if (!response.ok || !payload.record) {
    throw new Error(
      payload.message ??
        '영상에서 학습 화면을 만들지 못했어요. 다른 링크로 다시 시도해 주세요.',
    )
  }

  return { record: payload.record }
}
