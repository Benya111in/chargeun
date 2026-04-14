# 14_FRONTEND_PLAYER_UI

## 목표

심사위원이 봤을 때 즉시 이해되는 polished UI를 만든다.

## 화면 구성

### A. Home
- 제품 한 줄 소개
- 현재 모니터 읽기 시작
- 브라우저 공유 시작
- 데모 영상 재생
- 최근 세션 보기

### B. Live HUD
- minimal overlay
- hazard badge
- current segment title
- Shadow 열기
- Panic

### C. Shadow Player
- left: video
- right: segment card panel
- bottom: controls + track tabs + replay

### D. Panic Mode
- 큰 글씨 3줄
- 지금 / 금지 / 신고
- 뒤로 가기 버튼

### E. Source Evidence Panel
- rule id
- 공식 제목
- 원문 요약
- 언제 왜 선택됐는지

## 디자인 규칙

- 라운드 카드
- 너무 많은 그림자 금지
- 강한 대비
- motion은 부드럽게, 과도한 애니메이션 금지
- 한 화면의 primary action 1개

## 컴포넌트 목록

- `CaptureStartCard`
- `LiveHudOverlay`
- `ShadowPlayer`
- `SegmentTimeline`
- `SegmentCard`
- `TrackTabs`
- `PanicCard`
- `EvidenceDrawer`
- `VoicePromptBar`
- `ReplayControls`

## 상태 관리

- session state
- capture state
- shadow buffer state
- current segment
- selected track
- voice state
- evidence drawer state

## 구현 우선순위

1. Shadow Player shell
2. SegmentCard
3. TrackTabs
4. Panic Mode
5. EvidenceDrawer
6. VoicePromptBar
7. HUD polish

## 완료 기준

- 키보드/마우스 모두 사용 가능
- 1920x1080 발표 화면에서 보기 좋음
- 폰트, 간격, 대비 일관성
- 데모 중 시선 흐름이 자연스러움

## Codex에게 바로 맡길 일

- design tokens 정의
- shadcn 기반 컴포넌트 조합
- player layout 구현
- evidence drawer와 panic mode 구현
