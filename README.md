# 안심트랙 Live

경진대회용 macOS 우선 데스크톱 앱입니다. 현재 모니터의 재난안전 영상을 읽고, 4초 지연 Shadow Player 위에서 판단 전환 지점별 멀티트랙 설명을 제공합니다.

## 현재 상태

- Phase 0 부트스트랩 진행 중
- `docs/`에 번들 문서 복사 완료
- `packages/shared-types` 공통 계약 생성
- `workers/llm-orchestrator` 로컬 오케스트레이션 스텁 생성
- `apps/desktop-ui` 데모 가능한 Shadow Player UI 셸 생성 예정

## 로컬 부팅

```bash
./scripts/check-env.sh
pnpm install
pnpm dev
pnpm dev:desktop
```

`pnpm dev`는 웹 셸을 띄우고, `pnpm dev:desktop`는 Tauri 셸을 띄웁니다.

## 기본 워크스페이스

```text
apps/desktop-ui
native/mac-capture
native/windows-capture
workers/llm-orchestrator
data/rules
docs
packages/shared-types
```

## 주요 스크립트

- `pnpm dev`
- `pnpm dev:desktop`
- `pnpm build`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm demo:reset`
- `pnpm rules:validate`
