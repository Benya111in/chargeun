# WORK_QUEUE

## 운영 규칙

- 이 파일의 가장 위 `pending` 항목부터 순서대로 구현한다.
- 각 항목이 끝나면 검증, `PROGRESS.md`/`DECISIONS.md`/`KNOWN_ISSUES.md` 갱신, git commit까지 한 묶음으로 처리한다.
- 다음 항목은 이전 항목이 `done`으로 바뀐 직후 바로 시작한다.
- 기준 문서:
  - 순서: `docs/20_CODEX_EXECUTION_ORDER.md`
  - 제품 제약: `docs/00_START_HERE.md`
  - 세부 요구사항: 각 도메인 문서

## Queue

1. `done` macOS native command를 Swift foundation에 직접 연결
   - source docs: `docs/05_NATIVE_CAPTURE_MAC.md`, `docs/20_CODEX_EXECUTION_ORDER.md`, `docs/25_CODEX_PROMPTS_BY_DOMAIN.md`
   - goal: Tauri `enumerate/start/stop`가 seeded state가 아니라 Swift `MacCaptureCoordinator` 기반 결과를 사용

2. `done` native frame/audio preview bridge
   - source docs: `docs/05_NATIVE_CAPTURE_MAC.md`, `docs/08_SHADOW_PLAYER_AND_BUFFER_ENGINE.md`
   - goal: native preview/frame 이벤트를 앱으로 보내고 replay lane과 분리 유지

3. `done` browser/native preview를 shadow/perception 입력으로 분기
   - source docs: `docs/07_BROWSER_CAPTURE_FALLBACK.md`, `docs/08_SHADOW_PLAYER_AND_BUFFER_ENGINE.md`, `docs/09_PERCEPTION_PIPELINE.md`
   - goal: preview input과 shadow input을 같은 contract 아래로 정리

4. `done` rule KB matcher 완성
   - source docs: `docs/11_RULE_KB_AND_GROUNDING.md`, `docs/16_DATA_MODELS_AND_API_CONTRACTS.md`
   - goal: fire/earthquake rules를 실제 matcher로 연결

5. `done` perception pipeline foundation
   - source docs: `docs/09_PERCEPTION_PIPELINE.md`, `docs/16_DATA_MODELS_AND_API_CONTRACTS.md`
   - goal: frame sampler, OCR/ASR adapter shell, PerceptionPacket 생성

6. `done` hazard classifier + segment engine
   - source docs: `docs/10_HAZARD_CLASSIFIER_AND_SEGMENT_ENGINE.md`
   - goal: segment state machine과 low-confidence fallback

7. `done` grounded track generation
   - source docs: `docs/12_LLM_ORCHESTRATION_AND_PROMPTS.md`, `docs/11_RULE_KB_AND_GROUNDING.md`
   - goal: segment + evidence + rules에서 track JSON 생성

8. `done` voice/TTS path
   - source docs: `docs/13_VOICE_REALTIME_AND_TTS.md`
   - goal: 최소 4개 intent에 대한 near-realtime voice explain

9. `done` frontend polish and evidence flow
   - source docs: `docs/04_PRODUCT_UX_ACCESSIBILITY_REQUIREMENTS.md`, `docs/14_FRONTEND_PLAYER_UI.md`
   - goal: SegmentCard, Panic Mode, evidence drawer polish

10. `done` storage/jobs skeleton
    - source docs: `docs/15_BACKEND_STORAGE_AND_JOBS.md`
    - goal: session log/export, local job skeleton

11. `done` safety/privacy/compliance pass
    - source docs: `docs/17_SAFETY_PRIVACY_AND_COMPLIANCE.md`
    - goal: guardrails, privacy defaults, local-first constraints 확인

12. `done` evaluation and QA tooling
    - source docs: `docs/18_EVALUATION_AND_QA.md`, `docs/21_RELEASE_CHECKLIST.md`
    - goal: eval clips, grounding audit, rehearsal checklist

13. `pending` demo runbook and backup mode
    - source docs: `docs/19_DEMO_RUNBOOK_AND_PITCH.md`
    - goal: prerecorded backup path, demo script alignment

14. `pending` post-demo backlog triage
    - source docs: `docs/22_POST_DEMO_BACKLOG.md`
    - goal: 대회 이후 backlog 정리
