# 안심트랙 Live

경진대회용 macOS 우선 데스크톱 앱입니다. 현재 모니터의 재난안전 영상을 읽고, 4초 지연 Shadow Player 위에서 판단 전환 지점별 멀티트랙 설명을 제공합니다.

## 현재 상태

- macOS 우선 capture command, browser fallback preview, Shadow Player demo path 구현
- fire/earthquake grounded rule matcher, segment engine, voice fallback, evidence drawer 구현
- live capture frame window에서 local `PerceptionPacket -> Segment -> explanation` 갱신과 snapshot/session log 저장 경로 구현
- Tauri runtime에 SQLite-backed app/session restore를 추가해 마지막 라이브 분석 요약과 runtime state를 재시작 후 복원 가능하게 정리
- ScreenCaptureKit audio callback 기반 native preview audio 상태와 macOS TTS/STT + browser/text fallback voice runtime 구현
- actual clip manual review와 3분 rehearsal 결과를 앱 안에서 기록하고 `data/eval` 로그로 동기화하는 QA workspace 구현
- safety/privacy guardrail, QA audit, demo runbook/backup mode, runtime restore/export 경로 구현
- 아직 남은 핵심은 실제 OCR/ASR 모델 연결, live audio의 ASR/Shadow buffer 직결, 실제 clip 기반 rehearsal 축적

## 권장 환경

```bash
pnpm check-env
```

- Apple Silicon MacBook
- 최신 macOS
- Xcode Command Line Tools
- Homebrew
- Node.js LTS / pnpm
- Rust toolchain
- FFmpeg
- Python 3.11+
- 글로벌 `tauri-cli`는 필수가 아닙니다. 이 저장소는 `@tauri-apps/cli`를 workspace dev dependency로 포함합니다.

## 빠른 시작

```bash
pnpm check-env
pnpm install
cp .env.example .env.local
pnpm dev # 브라우저 셸
pnpm dev:desktop # Tauri 셸
```

`pnpm check-env`는 로컬 툴체인과 `.env.example` 존재 여부를 점검합니다.

## 환경 파일

```bash
cp .env.example .env.local
```

`.env.local`에는 실제 비밀키를 넣되, 현재 저장소 기본 경로는 로컬 우선과 mock/demo path를 기본으로 둡니다. `ENABLE_DEMO_BACKUP_MODE=true`가 기본이라 모델 호출이 없어도 시연 경로를 바로 올릴 수 있습니다.

## 실행 전 점검

- macOS Screen Recording 권한 허용
- 음성 질의 실험 시 마이크 권한 허용
- 데모용 샘플 영상 준비
- 외부 모니터 연결 여부 확인

## 검증 명령

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm rules:validate`
- `pnpm prompts:validate`
- `pnpm eval:audit`
- `pnpm qa:sync`
- `pnpm qa:smoke`
- `pnpm demo:reset`

## 데모 관련

- `pnpm demo:reset`: 데모 캐시, export, `data/demo/last-session.json` 초기화
- runbook source: [data/demo/runbook.json](data/demo/runbook.json)
- backup preset source: [data/demo/prerecorded_sessions.json](data/demo/prerecorded_sessions.json)

## 기본 워크스페이스

```text
apps/desktop-ui
native/mac-capture
native/windows-capture
workers/perception-pipeline
workers/llm-orchestrator
data/rules
data/demo
data/eval
docs
packages/shared-types
packages/shadow-buffer
packages/local-store
```

## 주요 스크립트

- `pnpm check-env`
- `pnpm dev`
- `pnpm dev:desktop`
- `pnpm build`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm prompts:validate`
- `pnpm demo:reset`
- `pnpm eval:audit`
- `pnpm qa:sync`
- `pnpm qa:smoke`
- `pnpm rules:validate`
