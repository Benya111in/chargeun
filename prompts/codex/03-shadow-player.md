# 03 Shadow Player

## 사용 시점

4초 지연 replay buffer, seek/replay control, marker 표시, live preview 분리를 구현할 때 사용한다.

## Source Docs

- `docs/08_SHADOW_PLAYER_AND_BUFFER_ENGINE.md`
- `docs/14_FRONTEND_PLAYER_UI.md`
- `docs/25_CODEX_PROMPTS_BY_DOMAIN.md`

## Prompt

```text
apps/desktop-ui 안에 Shadow Player를 구현해라.

목표:
- 캡처 스트림을 4초 지연된 replay buffer로 재생
- pause, replay current segment, seek back 5s
- segment marker 표시
- 추후 세그먼트 카드와 연결 가능한 구조

요구사항:
- 가능한 간단한 방식으로 8초 이상 링버퍼 유지
- live preview 와 replay lane 을 분리
- buffer underrun fallback 처리
- UI는 시연용으로 보기 좋게 만들어라

구현 후 플레이어 구조와 한계점을 문서에 남겨라.
```
