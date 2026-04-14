# 17_SAFETY_PRIVACY_AND_COMPLIANCE

## 목표

재난안전 도메인에서 잘못된 행동 지시와 과도한 캡처를 방지한다.

## 핵심 리스크

1. 공식 규칙에 없는 행동 지시
2. 재난 유형 오분류
3. 민감한 화면이 의도치 않게 캡처됨
4. 오디오 미수집/오인식으로 잘못된 맥락 해석
5. 사용자가 AI 설명을 공식 지시보다 더 우선시함

## 가드레일

### A. Grounding 강제
- action/report/do_not는 rule id 필수
- rule 없으면 출력 금지

### B. 저신뢰 fallback
- confidence 낮음 -> `review_official`
- Panic Mode도 행동 대신 공식 확인 유도 가능

### C. 출처 표시
- 근거 패널 상시 제공
- official title과 요약 표시

### D. 캡처 투명성
- 캡처 중 명확한 표시
- 원본 장기 저장 opt-in
- 캐시 지우기 버튼 제공

### E. 보안
- API key 노출 방지
- 로컬 파일 권한 최소화
- demo 계정/샘플 데이터 분리

## 프라이버시 정책 초안

- 기본 모드는 로컬 처리 우선
- 분석을 위해 필요한 최소 keyframe과 텍스트만 전송
- 사용자가 원하지 않으면 전체 화면 저장 안 함
- 종료 시 캐시 삭제 옵션 제공

## 문구 가이드

앱 내부에 아래 문구를 넣는다.

- “이 앱의 행동 설명은 공식 재난행동요령에 근거해 재구성됩니다.”
- “확신이 낮을 때는 공식 원문 확인을 우선 안내합니다.”
- “화면 캡처는 사용자의 동의가 있어야 시작됩니다.”

## 완료 기준

- safety fallback 시나리오 5개 테스트
- 프라이버시 문구와 캐시 삭제 UI 존재
- 근거 패널 없이는 action track이 보이지 않도록 설계 가능

## Codex에게 바로 맡길 일

- safety middleware 구현
- low-confidence UI 설계
- privacy notice/consent modal 구현
- cache delete flow 구현
