import { useState } from 'react'
import { BookOpenCheck, ShieldAlert } from 'lucide-react'

import { learningScenarios } from './lib/demo-theater-content'
import { cn } from './lib/utils'

export default function TeacherGuidePage() {
  const [scenarioId, setScenarioId] = useState(learningScenarios[0]?.id ?? '')
  const scenario =
    learningScenarios.find((item) => item.id === scenarioId) ??
    learningScenarios[0]

  return (
    <main className="min-h-screen bg-[#f7f8f4] text-[#151713]">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-5 md:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe4da] pb-4">
          <a
            className="inline-flex items-center gap-2 rounded-md bg-[#151713] px-3 py-2 text-sm font-semibold text-white"
            href="/"
          >
            <ShieldAlert className="size-4" />
            안심트랙 연습
          </a>
          <nav className="flex flex-wrap gap-2 text-sm">
            <a className="link-button" href="/">
              학습자 홈
            </a>
          </nav>
        </header>

        <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-md border border-[#dfe4da] bg-white p-5">
            <div className="flex items-center gap-2">
              <BookOpenCheck className="size-5" />
              <h1 className="text-2xl font-semibold">선생님/보호자 진행</h1>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#596257]">
              같은 멀티트랙 데이터를 사용하지만, 학습자 화면에 숨긴 설명과 공식
              근거를 진행자가 확인합니다.
            </p>
            <div className="mt-5 grid gap-2">
              {learningScenarios.map((item) => (
                <button
                  key={item.id}
                  className={cn(
                    'rounded-md border px-4 py-3 text-left transition',
                    item.id === scenario.id
                      ? 'border-[#151713] bg-[#151713] text-white'
                      : 'border-[#dfe4da] bg-[#f7f8f4] text-[#151713] hover:border-[#151713]/40',
                  )}
                  onClick={() => setScenarioId(item.id)}
                  type="button"
                >
                  <span className="block text-sm font-semibold">
                    {item.title}
                  </span>
                  <span className="mt-1 block text-xs opacity-80">
                    {item.note}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="grid gap-4">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-5 text-amber-950">
              <p className="text-sm font-semibold">진행 원칙</p>
              <p className="mt-2 text-xl font-semibold leading-8">
                이 화면은 수업과 가정 연습을 위한 보조 도구입니다. 실제 위험하면
                119·112·주변 어른·현장 안내를 먼저 따르도록 반복해 주세요.
              </p>
            </div>

            {scenario.segments.map((segment, index) => (
              <article
                key={segment.id}
                className="rounded-md border border-[#dfe4da] bg-white p-5 shadow-[0_14px_36px_rgba(21,23,19,0.04)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#596257]">
                      장면 {index + 1}
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                      {segment.label}
                    </h2>
                  </div>
                  <a className="link-button" href={`/scenario/${scenario.id}`}>
                    학습자 화면 열기
                  </a>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <GuideBlock title="진행자 설명">
                    {segment.teacherGuide.script}
                  </GuideBlock>
                  <GuideBlock title="질문 예시">
                    {segment.teacherGuide.prompt}
                  </GuideBlock>
                  <GuideBlock title="오해 교정">
                    {segment.teacherGuide.correction}
                  </GuideBlock>
                  <GuideBlock title="관찰 포인트">
                    {segment.teacherGuide.observe}
                  </GuideBlock>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <GuideBlock title="신고/도움 요청 문장">
                    {segment.explanation.tracks.report ??
                      '위험하면 119·112 또는 주변 어른에게 바로 알려요.'}
                  </GuideBlock>
                  <GuideBlock title="공식 근거">
                    {segment.segment.officialRuleIds.join(', ') ||
                      '공식 근거 확인 필요'}
                  </GuideBlock>
                </div>

                <div className="mt-5 rounded-md border border-[#dfe4da] bg-[#f7f8f4] p-4">
                  <p className="text-sm font-semibold text-[#596257]">
                    Teach-back
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {segment.checkQuestion}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {segment.answerOptions.map((option) => (
                      <span
                        key={option.id}
                        className={cn(
                          'rounded-md border px-3 py-2 text-sm font-semibold',
                          option.correct
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                            : 'border-[#dfe4da] bg-white text-[#596257]',
                        )}
                      >
                        {option.label}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </section>
        </section>
      </div>
    </main>
  )
}

function GuideBlock({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <section className="rounded-md border border-[#dfe4da] bg-[#f7f8f4] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#596257]">
        {title}
      </p>
      <p className="mt-2 text-base font-semibold leading-7">{children}</p>
    </section>
  )
}
