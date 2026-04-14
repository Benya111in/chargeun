# 07 Multi-track Generator

## 사용 시점

grounded segment와 official rules를 6개 설명 트랙으로 재작성할 때 사용한다.

## Source Docs

- `docs/12_LLM_ORCHESTRATION_AND_PROMPTS.md`
- `docs/14_FRONTEND_PLAYER_UI.md`
- `docs/25_CODEX_PROMPTS_BY_DOMAIN.md`

## Prompt

```text
현재 세그먼트와 official rules 를 입력받아 6개 멀티트랙 설명을 생성하는 모듈을 만들어라.

필수 트랙:
- basic
- easy
- action
- reason
- caregiver
- report

조건:
- action 은 rule grounding 없으면 생성 금지
- easy 는 더 쉬운 말로 2문장 이하
- reason 은 1문장
- report 는 바로 읽을 수 있는 문장
- strict JSON schema
- zod validation
- 캐시 저장

샘플 입력/출력 fixture도 만들어라.
```
