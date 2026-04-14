# 25_CODEX_PROMPTS_BY_DOMAIN

이 문서는 **맥북 로컬 Codex에게 그대로 붙여 넣기 좋은 작업 지시문** 모음이다. 필요에 맞는 것만 골라 써도 된다.

---

## 1. 저장소 부트스트랩

```text
이 프로젝트는 경진대회용 macOS 우선 Tauri 2 데스크톱 앱이다.
목표는 현재 모니터의 재난안전 영상을 읽고 4초 지연 Shadow Player 위에 멀티트랙 설명을 보여주는 안심트랙 Live를 구현하는 것이다.
다음 일을 해줘.

1) pnpm workspace monorepo를 생성해라.
2) apps/desktop-ui 에 Tauri 2 + React + TypeScript + Tailwind + shadcn/ui 조합으로 앱을 초기화해라.
3) packages/shared-types 를 만들고 공통 타입을 정의해라.
4) docs/ 아래에 현재 문서 구조를 반영할 수 있게 기본 README, PROGRESS, DECISIONS, KNOWN_ISSUES를 만들어라.
5) lint, format, typecheck, test 스크립트를 설정해라.
6) 결과적으로 pnpm dev:desktop 이 실행되게 만들어라.

작업 후 생성된 파일과 다음 단계 제안을 요약해라.
```

---

## 2. macOS 캡처

```text
native/mac-capture 모듈을 만들어라.
목표는 ScreenCaptureKit 기반으로 디스플레이 또는 윈도우를 캡처하고 프레임/오디오 이벤트를 Tauri 앱으로 전달하는 것이다.

요구사항:
- 권한 체크 및 권한 안내 흐름
- source enumeration
- session start/stop
- frame event with timestamp
- audio event with timestamp
- error event
- 앱이 죽지 않는 안전한 브리지

shared-types 의 CaptureSession과 이벤트 contract를 사용해라.
Swift 코드, Tauri bridge, 간단한 smoke test, 사용법 문서를 함께 만들어라.
```

---

## 3. Shadow Player

```text
apps/desktop-ui 안에 Shadow Player를 구현해라.

목표:
- 캡처 스트림을 4초 지연된 replay buffer로 재생
- pause, replay current segment, seek back 5s
- segment marker 표시
- 추후 세그먼트 카드와 연결 가능한 구조

요구사항:
- encoded chunk 또는 가능한 간단한 방식으로 8초 이상 링버퍼 유지
- live preview 와 replay lane 을 분리
- buffer underrun fallback 처리
- UI는 시연용으로 보기 좋게 만들어라

구현 후 플레이어 구조와 한계점을 문서에 남겨라.
```

---

## 4. rules KB

```text
화재와 지진 공식 행동요령을 위한 rule KB를 JSON으로 설계하고 구현해라.

요구사항:
- data/rules/fire_rules.json
- data/rules/earthquake_rules.json
- 각 rule은 rule_id, hazard, phase, when, action, do_not, why, caregiver, report_script, source fields 포함
- schema validation 스크립트 작성
- rule grounding matcher 초안 구현
- docs/RULES_CHANGELOG.md 작성

대회 데모에서 action track이 반드시 공식 rule id를 가지도록 설계해라.
```

---

## 5. perception pipeline

```text
workers/perception 또는 workers/media-worker 에 perception pipeline 초안을 만들어라.

목표:
- frame sampler
- ASR adapter
- OCR adapter
- keyframe cache
- PerceptionPacket 생성

요구사항:
- 기본 1fps sampling, 이벤트 시 burst sampling 구조
- audio 없을 때도 동작
- OCR tokens, ASR text, keyframe list, object hints schema 포함
- 캐시 저장 경로와 정리 정책 포함

아직 완벽한 모델 정확도보다 파이프라인 연결과 관찰 데이터 형태 정의를 우선해라.
```

---

## 6. hazard classifier + segment engine

```text
workers/llm-orchestrator 에 hazard classifier 와 segment engine 을 구현해라.

목표:
- fire / earthquake / unknown 분류
- phase 추정
- segment boundary 결정
- official rule candidate 매칭

요구사항:
- 1차 규칙 기반 + 2차 모델 기반 하이브리드
- low confidence fallback
- strict JSON schema
- unit tests
- timeout/retry 정책

결과적으로 Segment 객체와 candidate officialRuleIds 가 나오게 만들어라.
```

---

## 7. multi-track generator

```text
현재 세그먼트와 official rules 를 입력받아 6개 멀티트랙 설명을 생성하는 모듈을 만들어라.

필수 트랙:
- basic
- easy
- action
- reason
- caregiver
- report

조건:
- action 은 rule grounding 없으면 생성 금지
- easy 는 더 쉬운 말로 2문장 이하
- reason 은 1문장
- report 는 바로 읽을 수 있는 문장
- strict JSON schema
- zod validation
- 캐시 저장

샘플 입력/출력 fixture도 만들어라.
```

---

## 8. UI 구현

```text
안심트랙 Live의 시연용 UI를 구현해라.

화면:
- Home
- Live HUD
- Shadow Player
- SegmentCard
- TrackTabs
- Panic Mode
- Evidence Drawer
- Voice Prompt Bar

요구사항:
- 1920x1080 발표 화면 기준
- 직관적이고 깔끔한 시각 구조
- 기본 화면에서는 easy + action 이 가장 잘 보이게
- Panic Mode 는 큰 글씨 3줄
- Evidence Drawer 에 공식 근거 rule 을 보여주기

디자인 토큰과 컴포넌트 구조를 함께 정리해라.
```

---

## 9. 음성

```text
현재 세그먼트 기반 재설명 음성 기능을 구현해라.

지원 intent:
- 다시 말해줘
- 더 쉽게 말해줘
- 왜?
- 지금 뭐 해야 해?
- 119에 뭐라고 말해?

우선순위:
1) 버튼 intent
2) TTS
3) 마이크 입력

조건:
- current segment 밖으로 벗어나지 말 것
- grounding 없는 행동 추가 금지
- 실패 시 텍스트 카드 fallback
```

---

## 10. 데모 모드와 리허설

```text
경진대회 시연용 데모 모드를 구현해라.

요구사항:
- prerecorded sample session fallback
- demo reset 버튼
- 네트워크 느릴 때 캐시 재생
- screenshot/export
- 발표 스크립트에 맞춘 단축 동작

최종적으로 3분 데모 시나리오에 맞는 클릭 순서를 README로 정리해라.
```
