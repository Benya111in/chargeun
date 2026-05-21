import { ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react'

import { appHref } from './lib/routes'
import { isLocalSeasonalEnabled } from './lib/local-seasonal'

const safetyNotice =
  '이 앱은 연습용입니다. 실제로 위험할 때는 119·112, 주변 어른, 현장 안내를 먼저 따르세요.'
export default function LearningHomePage() {
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
