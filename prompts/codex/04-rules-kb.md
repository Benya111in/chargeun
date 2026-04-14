# 04 Rules KB

## 사용 시점

화재/지진 공식 행동요령 JSON, validator, grounding matcher를 만들거나 보강할 때 사용한다.

## Source Docs

- `docs/11_RULE_KB_AND_GROUNDING.md`
- `docs/16_DATA_MODELS_AND_API_CONTRACTS.md`
- `docs/25_CODEX_PROMPTS_BY_DOMAIN.md`

## Prompt

```text
화재와 지진 공식 행동요령을 위한 rule KB를 JSON으로 설계하고 구현해라.

요구사항:
- data/rules/fire_rules.json
- data/rules/earthquake_rules.json
- 각 rule은 rule_id, hazard, phase, when, action, do_not, why, caregiver, report_script, source fields 포함
- schema validation 스크립트 작성
- rule grounding matcher 초안 구현
- docs/RULES_CHANGELOG.md 작성

대회 데모에서 action track이 반드시 공식 rule id를 가지도록 설계해라.
```
