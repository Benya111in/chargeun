# 23_MASTER_TASK_BOARD

## 분야별 담당 목록

| 분야 | P0 | P1 | 산출물 |
|---|---|---|---|
| 제품/UX | 사용자 흐름, 트랙 정의, Panic Mode | 튜토리얼 | 와이어프레임 |
| mac 네이티브 | 캡처/오디오/권한 | 소스 전환 | 캡처 브리지 |
| 버퍼/플레이어 | 4초 지연, 다시보기 | auto-pause | Shadow Player |
| 인식 파이프라인 | ASR/OCR/keyframe | tracking | perception cache |
| 분류/세그먼트 | hazard, phase, boundary | fine-tuning heuristics | segment engine |
| 규칙/grounding | fire/earthquake rules | rule editor | grounded explanations |
| LLM | schema, prompts, retries | nightly refinement | JSON explanations |
| 음성 | intent buttons, TTS | speech input polish | voice explain |
| 프론트엔드 | HUD, Shadow UI, evidence | animations | polished app |
| QA/데모 | eval set, rehearsal | export tools | stable demo |

## 오늘 당장 할 일

1. monorepo + Tauri 생성
2. ScreenCaptureKit preview 켜기
3. Shadow Player shell 만들기
4. fire/earthquake rules json 넣기
5. SegmentCard 정적 UI 만들기
6. LLM schema 연결
7. demo script 따라 1회 end-to-end

## 48시간 안에 끝내야 할 핵심

- 캡처
- Shadow Player
- rules
- track card
- Panic Mode
- evidence drawer
