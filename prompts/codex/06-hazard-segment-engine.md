# 06 Hazard Segment Engine

## 사용 시점

hazard classifier, phase 추정, segment boundary, low-confidence fallback을 구현할 때 사용한다.

## Source Docs

- `docs/10_HAZARD_CLASSIFIER_AND_SEGMENT_ENGINE.md`
- `docs/12_LLM_ORCHESTRATION_AND_PROMPTS.md`
- `docs/25_CODEX_PROMPTS_BY_DOMAIN.md`

## Prompt

```text
workers/llm-orchestrator 에 hazard classifier 와 segment engine 을 구현해라.

목표:
- fire / earthquake / unknown 분류
- phase 추정
- segment boundary 결정
- official rule candidate 매칭

요구사항:
- 1차 규칙 기반 + 2차 모델 기반 하이브리드
- low confidence fallback
- strict JSON schema
- unit tests
- timeout/retry 정책

결과적으로 Segment 객체와 candidate officialRuleIds 가 나오게 만들어라.
```
