import { lazy, Suspense, useEffect, useState } from 'react'

import { appHref, getAppRoute } from './lib/routes'
import { isLocalSeasonalEnabled } from './lib/local-seasonal'

const LearningHomePage = lazy(() => import('./LearningHomePage.tsx'))
const LocalSeasonalPage = lazy(() => import('./LocalSeasonalPage.tsx'))
const LiveLabPage = lazy(() => import('./WebAppPage.tsx'))
const QaWorkspacePage = lazy(() => import('./App.tsx'))
const ScenarioPracticePage = lazy(() => import('./ScenarioPracticePage.tsx'))
const SegmentEditorPage = lazy(() => import('./SegmentEditorPage.tsx'))
const TeacherGuidePage = lazy(() => import('./TeacherGuidePage.tsx'))
const UrlGeneratorPage = lazy(() => import('./UrlGeneratorPage.tsx'))
const UrlGeneratorV2Page = lazy(() => import('./UrlGeneratorV2Page.tsx'))

export function Root() {
  const [normalizedPathname, setNormalizedPathname] = useState(getAppRoute)

  useEffect(() => {
    const handleRouteChange = () => setNormalizedPathname(getAppRoute())

    window.addEventListener('hashchange', handleRouteChange)
    window.addEventListener('popstate', handleRouteChange)

    return () => {
      window.removeEventListener('hashchange', handleRouteChange)
      window.removeEventListener('popstate', handleRouteChange)
    }
  }, [])
  const isKnownPath =
    normalizedPathname === '/' ||
    normalizedPathname === '/demo' ||
    normalizedPathname === '/teacher' ||
    normalizedPathname === '/live-lab' ||
    normalizedPathname === '/url-generator' ||
    normalizedPathname === '/url-generator-v2' ||
    normalizedPathname.startsWith('/guardian-editor') ||
    (isLocalSeasonalEnabled() && normalizedPathname === '/local-seasonal') ||
    normalizedPathname === '/qa' ||
    normalizedPathname.startsWith('/scenario/')
  const Page =
    normalizedPathname.startsWith('/guardian-editor')
      ? SegmentEditorPage
      : normalizedPathname === '/demo' ||
          normalizedPathname.startsWith('/scenario/')
        ? ScenarioPracticePage
        : isLocalSeasonalEnabled() && normalizedPathname === '/local-seasonal'
          ? LocalSeasonalPage
          : normalizedPathname === '/teacher'
            ? TeacherGuidePage
            : normalizedPathname === '/live-lab'
              ? LiveLabPage
              : normalizedPathname === '/url-generator'
                ? UrlGeneratorPage
                : normalizedPathname === '/url-generator-v2'
                  ? UrlGeneratorV2Page
                  : normalizedPathname === '/qa'
                    ? isQaUnlocked()
                      ? QaWorkspacePage
                      : InternalQaGatePage
                    : normalizedPathname === '/'
                      ? LearningHomePage
                      : isKnownPath
                        ? LearningHomePage
                        : NotFoundPage

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] text-[var(--ink)]">
          안심트랙 연습을 여는 중입니다.
        </div>
      }
    >
      <Page />
    </Suspense>
  )
}

function isQaUnlocked() {
  const params = new URLSearchParams(window.location.search)

  if (params.get('internal') === 'qa') {
    try {
      window.localStorage.setItem('ansimtrack.internal.qa', 'enabled')
    } catch {
      // Ignore storage failures; the current URL still unlocks this session.
    }
    return true
  }

  try {
    return window.localStorage.getItem('ansimtrack.internal.qa') === 'enabled'
  } catch {
    return false
  }
}

function InternalQaGatePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4 text-[var(--ink)]">
      <section className="max-w-lg rounded-md border border-[var(--line)] bg-white p-6">
        <p className="text-sm font-semibold text-[var(--muted)]">내부 전용</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          QA 화면은 공개되어 있지 않습니다.
        </h1>
        <p className="mt-3 text-base leading-7 text-[var(--muted)]">
          학습자는 연습 홈을 사용해 주세요. 내부 검증이 필요한 팀원은 승인된
          링크로 접속해야 합니다.
        </p>
        <a className="link-button mt-5" href={appHref('/')}>
          연습 홈으로 가기
        </a>
      </section>
    </main>
  )
}

function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4 text-[var(--ink)]">
      <section className="max-w-lg rounded-md border border-[var(--line)] bg-white p-6">
        <p className="text-sm font-semibold text-[var(--muted)]">
          찾을 수 없는 주소
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          연습 화면을 찾지 못했어요.
        </h1>
        <p className="mt-3 text-base leading-7 text-[var(--muted)]">
          홈으로 돌아가서 화재나 지진 연습을 다시 골라 주세요.
        </p>
        <a className="link-button mt-5" href={appHref('/')}>
          연습 홈으로 가기
        </a>
      </section>
    </main>
  )
}
