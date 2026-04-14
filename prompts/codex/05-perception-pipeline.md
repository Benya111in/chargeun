# 05 Perception Pipeline

## 사용 시점

frame sampler, OCR/ASR adapter, cache, `PerceptionPacket` 생성 경로를 만들거나 연결할 때 사용한다.

## Source Docs

- `docs/09_PERCEPTION_PIPELINE.md`
- `docs/16_DATA_MODELS_AND_API_CONTRACTS.md`
- `docs/25_CODEX_PROMPTS_BY_DOMAIN.md`

## Prompt

```text
workers/perception 또는 workers/media-worker 에 perception pipeline 초안을 만들어라.

목표:
- frame sampler
- ASR adapter
- OCR adapter
- keyframe cache
- PerceptionPacket 생성

요구사항:
- 기본 1fps sampling, 이벤트 시 burst sampling 구조
- audio 없을 때도 동작
- OCR tokens, ASR text, keyframe list, object hints schema 포함
- 캐시 저장 경로와 정리 정책 포함

아직 완벽한 모델 정확도보다 파이프라인 연결과 관찰 데이터 형태 정의를 우선해라.
```
