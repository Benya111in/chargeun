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

### 진행 중

- macOS frame/audio preview bridge 실연결
- 브라우저 fallback preview를 shadow/perception 입력으로 연결
- mock segment에서 실제 segment/rule 매칭 입력으로 교체

### 다음

1. native frame/audio event를 preview/shadow 입력으로 전달하는 브리지 추가
2. browser/native preview 입력을 shadow/perception lane으로 분기 연결
3. mock segment -> grounded rule match -> segment engine 실입력 교체
