export function getAppRoute() {
  const hashRoute = window.location.hash.match(/^#(?<route>\/.*)$/)?.groups
    ?.route

  if (hashRoute) {
    return normalizeRoute(hashRoute)
  }

  const directRoute = normalizeRoute(window.location.pathname)

  if (isDirectAppRoute(directRoute)) {
    return directRoute
  }

  // GitHub Pages serves project sites from /repo-name/. With hash routing the
  // pathname is the repo base, not an app route, so treat it as the intro page.
  return '/'
}

export function appHref(path: string) {
  return `#${normalizeRoute(path)}`
}

export function publicAssetSrc(src: string) {
  if (!src.startsWith('/')) {
    return src
  }

  const base = import.meta.env.BASE_URL || '/'

  if (base === '/') {
    return src
  }

  return `${base.replace(/\/$/, '')}/${src.replace(/^\//, '')}`
}

function normalizeRoute(path: string) {
  const pathname = path.split('?')[0]?.replace(/\/+$/, '') || '/'
  return pathname || '/'
}

function isDirectAppRoute(path: string) {
  return (
    path === '/' ||
    path === '/demo' ||
    path === '/teacher' ||
    path === '/live-lab' ||
    path === '/qa' ||
    path.startsWith('/scenario/')
  )
}
