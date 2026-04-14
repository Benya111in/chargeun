# 15_BACKEND_STORAGE_AND_JOBS

## 목표

로컬 중심의 저장/캐시/비동기 작업 구조를 단순하게 만든다.

## 원칙

- 데모는 로컬 우선
- 원본 장기 저장 최소화
- 세그먼트/설명/규칙은 재사용 가능하게 저장
- 작업 큐는 복잡하게 가지 않음

## 저장 대상

### 세션
- capture source
- start/end time
- audio available
- selected display/window

### perception cache
- keyframes
- asr text
- ocr tokens
- object hints

### segment cache
- hazard
- phase
- confidence
- official rule ids
- explanation tracks

### ui prefs
- selected track
- delay seconds
- voice enabled
- caption size

## 권장 저장소

- SQLite: 메타데이터, 세그먼트, 트랙
- files/cache: 프레임, 오디오 chunk
- files/export: 데모 녹화/스크린샷

## 작업 종류

- frame sampling
- ASR chunking
- OCR extraction
- LLM orchestration
- tracking refresh
- export packaging

## 잡 실행 방식

- local worker thread/process
- queue depth 제한
- latest-only cancellation
- backpressure 적용

## 예시 테이블

- sessions
- perception_packets
- segments
- segment_explanations
- rules
- app_settings

## 완료 기준

- 앱 재시작 후 이전 세션 메타데이터 복원
- 캐시 청소 기능 제공
- 세그먼트 생성 로그 추적 가능
- export 기능으로 데모 자료 추출 가능

## Codex에게 바로 맡길 일

- SQLite schema 작성
- cache directory policy 구현
- worker queue 설계
- session log/export 기능 구현
