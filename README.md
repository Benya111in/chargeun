# 안심트랙 연습

느린학습자가 재난안전 영상을 짧게 멈춰 보고, 쉬운말과 행동 카드로 반복 연습하는 웹 학습 도구입니다. 실시간 화면공유 AI 분석은 기본 제품이 아니라 `/live-lab` 실험 기능으로 분리합니다.

## 현재 상태

- 웹 루트(`/`)는 공식 자료 기반 재난안전 연습 홈으로 전환
- `/scenario/:id`는 장면 자동 정지, 쉬운말, 행동 카드, teach-back을 제공하는 학습자 플레이어
- `/demo`는 `/scenario/fire-grounded-flow` 호환 경로로 유지
- `/teacher`는 교사/보호자 진행자 화면
- `/live-lab`는 기존 브라우저 화면공유 AI 분석 실험 기능
- `/qa`는 기존 운영자 검증 워크스페이스, QA fixture, rehearsal log 화면으로 분리
- Vercel 정적 프론트 + same-origin serverless API 프록시 설정 추가
- 서버 API는 OpenAI key를 클라이언트에 노출하지 않고 frame perception extraction / audio transcription만 담당
- macOS 우선 capture command, browser preview, Shadow Player demo path 구현
- fire/earthquake grounded rule matcher, segment engine, voice fallback, evidence drawer 구현
- SafeTV, 국민안전24, 한국장애인개발원 자료를 metadata/paraphrase chunk로 정리한 공식 근거 RAG 레이어 구현
- `StructuredLearningExplanation v1`은 visual/OCR/ASR/rule/RAG evidence를 분리하고, 공식 규칙으로 검증된 행동 카드에만 출처 근거를 붙임
- live capture frame window에서 local `PerceptionPacket -> Segment -> explanation` 갱신과 snapshot/session log 저장 경로 구현
- Tauri runtime에 SQLite-backed app/session restore를 추가해 마지막 라이브 분석 요약과 runtime state를 재시작 후 복원 가능하게 정리
- ScreenCaptureKit audio callback 기반 native preview audio 상태와 macOS TTS/STT + browser/text fallback voice runtime 구현
- actual clip manual review와 3분 rehearsal 결과를 앱 안에서 기록하고 `data/eval` 로그로 동기화하는 QA workspace 구현
- safety/privacy guardrail, QA audit, demo runbook/backup mode, runtime restore/export 경로 구현
- 아직 남은 핵심은 실제 느린학습자/보호자/교사 대상 이해도·불안·반복 기억 검증과 콘텐츠 검수 축적

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
pnpm dev # 웹 셸
pnpm build && pnpm web:preview # API 포함 로컬 웹 프리뷰
pnpm dev:desktop # Tauri 셸
```

`pnpm check-env`는 로컬 툴체인과 `.env.example` 존재 여부를 점검합니다.

## 환경 파일

```bash
cp .env.example .env.local
```

`.env.local`에는 실제 비밀키를 넣되, 현재 저장소 기본 경로는 로컬 우선과 mock/demo path를 기본으로 둡니다. `ENABLE_DEMO_BACKUP_MODE=true`가 기본이라 모델 호출이 없어도 시연 경로를 바로 올릴 수 있습니다.

웹 배포에는 Vercel 환경변수로 다음 값이 필요합니다.

```bash
OPENAI_API_KEY=
OPENAI_ANALYSIS_MODEL=gpt-5.5
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
OPENAI_TRANSCRIPTION_MODEL=whisper-1
OPENAI_GENERATION_MODEL=gpt-5.5
OPENAI_VISUAL_CAPTION_TIMEOUT_MS=110000
GENERATOR_SCENARIO_AUTHOR_TIMEOUT_MS=90000
GENERATOR_REUSE_EXISTING_JOBS=0
GENERATOR_REUSE_GENERATED_CACHE=0
GENERATOR_RETRY_UNTIL_PUBLISHED=1
GENERATOR_RETRY_DELAY_MS=3000
BETA_ACCESS_CODES=judge-demo-1,team-beta-1
MAX_SESSION_MINUTES=10
MAX_FRAMES_PER_ANALYSIS=3
```

`OPENAI_API_KEY`는 서버 함수에서만 읽고, 클라이언트 번들에는 포함하지 않습니다.

## 웹 라우트

- `/`: 느린학습자용 재난안전 연습 홈
- `/scenario/:id`: 시나리오 학습자 플레이어
- `/demo`: 화재 연습 호환 경로
- `/teacher`: 교사/보호자 진행자 화면
- `/live-lab`: 화면공유 AI 분석 실험 기능
- `/qa`: 내부 운영자/검증 워크스페이스

## 공식 근거 데이터

- source metadata: `data/official_sources/official_sources.json`
- paraphrase chunks: `data/official_sources/official_chunks.json`
- 검증: `pnpm rules:validate`

공식 자료는 원문 전체나 raw 영상을 저장소에 넣지 않고, canonical URL과 짧은 paraphrase/easyKo chunk만 tracked로 관리합니다. RAG 검색 결과는 행동을 새로 생성하지 않고, 이미 공식 rule grounding을 통과한 행동 카드의 근거를 보강하는 데만 사용합니다.

## Vercel 배포

이 저장소는 루트 `vercel.json`을 포함합니다.

```bash
pnpm install
pnpm --filter desktop-ui build
```

Vercel 설정:

- Build command: `pnpm --filter desktop-ui build`
- Output directory: `apps/desktop-ui/dist`
- API functions: `api/*.ts`

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
- `pnpm qa:prepare-clips`
- `pnpm qa:sync`
- `pnpm qa:smoke`
- `pnpm demo:reset`

## 데모 관련

- `pnpm demo:reset`: 데모 캐시, export, `data/demo/last-session.json` 초기화
- runbook source: [data/demo/runbook.json](data/demo/runbook.json)
- backup preset source: [data/demo/prerecorded_sessions.json](data/demo/prerecorded_sessions.json)

## QA Clip Intake

실제 QA clip은 저장소에 직접 커밋하지 않고, 로컬 source video에서 잘라서 `data/eval/clips`에 두는 경로를 기본으로 사용합니다.

```bash
cp data/eval/source_videos.example.json data/eval/source_videos.local.json
cp data/eval/clip_windows.example.json data/eval/clip_windows.local.json
pnpm qa:prepare-clips
pnpm qa:prepare-clips -- --extract --fixture earthquake-desk-001
```

- `source_videos.local.json`: 팀원 각자의 로컬 원본 mp4/mov 경로
- `clip_windows.local.json`: fixture별 source start/end ms
- 추출된 clip은 QA workspace에서 자동 preview 후보로 잡힙니다.

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
- `pnpm qa:prepare-clips`
- `pnpm qa:sync`
- `pnpm qa:smoke`
- `pnpm rules:validate`
