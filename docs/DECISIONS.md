# DECISIONS

## 2026-04-14

### D-001 macOS 단일 경로 우선

- 이유: 대회용 데모 완성도가 범용성보다 중요하다.
- 영향: Windows는 contract/stub 수준으로 두고, 실제 캡처/Shadow Player 연결은 macOS 중심으로 진행한다.

### D-002 로컬 우선 + grounded action 강제

- 이유: 재난 행동 지시는 공식 근거 없이는 출력하면 안 된다.
- 영향: `action`, `report`, `do_not`는 rule id 없으면 UI에서 숨기거나 review 모드로 전환한다.

### D-003 초기 vertical slice는 mock perception 기반

- 이유: 빈 저장소에서 캡처, 모델, UI를 동시에 여는 것보다 데모 흐름을 먼저 고정하는 편이 빠르다.
- 영향: 첫 구현은 검증된 mock segment/explanation/rules로 UI와 safety 흐름을 완성하고, 이후 native capture와 worker 입력을 교체한다.

### D-004 Shadow buffer는 독립 패키지로 먼저 고정

- 이유: ScreenCaptureKit 실연결 전에도 4초 지연, 링버퍼, 세그먼트 replay 동작을 단위 테스트로 검증할 수 있어야 한다.
- 영향: UI는 당분간 mock capture/replay lane을 사용하고, native capture bridge가 준비되면 동일한 buffer contract에 frame 입력만 교체한다.

### D-005 live preview와 replay lane은 분리 유지

- 이유: Shadow Player가 본체이므로 live preview 확보 때문에 replay 동작이나 4초 지연 의미가 흔들리면 안 된다.
- 영향: browser fallback은 먼저 live preview만 담당하고, Shadow Player는 기존 mock replay buffer를 유지한다. 이후 native/browser frame source를 붙일 때도 같은 분리 원칙을 유지한다.

### D-006 native 검증은 smoke executable 우선

- 이유: 현재 로컬 Swift toolchain에서는 `XCTest`와 `Testing` 모듈이 바로 보장되지 않아 `swift test` 경로가 불안정하다.
- 영향: `native/mac-capture`는 우선 `swift build`와 `swift run MacCaptureSmoke`를 focused verification 경로로 사용하고, 정식 test target은 추후 툴체인 제약이 풀리면 복원한다.

### D-007 Tauri command surface를 먼저 고정

- 이유: React UI와 native foundation을 동시에 직접 엮기보다 command contract를 먼저 고정하면 단계별 검증과 교체가 쉽다.
- 영향: 현재 Tauri는 source enumerate/start/stop을 자체 상태로 먼저 제공하고, 다음 단계에서 이 command 내부를 Swift `MacCaptureCoordinator` 호출로 치환한다.

### D-008 Swift bridge는 우선 executable 경로로 연결

- 이유: Rust와 Swift를 직접 FFI로 묶기보다 Swift executable을 호출하는 편이 현재 로컬 개발 환경에서 구현 속도와 디버깅성이 높다.
- 영향: Tauri command는 우선 `MacCaptureBridge`를 subprocess로 호출하고, 이후 frame/audio 브리지 단계에서 더 직접적인 연결이 필요해지면 FFI 또는 plugin 경로를 재검토한다.

### D-009 native preview는 저주기 snapshot event로 먼저 연결

- 이유: 실시간 raw frame을 바로 Tauri로 밀어 넣는 경로는 현재 데모 단계에서 비용과 복잡도가 크다.
- 영향: macOS 우선 경로는 우선 low-fps JPEG data URL snapshot을 `capture/frame` 이벤트로 흘리고, Shadow replay lane은 기존 ring buffer와 분리 유지한다.

### D-010 browser/native 입력은 공통 frame sample로 정규화

- 이유: perception, grounding, segment 단계가 입력 원본이 브라우저인지 네이티브인지에 따라 분기되면 후속 구현이 빠르게 꼬인다.
- 영향: 브라우저 fallback도 1fps JPEG sample을 만들고, native snapshot과 같은 `CaptureFrameSample` window를 유지한다. replay lane은 여전히 별도지만 perception seed는 같은 계약을 쓴다.

### D-011 matcher는 현재 문서 drift를 phase alias로 흡수

- 이유: 현재 eval/데모 문서에는 `protect`, `route_selection` 같은 표현이 남아 있고, 실제 rule JSON은 `during_shaking`, `door_control`, `stair_evacuation`처럼 더 구체적인 phase를 쓴다.
- 영향: grounded matcher는 alias를 통해 후보군을 좁히되, phase만으로는 grounded 처리하지 않고 evidence token이 있어야 rule을 선택한다.

### D-012 perception foundation은 로컬 결정론 경로부터 시작

- 이유: 현재 단계에서는 ASR/OCR 정확도보다 packet 구조와 후속 엔진 연결이 더 중요하고, 외부 모델 호출 비용도 아껴야 한다.
- 영향: perception worker는 우선 local frame sampling plan, OCR/ASR shell, text-driven object hint derivation, cache key 생성만 제공하고 실제 모델 adapter는 다음 단계에서 채운다.

### D-013 segment phase는 docs-level 이름을 유지

- 이유: 현재 UI, eval 문서, demo narrative는 `protect`, `route_selection` 같은 상위 phase를 중심으로 정리되어 있다.
- 영향: segment engine은 docs-level phase를 출력하고, grounded matcher가 이를 실제 rule phase alias로 매핑한다.

### D-014 데모 UI도 실제 packet/rule 경로를 사용

- 이유: backend matcher와 segment engine이 따로 놀면 시연 중 안전 fallback과 근거 패널이 어긋난다.
- 영향: demo scenario는 이제 mock `PerceptionPacket`과 rule bundle만 제공하고, 화면에서는 실제 `buildSegmentFromPerception` 및 `buildGroundedExplanation` 결과를 사용한다.

### D-015 voice는 우선 브라우저 TTS fallback으로 제공

- 이유: 현재 단계에서 중요한 것은 intent 버튼을 눌렀을 때 1초 안에 반응이 시작되는 데모 흐름이다.
- 영향: TTS는 우선 `speechSynthesis`를 사용하고, unavailable 환경에서는 transcript 카드만 유지한다. 외부 TTS 모델이나 비용 있는 API는 아직 붙이지 않는다.

### D-016 evidence drawer는 raw packet과 matcher signal을 직접 보여 준다

- 이유: 심사나 협업 상황에서는 "왜 이 규칙이 선택됐는지"가 즉시 드러나야 한다.
- 영향: 근거 패널은 요약 문장 대신 `matchedSignals`, candidate rule score, OCR/ASR/object hints, packet window를 직접 노출한다.

### D-017 storage는 우선 file-backed skeleton으로 시작

- 이유: 현 단계에서 필요한 것은 앱 전체 persistence보다 세션 로그, export, job control의 계약을 먼저 고정하는 것이다.
- 영향: `local-store`는 SQLite schema를 아티팩트로 남기고 실제 메타데이터는 JSONL/export 파일로 먼저 다룬다. 실제 앱 재시작 복원과 SQLite 연결은 후속 slice에서 붙인다.

### D-018 action/report는 evidence drawer와 consent 상태에 종속

- 이유: 재난안전 도메인에서는 행동 문장을 근거 없이 떼어 보여 주면 오해 가능성이 크다.
- 영향: `applySafetyGuardrails`가 low-confidence/missing rule/privacy hold에서는 `review_official`로 강등하고, evidence drawer가 닫혀 있으면 grounded 상태여도 action/report 트랙을 숨긴다. 캡처 시작은 consent modal 확인 뒤에만 허용한다.

### D-019 QA는 raw clip보다 packet fixture audit부터 고정

- 이유: 현재 단계에서는 실제 영상 클립 수집보다 matcher/segment/guardrail drift를 빠르게 잡는 자동 점검이 더 중요하다.
- 영향: eval set은 우선 synthetic `PerceptionPacket` fixture로 관리하고, `pnpm eval:audit`가 hazard/phase/rule/safety fallback을 검사한다. 실제 녹화 클립 walkthrough는 별도 manual log로 추적한다.

### D-020 demo runbook과 backup preset은 코드가 아니라 데이터로 관리

- 이유: 발표 직전에는 시연 순서와 플랜 B를 빠르게 바꿀 수 있어야 하고, 프론트 코드 수정 없이도 발표 흐름을 조정할 수 있어야 한다.
- 영향: `data/demo/runbook.json`과 `data/demo/prerecorded_sessions.json`이 시연 타임라인과 prerecorded preset의 단일 소스가 되고, UI는 이 데이터를 읽어 runbook 패널과 backup mode를 구성한다.

### D-021 post-demo는 확장보다 live path 안정화가 먼저

- 이유: 현재 코드베이스의 가장 큰 리스크는 기능 부족보다 live capture와 persistence의 미연결이다.
- 영향: `docs/22_POST_DEMO_BACKLOG.md`는 이제 확장 아이디어 목록이 아니라 우선순위 문서로 유지하고, P1은 live capture 실시간 연결, SQLite restore, native audio/TTS/STT, manual rehearsal에 배정한다.

### D-022 runtime state와 발표 export는 Tauri command + 브라우저 fallback 이중 경로로 관리

- 이유: 데스크톱 실사용 경로에서는 파일로 남겨야 하고, 브라우저 preview에서도 같은 UX를 검증할 수 있어야 한다.
- 영향: runtime state는 Tauri에서는 `.slowlearner/ui-state.json`, 브라우저에서는 `localStorage`를 사용한다. 발표 자료 export는 Tauri에서는 `.slowlearner/export`에 JSON/PNG를 저장하고, 브라우저에서는 다운로드 fallback을 사용한다.

### D-023 로컬 셋업은 비밀키 없이도 바로 데모 부팅 가능해야 한다

- 이유: 협업 환경에서는 개발자마다 API 키나 글로벌 CLI 준비 상태가 다르므로, 첫 부팅이 외부 의존성 때문에 막히면 진입 비용이 커진다.
- 영향: `pnpm check-env`는 macOS 툴체인과 `.env.example` 존재만 확인하고, 글로벌 `tauri-cli` 대신 workspace의 `@tauri-apps/cli`를 기본 경로로 본다. `.env.example`은 demo backup 모드를 기본 활성화해 비밀키 없이도 시연 경로가 올라오게 유지한다.

### D-024 prompt 자산은 runtime prompt와 Codex 작업 prompt를 분리 관리한다

- 이유: 앱 내부에서 쓰는 짧은 deterministic prompt와 저장소 구현 작업을 위임하는 긴 Codex prompt는 목적과 변경 주기가 다르다.
- 영향: `prompts/*.md`는 segment/track/voice runtime prompt 골격으로 유지하고, `prompts/codex/*.md`는 문서 25의 도메인별 작업 지시문을 파일로 관리한다. `scripts/validate-prompts.ts`는 핵심 grounding/safety 제약과 파일 누락을 빠르게 점검한다.
