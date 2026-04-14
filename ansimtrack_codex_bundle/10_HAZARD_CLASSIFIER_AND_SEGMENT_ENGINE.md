# 10_HAZARD_CLASSIFIER_AND_SEGMENT_ENGINE

## 목표

현재 영상이 어떤 재난 상황인지 분류하고, 어떤 판단 지점으로 잘라야 하는지 결정한다.

## 설계 원칙

- 샷 전환이 아니라 **판단 전환**
- low confidence면 안전한 fallback
- 분류와 세그먼트는 규칙 + 모델의 하이브리드

## 1차 규칙 신호

### 화재 후보
- OCR/ASR에 `화재`, `연기`, `불`, `대피`, `119`, `비상구`
- 출구 표지/연기/불꽃/복도/계단 방향 등장

### 지진 후보
- OCR/ASR에 `지진`, `흔들림`, `탁자`, `가스`, `출구`
- 책상 아래 자세, 흔들리는 장면, 안전모 등

## 2차 모델 추론

입력:
- recent keyframes 4~6장
- 최근 6초 ASR
- 최근 OCR tokens
- rule candidate list
- previous segment state

출력:
- hazard_type
- phase
- boundary decision
- confidence
- candidate official rule ids
- overlay targets

## 세그먼트 템플릿

### 화재
1. 경보/연기 인지
2. 주변에 알리기
3. 대피 가능 여부 판단
4. 경로 선택
5. 이동
6. 신고/안전 확인

### 지진
1. 흔들림 시작
2. 몸 보호
3. 흔들림 종료
4. 출구/가스/전기 확인
5. 이동
6. 신고/안전 확인

## 경계 검출 휴리스틱

- 새로운 행동 동사 출현
- 공간 상태 변화
- 대상 객체 변화
- 화면 텍스트 전환
- 음성 내 단계 전환 표현(`먼저`, `다음`, `이때`, `흔들림이 멈추면`)

## low confidence 처리

- `hazard = unknown`
- action track 생성 금지
- basic/easy만 표시
- 근거 패널을 “공식 행동요령 선택 필요”로 전환

## 완료 기준

- 화재/지진 데모 영상 20개 샘플에서 대부분 올바른 hazard 분류
- 세그먼트 경계가 대략적이라도 시연상 자연스러움
- low confidence fallback이 안전하게 동작

## Codex에게 바로 맡길 일

- hazard classifier schema 작성
- segment engine state machine 구현
- fallback 처리 구현
- test fixtures 작성
