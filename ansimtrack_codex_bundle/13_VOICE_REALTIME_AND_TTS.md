# 13_VOICE_REALTIME_AND_TTS

## 목표

사용자가 버튼이나 음성으로 짧게 질문하면, 현재 세그먼트 기준으로 다시 설명해 준다.

## 지원 intent

- 다시 말해줘
- 더 쉽게 말해줘
- 왜 그래?
- 지금 뭐 해야 해?
- 119에 뭐라고 말해?

## 음성 UX 원칙

- 답변은 짧고 안정적이어야 함
- 과도한 공감 멘트 금지
- 현재 세그먼트 밖으로 벗어나지 말 것
- 정보가 없으면 모른다고 하고 근거 패널로 유도

## 파이프라인

1. 마이크 입력 또는 버튼 intent
2. intent 분류
3. current segment context 조회
4. voice agent text 생성
5. TTS 재생
6. transcript card 표시

## 구현 과업

### A. 버튼 기반 intent
- 가장 먼저 구현
- 버튼만으로도 데모 가능

### B. 음성 인식
- push-to-talk 또는 짧은 토글
- silence timeout
- partial transcript optional

### C. TTS
- calm voice
- 속도 약간 느리게
- 지나치게 기계적이지 않게

### D. 에러 처리
- 인식 실패 시 버튼 fallback
- 네트워크 지연 시 로딩 토스트
- voice unavailable 시 텍스트 카드만 보여줌

## 오디오 정책

- 시스템 오디오와 TTS가 충돌하지 않게 ducking 또는 볼륨 정책 결정
- Shadow Player 음량과 TTS 음량 분리
- TTS 재생 중 기본 영상은 자동 감쇠 가능

## 완료 기준

- 5개 intent 중 4개 이상 동작
- 1초 내 답변 시작
- current segment만 기반으로 답변
- 음성 없이 버튼만으로도 동일 기능 가능

## Codex에게 바로 맡길 일

- intent buttons 구현
- current segment voice agent 구현
- TTS playback manager 작성
- transcript bubble UI 추가
