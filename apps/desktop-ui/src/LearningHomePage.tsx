import {
  ArrowRight,
  BookOpenCheck,
  MonitorPlay,
  ShieldAlert,
  Users,
} from 'lucide-react'

import { homeLearningScenarios } from './lib/demo-theater-content'
import { cn } from './lib/utils'

const safetyNotice =
  '이 앱은 연습용입니다. 실제로 위험할 때는 119·112, 주변 어른, 현장 안내를 우선 따르세요.'

export default function LearningHomePage() {
  return (
    <main className="min-h-screen bg-[#f7f8f4] text-[#151713]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col px-4 py-5 md:px-6 lg:py-7">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe4da] pb-4">
          <a
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#151713] px-3 py-2 text-sm font-semibold text-white"
            href="/"
          >
            <ShieldAlert className="size-4" />
            안심트랙 연습
          </a>
        </header>

        <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-10">
          <div>
            <h1 className="max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
              재난 영상을 짧게 멈춰 보고, 쉬운말과 카드로 연습해요.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[#596257]">
              빠른 영상을 한 장면씩 나누고, 지금 할 일을 카드로 골라 봅니다.
              선생님이나 보호자와 함께 반복해서 연습하는 화면입니다.
            </p>
          </div>

          <aside className="rounded-md border border-amber-300 bg-amber-50 p-5 text-amber-950">
            <p className="text-sm font-semibold">연습 전에 기억해요</p>
            <p className="mt-3 text-2xl font-semibold leading-9">
              {safetyNotice}
            </p>
          </aside>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Principle icon={<BookOpenCheck className="size-5" />} title="짧게">
            한 장면을 보고 멈춘 뒤 하나씩 확인해요.
          </Principle>
          <Principle icon={<MonitorPlay className="size-5" />} title="반복">
            이해가 어려우면 같은 장면을 다시 볼 수 있어요.
          </Principle>
          <Principle icon={<Users className="size-5" />} title="함께">
            선생님이나 보호자가 질문하고 도와줄 수 있어요.
          </Principle>
        </section>

        <section className="py-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                오늘 연습할 장면
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#596257]">
                화재와 지진 장면을 쉬운말, 행동 카드, 다시 보기로 연습합니다.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {homeLearningScenarios.map((scenario) => (
              <a
                key={scenario.id}
                aria-label={`${scenario.homeTitle ?? scenario.title} 연습 시작`}
                className="group rounded-md border border-[#dfe4da] bg-white p-5 shadow-[0_14px_36px_rgba(21,23,19,0.05)] transition hover:border-[#151713]/30"
                href={`/scenario/${scenario.id}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <span
                    className={cn(
                      'inline-flex size-3 rounded-full',
                      scenario.accentClassName,
                    )}
                  />
                  <span className="text-sm font-semibold text-[#596257]">
                    {`${scenario.segments.length}개 장면`}
                  </span>
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight">
                  {scenario.homeTitle ?? scenario.title}
                </h3>
                <p className="mt-3 min-h-12 text-sm leading-6 text-[#596257]">
                  {scenario.homeNote ?? scenario.note}
                </p>
                <div className="mt-5 flex items-center gap-2 text-sm font-semibold">
                  연습 시작
                  <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                </div>
              </a>
            ))}
          </div>
        </section>

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#dfe4da] py-4 text-sm text-[#596257]">
          <span>선생님이나 보호자와 함께 천천히 연습해요.</span>
          <a className="link-button" href="/teacher">
            어른용 안내
          </a>
        </footer>
      </div>
    </main>
  )
}

function Principle({
  children,
  icon,
  title,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  title: string
}) {
  return (
    <section className="rounded-md border border-[#dfe4da] bg-white p-5">
      <div className="flex items-center gap-2 text-[#151713]">
        {icon}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#596257]">{children}</p>
    </section>
  )
}
