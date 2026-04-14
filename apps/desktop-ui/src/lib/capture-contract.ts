import type {
  CaptureSession,
  CaptureSourceType,
} from '@ansimtrack/shared-types'

export type CapturePermissionState =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'unsupported'

export type CaptureControllerStatus =
  | 'bootstrapping'
  | 'idle'
  | 'starting'
  | 'running'
  | 'error'

export type CaptureRuntime = 'native-mac' | 'browser-fallback'

export type CaptureBootstrapState = {
  platform: string
  capturePath: string
  shadowDelayMs: number
}

export type CaptureSourceOption = {
  id: string
  displayName: string
  sourceType: CaptureSourceType
  runtime: CaptureRuntime
  priority: 'primary' | 'fallback'
  description: string
  ready: boolean
}

export const DEFAULT_CAPTURE_BOOTSTRAP_STATE: CaptureBootstrapState = {
  platform: 'mac-priority',
  capturePath: 'screen-capture-kit-pending',
  shadowDelayMs: 4000,
}

export const NATIVE_MONITOR_SOURCE_ID = 'native-current-monitor'
export const BROWSER_FALLBACK_SOURCE_ID = 'browser-screen-share'

export const capturePermissionLabels: Record<CapturePermissionState, string> = {
  unknown: '권한 확인 전',
  granted: '권한 허용됨',
  denied: '권한 거부됨',
  unsupported: '지원 안 됨',
}

export const captureStatusLabels: Record<CaptureControllerStatus, string> = {
  bootstrapping: '캡처 경로 확인 중',
  idle: '대기 중',
  starting: '시작 중',
  running: '실행 중',
  error: '오류',
}

export function buildCaptureSources(input: {
  bootstrap: CaptureBootstrapState
  browserCaptureSupported: boolean
}): CaptureSourceOption[] {
  const { bootstrap, browserCaptureSupported } = input

  return [
    {
      id: NATIVE_MONITOR_SOURCE_ID,
      displayName: '현재 모니터',
      sourceType: 'monitor',
      runtime: 'native-mac',
      priority: 'primary',
      description:
        bootstrap.capturePath === 'screen-capture-kit-ready'
          ? 'macOS ScreenCaptureKit 우선 경로'
          : 'ScreenCaptureKit bridge 연결 예정',
      ready: bootstrap.capturePath === 'screen-capture-kit-ready',
    },
    {
      id: BROWSER_FALLBACK_SOURCE_ID,
      displayName: '브라우저 화면 공유',
      sourceType: 'browser_tab',
      runtime: 'browser-fallback',
      priority: 'fallback',
      description: browserCaptureSupported
        ? 'getDisplayMedia 기반 live preview fallback'
        : '현재 환경은 브라우저 화면 공유를 지원하지 않음',
      ready: browserCaptureSupported,
    },
  ]
}

export function createCaptureSession(
  source: CaptureSourceOption,
  input: {
    displayName?: string
    hasAudio: boolean
    platform: CaptureSession['platform']
  },
): CaptureSession {
  return {
    id: `${source.id}-${crypto.randomUUID()}`,
    sourceType: source.sourceType,
    platform: input.platform,
    startedAt: Date.now(),
    hasAudio: input.hasAudio,
    displayName: input.displayName ?? source.displayName,
  }
}
