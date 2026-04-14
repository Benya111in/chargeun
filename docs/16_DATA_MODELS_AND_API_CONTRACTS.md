# 16_DATA_MODELS_AND_API_CONTRACTS

## 목표

모든 모듈이 같은 타입을 사용하도록 shared contracts를 만든다.

## 핵심 타입

```ts
type HazardType = "fire" | "earthquake" | "unknown"

type CaptureSourceType = "monitor" | "window" | "browser_tab" | "video_element"

type SafetyMode = "grounded" | "review_official"

type CaptureSession = {
  id: string
  sourceType: CaptureSourceType
  platform: "mac" | "windows" | "web"
  startedAt: number
  hasAudio: boolean
  displayName?: string
}

type Segment = {
  id: string
  sessionId: string
  hazard: HazardType
  phase: string
  startMs: number
  endMs: number
  confidence: number
  officialRuleIds: string[]
}

type TrackSet = {
  basic: string
  easy: string
  action: string
  reason: string
  caregiver?: string
  report?: string
}

type SegmentExplanation = {
  segmentId: string
  safetyMode: SafetyMode
  doNot?: string
  tracks: TrackSet
  overlayTargets: OverlayTarget[]
}

type OverlayTarget = {
  label: string
  bbox: [number, number, number, number]
  frameRange: [number, number]
}
```

## 이벤트 contract

- `capture/session-started`
- `capture/frame`
- `capture/audio`
- `perception/packet-ready`
- `segment/created`
- `segment/explanation-ready`
- `voice/reply`
- `error/system`

## internal API 예시

### start capture
```ts
startCapture(input: {
  sourceType: CaptureSourceType
  sourceId?: string
  withAudio?: boolean
}): Promise<CaptureSession>
```

### process perception
```ts
processPerception(packet: PerceptionPacket): Promise<Segment | null>
```

### generate tracks
```ts
generateTracks(input: {
  segment: Segment
  evidence: PerceptionPacket
  rules: Rule[]
}): Promise<SegmentExplanation>
```

### voice explain
```ts
voiceExplain(input: {
  segmentId: string
  intent: "repeat" | "easy" | "why" | "action" | "report"
}): Promise<{ text: string; audioRef?: string }>
```

## Schema validation 원칙

- 외부 입력은 모두 validation
- LLM 출력도 validation
- UI 직전에도 null-safe transform 수행

## 완료 기준

- shared-types 패키지 완성
- 모든 워커와 프론트가 shared type 사용
- zod schemas와 TS types 동기화

## Codex에게 바로 맡길 일

- shared-types 패키지 작성
- zod schema 작성
- event enum/constants 정리
- 타입 테스트 추가
