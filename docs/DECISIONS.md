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

### D-025 live analysis snapshot은 raw frame 대신 요약 패킷을 저장한다

- 이유: active capture frame의 data URL 전체를 매 refresh마다 저장하면 브라우저 preview와 Tauri runtime 모두에서 용량과 쓰기 비용이 급격히 커진다.
- 영향: live session log는 `sessions.jsonl`에 세션 메타데이터만 append하고, 최신 analysis snapshot은 keyframe count/OCR/ASR/object hint label 중심 summary로 저장한다. 실제 raw frame cache는 capture input window와 runtime export 경로에서만 일시적으로 유지한다.

### D-026 restore는 SQLite 우선, JSON file fallback을 병행한다

- 이유: 제품 단계에서는 SQLite query/restore가 필요하지만, 기존 demo runtime과 브라우저 preview는 파일 fallback이 있어야 전환 비용이 낮다.
- 영향: Tauri는 `runtime.sqlite3`에 `app_settings`, `sessions`, `perception_packets`, `segments`, `segment_explanations`를 기록하고, 동시에 `ui-state.json`과 `live-analysis-latest.json` fallback을 유지한다. 앱 시작 시에는 파일이 있으면 먼저 읽고, 없으면 SQLite에서 마지막 runtime state와 live snapshot을 복원한다.

### D-027 voice runtime은 macOS native 우선, browser/text fallback을 유지한다

- 이유: 데모와 제품화 모두에서 macOS 경로의 일관된 음성 UX가 필요하지만, 마이크 권한/환경 차이 때문에 fallback이 없으면 협업과 시연이 불안정해진다.
- 영향: TTS는 `VoiceRuntimeBridge`의 macOS 시스템 음성을 우선 사용하고, 실패 시 브라우저 `speechSynthesis`, 마지막에는 텍스트 카드로 내려간다. STT는 우선 지원 intent 5개에 맞춘 macOS command-style 인식을 사용하고, 실패 시 브라우저 음성 인식 또는 텍스트 명령 입력으로 전환한다. native preview audio는 ScreenCaptureKit audio callback을 실제 `capture/audio` 이벤트로 노출하되, 아직 PCM persistence나 live ASR 입력까지는 확장하지 않는다.

### D-028 manual QA와 rehearsal 로그는 JSON을 단일 소스로 두고 markdown을 생성한다

- 이유: 팀 단위 검수에서는 사람이 바로 수정할 수 있는 단순한 데이터 형식이 필요하지만, 발표용 체크리스트와 로그 문서도 항상 최신 상태를 유지해야 한다.
- 영향: `data/eval/manual_review_runs.json`과 `data/eval/rehearsal_runs.json`을 단일 입력으로 두고, `pnpm qa:sync`가 `manual_review_log_2026-04-14.md`와 `demo_rehearsal_checklist.md`를 다시 생성한다. 실제 clip walkthrough가 없으면 status는 `pending`/`blocked`로 남기고, generated markdown에서 공백을 숨기지 않는다.

### D-029 actual clip QA는 앱 안에서 바로 기록 가능해야 한다

- 이유: 실제 시연 직전에는 터미널로 JSON을 직접 열어 수정하는 것보다, 현재 세션을 보면서 같은 화면 안에서 walkthrough 결과를 남기는 편이 훨씬 빠르고 협업 실수가 적다.
- 영향: desktop UI는 `QaReviewPanel`에서 fixture별 status/path/notes와 rehearsal checklist를 바로 기록하고, Tauri command가 `data/eval/*runs.json`을 갱신한 뒤 `pnpm qa:sync`를 실행해 markdown 로그까지 맞춘다. 이 경로는 현재 개발 저장소 기준이며, 독립 배포용 bundle persistence와는 아직 분리되어 있다.

### D-030 local clip preview는 QA 입력 path를 그대로 재사용한다

- 이유: 실제 clip 검수에서는 별도 asset registry를 또 관리하기보다, 검수자가 지금 보고 있는 로컬 파일 path를 그대로 preview와 로그에 같이 남기는 편이 가장 빠르고 협업 중 실수가 적다.
- 영향: `QaReviewPanel`은 manual review의 `path` 값을 우선 사용하고, Tauri 실행 시에는 `convertFileSrc`로 `asset:` URL을 만들어 영상 preview를 연다. 브라우저 preview에서는 path 문자열만 유지하며, 실제 자산 배포/복사는 후속 범위로 남긴다.

### D-031 release readiness는 최신 rehearsal 로그에서 바로 파생한다

- 이유: 대회 직전에는 별도 스프레드시트나 문서를 또 맞추기보다, 지금 앱에서 실제로 남긴 rehearsal/manual review 로그를 기준으로 남은 리스크를 바로 보는 편이 빠르고 협업 인수인계도 단순하다.
- 영향: desktop UI는 `QaReviewPanel`에서 latest rehearsal + manual review coverage를 조합해 release checklist snapshot을 계산하고, 미완료 fixture를 우선순위 queue로 재정렬한다. pause/seek 같은 아직 계측되지 않은 항목은 계속 사람 기준 manual verification으로 남긴다.

### D-032 외부 원본 영상은 fixture source reference로만 먼저 등록한다

- 이유: YouTube 같은 외부 영상은 바로 저장소에 내려받아 넣기보다, 어떤 공식 원본에서 어떤 clip을 잘라야 하는지를 먼저 데이터로 남기는 편이 저작권과 협업 측면에서 안전하다.
- 영향: `annotated_segments.json`의 fixture는 optional `sourceReference`를 가질 수 있고, QA 패널은 제목/링크/메모를 보여 준다. 실제 수동 검수는 여전히 로컬로 잘라 둔 mp4/mov path를 manual review input에 별도로 기록한다.

### D-033 실제 QA clip 자산은 tracked template + local override로 관리한다

- 이유: source video의 로컬 경로와 구간 timestamp는 팀원마다 다르고, 실제 mp4/mov clip은 용량과 저작권 측면에서 저장소에 직접 넣기 어렵다.
- 영향: 저장소에는 `source_videos.example.json`, `clip_windows.example.json`, fixture의 `sourceClipPlan`만 tracked로 남기고, 실제 경로와 timestamp는 `*.local.json`에 둔다. `pnpm qa:prepare-clips`가 이를 읽어 `data/eval/clips/*.mp4`를 만들고, Tauri QA workspace는 그 산출물을 자동 preview 후보로 사용한다.

### D-034 초기 clip window는 auto subtitle hit를 시드로 써도 된다

- 이유: 실제 QA clip을 처음 따는 단계에서는 완전 수동 탐색보다 자동 생성 자막의 키워드 hit를 시작점으로 삼는 편이 훨씬 빠르다.
- 영향: `earthquake-desk-001`, `earthquake-after-shaking-001`의 첫 local window는 `책상`, `흔들림이 멈춘 후`, `가스`, `전기` 같은 자막 hit를 기준으로 잡고, 최종 pass/fail은 여전히 사람이 clip과 UI를 보며 확정한다.

### D-035 release runtime은 source tree가 아니라 app-local data를 쓴다

- 이유: 지금까지의 Tauri runtime/QA 경로는 개발 저장소 상대경로에 기대고 있어서, 실제로 번들된 `.app`를 다른 맥북에 옮기면 persistence와 QA workspace가 바로 깨질 위험이 컸다.
- 영향: debug build는 기존 협업 흐름을 위해 저장소 `.slowlearner`와 `data/eval`을 계속 사용하지만, release/package build는 `app_local_data_dir` 아래 runtime/SQLite/QA JSON을 쓴다. eval fixture와 seed QA JSON은 `bundle.resources`로 앱 리소스에 포함하고, standalone 앱은 첫 실행 시 이를 local seed로 복사해 사용한다.

### D-036 live Shadow는 full stream 대신 sampled frame부터 직결한다

- 이유: 현재 native/browser 공통으로 가장 안정적으로 들어오는 것은 snapshot/dataURL 기반 frame sample이고, 이를 먼저 Shadow Player에 꽂아야 live path의 본질인 "4초 붙잡아 주기"를 실제 제품 화면에서 검증할 수 있다.
- 영향: Shadow buffer는 이제 frame payload를 보존하고, `useShadowLivePlayer`가 `captureInput.frameWindow`를 실제 replay/live thumbnail로 사용한다. 다만 현재는 encoded video/audio 동기화 재생이 아니라 sampled frame replay이므로, 연속 영상 품질과 live audio ASR 연동은 후속 범위로 남긴다.

### D-037 live OCR은 macOS Vision bridge를 우선 사용한다

- 이유: 외부 모델 호출 없이도 한글/영문 자막·표지판 인식 신호를 바로 얻을 수 있고, 현재 저장소 구조에서는 latest frame data URL을 Tauri가 받아 네이티브 OCR로 넘기는 경로가 가장 구현 비용이 낮다.
- 영향: frontend는 `useLiveOcrTokens`로 latest frame OCR을 누적하고, Tauri는 `extract_ocr_tokens` command에서 data URL을 임시 이미지로 푼 뒤 `MacCaptureBridge ocr-image`를 호출한다. 현재 live perception의 text signal은 OCR 우선이며, audio transcription은 별도 후속 slice로 남긴다.

### D-038 live ASR은 chunk file + 안전 fallback 2단계로 둔다

- 이유: ScreenCaptureKit audio callback은 metadata만으로는 ASR에 쓸 수 없고, macOS `Speech` 권한 요청은 현재 CLI bridge 구조에서 TCC privacy crash를 일으킬 수 있다.
- 영향: native audio preview는 1.5초 내외 `.caf` chunk file을 temp에 저장하고 `pcmRef`로 UI에 전달한다. Tauri는 먼저 local Speech bridge 결과를 읽되, bridge가 번들 식별자/usage description 없이 실행되는 환경에서는 권한 요청을 시도하지 않고 `unavailable`로 안전하게 빠진다. `OPENAI_API_KEY` 또는 `SLOWLEARNER_OPENAI_API_KEY`가 있으면 `gpt-4o-mini-transcribe`로 fallback하고, 없으면 live path는 OCR/visual 중심으로 유지한다.
