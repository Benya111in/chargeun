import { ArrowRight } from 'lucide-react'

import { appHref } from './lib/routes'
import { learningScenarios } from './lib/demo-theater-content'

const localSeasonalScenarios = learningScenarios.filter(
  (scenario) => scenario.localOnly,
)

export default function LocalSeasonalPage() {
  return (
    <main className="min-h-screen bg-[#f7f8f4] px-6 py-8 text-[#151713]">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold text-[#596257]">로컬 전용</p>
        <h1 className="mt-2 text-[clamp(2.6rem,5vw,4.8rem)] font-semibold leading-tight tracking-tight">
          새 재난 주제를
          <br />
          로컬에서만 확인해요.
        </h1>
        <p className="mt-5 max-w-3xl text-lg font-semibold leading-8 text-[#596257]">
          GitHub Pages 체험 링크는 기존 화재와 지진 흐름 그대로 둡니다. 아래
          주제는 로컬 검토용으로만 열어 둔 새 학습 페이지입니다.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {localSeasonalScenarios.map((scenario) => (
            <a
              className="group rounded-md border border-[#dfe4da] bg-white p-5 shadow-sm transition hover:border-[#151713]"
              href={appHref(`/scenario/${scenario.id}`)}
              key={scenario.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div
                    aria-hidden="true"
                    className={`mb-5 size-3 rounded-full ${scenario.accentClassName}`}
                  />
                  <h2 className="text-2xl font-semibold">
                    {scenario.homeTitle ?? scenario.title}
                  </h2>
                  <p className="mt-3 text-base font-semibold leading-7 text-[#596257]">
                    {scenario.homeNote ?? scenario.note}
                  </p>
                </div>
                <ArrowRight className="mt-1 size-6 shrink-0 transition group-hover:translate-x-1" />
              </div>
              <p className="mt-6 text-sm font-semibold text-[#596257]">
                {scenario.segments.length}개 장면
              </p>
            </a>
          ))}
        </div>

        <a
          className="mt-8 inline-flex text-sm font-semibold text-[#596257] underline underline-offset-4"
          href={appHref('/')}
        >
          기존 체험 홈으로 돌아가기
        </a>
      </section>
    </main>
  )
}
