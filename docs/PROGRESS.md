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

### 진행 중

- macOS ScreenCaptureKit bridge 실연결
- 브라우저 fallback capture adapter
- mock segment에서 실제 segment/rule 매칭 입력으로 교체

### 다음

1. native frame source를 `shadow-buffer` contract에 연결
2. Tauri 셸에서 권한/세션 시작 상태를 실제 capture bridge와 연결
3. mock segment -> grounded rule match -> voice/evidence/panic 흐름을 실데이터 입력으로 교체
