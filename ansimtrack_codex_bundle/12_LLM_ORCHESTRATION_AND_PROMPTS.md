# 12_LLM_ORCHESTRATION_AND_PROMPTS

## 목표

LLM을 **창의적 생성기**가 아니라 **구조화된 설명 엔진**으로 사용한다.

## 기본 원칙

- action은 자유 생성 금지
- 반드시 matched official rule 기반
- strict JSON schema 출력
- confidence가 낮으면 안전 fallback
- prompt는 짧고 deterministic하게

## 권장 역할 분리

### 1. Segment Reasoner
입력:
- keyframes
- ASR chunk
- OCR tokens
- previous segment state
- candidate rules

출력:
- hazard
- phase
- segment boundary
- matched rule ids
- overlay targets

### 2. Track Generator
입력:
- current segment
- matched rules
- mode requirements

출력:
- 6개 트랙 문장
- do_not
- confidence
- safety mode

### 3. Voice Re-explainer
입력:
- current segment explanation
- user intent

출력:
- 짧은 음성 답변 1개

## Segment Reasoner 프롬프트 골격

```text
System:
You analyze cognitively accessible disaster-video segments.
Never invent emergency actions.
Use only supplied evidence and candidate official rules.
Return strict JSON.

User:
- recent keyframes
- ASR text
- OCR tokens
- previous segment
- candidate_rules
```

## Track Generator 프롬프트 골격

```text
System:
You rewrite grounded disaster rules into multiple explanation tracks.
Constraints:
- one action per segment
- easy track must use simpler words
- reason track must explain why in one sentence
- report track must be directly speakable
- if grounding weak, mark safety_mode=review_official
Return strict JSON.

User:
- hazard
- phase
- scene summary
- matched_rules
- ui_language=ko
```

## Voice Re-explainer 프롬프트 골격

```text
System:
You answer only from the current grounded segment.
Keep answers short and calm.
Never add rules that are not in the supplied segment.

User:
- user_intent
- current_tracks
- official_rule_ids
```

## schema 예시

```json
{
  "hazard": "fire",
  "phase": "route_selection",
  "official_rule_ids": ["KR_FIRE_03"],
  "confidence": 0.92,
  "safety_mode": "grounded",
  "tracks": {
    "basic": "...",
    "easy": "...",
    "action": "...",
    "reason": "...",
    "caregiver": "...",
    "report": "..."
  },
  "do_not": "..."
}
```

## 모델 호출 정책

- 고빈도 경로: 가벼운 모델 우선
- 재분석: 더 큰 모델
- 음성: realtime model
- 모든 응답은 schema validation 후 캐시

## 실패 처리

- schema parse 실패 -> 1회 재시도
- grounding 누락 -> action/report 비활성화
- confidence 낮음 -> review_official
- timeout -> 이전 세그먼트 유지 + 로딩 배지

## 완료 기준

- prompts 디렉터리 정리
- schema validation 통과
- 20개 샘플에서 일관된 JSON 형식 반환
- hallucinated action 0건

## Codex에게 바로 맡길 일

- prompts 작성
- zod/json schema 정의
- orchestrator 구현
- caching/retry/timeout 정책 구현
