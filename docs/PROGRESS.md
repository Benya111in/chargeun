# PROGRESS

## 2026-05-21

### 완료

- GitHub Pages 공유용 진입 흐름으로 `/`를 개편했다. 첫 화면은 서비스 소개와 `학습 체험하기` CTA만 보여 주고, 기존 시나리오 카드 목록과 내부/진행자 링크는 기본 공개 화면에서 제거했다.
- GitHub Pages 정적 호스팅을 위해 Vite `base`를 상대 경로로 바꾸고, 내부 학습 링크를 `#/scenario/...` 해시 라우팅으로 지원하도록 route helper를 추가했다. 기존 `/demo`, `/teacher`, `/live-lab`, `/qa` 호환 경로는 유지한다.
- `/scenario/*` 상단의 `안심트랙 연습`, `다른 연습 고르기` 링크를 제거해 화재/지진 연습에 바로 집중하게 했다. 화재 마지막 장면은 바로 지진 연습으로 이어지고, 마지막 지진 연습 종료 시 설문 요청 모달을 띄우도록 바꿨다.
- 구글폼 설문 링크 `https://forms.gle/nzCofnS9KosQ3X566`를 공개 체험 기본값으로 연결했다. `VITE_SURVEY_FORM_URL`을 지정하면 배포 환경별로 다른 설문 링크로 덮어쓸 수 있다.
- GitHub Pages 배포 workflow를 추가했다. `main` 브랜치 push 또는 수동 실행 시 `pnpm --filter desktop-ui build` 결과인 `apps/desktop-ui/dist`를 Pages artifact로 업로드하고 배포한다.
- 지진 전체 연습을 14장면에서 16장면으로 재구성해, 긴 음성 설명을 한 장면에 과하게 압축하지 않고 `탁자 다리`, `방석`, `유리`, `간판`, `안전디딤돌`, `공원/운동장`, `튼튼한 건물`, `손전등`, `수도관`, `물 쓰기 전 확인` 같은 핵심 단서를 학습자 카드에 보이도록 재구성했다.
- 지진 후속 행동을 더 정확히 grounding하기 위해 학교 이동, 가스 냄새/새는 소리, 전기/정전, 귀가 후 문/설비 확인, 수도관/물 사용, 넓은 곳이 없을 때 튼튼한 건물 규칙과 공식 source chunk를 추가했다. 엘리베이터/지하철이 섞여 보이는 원본 구간은 학습 흐름에서 제거했다.
- 쉬운말 변환 중 핵심 단어가 사라지지 않도록 `requiredLearnerKeywords`를 추가했다. `옷장/보관함 문`, `가스 냄새`, `새는 소리`, `전선`, `수도꼭지`, `화장실`, `지진 대피소`, `안내 방송` 같은 단어가 학습자 화면에 남는지 테스트한다.
- 학습자 화면에서 중복된 `지금 할 일` 섹션을 제거하고, `하지 말아요`와 `왜 이렇게 해야 할까요?` 이유 카드를 답 선택 전부터 보이게 바꿨다.
- `learner-copy` 변환에서 `가기해야`, `지키기하는` 같은 어색한 치환 찌꺼기가 생기지 않도록 exact replacement와 regression test를 추가했다.
- `/scenario/earthquake-protect-flow` 브라우저 검증에서 3번 방석/유리 장면과 16번 수도관/물 사용 장면이 실제 영상 정지 후 쉬운말, 순서 카드, 하지 말 것, 확인 질문으로 보이는 것을 확인했다.
- `pnpm --filter desktop-ui test -- learning-scenarios`, `pnpm --filter desktop-ui typecheck`, `pnpm --filter desktop-ui lint`, `pnpm --filter desktop-ui test:e2e`, `pnpm --filter desktop-ui build` 검증을 완료했다.
- `pnpm --filter desktop-ui build`, `pnpm --filter desktop-ui test -- learning-scenarios`, `pnpm --filter desktop-ui exec playwright test e2e/app.spec.ts`, 브라우저 DOM/screenshot 확인으로 공개 링크 진입 흐름을 검증했다.
- URL 입력 자동 생성 경로가 자막을 너무 크게 묶어 2개 장면만 만들 수 있던 문제를 고쳤다. 자막/오디오 주제 전환을 기준으로 장면을 나누고, 생성 직후 `url_generation_lrs_v1` 품질 게이트를 통과해야만 결과를 저장한다.
- 품질 게이트는 장면 수 부족, 30초 초과 장면, 행동/하지 말아요/확인 질문 누락, 정답 1개 위반, 쉬운말 금지 표현, `말해요/알려요` 대상 누락을 blocker로 처리한다. `youtube.com/watch?v=IiVsojHcoEo`는 7개 장면으로 분할되고 quality score 100을 통과했다.
- 펭수 태풍 영상 `oWu95ZitpTI`가 30초 초과 장면으로 막히던 원인을 보강했다. 태풍 URL 생성은 이제 외출 자제, 문/창문, 간판/위험 시설물, 배수구, 하천/운전, 농촌 시설물/배수로, 바닷가/선박을 별도 판단 지점으로 나누며, 해당 영상은 10개 장면과 quality score 100으로 통과한다.

### 진행 중

- 지진 장면 분할과 설명은 학습자 UI 기준으로 보강됐지만, 실제 느린학습자/교사 대상 이해도 테스트 전까지 최종 문구로 확정하지 않는다.

### 다음

1. 화재 시나리오도 같은 기준으로 음성/자막 대비 누락된 구체 단서가 없는지 재점검
2. 교사/보호자 화면에서 새 지진 규칙과 source chunk가 과하지 않게 읽히는지 검수
3. 실제 사용자 검증용 카드 이미지/아이콘 자산 설계

## 2026-05-20

### 완료

- `/live-lab` 화면공유 직후 흰 화면으로 보일 수 있는 live sampler 경로를 점검하고, browser frame timestamp를 epoch 시간이 아니라 세션 시작 후 경과 시간으로 정규화했다
- canvas draw/toDataURL 샘플링 예외가 발생해도 앱 전체 렌더링을 깨지 않도록 sampler 내부에서 1회 경고 후 해당 frame만 건너뛰게 했다
- 실제 사용자 화면을 외부로 보내지 않는 합성 `getDisplayMedia` E2E를 추가해, beta code 확인 -> 화면공유 시작 -> Shadow replay frame 표시 -> mocked perception 분석 반영 흐름을 회귀 테스트로 고정했다
- V2A 멀티트랙 제안서의 1차 적용 범위를 계약 우선으로 정하고, `StructuredLearningExplanation v1` 타입/schema를 `shared-types`에 추가했다
- 기존 `SegmentExplanation`을 제거하지 않고 `StructuredLearningExplanation -> SegmentExplanation` adapter를 둬 학습자 UI를 복잡하게 만들지 않는 병행 구조로 전환했다
- `buildStructuredLearningExplanation`, `validateLearningExplanation`, `buildSuppressedCandidates`, `toLegacySegmentExplanation` deterministic path를 `llm-orchestrator`에 추가했다
- `PerceptionPacket`에서 visual/OCR/ASR/rule evidence를 분리하는 normalization helper를 `perception-pipeline`에 추가했다
- 현재 `learningScenarios` 모든 segment가 새 structured schema를 통과하도록 adapter를 붙이고, `/teacher`에는 segment status, 행동 카드별 rule id, 분리 근거, 억제 후보를 표시했다
- `/qa`에는 LRS 초안 체크리스트를 추가해 공식 근거, 한 판단 지점, 쉬운말, 근거 출처 분리, 학습자 공개 가능 여부를 수동 검수할 수 있게 했다
- 6개 분야별 QA 에이전트를 학습자 흐름, teacher/QA, live-lab, 인지 접근성, 반응형 시각 QA, 계약/데이터 무결성으로 배치해 2라운드 검증을 수행했다
- QA 지적을 반영해 learner action 노출을 `StructuredLearningExplanation`의 `validated`/`learnerSafe`/`hasGroundedAction` 상태로 게이트하고, `needs_review`/`blocked` 상태에서는 raw scenario action을 숨기도록 고정했다
- `/live-lab`에서 빈 `MediaStream` 화면공유를 running 상태로 받던 문제를 막고, `getDisplayMedia` 미지원 브라우저에서는 beta 확인 후에도 시작 버튼을 비활성화하도록 보강했다
- 로컬 `web-preview-server`에 mp4 byte range 응답을 추가해 `/scenario` 장면 이동 시 video seek가 0초로 되돌아가지 않게 수정했다
- `/scenario/earthquake-review-flow` 호환 alias를 추가하고, 다음 장면 재생이 해당 segment 시작점에서 시작하도록 재생 예약 로직을 안정화했다
- 학습자 영상은 `object-contain` 16:9로 바꿔 모바일에서 자막/수어 inset이 잘리지 않게 했고, Shadow Player 장면 설명은 영상 위 overlay가 아니라 아래 caption으로 내려 텍스트 충돌을 제거했다
- 피해야 할 행동은 학습자 행동 카드나 교사 설명에서는 `엘리베이터는 타지 않아요`, `바로 뛰지 않아요`, `가스 밸브는 만지지 않아요`처럼 do-not 문장으로 풀어 쓰고, `왜요?` 버튼은 `이유 보기`로 명확히 했다
- 확인 질문에서 do-not 문장이 오답처럼 보이며 정답이 두 개처럼 읽히던 문제를 고쳐, 오답 선택지를 현재 장면과 관련된 대비 대상/장소/상태로 다시 설계했다
- `learningScenarios` 테스트에 “정답은 정확히 1개, `잘 모르겠어요` 고정 선택지 금지, 오답은 행동 카드/do-not/명령형 문장과 중복 금지” invariant를 추가해 같은 콘텐츠 회귀를 막았다
- `StructuredLearningExplanation v1`에 `tracks.teachBack` 계약을 추가해 validated segment가 정답 1개, semantic kind 일치, 공식 rule id 연결, 행동 카드와 선택지 분리, 고정/명령형 오답 금지를 통과해야만 학습자 질문을 노출하도록 바꿨다
- `/scenario`는 더 이상 seed의 자유 텍스트 answer option을 직접 신뢰하지 않고, schema를 통과한 `structuredExplanation.tracks.teachBack`에서 질문과 선택지를 파생한다
- 마지막 장면에서는 `다음 장면 보기`가 첫 장면으로 순환하지 않도록 막고, 정답 선택 후 `다음 연습 보기`, 다음 연습 제목/설명 링크, `처음부터 다시 보기`를 제공하도록 바꿨다
- 홈의 연습 카드를 재난 주제 중심으로 정리해 `소리 없이 보기` 보조 연습은 기본 홈에서 숨기고, 지진은 `지진이 났을 때` 한 주제 안에서 `흔들릴 때 -> 멈춘 뒤` 연속 연습으로 연결했다
- `llm-orchestrator`의 structured action card 생성 단계에서 `않아요`, `피해요`, `만지지`, `무리해서` 같은 부정/금지형 행동 문장을 학습자 행동 카드에서 자동 제외하고 suppressed candidate로 보관하도록 막았다
- 학습자 `/scenario` 화면에 `쉬운말`, `할 일`, `확인`, `헷갈림` 요약과 보존된 헷갈림 후보 패널을 추가해, 내부 용어 없이도 멀티트랙 구조와 후보 보존 결과가 보이도록 했다
- fire stair 장면에서 `엘리베이터는 타지 않아요`가 행동 카드처럼 보이지 않고, `헷갈릴 수 있어요` 패널의 보관 후보로만 나타나도록 콘텐츠와 invariant를 정리했다
- GPT-5.5 에이전트 6개를 영상 분절, 공식 출처, RAG 설계, 학습자 UX, 테스트 전략, 원본/라이선스 리스크 축으로 배치해 현재 demo clip과 장면 문구를 재검수했다
- SafeTV, 국민안전24, 한국장애인개발원 자료를 `data/official_sources`의 metadata/chunk catalog로 정리하고, 원문 복사 대신 짧은 paraphrase/easyKo와 canonical URL만 저장하는 deterministic official RAG 레이어를 추가했다
- `StructuredLearningExplanation`의 `ruleEvidence`에 `sourceChunkId`, `sourceHeading`, `easyText`, `retrievalScore`, `sourceUrl`을 붙여 교사/QA 화면에서 행동 카드별 공식 근거를 추적할 수 있게 했다
- 장면 window를 너무 잘게 쪼개던 fire/earthquake demo를 재분절했다: 화재는 `문 닫기 + 계단 찾기`를 한 장면으로 길게 묶고, `대피가 어려울 때`를 두 번째 장면으로 두었다
- 지진은 `흔들릴 때`와 `흔들림이 멈춘 뒤`를 한 주제의 연속 연습으로 유지하고, 학교/교실 장면과 흔들림 이후 출구/가스/전기 확인 장면의 learner-facing 설명을 다시 썼다
- RAG 결과가 action을 새로 허가하지는 않고, 이미 grounded rule로 검증된 행동에 공식 출처 evidence를 보강하는 구조로 고정했다
- `rules:validate`가 공식 source metadata/chunk catalog도 검증하도록 확장해, 존재하지 않는 source/rule id가 청크에 들어가면 실패하게 했다
- 6개 QA 에이전트를 재배치해 learner flow, 한국어 자연스러움/안전 문구, teacher/QA/RAG, live-lab fallback, 접근성/모바일, 계약/회귀 검증을 다시 수행했다
- QA 지적을 반영해 지진 후 `KR_EQ_05` 문구를 학습자가 가스/전기를 직접 끄는 표현에서 `직접 만지지 말고 어른이나 현장 안내에 알림`으로 바꿨다
- 마지막 지진 후 연습이 화재로 순환하지 않도록 바꾸고, 코스 마지막에는 `오늘 연습 끝내기`, `처음 화면으로 가요`, `처음부터 다시 보기`만 제공한다
- 학습자 화면의 보존 후보가 긴 공식 금지문으로 보이지 않도록 `바로 밖으로 뛰기`, `유리창 가까이 가기`, `혼자 만지기` 같은 짧은 대비 후보로 변환했다
- 모바일 설명 상태에서는 멀티트랙 요약 배지를 숨겨 행동 카드가 더 빨리 보이도록 했고, 자동 정지 후 설명 heading으로 포커스가 이동하게 했다
- live-lab 화면공유 실패 telemetry의 route를 `/`가 아니라 `/live-lab`로 기록하도록 수정했다
- `ruleEvidence`는 후보 rule 전체가 아니라 현재 segment의 공식 action rule만 표시하게 해, 교사 화면에서 핵심 근거와 억제 후보가 섞이지 않도록 정리했다

### 검증

- `pnpm --filter desktop-ui test`
- `pnpm --filter desktop-ui typecheck`
- `pnpm --filter desktop-ui test:e2e`
- `pnpm --filter @ansimtrack/shared-types test`
- `pnpm --filter @ansimtrack/llm-orchestrator test`
- `pnpm --filter @ansimtrack/perception-pipeline test`
- `pnpm typecheck`
- `pnpm --filter desktop-ui lint`
- `pnpm lint`
- `pnpm --filter desktop-ui test:e2e`
- `pnpm --filter @ansimtrack/shared-types test`
- `pnpm --filter @ansimtrack/llm-orchestrator test`
- `pnpm --filter desktop-ui test:e2e -- app.spec.ts`
- `pnpm --filter desktop-ui test -- learning-scenarios`
- `pnpm --filter desktop-ui typecheck`
- `pnpm --filter desktop-ui lint`
- `pnpm exec prettier --check` on changed implementation/docs files
- `pnpm --filter desktop-ui test:e2e -- app.spec.ts`
- Browser preview check: `/teacher` structured panel and `/qa?internal=qa` LRS panel render with no console errors
- Browser preview check: `/scenario/fire-grounded-flow` 첫 장면과 두 번째 장면의 teach-back 선택지가 행동 카드와 충돌하지 않는지 확인
- Browser preview check: `/`에는 화재/지진 주제만 보이고, `/scenario/fire-grounded-flow` 두 번째 장면에는 행동 카드 2개와 `엘리베이터` 보관 후보가 분리 표시됨
- 분야별 QA 에이전트 2라운드: learner flow, live-lab fallback, cognitive accessibility, visual responsive QA, teacher/QA, contract/data integrity 재검증 완료
- `pnpm --filter @ansimtrack/shared-types build`
- `pnpm rules:validate`
- `pnpm --filter @ansimtrack/shared-types test`
- `pnpm --filter @ansimtrack/llm-orchestrator test`
- `pnpm --filter desktop-ui test -- learning-scenarios`
- `pnpm --filter desktop-ui typecheck`
- `pnpm --filter desktop-ui lint`
- `pnpm --filter desktop-ui test:e2e -- app.spec.ts`
- `CI=1 pnpm --filter desktop-ui test:e2e -- app.spec.ts`
- Browser preview check: `/scenario/earthquake-after-flow` 마지막 장면이 화재로 순환하지 않고 course complete 상태로 끝남
- Browser preview check: `/teacher` 지진 후 공식 근거에 `가스와 전깃불을 끄고`가 더 이상 노출되지 않음
- Mobile Playwright audit: 390px에서 수평 overflow 없음, 설명 heading 포커스 이동, 모바일 멀티트랙 요약 숨김, 긴 금지문 미노출 확인
- `/scenario` video boundary가 다음 장면 첫 프레임을 잠깐 보여 주는 문제를 0.1초 clamp와 `requestAnimationFrame` boundary monitor로 수정했다. E2E에 `currentTime < endSec` 회귀 검증을 추가했다.
- 화재 연습은 안전한TV 원본 60초 전체를 압축한 `fire-full-practice-001.mp4`와 6개 장면으로 재구성했다. 오프닝/알림, 현관문 닫기, 계단, 대피공간, 문틈 막기, 대피 후 확인까지 이어진다.
- 지진 연습은 오프닝과 핵심 행동요령 구간을 이어 붙인 `earthquake-full-practice-001.mp4`와 11개 장면으로 재구성했다. 기존 `흔들릴 때`/`멈춘 뒤` 분리를 기본 흐름에서 없애고 하나의 연속 연습으로 만들었다.
- Browser preview check: 홈에서 화재 6개 장면, 지진 11개 장면이 표시되고 `소리가 없어도 볼 수 있어요` 보조 카드가 기본 홈에 노출되지 않음을 확인했다.

### 다음

1. 민감정보가 없는 테스트 탭으로 실제 Chrome 화면공유 + OpenAI perception 호출을 수동 rehearsal
2. 공식 source chunk를 더 늘려 화재/지진 외 호우·태풍·생활안전 시나리오까지 같은 RAG 계약으로 확장
3. `/live-lab`이 실제 API 지연/오류 시 마지막 안정 설명을 유지하는지 장시간 확인
4. `LearningReviewSubmission`을 실제 QA 저장 구조에 연결하고 LRS/LAS 분석을 분리
5. structured output LLM 생성은 내부 QA 경로에서만 schema/validation/fallback을 통과시킨 뒤 실험

## 2026-05-11

### 완료

- 배포 목표를 macOS 앱이 아니라 웹 링크 기반 베타/심사용 제품으로 재정의하고, `/`를 브라우저 화면공유 중심 사용자 화면으로 전환했다
- 기존 운영자 검증 워크스페이스는 `/qa`로 이동하고, `/demo`는 API 장애 시에도 동작하는 mp4 scene-stepper 백업 데모로 유지했다
- Vercel 루트 설정과 `api/health`, `api/analyze-frame-window`, `api/transcribe-audio`, `api/client-event` serverless function 초안을 추가했다
- 서버 API는 beta code, same-origin check, payload size/type validation, in-memory rate limit을 적용하고 OpenAI key를 서버 환경변수로만 읽도록 구성했다
- 웹 전용 capture controller, 화면공유 audio recorder, frame-window perception analysis hook을 추가해 Tauri/native command 없이도 브라우저 capture path가 동작하도록 분리했다
- 클라이언트 분석 흐름은 서버가 반환한 `PerceptionPacket`을 기존 deterministic `Segment -> grounded rule -> explanation -> safety guardrail` 경로에 넣도록 유지했다
- `.env.example`과 `README.md`에 Vercel/OpenAI/beta access 배포 환경변수와 `/`, `/demo`, `/qa` 라우트 기준을 반영했다
- tester agent와 브라우저/Playwright 검증을 돌려 stale E2E 기대값을 발견했고, `/`, `/demo`, `/qa`, mocked 화면공유 분석 loop를 검증하는 E2E로 교체했다
- `pnpm web:preview` 로컬 서버를 추가해 정적 앱과 `api/*.ts`를 same-origin으로 함께 띄우고, 로컬에서도 `/api/health` 404 없이 배포 구조를 확인할 수 있게 했다
- 리서치 결과에 따라 기본 제품을 화면공유 AI 분석에서 공식 자료 기반 재난안전 연습 도구로 전환했다
- `/` 학습 홈, `/scenario/:id` 학습자 플레이어, `/teacher` 진행자 화면을 추가하고 기존 화면공유 경로는 `/live-lab` 실험 기능으로 격리했다
- `docs/WHY_SLOWLEARNER_DISASTER_TRAINING.md`에 짧은 장면, 멈춤, 쉬운말, 행동 카드, teach-back, 교사/보호자 동반이 필요한 이유를 기록했다
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm --filter desktop-ui test:e2e`, `pnpm rules:validate`, `pnpm eval:audit`, `pnpm prompts:validate`, browser preview route check로 학습 MVP 전환을 검증했다
- 분야별 테스터 에이전트 5개로 학습자 흐름, 접근성, 콘텐츠 안전, live-lab/API, chaos regression을 검수했고, 재현된 문제를 수정했다: 학습자 홈 내부 용어 제거, 쉬운말 큰 설명 분리, 위험한 오답 문구 완화, 정답 후 선택 잠금, teach-back 정답 전 다음 장면 잠금, `/teacher` 공식 근거 확장, `/live-lab` beta code 검증, `/qa` 게이트와 unknown route 처리

### 다음

1. 느린학습자/보호자/교사 대상 폐쇄형 사용성 검증 설계
2. 화재/지진 시나리오별 그림 카드와 음성 읽어주기 추가
3. `/live-lab` 실험 기능의 Vercel beta code/env 설정과 HTTPS 화면공유 rehearsal

## 2026-04-30

### 완료

- GPT-5.5 explorer agent 6개를 `/demo`, `/`, capture fallback, QA workspace, domain regression, 접근성 축으로 나눠 병렬 검수하게 하고, 재현 가능한 P1/P2 지적을 한 라운드에서 통합 수정했다
- 근거 없는 `officialRuleIds`만으로 action/report가 grounded 처리되던 문제를 차단하고, `matchGroundedRules`가 현재 장면의 `when:` 또는 `evidence:` 신호가 있을 때만 rule을 선택하도록 보강했다
- `pnpm eval:audit`를 exact rule id와 overlay target까지 검증하도록 강화하고, door-control fixture phase를 실제 규칙 단계와 맞춰 `fire-door-control-001`이 `KR_FIRE_04`만 통과하도록 고정했다
- `/demo`의 첫 화재 장면, 지진 보호 장면, 대피공간 장면, 지진 후 신고 장면이 각 장면에 맞는 learner-facing 설명을 내도록 curated segment override와 evidence hints를 보강했다
- `/demo` 마지막 장면의 `처음부터 다시 보기`가 준비 화면으로 돌아가기만 하던 문제를 수정해 첫 장면을 바로 재생하게 했고, scene stepper의 터치 타겟, heading, focus 이동, raw playback error 숨김을 개선했다
- 루트 검증 화면에서 capture 시작 실패 후에도 "캡처를 시작했습니다"가 표시되던 문제를 수정하고, 이미 캡처 중일 때 다른 capture 시작 버튼이 세션 상태를 오염시키지 않도록 막았다
- native capture bridge stdout EOF가 `session-stopped` 없이 끝나도 UI가 running에 갇히지 않도록 fatal error와 stop event를 내보내게 했다
- 브라우저 preview에서 OCR/ASR이 실제 adapter-ready처럼 보이던 문제를 수정해 native OCR/ASR 미연결 상태를 명확히 표시하도록 했다
- QA workspace 브라우저 fallback이 tracked eval JSON seed를 로드하도록 바꾸고, manual review coverage가 같은 fixture의 최신 pass/fail/block 상태만 보도록 고쳤다
- QA fixture 선택 시 추천 queue와 selected fixture가 어긋나거나 이전 fixture의 clip path가 새 fixture로 새는 문제를 수정하고, 브라우저에서는 local clip path를 깨진 `<video>`로 열지 않도록 막았다
- 마이크 intent가 브라우저 SpeechRecognition 무응답에서 무한 `마이크 대기`로 남던 문제를 timeout과 stop 가능 상태로 수정했다
- Shadow buffer out-of-order frame, LocalLatestJobQueue superseded promise hang, perception cache key collision, shared schema의 inverted time/bbox validation 누락을 각각 regression test와 함께 보강했다
- 복원된 live-analysis snapshot이 Shadow Player에서 빈 `demo shadow`로 보이던 문제를 수정해, 이전 분석은 별도 복원 상태와 비활성 재생 제어로 표시하고 새 캡처 대기임을 명확히 했다
- 문서 언어를 `ko`, title을 `안심트랙`으로 수정하고, 백업 시나리오 선택 상태와 일부 기술 용어 라벨을 더 한국어 중심으로 정리했다
- 검증: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm eval:audit`, `cargo fmt --manifest-path apps/desktop-ui/src-tauri/Cargo.toml --check`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, Playwright `/demo` 및 `/` 재현 검증을 통과했고, Linnaeus agent의 restored snapshot 재검증도 clear 처리했다

### 다음

1. 실제 macOS Screen Recording 권한 허용 상태에서 native capture full rehearsal 기록
2. `/` 검증 화면의 남은 운영자용 영어/내부 용어를 제품 용어로 추가 정리
3. local clip asset pipeline과 발표용 long clip pipeline 자동 동기화

## 2026-04-14

### 완료

- bundle 문서를 `docs/`로 복사
- Git 저장소 및 `codex/phase0-bootstrap` 브랜치 생성
- pnpm workspace 초기화
- React/Vite 기반 `apps/desktop-ui` 스캐폴드 생성
- `packages/shared-types`와 `workers/llm-orchestrator` 공통 계약/오케스트레이션 초안 착수
- `packages/shadow-buffer`에 4초 지연, 최소 8초 버퍼, 세그먼트 marker, rewind/replay 제어를 갖춘 Shadow Player 링버퍼 추가
- desktop UI에 mock capture/replay lane 기반 `ShadowVideoStage` 연결
- `pnpm typecheck`, `pnpm test`, `pnpm rules:validate`, `pnpm lint`, `pnpm build`로 Shadow Player slice 검증
- desktop UI에 capture control contract, source 상태, permission/session 상태 연결
- browser `getDisplayMedia` 기반 live preview fallback 연결
- live preview lane과 Shadow Player replay lane을 분리한 상태로 `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` 검증
- `native/mac-capture`에 permission/source/session foundation 추가
- ScreenCaptureKit source enumerate와 session bookkeeping을 반영한 `MacCaptureCoordinator` 강화
- `swift build`, `swift run MacCaptureSmoke`로 native foundation smoke 검증
- Tauri에 `get_bootstrap_state`, `list_native_capture_sources`, `start_native_capture`, `stop_native_capture` command 추가
- desktop UI capture controller가 Tauri native command를 우선 사용하도록 연결
- `cargo check`까지 포함해 command/UI 경로 검증
- `docs/WORK_QUEUE.md`를 추가해 남은 문서를 순차 작업 큐로 고정
- Tauri capture command가 Swift `MacCaptureBridge` executable을 직접 호출하도록 연결
- `swift run MacCaptureBridge bootstrap`, `swift run MacCaptureBridge stop --session-id does-not-exist`로 bridge command smoke 검증
- `MacCaptureBridge stream` 명령과 low-fps native snapshot preview를 추가해 Tauri가 `capture/session-started`, `capture/frame`, `capture/session-stopped`, `error/system` 이벤트를 앱으로 전달하도록 연결
- desktop UI에 native preview reducer, Tauri event listener, native frame snapshot preview 표시를 추가해 browser/native preview lane을 같은 화면에서 다루도록 확장
- `pnpm --filter @ansimtrack/shared-types test`, `pnpm --filter desktop-ui test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `swift build`, `cargo check` 검증 완료
- `swift run MacCaptureBridge bootstrap`로 현재 로컬 macOS 권한 상태가 `permissionState: denied`임을 재확인
- browser `MediaStream`를 1fps JPEG sample로 정규화하는 sampler와 native/browser 공용 `CaptureFrameSample` 계약을 추가
- `captureInput` 상태와 perception seed 초안을 연결해 preview lane이 다음 perception/rule 단계에서 바로 쓸 frame window를 유지하도록 정리
- `workers/llm-orchestrator`에 grounded rule matcher와 `buildGroundedExplanation` 경로를 추가해 fire/earthquake evidence에서 실제 rule 1~3개를 고르도록 구현
- `protect -> during_shaking`, `route_selection -> stair_evacuation/door_control/refuge_space` phase alias와 evidence gating을 넣어 공식 rule 없는 action 노출을 계속 막음
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`로 matcher slice까지 루트 검증 완료
- `workers/perception-pipeline` 패키지를 추가하고 frame sampling plan, text-driven object hint derivation, `PerceptionPacket` builder, cache key foundation을 구현
- 루트 build/test/typecheck 스크립트에 perception worker를 편입하고 `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`로 workspace 검증 완료
- `workers/llm-orchestrator`에 hazard classifier, phase heuristics, segment boundary detector, `buildSegmentFromPerception`을 추가해 `PerceptionPacket -> Segment` 경로를 구현
- fire는 docs-level `route_selection`, earthquake는 `protect` 같은 사용자-facing phase를 유지하고, grounded matcher alias를 통해 실제 rule phase와 연결되도록 정리
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`를 다시 통과시켜 segment slice까지 루트 검증 완료
- demo scenario가 더 이상 mock `matchedRules`를 직접 들고 있지 않고, `PerceptionPacket -> Segment -> buildGroundedExplanation` 경로로 실제 grounded track을 만들도록 desktop UI를 교체
- `matchGroundedRules` 결과를 근거 패널과 segment card에 연결해 rule id/action/report 노출이 실제 matcher 결과를 따르도록 정리
- browser `speechSynthesis` 기반 TTS fallback과 재생 상태 관리를 추가해 5개 intent 버튼이 transcript + 음성 재생을 함께 제공하도록 연결
- 음성 unavailable 환경에서는 자동으로 텍스트-only fallback으로 남기고, 재생 중지 버튼과 상태 배지를 추가
- 근거 패널을 `EvidenceDrawer`로 분리하고 matcher의 `matchedSignals`, 규칙 후보 score, packet evidence, grounded ids를 그대로 보여 주도록 정리
- segment/evidence/voice 영역을 더 읽기 쉬운 발표용 정보 흐름으로 정리하고, evidence toggle이 실제 drawer 성격의 패널을 여닫도록 다듬음
- `packages/local-store` 패키지를 추가해 로컬 runtime directory policy(`.slowlearner/cache|export|logs`), SQLite schema 아티팩트, session JSONL 로그, export snapshot writer를 구현
- `LocalLatestJobQueue`로 queue depth 제한과 latest-only cancellation이 걸린 local job skeleton을 추가
- 루트 build/test/typecheck 스크립트에 local-store를 편입하고 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`로 storage slice까지 workspace 검증 완료
- `workers/llm-orchestrator`에 `applySafetyGuardrails` middleware를 추가해 low-confidence, missing rule id, privacy consent 부재, evidence drawer hidden 조건에서 action/report를 잠그도록 정리
- shared schema가 `review_official` 모드에서 action/report/do_not를 막도록 강화하고, safety fallback 5개 시나리오 테스트를 추가
- desktop UI에 privacy control panel, capture consent modal, evidence drawer gating, 종료 후 캐시 자동 삭제 옵션, 수동 cache clear 흐름을 추가
- Tauri `clear_local_runtime` command를 추가하고 `pnpm --filter @ansimtrack/shared-types test`, `pnpm --filter @ansimtrack/llm-orchestrator test`, `pnpm --filter desktop-ui test`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm typecheck`, `pnpm lint`, `pnpm build` 검증 완료
- `data/eval/annotated_segments.json`를 5개 fixture(화재 2, 지진 2, review fallback 1) 기준으로 재작성하고, audio-missing 케이스까지 포함한 packet-level eval set으로 정리
- `scripts/grounding-audit.ts`와 루트 `pnpm eval:audit`, `pnpm qa:smoke` 스크립트를 추가해 hazard/phase/rule id/safety mode/forbidden action/audio fallback을 자동 점검하도록 구현
- `data/eval/manual_review_log_2026-04-14.md`, `data/eval/demo_rehearsal_checklist.md`를 추가하고 `pnpm eval:audit`, `pnpm qa:smoke`, `pnpm lint`로 QA slice 검증 완료
- `data/demo/runbook.json`, `data/demo/prerecorded_sessions.json`를 추가해 3분 시연 타임라인과 prerecorded backup 세션을 데이터로 고정
- desktop UI에 `DemoRunbookPanel`을 추가해 live/backup mode 토글, 단계별 runbook 선택, Q&A용 근거 패널 바로가기, prerecorded backup 프리셋 선택을 제공
- `mock-session`에 visual-only fire backup과 earthquake after-shaking backup 시나리오를 추가하고 `pnpm --filter desktop-ui test`, `pnpm demo:reset`, `pnpm lint`, `pnpm build`로 demo slice 검증 완료
- `docs/22_POST_DEMO_BACKLOG.md`를 현재 구현 상태 기준 P1/P2/P3 triage 문서로 재구성해, live path 안정화와 persistence를 확장 아이디어보다 우선하는 기준을 고정
- Tauri와 브라우저 fallback 모두에서 `AppRuntimeState`를 저장/복원하는 runtime bridge를 추가해 demo mode, scenario, selected track, privacy prefs, last session metadata가 재시작 후 복원되도록 정리
- 발표용 export 경로를 추가해 현재 시연 상태 JSON과 스크린샷 PNG를 `.slowlearner/export` 또는 브라우저 다운로드로 저장할 수 있게 구현
- `pnpm --filter desktop-ui test`, `pnpm typecheck`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm lint`, `pnpm build`로 restore/export slice 검증 완료
- `README.md`, `docs/24_LOCAL_SETUP_FOR_MACBOOK.md`, `.env.example`, `scripts/check-env.sh`를 현재 저장소 기준으로 정리해 로컬 부팅 순서, workspace 내 Tauri CLI 사용, demo backup 기본값을 문서와 스크립트에 반영
- `pnpm check-env`, `bash -n scripts/check-env.sh`, `pnpm lint`로 local setup slice 검증 완료
- `prompts/README.md`, runtime prompt 3종, `prompts/codex/*.md` 10종, `scripts/validate-prompts.ts`, `pnpm prompts:validate` 스크립트를 추가해 도메인 prompt 자산을 저장소 안에서 버전 관리하도록 정리
- `pnpm prompts:validate`, `pnpm lint`로 prompt asset slice 검증 완료
- live capture frame window를 `buildPerceptionFoundation -> buildSegmentFromPerception -> buildGroundedExplanation` 경로에 연결해 active capture 중에는 demo fixture 대신 실시간 local packet/segment/explanation이 화면에 반영되도록 정리
- Tauri `.slowlearner/logs/sessions.jsonl` / `.slowlearner/cache/live-analysis-latest.json` 및 브라우저 preview localStorage fallback을 추가해 session log와 최신 live analysis snapshot을 남기도록 구현
- `pnpm --filter desktop-ui test`, `pnpm typecheck`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm lint`, `pnpm build`로 live capture analysis slice 검증 완료
- Tauri runtime에 `runtime.sqlite3`를 추가해 `app_settings`, `sessions`, `perception_packets`, `segments`, `segment_explanations`를 실제 SQLite에 기록하고, JSON 파일 fallback과 함께 dual-write 하도록 정리
- 앱 시작 시 마지막 live analysis snapshot을 SQLite 또는 cache file에서 복원하고, `live-priority` 모드에서는 active session이 없을 때 복원된 라이브 요약을 그대로 표시하도록 연결
- `pnpm --filter desktop-ui test`, `pnpm typecheck`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm lint`, `pnpm build`로 SQLite restore slice 검증 완료
- ScreenCaptureKit audio callback을 별도 monitor로 붙여 native preview가 실제 `capture/audio` 이벤트를 내보내고, preview 패널에 최근 audio metadata를 표시하도록 정리
- `VoiceRuntimeBridge`, Tauri voice command, `useVoiceRuntime`를 추가해 macOS native TTS/STT를 우선 사용하고 browser/text fallback으로 내려가는 voice runtime을 구현
- Voice Prompt Bar에 마이크 intent, 텍스트 명령 fallback, native/browser/text 상태 배지, transcript 표시를 추가해 버튼-only voice path를 제품형 fallback 흐름으로 확장
- `swift build`, `swift run VoiceRuntimeBridge status`, `pnpm --filter desktop-ui test`, `pnpm typecheck`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm lint`, `pnpm build`로 native audio/voice slice 검증 완료
- `data/eval/manual_review_runs.json`, `data/eval/rehearsal_runs.json`, `scripts/sync-qa-logs.ts`, `pnpm qa:sync`를 추가해 actual clip/manual review와 rehearsal 로그를 구조화된 JSON에서 markdown 보고서로 동기화하는 경로를 마련
- `pnpm qa:sync`, `pnpm qa:smoke`, `pnpm lint`로 QA log sync slice 검증 완료
- Tauri `load_qa_review_state`, `append_manual_review_run`, `append_rehearsal_run` command와 desktop bridge를 추가해 앱 내부에서 QA 로그를 읽고 기록할 수 있게 정리
- `QaReviewPanel`과 `qa-review` helper를 추가해 fixture별 manual walkthrough status, clip path, notes, rehearsal checklist를 UI에서 바로 남기고 `data/eval`에 sync되도록 연결
- `pnpm --filter desktop-ui test`, `pnpm typecheck`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm qa:sync`, `pnpm lint`, `pnpm build`로 in-app QA workspace slice 검증 완료
- QA workspace가 operator가 입력한 local clip path를 Tauri `asset:` URL 또는 브라우저 path fallback으로 바로 preview하도록 확장돼, 실제 clip walkthrough 시 같은 화면에서 영상 확인과 로그 기록을 같이 할 수 있게 정리
- `resolveLocalMediaSrc` helper test를 추가하고 `pnpm --filter desktop-ui test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`로 local clip preview slice 검증 완료
- `qa-review` helper에 manual review 우선순위 queue와 release checklist snapshot derivation을 추가해, 미완료 fixture를 먼저 보이고 최근 rehearsal 기준 남은 리스크를 앱 안에서 바로 확인할 수 있게 정리
- `QaReviewPanel`이 다음 walkthrough 추천 fixture, sorted fixture queue, release checklist snapshot을 표시하도록 확장하고 `getLatestRehearsalRun`은 더 이상 배열을 mutate하지 않도록 수정
- `pnpm --filter desktop-ui test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`로 QA readiness dashboard slice 검증 완료
- 지진 fixture 2개에 사용자가 제안한 행정안전부 YouTube 원본 source reference를 등록하고, `QaReviewPanel`에서 source title/link/추출 메모를 바로 보게 해 실제 clip intake 경로를 명시적으로 고정
- `pnpm eval:audit`, `pnpm --filter desktop-ui test`, `pnpm typecheck`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm lint`, `pnpm build`로 source reference slice 검증 완료
- `data/eval/source_videos.example.json`, `data/eval/clip_windows.example.json`, `scripts/prepare-eval-clips.ts`, `pnpm qa:prepare-clips`를 추가해 팀원별 local source path와 fixture timestamp를 git 밖의 local override로 관리하면서 `ffmpeg`로 실제 QA clip을 추출하는 intake workflow를 구현
- earthquake fixture의 `sourceClipPlan`과 Tauri fixture hydration을 추가해 `data/eval/clips/<clipId>.mp4`가 존재하면 QA workspace가 repo clip을 자동 preview 후보로 잡도록 정리
- `manualReviewDraft.path` 기본값을 비워 automatic repo clip / latest run fallback이 실제로 동작하도록 수정
- `pnpm qa:prepare-clips`, `pnpm eval:audit`, `pnpm --filter desktop-ui test`, `pnpm typecheck`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm lint`, `pnpm build`로 clip intake workflow slice 검증 완료
- 로컬 환경에서 `yt-dlp` + `ffmpeg`로 행정안전부 지진 원본을 `data/eval/sources/yYwX3qqVMSE.webm`으로 확보하고, 자동 자막 기준 구간으로 `earthquake-desk-001.mp4`, `earthquake-after-shaking-001.mp4`를 실제 추출
- `data/eval/manual_review_runs.json`에 두 earthquake fixture의 local clip 준비 상태를 pending run으로 추가하고 `pnpm qa:sync` 대상 로그가 실제 clip 기준 최신 path를 가리키도록 정리

### 진행 중

- 추출된 earthquake actual clip을 기준으로 UI walkthrough/pass-fail 기록을 남기고, fire/review fixture에도 실제 source/clip을 확보하는 단계

### 다음

1. 실제 clip 기반 rehearsal log 축적
2. live OCR/ASR adapter를 실제 모델 호출 또는 로컬 추론으로 교체
3. Shadow buffer live 입력과 audio/ASR 경로 직결

## 2026-04-15

### 완료

- 발표용 `/demo` 전용 화면을 추가해, 기존 `/` 검증 워크스페이스는 유지하면서 실제 mp4 클립과 큰 행동 설명만 보이는 별도 demo theater를 분리했다
- `apps/desktop-ui/public/demo-video/*.mp4`에 fire/earthquake actual clip을 배치하고, `/demo`가 HTML5 video 기반으로 실제 재생/일시정지/처음부터/음소거를 수행하도록 정리했다
- Playwright로 `http://localhost:1420/demo`에서 `영상 재생` 클릭 후 `video.paused: false`, `currentTime > 1s`까지 확인해 "재생 버튼이 안 된다"는 문제를 발표 화면 기준으로 해소했다
- 발표 화면이 6~9초 QA 컷으로 너무 짧게 끝나던 문제를 수정해, `/demo` 자산을 화재 28초/24초, 지진 28초/30초 길이의 발표용 롱클립으로 교체했다
- 발표 화면이 한 문장만 보여 연속성이 약하던 문제를 수정해, `/demo`에 멀티트랙 cue timeline, grounded rule/source, 관찰 신호, safety fallback을 함께 보여 주는 theater layout을 추가했다
- `/demo`를 scene-stepper 구조로 재작업해, 각 영상을 3~4개 장면 window로 나누고 장면 재생 -> 자동 정지 -> 현재 장면 멀티트랙 설명 -> 다음 장면 재생 흐름으로 바꿨다
- `/demo`가 개발자용 프로세스 설명처럼 보이던 문제를 수정해, grounded/rule/signal/safety 패널과 운영자 문구를 제거하고 실제 느린학습자 기준의 큰 영상, 장면 순서, 쉬운 설명, 하지 말 것, 다시 보기/다음 장면만 남겼다
- Playwright로 `http://localhost:1420/demo`에서 첫 장면이 7.8초까지 실제 재생된 뒤 자동 정지하고, 사용자용 설명 탭과 `이 장면 다시 보기`/`다음 장면 보기`만 나타나는지 재검증했다
- localhost demo path에서 버튼 상태만 바뀌고 Shadow Player 화면이 비어 보이던 문제를 추적해, scenario별 정적 demo frame 자산(`apps/desktop-ui/public/demo/*.jpg`)과 replay/live thumbnail fallback을 연결했다
- `mock-session`이 demo timeline용 frame 목록을 같이 들고 다니도록 확장하고, `ShadowVideoStage`가 live frame이 없을 때 scenario demo frame을 cursor 기준으로 고르도록 수정했다
- 이후 localhost 브라우저 데모에서도 각 preset 버튼이 실제 scene image 변경으로 바로 드러나게 되어, "버튼은 눌리는데 아무것도 안 바뀐다"는 오해를 줄였다
- Tauri runtime/storage/QA 경로를 release bundle 기준으로 재정리해, debug에서는 기존 저장소 `.slowlearner` 및 `data/eval` 흐름을 유지하고 release/package에서는 `app_local_data_dir` 기반 로컬 runtime을 사용하도록 수정
- `load_app_runtime_state`, `save_app_runtime_state`, `append_session_log_entry`, `save_live_analysis_snapshot`, `load_last_live_analysis_snapshot`, QA review command들이 모두 `AppHandle` 기반 path resolver를 사용하도록 정리
- release bundle이 `annotated_segments.json`, `manual_review_runs.json`, `rehearsal_runs.json`을 `Contents/Resources/data/eval/*`에 포함하고, standalone 앱이 최초 실행 시 이를 app-local QA JSON seed로 복사해 쓰도록 정리
- `scripts/sync-qa-logs.ts`가 generated markdown을 쓰고 바로 Prettier로 정리하도록 보강해 `pnpm qa:sync` 이후에도 lint baseline이 다시 깨지지 않게 수정
- debug bundle 빌드까지 확인해 packaged app 안에 `data/eval/*.json` 리소스가 실제로 들어가는 것을 검증
- `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm --filter desktop-ui test`, `pnpm typecheck`, `pnpm build`, `pnpm --filter desktop-ui tauri build --debug` 검증 완료
- `packages/shadow-buffer`가 frame payload를 함께 들고 다닐 수 있게 확장되고, `useShadowLivePlayer`/`shadow-player-utils`를 추가해 실제 `captureInput.frameWindow`가 4초 지연 replay cursor와 segment marker에 직접 연결되도록 정리
- `ShadowVideoStage`가 실제 replay frame과 live edge thumbnail을 표시하고, browser/native capture notice도 replay lane이 더 이상 mock buffer가 아니라 실제 sampled frame 입력을 쓴다는 내용으로 갱신
- `shadow-player-utils.test.ts`를 추가하고 `pnpm --filter desktop-ui test`, `pnpm build`, `pnpm lint`로 live Shadow slice 검증 완료
- Tauri `extract_ocr_tokens` command와 `MacCaptureBridge ocr-image` Vision OCR 경로를 추가해 latest frame data URL을 임시 이미지로 풀고 실제 한글/영문 OCR token을 뽑아 live perception에 주입하도록 정리
- `useLiveOcrTokens` hook과 preview OCR status를 추가해 current session frame window 기준 OCR token을 누적/표시하고, live analysis가 demo fixture 대신 실제 OCR token을 evidence로 사용하도록 연결
- `swift build`, `./.build/debug/MacCaptureBridge ocr-image --image-path /tmp/slowlearner-ocr-smoke.png`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm --filter desktop-ui test`, `pnpm --filter desktop-ui typecheck`, `pnpm lint`, `pnpm build`로 OCR adapter slice 검증 완료
- ScreenCaptureKit audio preview가 placeholder ref 대신 session별 temp `.caf` chunk를 실제로 저장하고, native preview state가 latest `pcmRef`를 유지하도록 정리
- `MacCaptureBridge transcribe-audio`, Tauri `transcribe_audio_sample`, `useLiveAsrText` hook을 추가해 live audio chunk를 ASR 결과로 묶어 `buildLiveAnalysis`의 `asrText` signal에 주입하도록 연결
- macOS CLI bridge에서 Speech authorization prompt가 TCC privacy crash를 일으키는 문제를 피하기 위해, bridge는 번들 식별자/usage description이 없으면 권한 요청을 하지 않고 `unavailable` 상태만 반환하도록 안전화했다
- Tauri Rust는 local Speech 결과가 unavailable/error일 때 `OPENAI_API_KEY` 또는 `SLOWLEARNER_OPENAI_API_KEY`가 있으면 공식 audio transcription endpoint에 `gpt-4o-mini-transcribe`로 fallback하도록 정리했고, frontend preview에 ASR status/message를 표시하도록 확장했다
- `apps/desktop-ui/src-tauri/Info.plist`를 추가해 `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`를 bundle에 포함했고, debug bundle의 `Contents/Info.plist`에 실제 반영된 것을 확인했다
- `swift build`, `./.build/debug/MacCaptureBridge transcribe-audio --audio-path /tmp/slowlearner-asr-smoke-en.aiff --locale en-US`, `cargo check --manifest-path apps/desktop-ui/src-tauri/Cargo.toml`, `pnpm --filter desktop-ui test`, `pnpm --filter desktop-ui typecheck`, `pnpm lint`, `pnpm build`, `pnpm --filter desktop-ui tauri build --debug`, `plutil -p apps/desktop-ui/src-tauri/target/debug/bundle/macos/AnsimTrack Live.app/Contents/Info.plist | rg 'NSMicrophoneUsageDescription|NSSpeechRecognitionUsageDescription'`로 ASR slice 검증 완료
- 안전한TV `[사회재난] 아파트 화재 시 이렇게 행동합시다` 원본 page/mp4를 fire fixture 공식 source로 고정하고, `fire-door-control-001`, `fire-stair-no-audio-001`의 tracked `sourceReference`/`sourceClipPlan`과 `source_videos.example.json`, `clip_windows.example.json`을 갱신했다
- 로컬 `data/eval/sources/fire-apartment-2739.mp4`에서 `fire-door-control-001.mp4`(8.2초), `fire-stair-no-audio-001.mp4`(6.6초, 무음)를 실제 추출하고, `review-unknown-empty-001.mp4`는 3초 black clip으로 생성해 fire/review fixture까지 전부 local clip 준비 상태로 맞췄다
- `data/eval/manual_review_runs.json`, `data/eval/rehearsal_runs.json`에 actual fire/review clip 준비 상태를 추가하고, `pnpm qa:sync`로 generated markdown log를 다시 맞췄다
- `pnpm eval:audit`, `pnpm qa:smoke`, `pnpm --filter desktop-ui typecheck`, `pnpm lint`로 fire/review clip intake slice 검증 완료

### 진행 중

- 실제 UI walkthrough/pass-fail 기록과 native permission 허용 후 rehearsal pass 로그 누적 단계
- localhost demo path를 넘어, capture 시작/중지와 프리셋 전환이 처음 보는 사용자에게도 명확하게 읽히도록 onboarding/empty-state를 다듬는 단계
- `/demo` 발표 화면과 `/` 검증 화면 사이 역할 분리를 더 명확하게 보이도록 접근 경로와 라벨을 다듬는 단계

### 다음

1. 실제 clip 기반 walkthrough/pass-fail 기록 채우기
2. Screen Recording 권한 허용 뒤 native live rehearsal pass 로그 축적
3. live ASR OpenAI fallback을 앱 설정 또는 secure local secret 주입 경로까지 제품형으로 다듬기
4. demo/live empty state와 첫 사용 설명을 제품 수준으로 정리
5. 발표 화면 진입 링크와 운영자용 전환 UX 정리

## 2026-05-21

### 완료

- 안전한TV 공식 영상 기반 계절 재난 학습 시나리오 5종을 추가했다: 호우, 태풍, 폭염, 한파, 대설
- 각 시나리오는 기존 화재/지진 학습 플레이어와 같은 구조를 따른다: 영상 장면, 자동 정지, 상황/해야 할 일 카드, 하지 말아요, 이유, 확인 질문, 장면별 복습
- `data/rules/seasonal_rules.json`에 계절 재난 공식 rule 20개를 추가하고, `rule-catalog`와 shared hazard schema에 `heavy_rain`, `typhoon`, `heatwave`, `coldwave`, `heavy_snow`를 연결했다
- `data/official_sources/official_sources.json`와 `data/official_sources/official_chunks.json`에 안전한TV 출처와 rule-grounded chunk를 추가해 teacher/QA evidence가 새 주제에도 나오도록 확장했다
- 로컬 원본 영상은 `data/eval/sources/seasonal/*` 아래 ignored 자산으로 두고, 로컬 preview용 압축 mp4/poster도 `apps/desktop-ui/public/demo-video/seasonal/*`에 ignored 자산으로 분리했다
- GitHub Pages 체험 링크의 기본 홈과 학습 순서는 유지했다. 새 계절 재난 주제는 dev 환경의 `/local-seasonal`과 직접 `/scenario/:id` 접근에서만 확인한다
- E2E 테스트를 갱신해 기존 공개 흐름은 `화재 -> 지진 -> 설문`으로 남고, 로컬 전용 계절 재난 페이지는 별도 경로로 열리는지 확인했다
- URL 입력 자동 생성 경로에서 익숙한 주제 키워드가 없는 긴 자막 블록도 먼저 18초 이하 cue로 나눈 뒤 품질검사를 하도록 수정했다. 이제 새 영상이 30초를 넘는다는 이유만으로 한 덩어리 세그먼트가 되어 바로 차단되지 않는다.
- URL 자동 생성 fallback hazard를 화재가 아니라 `재난안전` 일반 프로필로 바꿔, 새 영상에서 주제 키워드를 못 찾았을 때 화재 행동 문구가 잘못 섞이지 않게 했다.
- URL 생성 로딩 UI가 실제 요청보다 먼저 1초 만에 모든 단계가 끝난 것처럼 보이던 흐름을 없애고, 요청은 즉시 시작하되 최소 7초 동안 경과 시간을 표시하며 단계가 순차적으로 진행되게 바꿨다.

### 검증

- `pnpm --filter @ansimtrack/shared-types test`
- `pnpm --filter desktop-ui test -- src/lib/learning-scenarios.test.ts`
- `pnpm --filter desktop-ui test -- src/lib/url-generation-quality.test.ts src/lib/generated-scenario.test.ts`
- `pnpm --filter desktop-ui typecheck`
- `pnpm rules:validate`
- `pnpm build`
- `pnpm --filter desktop-ui test:e2e -- app.spec.ts`
- `pnpm --filter desktop-ui lint`

### 진행 중

- 호우/태풍/폭염/한파/대설의 장면 분할을 다시 검수해, 한 장면에 여러 주제가 섞이던 4~5개 장면 구성을 7~12개 짧은 장면으로 재분할했다. 로컬 계절 재난 시나리오는 이제 각 장면이 30초 이하이고, 시간 구간이 겹치거나 비지 않도록 테스트로 고정했다.
- 계절 재난 rule catalog를 22개로 늘리고, 호우 후 망가진 길/시설 신고와 대설 비닐하우스/양식장 관리 rule 및 official chunk를 분리했다. 덕분에 해당 장면의 행동 카드가 넓은 기존 rule에 억지로 붙지 않고 장면별 근거를 가진다.
- `learning-scenarios.test.ts`에 계절 재난 최소 장면 수, segment 연속성, 30초 이하 duration, 핵심 대본 키워드 보존 검증을 추가했다.
- 실제 느린학습자/교사 검토를 통해 정보량, 표현 난이도, 장면 길이는 다시 조정해야 한다.
- 계절 재난 영상 자산은 로컬 프로토타입 검증용으로만 넣었다. 공개 공유 범위가 커지기 전 안전한TV 영상의 2차 이용 조건과 출처 표기 방식을 확인해야 한다.

### 다음

1. 산사태, 해일, 미세먼지, 감염병 등 남은 주제 후보를 공식 영상/문서 기준으로 선별
2. 새 계절 재난 5종을 교사/보호자에게 우선 검수받아 어색한 문장과 과도한 정보량 정리
3. 공식 영상 사용 권한과 출처 표기 기준 확정
