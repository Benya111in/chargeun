# 01 Repository Bootstrap

## 사용 시점

새 저장소를 처음 올리거나, 부트스트랩 구조를 다시 세울 때 사용한다.

## Source Docs

- `docs/03_REPO_BOOTSTRAP_AND_STANDARDS.md`
- `docs/20_CODEX_EXECUTION_ORDER.md`
- `docs/25_CODEX_PROMPTS_BY_DOMAIN.md`

## Prompt

```text
이 프로젝트는 경진대회용 macOS 우선 Tauri 2 데스크톱 앱이다.
목표는 현재 모니터의 재난안전 영상을 읽고 4초 지연 Shadow Player 위에 멀티트랙 설명을 보여주는 안심트랙 Live를 구현하는 것이다.
다음 일을 해줘.

1) pnpm workspace monorepo를 생성해라.
2) apps/desktop-ui 에 Tauri 2 + React + TypeScript + Tailwind 조합으로 앱을 초기화해라.
3) packages/shared-types 를 만들고 공통 타입을 정의해라.
4) docs/ 아래에 현재 문서 구조를 반영할 수 있게 README, PROGRESS, DECISIONS, KNOWN_ISSUES를 만들어라.
5) lint, format, typecheck, test 스크립트를 설정해라.
6) 결과적으로 pnpm dev:desktop 이 실행되게 만들어라.

추가 제약:
- macOS 단일 경로를 먼저 완성해라.
- API 키를 하드코딩하지 마라.
- 작업 후 생성된 파일과 다음 단계 제안을 요약해라.
```
