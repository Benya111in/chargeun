# 08_SHADOW_PLAYER_AND_BUFFER_ENGINE

## 목표

실시간 입력 스트림을 **3~5초 지연된 재생 경험**으로 변환해, 사용자가 멈춤/반복/다시보기 할 수 있게 만든다.

## 왜 중요한가

이 제품의 핵심 가치는 실시간 분석이 아니라 **잠깐 붙잡아 주는 것**이다. 따라서 Shadow Player는 옵션이 아니라 본체다.

## 요구사항

- 4초 기본 지연
- 최소 8초 버퍼 유지
- 다시보기 1세그먼트
- 세그먼트 경계에서 auto-pause 가능
- 버퍼 언더런/오버런 대응
- 분석 lane과 재생 lane의 분리

## 구현 과업

### A. 버퍼 자료구조
- ring buffer for encoded chunks
- frame index + timestamp index
- audio/video sync metadata
- segment markers

### B. 재생 엔진
- Shadow Player video element 또는 native texture
- 현재 재생 위치 = live edge - delay
- 세그먼트 marker 위치에 카드 표시
- auto-pause 후 resume 제어

### C. UX 기능
- 5초 되감기
- 현재 세그먼트 다시 보기
- 쉬운 설명 다시 듣기
- Panic Mode 즉시 전환

### D. 장애 대응
- buffer underrun 시 live preview로 임시 전환
- fps 급락 시 해상도 다운그레이드
- 오디오 drift 보정
- long session cleanup

## 권장 설계

- `CaptureLane`: 원본 캡처
- `ReplayLane`: 재생용 H.264/Opus or browser-supported path
- `AnalysisLane`: keyframe sampler

## 완료 기준

- 10분 재생 중 재생 끊김 없음
- 세그먼트 경계 기반 다시보기 가능
- 음성과 영상이 크게 어긋나지 않음
- manual pause / auto pause 둘 다 동작

## Codex에게 바로 맡길 일

- ring buffer 모듈 작성
- Shadow Player 컴포넌트 작성
- replay controls 구현
- segment marker overlay 연결
