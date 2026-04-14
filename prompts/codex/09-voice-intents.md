# 09 Voice Intents

## 사용 시점

intent 버튼, TTS fallback, 음성 재설명 정책을 구현하거나 보강할 때 사용한다.

## Source Docs

- `docs/13_VOICE_REALTIME_AND_TTS.md`
- `docs/17_SAFETY_PRIVACY_AND_COMPLIANCE.md`
- `docs/25_CODEX_PROMPTS_BY_DOMAIN.md`

## Prompt

```text
현재 세그먼트 기반 재설명 음성 기능을 구현해라.

지원 intent:
- 다시 말해줘
- 더 쉽게 말해줘
- 왜?
- 지금 뭐 해야 해?
- 119에 뭐라고 말해?

우선순위:
1) 버튼 intent
2) TTS
3) 마이크 입력

조건:
- current segment 밖으로 벗어나지 말 것
- grounding 없는 행동 추가 금지
- 실패 시 텍스트 카드 fallback
```
