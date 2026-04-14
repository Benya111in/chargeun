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
  permissionState: CapturePermissionState | 'unknown'
  shadowDelayMs: number
}

export type NativeCaptureSourceRecord = {
  id: string
  displayName: string
  sourceType: Extract<CaptureSourceType, 'monitor' | 'window'>
  width: number
  height: number
}

export type NativeCaptureSessionRecord = {
  sessionId: string
  sourceId: string
  sourceType: Extract<CaptureSourceType, 'monitor' | 'window'>
  displayName: string
  hasAudio: boolean
  platform: CaptureSession['platform']
  startedAt: number
  outputWidth: number
  outputHeight: number
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
  permissionState: 'unknown',
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
  nativeSources?: NativeCaptureSourceRecord[]
}): CaptureSourceOption[] {
  const { bootstrap, browserCaptureSupported, nativeSources = [] } = input

  const preferredNativeSources =
    nativeSources.length > 0
      ? nativeSources.map((source) => ({
          id: source.id,
          displayName: source.displayName,
          sourceType: source.sourceType,
          runtime: 'native-mac' as const,
          priority: 'primary' as const,
          description: `${source.width}x${source.height} ScreenCaptureKit source`,
          ready: isNativeCapturePathReady(bootstrap.capturePath),
        }))
      : [
          {
            id: NATIVE_MONITOR_SOURCE_ID,
            displayName: '현재 모니터',
            sourceType: 'monitor' as const,
            runtime: 'native-mac' as const,
            priority: 'primary' as const,
            description: isNativeCapturePathReady(bootstrap.capturePath)
              ? 'macOS ScreenCaptureKit command path'
              : 'ScreenCaptureKit bridge 연결 예정',
            ready: isNativeCapturePathReady(bootstrap.capturePath),
          },
        ]

  return [
    ...preferredNativeSources,
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

export function isNativeCapturePathReady(capturePath: string) {
  return (
    capturePath === 'screen-capture-kit-ready' ||
    capturePath === 'screen-capture-kit-command-ready' ||
    capturePath === 'screen-capture-kit-swift-bridge-ready'
  )
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

export function captureSessionFromNativeRecord(
  session: NativeCaptureSessionRecord,
): CaptureSession {
  return {
    id: session.sessionId,
    sourceType: session.sourceType,
    platform: session.platform,
    startedAt: session.startedAt,
    hasAudio: session.hasAudio,
    displayName: session.displayName,
  }
}
