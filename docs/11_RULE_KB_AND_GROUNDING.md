# 11_RULE_KB_AND_GROUNDING

## 목표

행동 지시를 반드시 공식 재난행동요령에 근거시키는 지식베이스를 만든다.

## rule 저장 단위

```json
{
  "rule_id": "KR_FIRE_03",
  "hazard": "fire",
  "phase": "route_selection",
  "when": ["연기 확인", "출구 확인"],
  "action": "계단으로 대피하거나 창문으로 구조를 요청합니다.",
  "do_not": "엘리베이터를 타지 않습니다.",
  "why": "엘리베이터는 정전이나 연기 유입으로 위험할 수 있습니다.",
  "caregiver": "주변의 어린이와 노약자를 먼저 확인합니다.",
  "report_script": "안전한 곳으로 이동한 뒤 119에 장소와 상황을 말합니다."
}
```

## 데이터 수집 과업

### 화재
- 공식 화재 국민행동요령 문장 분해
- phase별 rule 분할
- 행동/금지/이유/보호자/신고 스크립트 정리

### 지진
- 공식 지진 국민행동요령 문장 분해
- 장소별/상황별 분기 정리
- phase별 rule 매핑

## 지식베이스 규칙

- action은 원문 의미를 벗어나지 않는다
- do_not는 없으면 빈 문자열 허용
- caregiver/report는 상황 없으면 optional
- 모든 rule에는 source_title, source_url, updated_at 포함
- rule 수정 시 changelog 남김

## grounding 절차

1. hazard와 phase가 정해진다
2. 해당 hazard/phase의 rule 후보를 좁힌다
3. scene evidence와 매칭 점수를 계산한다
4. 가장 적절한 rule 1~3개를 선택한다
5. tracks 생성 시 선택한 rule만 사용한다

## rule 매칭 점수 요소

- hazard 일치
- phase 일치
- when keywords 일치
- object hints 일치
- ASR/OCR 단어 일치
- previous rule continuity

## 실패 시 fallback

- grounded rule 없으면 action 출력 금지
- “공식 행동요령을 직접 확인하세요” 경고 배지 표시
- 근거 패널 자동 열기

## 완료 기준

- 화재/지진 각각 최소 12개 rule
- action/do_not/why/caregiver/report 필드 정리
- JSON schema validation 통과
- grounding unit test 보유

## Codex에게 바로 맡길 일

- `data/rules/fire_rules.json`, `earthquake_rules.json` 작성
- schema validator 작성
- grounding matcher 작성
- rules changelog 작성
