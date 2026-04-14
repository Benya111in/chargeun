# 18_EVALUATION_AND_QA

## 목표

데모 전에 “예쁘게 보이지만 위험한 제품”이 되지 않도록 최소한의 검수 체계를 만든다.

## 평가 축 5개

1. 재난 분류 정확성
2. 세그먼트 경계 자연스러움
3. grounding 무결성
4. 설명 가독성
5. 시연 안정성

## 수작업 평가셋

### 화재
- 공식 화재 행동요령 영상 10~20개 클립
- 복도/계단/창문/신고 등 다양한 phase 포함

### 지진
- 초기 흔들림/탁자 아래/흔들림 종료/이동 phase 포함

## 라벨링 항목

- hazard
- phase
- ideal segment start/end
- expected rule ids
- 금지 행동 문장
- 추천 overlay 대상

## 자동 점검

- action track rule id 존재 여부
- explanation schema validation
- confidence threshold 동작
- empty state/timeout fallback
- audio 없는 세션 fallback

## 사용자 관점 QA

- 버튼만으로 끝까지 사용 가능한가
- Panic Mode가 진짜 한눈에 들어오는가
- 쉬운 설명이 불필요하게 장황하지 않은가
- 근거 패널이 이해 가능한가

## 대회 전 리허설 체크

- 3분 시연 10회 연속 성공
- 화면 전환 중 버벅임 없음
- 네트워크 느려도 fallback 가능
- 음성 기능 꺼도 데모 유지 가능

## 완료 기준

- annotated eval set 존재
- 수동 검수 로그 존재
- known issues가 정리되어 있음
- demo rehearsal checklist 완료

## Codex에게 바로 맡길 일

- `data/eval/annotated_segments.json` 초안 작성
- smoke tests와 manual qa checklist 작성
- grounding audit script 작성
