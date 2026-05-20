# DECISIONS

## 2026-05-20

### D-057 browser live frame clock은 세션 기준으로 정규화한다

- 이유: 브라우저 화면공유 sample에 `Date.now()` epoch timestamp가 들어가면 Shadow buffer marker, frame window, perception window가 같은 시간축을 공유하지 못한다.
- 영향: browser sampler는 `performance.now()` 기준 세션 경과 시간을 `tsMs`로 기록한다. canvas 샘플링 실패는 live-lab 전체 렌더링 실패가 아니라 해당 frame drop으로 처리하고, 합성 화면공유 E2E가 이 경로를 계속 검증한다.

### D-058 구조적 멀티트랙은 계약 우선으로 병행 도입한다

- 이유: V2A식 멀티트랙 생성 기술을 바로 LLM 호출로 붙이면 학습자 행동 지시 안전성이 흔들릴 수 있다.
- 영향: `StructuredLearningExplanation v1`을 새 표준 계약으로 추가하되, 기존 `SegmentExplanation`과 학습자 UI는 유지한다. 현재 단계에서는 deterministic adapter로 기존 시나리오를 새 계약에 투영하고, LLM structured output은 QA 실험 단계로 미룬다.

### D-059 억제 후보와 근거 출처는 진행자/QA 화면에만 노출한다

- 이유: suppressed candidate, visual/OCR/ASR/rule evidence, validation status는 안전 감사와 교사용 설명에는 필요하지만 학습자에게는 인지부하가 된다.
- 영향: `/scenario/:id`는 쉬운말, 행동 카드, teach-back 중심을 유지한다. `/teacher`와 `/qa`에서만 action card rule id, evidence source, suppressed candidates, LRS 검수 항목을 확인한다.

### D-060 학습자 행동 카드는 structured validation을 통과한 경우에만 노출한다

- 이유: 수동 scenario seed에 `actionSteps`가 남아 있어도 structured status가 `needs_review` 또는 `blocked`이면 학습자에게 행동 지시처럼 보이면 안 된다.
- 영향: `/scenario/:id`는 `StructuredLearningExplanation`의 `validated`, `learnerSafe`, `hasGroundedAction`, `requiresHumanReview=false` 조건을 통과한 action card만 보여 준다. 검토 상태에서는 공식 안내 확인 fallback만 보이고 teach-back action 선택도 숨긴다.

### D-061 로컬 웹 시현 서버도 media range 요청을 지원한다

- 이유: 브라우저 video seek는 mp4 byte range 응답에 의존한다. 로컬 preview 서버가 range를 지원하지 않으면 장면 전환이 0초부터 다시 재생되어 실제 학습 흐름 검증이 왜곡된다.
- 영향: `pnpm web:preview`는 `Range` 요청에 `206 Partial Content`를 반환하고 `.mp4` content type을 명시한다. `/scenario` 장면 이동과 `/demo` 호환 경로는 로컬에서도 실제 segment start time으로 이동한다.

### D-062 확인 질문 오답은 행동 문장으로 쓰지 않는다

- 이유: `엘리베이터는 타지 않아요`, `바로 뛰지 않아요` 같은 do-not 문장은 안전 행동이라서 확인 질문의 오답으로 보이면 정답이 두 개처럼 읽힌다.
- 영향: 학습자 확인 질문의 오답은 `잘 모르겠어요`처럼 정답을 노출하는 고정 선택지가 아니라, 현재 장면과 관련 있지만 정답 행동 카드와 충돌하지 않는 대상/장소/상태로 둔다. do-not 행동은 행동 카드나 교사 설명에는 남길 수 있지만 quiz answer option으로는 쓰지 않는다.

### D-063 Teach-back 선택지는 구조적 계약을 통과해야 한다

- 이유: `answerOptions`를 자유 텍스트로 두면 LLM 또는 사람이 다시 정답 같은 오답, 고정 `잘 모르겠어요`, 행동 지시형 오답을 만들 수 있다.
- 영향: `StructuredLearningExplanation v1`에 `tracks.teachBack`을 추가하고, validated segment는 teach-back을 반드시 포함해야 한다. 선택지는 `correct | contrast` role, `object | person | place | signal | state` kind, `correctOptionId`, 공식 rule id를 가진다. schema는 정답 1개, 동일 kind, `잘 모르겠어요` 금지, 행동 지시형 label 금지, 행동 카드 label 중복 금지, 정답 option과 행동 카드의 rule id 연결을 강제한다. UI는 검증된 structured teach-back에서만 질문과 선택지를 파생한다.

### D-064 마지막 장면은 다음 장면으로 순환하지 않는다

- 이유: 마지막 장면에서 `다음 장면 보기`가 첫 장면으로 돌아가면 학습자가 한 연습이 끝났다는 신호를 받지 못한다.
- 영향: 마지막 장면에서는 정답 선택 후 `다음 연습 보기`, 다음 연습 제목/설명 링크, `처음부터 다시 보기`를 노출한다. 정답 전에는 다음 연습 이동을 비활성화하고, 일반 장면에서만 `다음 장면 보기`를 유지한다.

### D-065 홈에는 재난 주제만 노출하고 보조 연습은 숨긴다

- 이유: `소리 없이 보기`는 접근성 보조 조건이지 학습자가 고를 독립 재난 주제가 아니다. 홈에서 화재, 지진, 보조 조건이 같은 레벨로 보이면 학습 흐름의 중심이 흐려진다.
- 영향: `/`는 `화재가 났을 때`, `지진이 났을 때`처럼 재난 상황 단위만 보여 준다. `fire-visual-flow`는 데이터와 직접 route는 유지하되 `showOnHome=false`, `practiceSequence=false`로 기본 학습 큐에서 제외한다.

### D-066 부정 행동은 행동 카드가 아니라 보존 후보로 분리한다

- 이유: `엘리베이터는 타지 않아요`처럼 안전한 금지 문장은 중요하지만, 확인 질문이나 행동 카드와 같은 층에 두면 정답이 두 개처럼 읽힌다.
- 영향: `buildStructuredLearningExplanation`의 action card 생성 단계가 부정/금지형 learner step을 자동 제외하고 `suppressedCandidates`로 보관한다. 학습자 화면은 해야 할 행동만 카드로 보여 주고, 헷갈릴 수 있는 선택은 별도 패널에 `지금은 고르지 않아요`로 표시한다.

### D-067 지진은 하나의 주제 안에서 연속 단계로 다룬다

- 이유: `흔들릴 때`와 `흔들림이 멈춘 뒤`는 서로 다른 주제가 아니라 지진 행동 순서의 앞뒤 단계다.
- 영향: 홈에는 `지진이 났을 때` 한 카드만 보이고, 내부에 `1. 흔들릴 때`, `2. 멈춘 뒤`를 명시한다. `earthquake-protect-flow` 마지막 장면의 다음 연습은 `earthquake-after-flow`로 이어진다.

### D-068 공식 자료 RAG는 행동 생성기가 아니라 근거 보강 계층이다

- 이유: SafeTV, 국민안전24, 한국장애인개발원 자료는 공신력 있는 근거지만, 검색 결과만으로 학습자 행동 지시를 새로 만들면 장면 오인식과 자동화 편향 위험이 남는다.
- 영향: `official_sources` catalog와 `retrieveOfficialSources`는 `StructuredLearningExplanation.evidence.ruleEvidence`를 보강한다. 학습자 action card는 여전히 `matchGroundedRules`와 structured validation을 통과한 경우에만 노출한다.

### D-069 공식 원문/영상은 metadata와 paraphrase chunk로 관리한다

- 이유: 공식 페이지와 영상은 라이선스, 갱신, 원문 저작권 리스크가 있으므로 저장소에 원문 전체나 raw mp4를 RAG 자료로 넣는 것은 부적절하다.
- 영향: 저장소에는 source metadata, canonical URL, 짧은 paraphrase/easyKo, rule id 연결만 tracked한다. raw 영상은 local manual/cache ignored 경로로 두고, 배포 콘텐츠로 쓰려면 별도 라이선스 검토와 출처 표기가 필요하다.

### D-070 학습용 장면은 너무 짧게 끊지 않는다

- 이유: 2~4초 단위로 과하게 끊으면 영상 장면과 설명이 계속 어긋나고, 느린학습자에게 필요한 것은 한 판단 지점을 충분히 보고 멈추는 것이다.
- 영향: 화재 첫 장면은 `문 닫기 + 계단 찾기`를 하나의 긴 window로 묶고, 지진은 흔들릴 때와 멈춘 뒤를 순서형 연습으로 이어 간다. 장면 분절 기준은 "한 행동 판단 지점"이며, 화면이 바뀌었다는 이유만으로 새 학습 질문을 만들지 않는다.

### D-071 코스 마지막은 다음 연습으로 순환하지 않는다

- 이유: 마지막 연습 뒤에 다시 화재로 돌아가면 학습자가 끝났다는 신호를 받지 못하고, 반복 루프가 의도된 순서처럼 보인다.
- 영향: `practiceSequenceScenarios`의 마지막 scenario는 `nextPractice=null`로 처리한다. 마지막 장면 정답 후에는 `오늘 연습 끝내기`, 처음 화면 링크, 처음부터 다시 보기만 보여 준다.

### D-072 학습자는 설비를 직접 조작하는 문장을 보지 않는다

- 이유: 지진 후 가스와 전기는 공식 행동요령에 포함되지만, 느린학습자용 학습 화면에서 `끄고`, `확인합니다`가 직접 조작 지시처럼 보이면 위험하다.
- 영향: `KR_EQ_05`와 관련 learner copy는 `나갈 길 확인`, `가스 냄새/전기 이상은 직접 만지지 말고 어른이나 현장 안내에 알림`으로 통일한다. 보존 후보도 긴 금지문 대신 짧은 대비 후보로 변환한다.

### D-073 모바일 학습자 화면은 행동 카드 우선이다

- 이유: 작은 화면에서 멀티트랙 요약 배지가 행동 카드를 아래로 밀면, 학습자가 가장 중요한 `지금 할 일`을 늦게 본다.
- 영향: 멀티트랙 요약 배지는 desktop 이상에서만 보여 주고, 모바일에서는 설명 다음에 행동 카드와 확인 질문이 먼저 보이게 한다. 자동 정지 후 focus는 설명 heading으로 이동한다.

### D-074 공개 공유 링크는 소개 -> 화재 -> 지진 -> 설문 흐름으로 고정한다

- 이유: GitHub Pages로 공유할 때 첫 화면부터 여러 연습 카드, 내부 링크, 상단 네비게이션이 보이면 사용자가 어디를 눌러야 하는지 흔들린다. 이번 링크는 제품 전체 탐색이 아니라 한 번의 학습 체험을 끝까지 보게 하는 목적이다.
- 영향: `/`는 서비스 소개와 `학습 체험하기` CTA만 노출한다. CTA는 `#/scenario/fire-grounded-flow`로 이동하고, 화재 완료 후 지진으로 이어진다. 마지막 연습 종료 시 설문 요청 모달을 보여 주며, 기본 구글폼 URL은 `https://forms.gle/nzCofnS9KosQ3X566`이다. 필요하면 `VITE_SURVEY_FORM_URL` 환경변수로 덮어쓴다.

## 2026-04-14

### D-001 macOS 단일 경로 우선

- 이유: 대회용 데모 완성도가 범용성보다 중요하다.
- 영향: Windows는 contract/stub 수준으로 두고, 실제 캡처/Shadow Player 연결은 macOS 중심으로 진행한다.

### D-002 로컬 우선 + grounded action 강제

- 이유: 재난 행동 지시는 공식 근거 없이는 출력하면 안 된다.
- 영향: `action`, `report`, `do_not`는 rule id 없으면 UI에서 숨기거나 review 모드로 전환한다.

### D-003 초기 vertical slice는 mock perception 기반

- 이유: 빈 저장소에서 캡처, 모델, UI를 동시에 여는 것보다 데모 흐름을 먼저 고정하는 편이 빠르다.
- 영향: 첫 구현은 검증된 mock segment/explanation/rules로 UI와 safety 흐름을 완성하고, 이후 native capture와 worker 입력을 교체한다.

### D-004 Shadow buffer는 독립 패키지로 먼저 고정

- 이유: ScreenCaptureKit 실연결 전에도 4초 지연, 링버퍼, 세그먼트 replay 동작을 단위 테스트로 검증할 수 있어야 한다.
- 영향: UI는 당분간 mock capture/replay lane을 사용하고, native capture bridge가 준비되면 동일한 buffer contract에 frame 입력만 교체한다.

### D-005 live preview와 replay lane은 분리 유지

- 이유: Shadow Player가 본체이므로 live preview 확보 때문에 replay 동작이나 4초 지연 의미가 흔들리면 안 된다.
- 영향: browser fallback은 먼저 live preview만 담당하고, Shadow Player는 기존 mock replay buffer를 유지한다. 이후 native/browser frame source를 붙일 때도 같은 분리 원칙을 유지한다.

### D-006 native 검증은 smoke executable 우선

- 이유: 현재 로컬 Swift toolchain에서는 `XCTest`와 `Testing` 모듈이 바로 보장되지 않아 `swift test` 경로가 불안정하다.
- 영향: `native/mac-capture`는 우선 `swift build`와 `swift run MacCaptureSmoke`를 focused verification 경로로 사용하고, 정식 test target은 추후 툴체인 제약이 풀리면 복원한다.

### D-007 Tauri command surface를 먼저 고정

- 이유: React UI와 native foundation을 동시에 직접 엮기보다 command contract를 먼저 고정하면 단계별 검증과 교체가 쉽다.
- 영향: 현재 Tauri는 source enumerate/start/stop을 자체 상태로 먼저 제공하고, 다음 단계에서 이 command 내부를 Swift `MacCaptureCoordinator` 호출로 치환한다.

### D-008 Swift bridge는 우선 executable 경로로 연결

- 이유: Rust와 Swift를 직접 FFI로 묶기보다 Swift executable을 호출하는 편이 현재 로컬 개발 환경에서 구현 속도와 디버깅성이 높다.
- 영향: Tauri command는 우선 `MacCaptureBridge`를 subprocess로 호출하고, 이후 frame/audio 브리지 단계에서 더 직접적인 연결이 필요해지면 FFI 또는 plugin 경로를 재검토한다.

### D-009 native preview는 저주기 snapshot event로 먼저 연결

- 이유: 실시간 raw frame을 바로 Tauri로 밀어 넣는 경로는 현재 데모 단계에서 비용과 복잡도가 크다.
- 영향: macOS 우선 경로는 우선 low-fps JPEG data URL snapshot을 `capture/frame` 이벤트로 흘리고, Shadow replay lane은 기존 ring buffer와 분리 유지한다.

### D-010 browser/native 입력은 공통 frame sample로 정규화

- 이유: perception, grounding, segment 단계가 입력 원본이 브라우저인지 네이티브인지에 따라 분기되면 후속 구현이 빠르게 꼬인다.
- 영향: 브라우저 fallback도 1fps JPEG sample을 만들고, native snapshot과 같은 `CaptureFrameSample` window를 유지한다. replay lane은 여전히 별도지만 perception seed는 같은 계약을 쓴다.

### D-011 matcher는 현재 문서 drift를 phase alias로 흡수

- 이유: 현재 eval/데모 문서에는 `protect`, `route_selection` 같은 표현이 남아 있고, 실제 rule JSON은 `during_shaking`, `door_control`, `stair_evacuation`처럼 더 구체적인 phase를 쓴다.
- 영향: grounded matcher는 alias를 통해 후보군을 좁히되, phase만으로는 grounded 처리하지 않고 evidence token이 있어야 rule을 선택한다.

### D-012 perception foundation은 로컬 결정론 경로부터 시작

- 이유: 현재 단계에서는 ASR/OCR 정확도보다 packet 구조와 후속 엔진 연결이 더 중요하고, 외부 모델 호출 비용도 아껴야 한다.
- 영향: perception worker는 우선 local frame sampling plan, OCR/ASR shell, text-driven object hint derivation, cache key 생성만 제공하고 실제 모델 adapter는 다음 단계에서 채운다.

### D-013 segment phase는 docs-level 이름을 유지

- 이유: 현재 UI, eval 문서, demo narrative는 `protect`, `route_selection` 같은 상위 phase를 중심으로 정리되어 있다.
- 영향: segment engine은 docs-level phase를 출력하고, grounded matcher가 이를 실제 rule phase alias로 매핑한다.

### D-014 데모 UI도 실제 packet/rule 경로를 사용

- 이유: backend matcher와 segment engine이 따로 놀면 시연 중 안전 fallback과 근거 패널이 어긋난다.
- 영향: demo scenario는 이제 mock `PerceptionPacket`과 rule bundle만 제공하고, 화면에서는 실제 `buildSegmentFromPerception` 및 `buildGroundedExplanation` 결과를 사용한다.

### D-015 voice는 우선 브라우저 TTS fallback으로 제공

- 이유: 현재 단계에서 중요한 것은 intent 버튼을 눌렀을 때 1초 안에 반응이 시작되는 데모 흐름이다.
- 영향: TTS는 우선 `speechSynthesis`를 사용하고, unavailable 환경에서는 transcript 카드만 유지한다. 외부 TTS 모델이나 비용 있는 API는 아직 붙이지 않는다.

### D-016 evidence drawer는 raw packet과 matcher signal을 직접 보여 준다

- 이유: 심사나 협업 상황에서는 "왜 이 규칙이 선택됐는지"가 즉시 드러나야 한다.
- 영향: 근거 패널은 요약 문장 대신 `matchedSignals`, candidate rule score, OCR/ASR/object hints, packet window를 직접 노출한다.

### D-017 storage는 우선 file-backed skeleton으로 시작

- 이유: 현 단계에서 필요한 것은 앱 전체 persistence보다 세션 로그, export, job control의 계약을 먼저 고정하는 것이다.
- 영향: `local-store`는 SQLite schema를 아티팩트로 남기고 실제 메타데이터는 JSONL/export 파일로 먼저 다룬다. 실제 앱 재시작 복원과 SQLite 연결은 후속 slice에서 붙인다.

### D-018 action/report는 evidence drawer와 consent 상태에 종속

- 이유: 재난안전 도메인에서는 행동 문장을 근거 없이 떼어 보여 주면 오해 가능성이 크다.
- 영향: `applySafetyGuardrails`가 low-confidence/missing rule/privacy hold에서는 `review_official`로 강등하고, evidence drawer가 닫혀 있으면 grounded 상태여도 action/report 트랙을 숨긴다. 캡처 시작은 consent modal 확인 뒤에만 허용한다.

### D-019 QA는 raw clip보다 packet fixture audit부터 고정

- 이유: 현재 단계에서는 실제 영상 클립 수집보다 matcher/segment/guardrail drift를 빠르게 잡는 자동 점검이 더 중요하다.
- 영향: eval set은 우선 synthetic `PerceptionPacket` fixture로 관리하고, `pnpm eval:audit`가 hazard/phase/rule/safety fallback을 검사한다. 실제 녹화 클립 walkthrough는 별도 manual log로 추적한다.

### D-020 demo runbook과 backup preset은 코드가 아니라 데이터로 관리

- 이유: 발표 직전에는 시연 순서와 플랜 B를 빠르게 바꿀 수 있어야 하고, 프론트 코드 수정 없이도 발표 흐름을 조정할 수 있어야 한다.
- 영향: `data/demo/runbook.json`과 `data/demo/prerecorded_sessions.json`이 시연 타임라인과 prerecorded preset의 단일 소스가 되고, UI는 이 데이터를 읽어 runbook 패널과 backup mode를 구성한다.

### D-021 post-demo는 확장보다 live path 안정화가 먼저

- 이유: 현재 코드베이스의 가장 큰 리스크는 기능 부족보다 live capture와 persistence의 미연결이다.
- 영향: `docs/22_POST_DEMO_BACKLOG.md`는 이제 확장 아이디어 목록이 아니라 우선순위 문서로 유지하고, P1은 live capture 실시간 연결, SQLite restore, native audio/TTS/STT, manual rehearsal에 배정한다.

### D-022 runtime state와 발표 export는 Tauri command + 브라우저 fallback 이중 경로로 관리

- 이유: 데스크톱 실사용 경로에서는 파일로 남겨야 하고, 브라우저 preview에서도 같은 UX를 검증할 수 있어야 한다.
- 영향: runtime state는 Tauri에서는 `.slowlearner/ui-state.json`, 브라우저에서는 `localStorage`를 사용한다. 발표 자료 export는 Tauri에서는 `.slowlearner/export`에 JSON/PNG를 저장하고, 브라우저에서는 다운로드 fallback을 사용한다.

### D-023 로컬 셋업은 비밀키 없이도 바로 데모 부팅 가능해야 한다

- 이유: 협업 환경에서는 개발자마다 API 키나 글로벌 CLI 준비 상태가 다르므로, 첫 부팅이 외부 의존성 때문에 막히면 진입 비용이 커진다.
- 영향: `pnpm check-env`는 macOS 툴체인과 `.env.example` 존재만 확인하고, 글로벌 `tauri-cli` 대신 workspace의 `@tauri-apps/cli`를 기본 경로로 본다. `.env.example`은 demo backup 모드를 기본 활성화해 비밀키 없이도 시연 경로가 올라오게 유지한다.

### D-024 prompt 자산은 runtime prompt와 Codex 작업 prompt를 분리 관리한다

- 이유: 앱 내부에서 쓰는 짧은 deterministic prompt와 저장소 구현 작업을 위임하는 긴 Codex prompt는 목적과 변경 주기가 다르다.
- 영향: `prompts/*.md`는 segment/track/voice runtime prompt 골격으로 유지하고, `prompts/codex/*.md`는 문서 25의 도메인별 작업 지시문을 파일로 관리한다. `scripts/validate-prompts.ts`는 핵심 grounding/safety 제약과 파일 누락을 빠르게 점검한다.

### D-025 live analysis snapshot은 raw frame 대신 요약 패킷을 저장한다

- 이유: active capture frame의 data URL 전체를 매 refresh마다 저장하면 브라우저 preview와 Tauri runtime 모두에서 용량과 쓰기 비용이 급격히 커진다.
- 영향: live session log는 `sessions.jsonl`에 세션 메타데이터만 append하고, 최신 analysis snapshot은 keyframe count/OCR/ASR/object hint label 중심 summary로 저장한다. 실제 raw frame cache는 capture input window와 runtime export 경로에서만 일시적으로 유지한다.

### D-026 restore는 SQLite 우선, JSON file fallback을 병행한다

- 이유: 제품 단계에서는 SQLite query/restore가 필요하지만, 기존 demo runtime과 브라우저 preview는 파일 fallback이 있어야 전환 비용이 낮다.
- 영향: Tauri는 `runtime.sqlite3`에 `app_settings`, `sessions`, `perception_packets`, `segments`, `segment_explanations`를 기록하고, 동시에 `ui-state.json`과 `live-analysis-latest.json` fallback을 유지한다. 앱 시작 시에는 파일이 있으면 먼저 읽고, 없으면 SQLite에서 마지막 runtime state와 live snapshot을 복원한다.

### D-027 voice runtime은 macOS native 우선, browser/text fallback을 유지한다

- 이유: 데모와 제품화 모두에서 macOS 경로의 일관된 음성 UX가 필요하지만, 마이크 권한/환경 차이 때문에 fallback이 없으면 협업과 시연이 불안정해진다.
- 영향: TTS는 `VoiceRuntimeBridge`의 macOS 시스템 음성을 우선 사용하고, 실패 시 브라우저 `speechSynthesis`, 마지막에는 텍스트 카드로 내려간다. STT는 우선 지원 intent 5개에 맞춘 macOS command-style 인식을 사용하고, 실패 시 브라우저 음성 인식 또는 텍스트 명령 입력으로 전환한다. native preview audio는 ScreenCaptureKit audio callback을 실제 `capture/audio` 이벤트로 노출하되, 아직 PCM persistence나 live ASR 입력까지는 확장하지 않는다.

### D-028 manual QA와 rehearsal 로그는 JSON을 단일 소스로 두고 markdown을 생성한다

- 이유: 팀 단위 검수에서는 사람이 바로 수정할 수 있는 단순한 데이터 형식이 필요하지만, 발표용 체크리스트와 로그 문서도 항상 최신 상태를 유지해야 한다.
- 영향: `data/eval/manual_review_runs.json`과 `data/eval/rehearsal_runs.json`을 단일 입력으로 두고, `pnpm qa:sync`가 `manual_review_log_2026-04-14.md`와 `demo_rehearsal_checklist.md`를 다시 생성한다. 실제 clip walkthrough가 없으면 status는 `pending`/`blocked`로 남기고, generated markdown에서 공백을 숨기지 않는다.

### D-029 actual clip QA는 앱 안에서 바로 기록 가능해야 한다

- 이유: 실제 시연 직전에는 터미널로 JSON을 직접 열어 수정하는 것보다, 현재 세션을 보면서 같은 화면 안에서 walkthrough 결과를 남기는 편이 훨씬 빠르고 협업 실수가 적다.
- 영향: desktop UI는 `QaReviewPanel`에서 fixture별 status/path/notes와 rehearsal checklist를 바로 기록하고, Tauri command가 `data/eval/*runs.json`을 갱신한 뒤 `pnpm qa:sync`를 실행해 markdown 로그까지 맞춘다. 이 경로는 현재 개발 저장소 기준이며, 독립 배포용 bundle persistence와는 아직 분리되어 있다.

### D-030 local clip preview는 QA 입력 path를 그대로 재사용한다

- 이유: 실제 clip 검수에서는 별도 asset registry를 또 관리하기보다, 검수자가 지금 보고 있는 로컬 파일 path를 그대로 preview와 로그에 같이 남기는 편이 가장 빠르고 협업 중 실수가 적다.
- 영향: `QaReviewPanel`은 manual review의 `path` 값을 우선 사용하고, Tauri 실행 시에는 `convertFileSrc`로 `asset:` URL을 만들어 영상 preview를 연다. 브라우저 preview에서는 path 문자열만 유지하며, 실제 자산 배포/복사는 후속 범위로 남긴다.

### D-031 release readiness는 최신 rehearsal 로그에서 바로 파생한다

- 이유: 대회 직전에는 별도 스프레드시트나 문서를 또 맞추기보다, 지금 앱에서 실제로 남긴 rehearsal/manual review 로그를 기준으로 남은 리스크를 바로 보는 편이 빠르고 협업 인수인계도 단순하다.
- 영향: desktop UI는 `QaReviewPanel`에서 latest rehearsal + manual review coverage를 조합해 release checklist snapshot을 계산하고, 미완료 fixture를 우선순위 queue로 재정렬한다. pause/seek 같은 아직 계측되지 않은 항목은 계속 사람 기준 manual verification으로 남긴다.

### D-032 외부 원본 영상은 fixture source reference로만 먼저 등록한다

- 이유: YouTube 같은 외부 영상은 바로 저장소에 내려받아 넣기보다, 어떤 공식 원본에서 어떤 clip을 잘라야 하는지를 먼저 데이터로 남기는 편이 저작권과 협업 측면에서 안전하다.
- 영향: `annotated_segments.json`의 fixture는 optional `sourceReference`를 가질 수 있고, QA 패널은 제목/링크/메모를 보여 준다. 실제 수동 검수는 여전히 로컬로 잘라 둔 mp4/mov path를 manual review input에 별도로 기록한다.

### D-033 실제 QA clip 자산은 tracked template + local override로 관리한다

- 이유: source video의 로컬 경로와 구간 timestamp는 팀원마다 다르고, 실제 mp4/mov clip은 용량과 저작권 측면에서 저장소에 직접 넣기 어렵다.
- 영향: 저장소에는 `source_videos.example.json`, `clip_windows.example.json`, fixture의 `sourceClipPlan`만 tracked로 남기고, 실제 경로와 timestamp는 `*.local.json`에 둔다. `pnpm qa:prepare-clips`가 이를 읽어 `data/eval/clips/*.mp4`를 만들고, Tauri QA workspace는 그 산출물을 자동 preview 후보로 사용한다.

### D-034 초기 clip window는 auto subtitle hit를 시드로 써도 된다

- 이유: 실제 QA clip을 처음 따는 단계에서는 완전 수동 탐색보다 자동 생성 자막의 키워드 hit를 시작점으로 삼는 편이 훨씬 빠르다.
- 영향: `earthquake-desk-001`, `earthquake-after-shaking-001`의 첫 local window는 `책상`, `흔들림이 멈춘 후`, `가스`, `전기` 같은 자막 hit를 기준으로 잡고, 최종 pass/fail은 여전히 사람이 clip과 UI를 보며 확정한다.

### D-035 release runtime은 source tree가 아니라 app-local data를 쓴다

- 이유: 지금까지의 Tauri runtime/QA 경로는 개발 저장소 상대경로에 기대고 있어서, 실제로 번들된 `.app`를 다른 맥북에 옮기면 persistence와 QA workspace가 바로 깨질 위험이 컸다.
- 영향: debug build는 기존 협업 흐름을 위해 저장소 `.slowlearner`와 `data/eval`을 계속 사용하지만, release/package build는 `app_local_data_dir` 아래 runtime/SQLite/QA JSON을 쓴다. eval fixture와 seed QA JSON은 `bundle.resources`로 앱 리소스에 포함하고, standalone 앱은 첫 실행 시 이를 local seed로 복사해 사용한다.

### D-036 live Shadow는 full stream 대신 sampled frame부터 직결한다

- 이유: 현재 native/browser 공통으로 가장 안정적으로 들어오는 것은 snapshot/dataURL 기반 frame sample이고, 이를 먼저 Shadow Player에 꽂아야 live path의 본질인 "4초 붙잡아 주기"를 실제 제품 화면에서 검증할 수 있다.
- 영향: Shadow buffer는 이제 frame payload를 보존하고, `useShadowLivePlayer`가 `captureInput.frameWindow`를 실제 replay/live thumbnail로 사용한다. 다만 현재는 encoded video/audio 동기화 재생이 아니라 sampled frame replay이므로, 연속 영상 품질과 live audio ASR 연동은 후속 범위로 남긴다.

### D-037 live OCR은 macOS Vision bridge를 우선 사용한다

- 이유: 외부 모델 호출 없이도 한글/영문 자막·표지판 인식 신호를 바로 얻을 수 있고, 현재 저장소 구조에서는 latest frame data URL을 Tauri가 받아 네이티브 OCR로 넘기는 경로가 가장 구현 비용이 낮다.
- 영향: frontend는 `useLiveOcrTokens`로 latest frame OCR을 누적하고, Tauri는 `extract_ocr_tokens` command에서 data URL을 임시 이미지로 푼 뒤 `MacCaptureBridge ocr-image`를 호출한다. 현재 live perception의 text signal은 OCR 우선이며, audio transcription은 별도 후속 slice로 남긴다.

### D-038 live ASR은 chunk file + 안전 fallback 2단계로 둔다

- 이유: ScreenCaptureKit audio callback은 metadata만으로는 ASR에 쓸 수 없고, macOS `Speech` 권한 요청은 현재 CLI bridge 구조에서 TCC privacy crash를 일으킬 수 있다.
- 영향: native audio preview는 1.5초 내외 `.caf` chunk file을 temp에 저장하고 `pcmRef`로 UI에 전달한다. Tauri는 먼저 local Speech bridge 결과를 읽되, bridge가 번들 식별자/usage description 없이 실행되는 환경에서는 권한 요청을 시도하지 않고 `unavailable`로 안전하게 빠진다. `OPENAI_API_KEY` 또는 `SLOWLEARNER_OPENAI_API_KEY`가 있으면 `gpt-4o-mini-transcribe`로 fallback하고, 없으면 live path는 OCR/visual 중심으로 유지한다.

### D-039 fire/review QA clip도 tracked metadata + local asset로 마감한다

- 이유: release 직전에는 earthquake만 actual clip이 있고 fire/review가 demo-fixture로 남아 있으면 manual QA queue와 rehearsal 로그가 계속 비현실적으로 남는다.
- 영향: fire fixture 2개는 안전한TV 공식 원본 `[사회재난] 아파트 화재 시 이렇게 행동합시다`를 tracked source로 등록하고, local `data/eval/sources/*.mp4`에서 실제 clip을 잘라 `data/eval/clips/*.mp4`에 준비한다. review fallback fixture는 의도적으로 근거 없는 장면이 목적이므로 local generated blank clip을 허용하되, pass/fail은 여전히 UI walkthrough로만 확정한다.

### D-040 브라우저 데모는 상태 변화가 반드시 영상 변화로 보여야 한다

- 이유: localhost 시연에서 실제 capture가 비활성인 상태에서는 버튼 클릭이 텍스트/근거만 바꾸면, 첫 인상상 "아무것도 안 된다"로 읽히기 쉽다.
- 영향: demo preset은 scenario별 정적 frame 세트를 함께 가지고, `ShadowVideoStage`는 live frame이 없을 때 replay/live thumbnail에 이 frame을 cursor 기준으로 렌더링한다. 실제 live capture가 붙으면 이 fallback은 자동으로 비활성화된다.

### D-041 검증 화면과 발표 화면을 분리한다

- 이유: 운영자용 검증 UI는 상태와 패널이 많아야 하지만, 발표 순간에는 실제 영상과 핵심 설명만 크게 보여야 한다.
- 영향: `/`는 기존 verification workspace로 유지하고, `/demo`는 실제 mp4 클립과 큰 설명만 노출하는 theater route로 분리한다. `/demo`의 재생 버튼은 Shadow mock control이 아니라 HTML5 `video.play()`에 직접 연결한다.

### D-042 발표 화면은 QA 컷이 아니라 롱클립을 쓴다

- 이유: QA fixture용 4~8초 clip은 검수에는 적합하지만, 발표 화면에 그대로 쓰면 영상이 너무 빨리 끝나 제품 인상이 불안정해진다.
- 영향: `/demo`는 `data/eval/clips`의 짧은 QA 샘플이 아니라, 같은 원본에서 다시 추출한 24~30초 발표용 클립을 `public/demo-video`에 둔다. QA/eval 경로와 발표 경로의 clip 길이는 분리해서 관리한다.

### D-043 발표 화면도 멀티트랙과 grounded 정보를 같이 보여 준다

- 이유: 발표 중 실제 영상 위에 한 문장만 크게 띄우면 continuity가 약하고, 지금까지 구현한 멀티트랙 설명·근거·안전 fallback 가치가 잘 드러나지 않는다.
- 영향: `/demo`는 큰 영상 중심은 유지하되, 하단과 우측에서 cue timeline, track별 설명, 공식 rule/source, 관찰 신호, safety warning을 동시에 보여 준다. 검증 화면 수준의 조작 복잡도는 피하고, 발표자가 바로 읽을 수 있는 밀도로만 남긴다.

### D-044 발표 화면의 기본 단위는 문장보다 장면이다

- 이유: 긴 영상 위에 하나의 설명만 고정하면 실제 장면 전환과 설명 전환이 어긋나서 데모가 끊겨 보인다.
- 영향: `/demo`는 영상 전체를 한 번에 설명하지 않고, 미리 정의한 scene window 단위로만 재생한다. 각 window는 끝에서 자동 정지하고, 그때 해당 장면의 grounded explanation과 관찰 신호만 보여 준 뒤 `다음 장면 재생`으로 이어 간다.

### D-045 `/demo`는 사용자용이고 구현 설명은 숨긴다

- 이유: 느린학습자가 보는 화면에 grounding, signal, fallback 같은 내부 용어가 섞이면 핵심 행동보다 시스템 설명이 먼저 읽힌다.
- 영향: `/demo`에는 영상, 현재 장면, 쉬운 설명, 하지 말 것, 다음 행동만 남기고 근거·운영자·검증 정보는 `/` workspace에만 둔다.

### D-046 rule id는 근거가 아니라 후보 단서로만 취급한다

- 이유: caller가 넣은 `officialRuleIds`만으로 행동 문장을 출력하면 실제 장면 근거 없이 재난 행동을 확정할 수 있다.
- 영향: grounded rule 선택은 현재 ASR/OCR/object/UI evidence의 `when:` 또는 `evidence:` 신호가 있어야만 통과한다. `segment:`와 `continuity:`는 점수 보조로만 쓰고 단독 grounding 근거가 될 수 없다.

### D-047 QA 브라우저 fallback도 seed 데이터를 로드한다

- 이유: localhost 검증에서 QA workspace가 비어 보이면 실제 fixture와 release checklist 흐름을 검수할 수 없다.
- 영향: Tauri가 아닌 브라우저 실행도 tracked `data/eval/*.json` seed를 localStorage에 초기화한다. 단, local filesystem clip preview는 브라우저에서 깨진 video로 열지 않고 데스크톱 앱 전용으로 안내한다.

### D-048 capture 시작 실패는 세션 시작으로 취급하지 않는다

- 이유: 권한 취소나 native unavailable 상태에서 "캡처를 시작했습니다"가 나오면 사용자가 실제 분석이 된다고 오해한다.
- 영향: capture start action은 성공/실패 결과를 반환하고, privacy notice와 restored-live 표시 전환은 성공한 경우에만 적용한다. 이미 세션이 실행 중이면 다른 capture start를 막는다.

### D-049 live buffer와 job queue는 비동기 순서 흔들림을 방어한다

- 이유: frame/event/job은 실제 런타임에서 순서가 어긋나거나 supersede될 수 있고, 이때 live edge나 promise가 조용히 망가지면 복구가 어렵다.
- 영향: Shadow buffer는 timestamp 정렬을 유지하고, latest-only job queue는 취소된 pending promise를 명시적으로 reject한다. perception cache key는 frame ref hash를 포함한다.

### D-050 복원된 live snapshot은 replay가 아니라 recovery state다

- 이유: 마지막 분석 스냅샷은 세그먼트와 설명을 복원할 수 있지만, 실제 frame buffer나 live capture session을 재개하는 데이터는 아니다. 이를 `demo shadow`로 렌더링하면 사용자와 QA가 빈 데모 플레이어로 오해한다.
- 영향: active live frame이 없는 restored snapshot은 Shadow Player에서 별도 복원 상태로 표시하고 재생/되감기/auto-pause 제어를 비활성화한다. 새 캡처가 시작돼 live frame이 들어오면 기존 live Shadow 경로가 다시 우선한다.

### D-051 첫 배포 단위는 웹 화면공유 제품이다

- 이유: 설치형 앱보다 웹 링크 배포가 심사/베타 사용자에게 즉시 전달하기 쉽고, 현재 브라우저 `getDisplayMedia` path를 제품 루트로 세우는 편이 배포 속도가 빠르다.
- 영향: `/`는 사용자용 웹 앱, `/demo`는 API-free 백업 데모, `/qa`는 내부 검증 워크스페이스로 분리한다. Tauri/macOS native path는 삭제하지 않고 후속 desktop extension으로 보류한다.

### D-052 서버는 perception extraction만 담당한다

- 이유: OpenAI key와 비용 제어는 서버에 있어야 하지만, 행동 문장을 모델이 자유 생성하면 grounding safety가 흔들린다.
- 영향: Vercel API는 frame/audio를 받아 OCR-like token, object hint, transcript만 반환한다. 최종 세그먼트, rule 선택, action/report 노출, safety fallback은 계속 클라이언트의 deterministic rule engine에서 결정한다.

### D-053 기본 제품은 재난안전 연습 도구로 전환한다

- 이유: 리서치 검토 결과 느린학습자에게 필요한 것은 실시간 AI 판단보다 짧은 장면, 멈춤, 쉬운말, 반복, 행동 카드, teach-back, 교사/보호자 동반 학습이다.
- 영향: `/`는 학습 홈, `/scenario/:id`는 구조화된 학습자 플레이어, `/teacher`는 진행자 화면이 된다. 기존 화면공유 AI 분석은 삭제하지 않고 `/live-lab` 실험 기능으로 격리한다.

### D-054 멀티트랙은 데이터 구조로 유지하고 학습자 UI는 단순화한다

- 이유: `쉬운말`, `지금 할 일`, `이유`, `보호자/선생님`, `신고/도움 요청`, 공식 근거는 각기 다른 사용자를 지원하지만, 학습자에게 한 번에 모두 보이면 인지부하가 커진다.
- 영향: 학습자 화면에는 쉬운말과 행동 카드가 먼저 보이고, 이유는 “왜요?”로 접는다. 보호자/선생님 트랙, 신고 문장, 공식 rule id는 `/teacher`와 `/qa`에서 확인한다.

### D-055 학습 확인 전 다음 장면으로 넘어가지 않는다

- 이유: 새 MVP의 핵심 흐름은 장면 보기, 자동 정지, 쉬운 설명, 행동 카드, teach-back 확인이다. 확인 질문을 건너뛰면 느린학습자가 실제 행동 순서를 이해했는지 확인할 수 없다.
- 영향: `/scenario/:id`는 정답 선택 전 `다음 장면 보기`를 비활성화한다. 오답은 다시 선택할 수 있지만, 정답을 고른 뒤에는 선택지를 잠가 성공 피드백이 뒤집히지 않도록 한다. 학습자용 큰 설명은 공식 원문이 아니라 별도 `learnerExplanation`만 사용한다.

### D-056 실험/내부 경로는 기본 학습 흐름에서 방어한다

- 이유: 느린학습자 기본 화면에 AI, 화면공유, QA 같은 내부 개념이 보이면 학습 목표보다 기술 설명이 앞선다. 비용이 드는 live-lab API도 잘못된 beta UX로 활성화되면 안 된다.
- 영향: 홈에서 `/live-lab` 링크를 숨기고, `/live-lab`는 `verify-beta-code` API로 실제 beta code를 확인한 뒤에만 화면공유를 켠다. `/qa`는 직접 접근 시 게이트 화면을 보이며, 일반 unknown route는 명확한 not-found 화면으로 처리한다.

### D-057 영상 장면 경계는 끝 프레임이 아니라 끝 0.1초 전에서 멈춘다

- 이유: 브라우저 `timeupdate`는 촘촘하지 않고, `endMs`와 다음 `startMs`가 같은 경우 `currentTime = endMs`로 seek하면 다음 장면 첫 프레임이 노출될 수 있다.
- 영향: `/scenario` 플레이어는 재생 중 `requestAnimationFrame`으로 boundary를 감시하고, 설명 전환 시 `endMs - 0.1s`에서 멈춘다. 세그먼트 시작은 0이 아닌 경우 0.02초 guard를 둬 이전 장면 마지막 프레임도 피한다.

### D-058 기본 화재/지진 연습은 짧은 QA 컷이 아니라 전체 흐름 영상으로 구성한다

- 이유: 8~30초 샘플 컷은 QA에는 좋지만 실제 데모에서는 장면 연속성이 약하고, 느린학습자가 오프닝부터 행동요령 끝까지 하나의 흐름으로 이해하기 어렵다.
- 영향: 화재는 안전한TV 원본 전체 60초 기반 6개 장면으로, 지진은 행정안전부 원본의 오프닝과 핵심 행동요령 구간을 이어 붙인 307초 기반 11개 장면으로 구성한다. 기존 짧은 clip과 hidden after-flow는 호환/보조 경로로만 남긴다.

### D-059 긴 음성 설명은 쉬운 한 문장으로 압축하지 않고 장면을 더 나눈다

- 이유: 느린학습자용 문장은 쉬워야 하지만, 공식 영상의 중요한 단서까지 지워지면 학습 목표가 사라진다. 예를 들어 `머리를 지켜요`만 남기면 `방석`, `탁자 다리`, `유리 파편`, `손전등`, `수도관` 같은 실제 행동 단서가 빠진다.
- 영향: 지진 연습은 영상 문장 단위에 맞춰 16개 장면으로 늘리고, 한 장면에는 `상황 1개 + 해야 할 일 1~3개 + 하지 말 것 + 확인 질문 1개`만 둔다. 정보가 많으면 문장을 길게 쓰지 않고 새 장면으로 분리한다.

### D-060 장면별 멀티트랙 근거가 맞지 않으면 새 공식 규칙을 추가한다

- 이유: 기존 `KR_EQ_05` 같은 넓은 규칙 하나에 학교, 가스, 전기, 수도관, 귀가 후 문 열기를 모두 붙이면 `하지 말아요`와 `이유` 트랙이 장면과 어긋난다.
- 영향: 학교 이동, 가스 냄새/새는 소리, 전기/정전, 귀가 후 문/설비, 수도관/물 사용, 넓은 곳이 없을 때 튼튼한 건물 규칙을 분리했다. 학습자 카드와 teach-back은 해당 장면 rule id와 evidence가 맞을 때만 노출된다.

### D-061 원본 장면이 서로 다른 상황을 섞으면 학습 흐름에서 제거한다

- 이유: 엘리베이터와 지하철처럼 서로 다른 안전 상황이 한 장면 안에 겹쳐 보이면, 느린학습자가 행동 규칙을 잘못 연결해서 기억할 수 있다. 미세한 타임코드 조정으로 안정적으로 분리되지 않는 구간은 데모 학습 흐름에 넣지 않는다.
- 영향: `earthquake-full-elevator-wait` 세그먼트를 지진 학습자 흐름에서 제거했다. 원본의 해당 구간은 교사/QA 연구 후보로만 남기고, 학습자 기본 경로에서는 학교 대피 다음에 119/방송 안내로 바로 이동한다.

### D-062 쉬운말 변환은 핵심 명사를 삭제하지 않는다

- 이유: `문을 천천히 열어요`, `냄새를 말해요`, `물 쓰기 전에 말해요`처럼 동사만 쉬워지고 대상 명사가 빠지면 느린학습자는 무엇을 해야 하는지 더 헷갈릴 수 있다. 쉬운말은 짧아야 하지만, 영상과 공식 행동요령을 연결하는 핵심 명사는 남겨야 한다.
- 영향: 세그먼트별 `requiredLearnerKeywords` 계약을 추가했다. `옷장/보관함 문`, `가스 냄새`, `새는 소리`, `전선`, `수도꼭지`, `화장실`, `지진 대피소`, `안내 방송` 같은 단어가 학습자 화면에서 사라지면 테스트가 실패한다. `말해요` 행동 카드는 `무엇을 누구에게 말하는지`를 포함해야 한다.

### D-063 학습자 화면에서 행동 카드 중복을 제거하고 이유를 먼저 보여 준다

- 이유: `순서대로 읽어봐요`가 이미 상황과 해야 할 일을 카드로 보여 주는데, 아래 `지금 할 일` 카드가 같은 내용을 반복해 화면을 복잡하게 만들었다. 반복보다는 하지 말아야 할 행동과 그 이유를 바로 보여 주는 편이 이해를 돕는다.
- 영향: `/scenario/*` 학습자 화면에서 `지금 할 일` 섹션을 제거했다. `하지 말아요` 카드는 가로 전체 폭으로 보여 주고, `왜 이렇게 해야 할까요?` 이유 카드를 답 선택 전부터 표시한다. 행동 단계는 위쪽 멀티트랙 순서 카드에만 남긴다.
