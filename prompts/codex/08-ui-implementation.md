# 08 UI Implementation

## 사용 시점

시연용 데스크톱 UI를 구현하거나 HUD, evidence drawer, Panic Mode 배치를 손볼 때 사용한다.

## Source Docs

- `docs/04_PRODUCT_UX_ACCESSIBILITY_REQUIREMENTS.md`
- `docs/14_FRONTEND_PLAYER_UI.md`
- `docs/25_CODEX_PROMPTS_BY_DOMAIN.md`

## Prompt

```text
안심트랙 Live의 시연용 UI를 구현해라.

화면:
- Home
- Live HUD
- Shadow Player
- SegmentCard
- TrackTabs
- Panic Mode
- Evidence Drawer
- Voice Prompt Bar

요구사항:
- 1920x1080 발표 화면 기준
- 직관적이고 깔끔한 시각 구조
- 기본 화면에서는 easy + action 이 가장 잘 보이게
- Panic Mode 는 큰 글씨 3줄
- Evidence Drawer 에 공식 근거 rule 을 보여주기

디자인 토큰과 컴포넌트 구조를 함께 정리해라.
```
