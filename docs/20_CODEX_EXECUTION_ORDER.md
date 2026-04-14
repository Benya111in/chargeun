# 20_CODEX_EXECUTION_ORDER

## 목적

맥북 로컬 Codex가 어디서부터 손대야 하는지 순서를 고정한다. 이 순서를 최대한 유지한다.

## Phase 0. 문서 읽기와 저장소 생성
- 이 ZIP의 모든 문서를 `docs/`로 복사
- monorepo/Tauri 부트스트랩
- shared types 패키지 생성
- PROGRESS/DECISIONS/KNOWN_ISSUES 생성

## Phase 1. macOS 캡처 경로
- ScreenCaptureKit 권한/선택기/세션
- 프레임/오디오 이벤트 브리지
- live preview 동작 확인

## Phase 2. Shadow Player
- 링버퍼
- 4초 지연 재생
- 수동 pause/seek/replay
- segment marker 자리 만들기

## Phase 3. rule KB
- 화재/지진 공식 행동요령 JSON화
- schema validator
- grounding matcher

## Phase 4. perception pipeline
- frame sampler
- ASR
- OCR
- object hints
- cache

## Phase 5. hazard + segment engine
- 규칙 기반 1차
- 모델 기반 2차
- segment state machine
- low confidence fallback

## Phase 6. track generation
- basic/easy/action/reason/caregiver/report
- do_not
- evidence drawer 연동

## Phase 7. UI polish
- Shadow Player UI
- SegmentCard
- Panic Mode
- track tabs
- evidence drawer

## Phase 8. voice
- intent buttons
- realtime or near-realtime voice explain
- transcript bubble

## Phase 9. QA
- eval clips
- grounding audit
- demo rehearsal

## Phase 10. 발표용 마감
- demo mode
- prerecorded backup
- export screenshots
- 발표 대본 반영

## 각 Phase 완료 정의

### Phase 1 완료
- 캡처 시작/정지 가능
- preview 보임
- 앱 안 죽음

### Phase 2 완료
- 4초 지연 동작
- 재생 제어 가능

### Phase 3 완료
- rules json과 matcher 완성

### Phase 4 완료
- ASR/OCR/keyframe bundle 생성

### Phase 5 완료
- 세그먼트가 생성됨

### Phase 6 완료
- 트랙 카드가 화면에 뜸

### Phase 7 완료
- 대회용 수준의 화면 polish

### Phase 8 완료
- 최소 4개 intent 응답 가능

### Phase 9 완료
- 10회 리허설 성공

## Codex 운영 팁

- 항상 가장 눈에 띄는 데모 경로부터 완성한다.
- 새 기능을 넣을 때마다 시연 흐름이 깨지지 않는지 먼저 본다.
- 막히면 기능을 덜어내고 시연 루트를 고정한다.
