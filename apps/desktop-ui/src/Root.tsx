import { lazy, Suspense } from 'react'

const DemoTheaterPage = lazy(() => import('./DemoTheaterPage.tsx'))
const QaWorkspacePage = lazy(() => import('./App.tsx'))
const WebAppPage = lazy(() => import('./WebAppPage.tsx'))

export function Root() {
  const normalizedPathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const Page =
    normalizedPathname === '/demo'
      ? DemoTheaterPage
      : normalizedPathname === '/qa'
        ? QaWorkspacePage
        : WebAppPage

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] text-[var(--ink)]">
          안심트랙 Live를 여는 중입니다.
        </div>
      }
    >
      <Page />
    </Suspense>
  )
}
