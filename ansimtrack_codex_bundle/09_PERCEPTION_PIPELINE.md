# 09_PERCEPTION_PIPELINE

## 목표

현재 캡처 중인 영상에서 세그먼트 판단에 필요한 관찰 신호를 만든다.

## 입력

- frame stream
- audio stream
- capture metadata

## 출력

- ASR chunk
- OCR tokens
- UI/screen elements
- object/region candidates
- event hints
- keyframe bundle

## 세부 모듈

### A. Frame Sampler
- 기본 1fps
- 이벤트 의심 시 burst 4~6fps, 2초
- segment 후보 주변은 추가 보존
- frame jpeg/webp cache 생성

### B. ASR
- 짧은 chunk 전사
- 문장 종료 추정
- 키워드 추출
- 음성 없음 처리

### C. OCR / Screen Parsing
- 자막
- 경고문
- UI 라벨
- 플레이어 진행바/버튼과 콘텐츠 영역 분리

### D. Object/Region Detection
- 출구 표지
- 소화기
- 계단 방향
- 문손잡이
- 탁자
- 전화기/휴대폰
- 위험 시각요소(연기, 불꽃 등)

### E. Overlay Tracking
- 초기 box seed
- SAM2 또는 tracker로 추적
- 불안정하면 고정 박스 fallback

## 성능 전략

- 모든 프레임을 LLM에 보내지 말 것
- keyframe과 text signal 중심으로 추론
- 로컬 parser 우선, LLM은 의미 통합에 사용
- 이벤트 기반 burst 분석으로 비용 절감

## 저장 형태

```ts
type PerceptionPacket = {
  sessionId: string
  tStartMs: number
  tEndMs: number
  asrText: string
  ocrTokens: string[]
  uiElements: Array<{label: string; bbox: number[]; conf: number}>
  objectHints: Array<{label: string; bbox: number[]; conf: number}>
  keyframes: string[]
}
```

## 완료 기준

- 자막/OCR/ASR 중 최소 2개 경로가 작동
- 화재/지진 데모에서 핵심 키워드가 추출됨
- overlay target 후보를 생성할 수 있음

## Codex에게 바로 맡길 일

- frame sampler 구현
- ASR adapter 구현
- OCR parser 구현
- object hints schema 구현
- perception packet 캐시 저장
