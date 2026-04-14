# 03_REPO_BOOTSTRAP_AND_STANDARDS

## 목표

Codex가 바로 작업 가능한 저장소를 만든다. 도메인/플랫폼/워커가 분리되어야 하고, 문서와 코드가 함께 자라야 한다.

## 권장 폴더 구조

```text
ansimtrack-live/
  apps/
    desktop-ui/
  native/
    mac-capture/
    windows-capture/
  workers/
    media-worker/
    llm-orchestrator/
    vision-worker/
  data/
    rules/
    demo/
    eval/
  docs/
  scripts/
  prompts/
  packages/
    shared-types/
    ui/
```

## 초기 부트스트랩 순서

1. monorepo 초기화
2. pnpm workspace 설정
3. desktop-ui 생성
4. Tauri 2 연결
5. shared-types 패키지 생성
6. docs 복사
7. lint/test/format 설정
8. basic CI 추가

## 권장 툴링

- package manager: pnpm
- formatter: prettier
- linter: eslint
- typecheck: tsc
- test: vitest + playwright
- rust fmt/clippy
- commit convention: conventional commits
- env: `.env.local`, `.env.example`

## 필수 스크립트

- `pnpm dev`
- `pnpm dev:desktop`
- `pnpm build`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm demo:reset`
- `pnpm rules:validate`

## 개발 규칙

- 기능마다 `README.md` 또는 `DECISIONS.md`를 둔다.
- UI에 쓰는 데이터 타입은 `shared-types`에서만 정의한다.
- 프로토타입이라도 `any` 남발 금지.
- LLM 출력은 반드시 schema 검증 후 저장한다.
- 새로운 모델/도구 도입 시 `docs/DECISIONS.md`에 근거를 남긴다.

## 브랜치 전략

- `main`: 시연 가능 상태만 유지
- `feat/*`: 기능별
- `demo/*`: 발표 전 폴리시 전용

## Codex에게 바로 맡길 일

- workspace 생성
- Tauri 2 + React + Tailwind 초기화
- shared types 패키지 연결
- eslint/prettier/vitest/playwright 세팅
- `docs/`에 이 ZIP 문서 복사
- `PROGRESS.md`/`DECISIONS.md`/`KNOWN_ISSUES.md` 생성
