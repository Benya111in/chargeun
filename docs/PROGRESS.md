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

### 진행 중

- mock segment에서 실제 segment/rule 매칭 입력으로 교체
- fire/earthquake rule matcher 구현
- perception packet foundation과 hazard/segment engine 실입력 연결

### 다음

1. fire/earthquake grounded matcher 구현
2. perception packet foundation과 hazard/segment engine 실입력 교체
3. grounded track와 evidence 흐름을 실제 packet/rule 입력으로 치환
