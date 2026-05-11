import { lazy, Suspense } from 'react'

const LearningHomePage = lazy(() => import('./LearningHomePage.tsx'))
const LiveLabPage = lazy(() => import('./WebAppPage.tsx'))
const QaWorkspacePage = lazy(() => import('./App.tsx'))
const ScenarioPracticePage = lazy(() => import('./ScenarioPracticePage.tsx'))
const TeacherGuidePage = lazy(() => import('./TeacherGuidePage.tsx'))

export function Root() {
  const normalizedPathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const Page =
    normalizedPathname === '/demo' ||
    normalizedPathname.startsWith('/scenario/')
      ? ScenarioPracticePage
      : normalizedPathname === '/teacher'
        ? TeacherGuidePage
        : normalizedPathname === '/live-lab'
          ? LiveLabPage
          : normalizedPathname === '/qa'
            ? QaWorkspacePage
            : LearningHomePage

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
