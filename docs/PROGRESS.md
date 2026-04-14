# PROGRESS

## 2026-04-14

### 완료

- bundle 문서를 `docs/`로 복사
- Git 저장소 및 `codex/phase0-bootstrap` 브랜치 생성
- pnpm workspace 초기화
- React/Vite 기반 `apps/desktop-ui` 스캐폴드 생성
- `packages/shared-types`와 `workers/llm-orchestrator` 공통 계약/오케스트레이션 초안 착수
- `packages/shadow-buffer`에 4초 지연, 최소 8초 버퍼, 세그먼트 marker, rewind/replay 제어를 갖춘 Shadow Player 링버퍼 추가
- desktop UI에 mock capture/replay lane 기반 `ShadowVideoStage` 연결
- `pnpm typecheck`, `pnpm test`, `pnpm rules:validate`, `pnpm lint`, `pnpm build`로 Shadow Player slice 검증
- desktop UI에 capture control contract, source 상태, permission/session 상태 연결
- browser `getDisplayMedia` 기반 live preview fallback 연결
- live preview lane과 Shadow Player replay lane을 분리한 상태로 `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` 검증
- `native/mac-capture`에 permission/source/session foundation 추가
- ScreenCaptureKit source enumerate와 session bookkeeping을 반영한 `MacCaptureCoordinator` 강화
- `swift build`, `swift run MacCaptureSmoke`로 native foundation smoke 검증
- Tauri에 `get_bootstrap_state`, `list_native_capture_sources`, `start_native_capture`, `stop_native_capture` command 추가
- desktop UI capture controller가 Tauri native command를 우선 사용하도록 연결
- `cargo check`까지 포함해 command/UI 경로 검증
- `docs/WORK_QUEUE.md`를 추가해 남은 문서를 순차 작업 큐로 고정
- Tauri capture command가 Swift `MacCaptureBridge` executable을 직접 호출하도록 연결
- `swift run MacCaptureBridge bootstrap`, `swift run MacCaptureBridge stop --session-id does-not-exist`로 bridge command smoke 검증
- `MacCaptureBridge stream` 명령과 low-fps native snapshot preview를 추가해 Tauri가 `capture/session-started`, `capture/frame`, `capture/session-stopped`, `error/system` 이벤트를 앱으로 전달하도록 연결
- desktop UI에 native preview reducer, Tauri event listener, native frame snapshot preview 표시를 추가해 browser/native preview lane을 같은 화면에서 다루도록 확장
- `pnpm --filter @ansimtrack/shared-types test`, `pnpm --filter desktop-ui test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `swift build`, `cargo check` 검증 완료
- `swift run MacCaptureBridge bootstrap`로 현재 로컬 macOS 권한 상태가 `permissionState: denied`임을 재확인
- browser `MediaStream`를 1fps JPEG sample로 정규화하는 sampler와 native/browser 공용 `CaptureFrameSample` 계약을 추가
- `captureInput` 상태와 perception seed 초안을 연결해 preview lane이 다음 perception/rule 단계에서 바로 쓸 frame window를 유지하도록 정리
- `workers/llm-orchestrator`에 grounded rule matcher와 `buildGroundedExplanation` 경로를 추가해 fire/earthquake evidence에서 실제 rule 1~3개를 고르도록 구현
- `protect -> during_shaking`, `route_selection -> stair_evacuation/door_control/refuge_space` phase alias와 evidence gating을 넣어 공식 rule 없는 action 노출을 계속 막음
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`로 matcher slice까지 루트 검증 완료
- `workers/perception-pipeline` 패키지를 추가하고 frame sampling plan, text-driven object hint derivation, `PerceptionPacket` builder, cache key foundation을 구현
- 루트 build/test/typecheck 스크립트에 perception worker를 편입하고 `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`로 workspace 검증 완료
- `workers/llm-orchestrator`에 hazard classifier, phase heuristics, segment boundary detector, `buildSegmentFromPerception`을 추가해 `PerceptionPacket -> Segment` 경로를 구현
- fire는 docs-level `route_selection`, earthquake는 `protect` 같은 사용자-facing phase를 유지하고, grounded matcher alias를 통해 실제 rule phase와 연결되도록 정리
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`를 다시 통과시켜 segment slice까지 루트 검증 완료
- demo scenario가 더 이상 mock `matchedRules`를 직접 들고 있지 않고, `PerceptionPacket -> Segment -> buildGroundedExplanation` 경로로 실제 grounded track을 만들도록 desktop UI를 교체
- `matchGroundedRules` 결과를 근거 패널과 segment card에 연결해 rule id/action/report 노출이 실제 matcher 결과를 따르도록 정리
- browser `speechSynthesis` 기반 TTS fallback과 재생 상태 관리를 추가해 5개 intent 버튼이 transcript + 음성 재생을 함께 제공하도록 연결
- 음성 unavailable 환경에서는 자동으로 텍스트-only fallback으로 남기고, 재생 중지 버튼과 상태 배지를 추가
- 근거 패널을 `EvidenceDrawer`로 분리하고 matcher의 `matchedSignals`, 규칙 후보 score, packet evidence, grounded ids를 그대로 보여 주도록 정리
- segment/evidence/voice 영역을 더 읽기 쉬운 발표용 정보 흐름으로 정리하고, evidence toggle이 실제 drawer 성격의 패널을 여닫도록 다듬음
- `packages/local-store` 패키지를 추가해 로컬 runtime directory policy(`.slowlearner/cache|export|logs`), SQLite schema 아티팩트, session JSONL 로그, export snapshot writer를 구현
- `LocalLatestJobQueue`로 queue depth 제한과 latest-only cancellation이 걸린 local job skeleton을 추가
- 루트 build/test/typecheck 스크립트에 local-store를 편입하고 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`로 storage slice까지 workspace 검증 완료
- `workers/llm-orchestrator`에 `applySafetyGuardrails` middleware를 추가해 low-confidence, missing rule id, privacy consent 부재, evidence drawer hidden 조건에서 action/report를 잠그도록 정리
- shared schema가 `review_official` 모드에서 action/report/do_not를 막도록 강화하고, safety fallback 5개 시나리오 테스트를 추가
- desktop UI에 privacy control panel, capture consent modal, evidence drawer gating, 종료 후 캐시 자동 삭제 옵션, 수동 cache clear 흐름을 추가
- Tauri `clear_local_runtime` command를 추가하고 `pnpm --filter @ansimtrack/shared-types test`, `pnpm --filter @ansimtrack/llm-orchestrator test`, `pnpm --filter desktop-ui test`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm typecheck`, `pnpm lint`, `pnpm build` 검증 완료
- `data/eval/annotated_segments.json`를 5개 fixture(화재 2, 지진 2, review fallback 1) 기준으로 재작성하고, audio-missing 케이스까지 포함한 packet-level eval set으로 정리
- `scripts/grounding-audit.ts`와 루트 `pnpm eval:audit`, `pnpm qa:smoke` 스크립트를 추가해 hazard/phase/rule id/safety mode/forbidden action/audio fallback을 자동 점검하도록 구현
- `data/eval/manual_review_log_2026-04-14.md`, `data/eval/demo_rehearsal_checklist.md`를 추가하고 `pnpm eval:audit`, `pnpm qa:smoke`, `pnpm lint`로 QA slice 검증 완료
- `data/demo/runbook.json`, `data/demo/prerecorded_sessions.json`를 추가해 3분 시연 타임라인과 prerecorded backup 세션을 데이터로 고정
- desktop UI에 `DemoRunbookPanel`을 추가해 live/backup mode 토글, 단계별 runbook 선택, Q&A용 근거 패널 바로가기, prerecorded backup 프리셋 선택을 제공
- `mock-session`에 visual-only fire backup과 earthquake after-shaking backup 시나리오를 추가하고 `pnpm --filter desktop-ui test`, `pnpm demo:reset`, `pnpm lint`, `pnpm build`로 demo slice 검증 완료
- `docs/22_POST_DEMO_BACKLOG.md`를 현재 구현 상태 기준 P1/P2/P3 triage 문서로 재구성해, live path 안정화와 persistence를 확장 아이디어보다 우선하는 기준을 고정
- Tauri와 브라우저 fallback 모두에서 `AppRuntimeState`를 저장/복원하는 runtime bridge를 추가해 demo mode, scenario, selected track, privacy prefs, last session metadata가 재시작 후 복원되도록 정리
- 발표용 export 경로를 추가해 현재 시연 상태 JSON과 스크린샷 PNG를 `.slowlearner/export` 또는 브라우저 다운로드로 저장할 수 있게 구현
- `pnpm --filter desktop-ui test`, `pnpm typecheck`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm lint`, `pnpm build`로 restore/export slice 검증 완료
- `README.md`, `docs/24_LOCAL_SETUP_FOR_MACBOOK.md`, `.env.example`, `scripts/check-env.sh`를 현재 저장소 기준으로 정리해 로컬 부팅 순서, workspace 내 Tauri CLI 사용, demo backup 기본값을 문서와 스크립트에 반영
- `pnpm check-env`, `bash -n scripts/check-env.sh`, `pnpm lint`로 local setup slice 검증 완료
- `prompts/README.md`, runtime prompt 3종, `prompts/codex/*.md` 10종, `scripts/validate-prompts.ts`, `pnpm prompts:validate` 스크립트를 추가해 도메인 prompt 자산을 저장소 안에서 버전 관리하도록 정리
- `pnpm prompts:validate`, `pnpm lint`로 prompt asset slice 검증 완료
- live capture frame window를 `buildPerceptionFoundation -> buildSegmentFromPerception -> buildGroundedExplanation` 경로에 연결해 active capture 중에는 demo fixture 대신 실시간 local packet/segment/explanation이 화면에 반영되도록 정리
- Tauri `.slowlearner/logs/sessions.jsonl` / `.slowlearner/cache/live-analysis-latest.json` 및 브라우저 preview localStorage fallback을 추가해 session log와 최신 live analysis snapshot을 남기도록 구현
- `pnpm --filter desktop-ui test`, `pnpm typecheck`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm lint`, `pnpm build`로 live capture analysis slice 검증 완료
- Tauri runtime에 `runtime.sqlite3`를 추가해 `app_settings`, `sessions`, `perception_packets`, `segments`, `segment_explanations`를 실제 SQLite에 기록하고, JSON 파일 fallback과 함께 dual-write 하도록 정리
- 앱 시작 시 마지막 live analysis snapshot을 SQLite 또는 cache file에서 복원하고, `live-priority` 모드에서는 active session이 없을 때 복원된 라이브 요약을 그대로 표시하도록 연결
- `pnpm --filter desktop-ui test`, `pnpm typecheck`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm lint`, `pnpm build`로 SQLite restore slice 검증 완료
- ScreenCaptureKit audio callback을 별도 monitor로 붙여 native preview가 실제 `capture/audio` 이벤트를 내보내고, preview 패널에 최근 audio metadata를 표시하도록 정리
- `VoiceRuntimeBridge`, Tauri voice command, `useVoiceRuntime`를 추가해 macOS native TTS/STT를 우선 사용하고 browser/text fallback으로 내려가는 voice runtime을 구현
- Voice Prompt Bar에 마이크 intent, 텍스트 명령 fallback, native/browser/text 상태 배지, transcript 표시를 추가해 버튼-only voice path를 제품형 fallback 흐름으로 확장
- `swift build`, `swift run VoiceRuntimeBridge status`, `pnpm --filter desktop-ui test`, `pnpm typecheck`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm lint`, `pnpm build`로 native audio/voice slice 검증 완료
- `data/eval/manual_review_runs.json`, `data/eval/rehearsal_runs.json`, `scripts/sync-qa-logs.ts`, `pnpm qa:sync`를 추가해 actual clip/manual review와 rehearsal 로그를 구조화된 JSON에서 markdown 보고서로 동기화하는 경로를 마련
- `pnpm qa:sync`, `pnpm qa:smoke`, `pnpm lint`로 QA log sync slice 검증 완료
- Tauri `load_qa_review_state`, `append_manual_review_run`, `append_rehearsal_run` command와 desktop bridge를 추가해 앱 내부에서 QA 로그를 읽고 기록할 수 있게 정리
- `QaReviewPanel`과 `qa-review` helper를 추가해 fixture별 manual walkthrough status, clip path, notes, rehearsal checklist를 UI에서 바로 남기고 `data/eval`에 sync되도록 연결
- `pnpm --filter desktop-ui test`, `pnpm typecheck`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm qa:sync`, `pnpm lint`, `pnpm build`로 in-app QA workspace slice 검증 완료
- QA workspace가 operator가 입력한 local clip path를 Tauri `asset:` URL 또는 브라우저 path fallback으로 바로 preview하도록 확장돼, 실제 clip walkthrough 시 같은 화면에서 영상 확인과 로그 기록을 같이 할 수 있게 정리
- `resolveLocalMediaSrc` helper test를 추가하고 `pnpm --filter desktop-ui test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`로 local clip preview slice 검증 완료
- `qa-review` helper에 manual review 우선순위 queue와 release checklist snapshot derivation을 추가해, 미완료 fixture를 먼저 보이고 최근 rehearsal 기준 남은 리스크를 앱 안에서 바로 확인할 수 있게 정리
- `QaReviewPanel`이 다음 walkthrough 추천 fixture, sorted fixture queue, release checklist snapshot을 표시하도록 확장하고 `getLatestRehearsalRun`은 더 이상 배열을 mutate하지 않도록 수정
- `pnpm --filter desktop-ui test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`로 QA readiness dashboard slice 검증 완료

### 진행 중

- 실제 mp4/mov 자산을 연결한 manual walkthrough와 rehearsal 반복

### 다음

1. 실제 clip 기반 rehearsal log 축적
2. live OCR/ASR adapter를 실제 모델 호출 또는 로컬 추론으로 교체
3. Shadow buffer live 입력과 audio/ASR 경로 직결
