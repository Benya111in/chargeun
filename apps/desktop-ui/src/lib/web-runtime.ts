const betaCodeStorageKey = 'ansimtrack.web.beta-code'

export function loadStoredBetaCode() {
  if (typeof window === 'undefined') {
    return ''
  }

  try {
    return window.localStorage.getItem(betaCodeStorageKey) ?? ''
  } catch {
    return ''
  }
}

export function saveStoredBetaCode(betaCode: string) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (betaCode.trim()) {
      window.localStorage.setItem(betaCodeStorageKey, betaCode.trim())
    } else {
      window.localStorage.removeItem(betaCodeStorageKey)
    }
  } catch {
    // Ignore private browsing storage errors.
  }
}

export function isDesktopBrowserForLiveCapture() {
  if (typeof navigator === 'undefined') {
    return false
  }

  const userAgent = navigator.userAgent.toLowerCase()
  const isMobile =
    /iphone|ipad|android|mobile/.test(userAgent) ||
    (navigator.maxTouchPoints > 1 && /macintosh/.test(userAgent))

  return !isMobile
}
