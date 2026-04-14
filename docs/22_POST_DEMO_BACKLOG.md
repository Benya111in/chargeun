# 22_POST_DEMO_BACKLOG

## 목적

대회 직후에는 아이디어를 넓히기보다, 현재 데모에서 드러난 구조적 공백을 먼저 메운다.

## 현재 상태 기준 우선순위

### P1. 바로 이어서 할 일

1. live capture -> perception -> segment 실시간 연결
   - 이유: 지금은 demo packet 경로가 가장 안정적이지만, 실제 제품 완성도는 live capture가 perception/grounding/storage까지 바로 이어져야 나온다.
   - 의존성: native frame/audio bridge, perception packet builder, local-store session log

2. SQLite 연결 + restart restore
   - 이유: storage skeleton은 만들어졌지만 앱 재시작 복원과 실제 persistence가 아직 빠져 있다.
   - 의존성: `packages/local-store`, Tauri/native file access, UI restore policy

3. native audio/TTS/STT 보강
   - 이유: 현재는 browser `speechSynthesis` fallback과 button intent가 중심이라 실제 오디오 이해/출력이 제한적이다.
   - 의존성: mac audio bridge, privacy review, local/offline 우선 정책

4. 실제 clip 기반 manual QA와 rehearsal 반복
   - 이유: synthetic packet audit는 통과했지만 실제 clip boundary와 발표 흐름은 사람이 끝까지 확인해야 한다.
   - 의존성: 권한 허용된 macOS 환경, rehearsal owner, backup artifact 준비

### P2. 데모 이후 첫 확장

1. 더 정교한 비디오 이해
   - 객체 하이라이트 고도화
   - 더 안정적인 segment boundary
   - 오디오 없는 세션의 visual-only robustness 강화

2. 시나리오 훈련형 제품화
   - 퀴즈/연습 모드
   - 시나리오 기반 훈련
   - 보호자/교사용 review flow

3. 사용자 폭 확장
   - 고령층
   - 외국인 주민
   - 발달장애인
   - 특수교사/보호자 교육용

### P3. 도메인/플랫폼 확장

- 태풍/호우/침수
- 한파/폭염
- 산사태
- 대피소 안내
- 민방위/생활안전
- iPad/Android companion app

## 지금 하지 않을 것

- cloud sync / annotation dashboard
- 복잡한 계정 체계
- 다국어 전체 확장
- 개인별 학습 로그를 중심으로 한 personalization

이 항목들은 협업성과 사업성 측면에서는 의미가 있지만, 현재 단계에서는 로컬 우선/grounded action/낮은 인지부하라는 핵심을 흐릴 가능성이 크다.

## 유지할 철학

- 기능을 늘리기보다 인지부하를 줄이는 방향을 유지한다.
- 멀티트랙은 계속 “선택형 경로”로 유지한다.
- 행동은 계속 공식 근거에 묶는다.
- 새로운 확장은 반드시 live path 안정화와 safety fallback을 해치지 않아야 한다.
