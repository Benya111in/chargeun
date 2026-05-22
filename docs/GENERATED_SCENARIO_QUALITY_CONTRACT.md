# Generated Scenario Quality Contract v1

이 문서는 URL 입력으로 만든 새 학습 시나리오가 사용자에게 공개되기 전에 반드시 통과해야 하는 품질 계약이다. 목표는 좋은 결과를 사람이 나중에 골라내는 것이 아니라, 나쁜 결과가 학습 화면으로 열리지 않게 막는 것이다.

## 공개 원칙

- 생성 결과는 검증 통과 전까지 사용자에게 공개하지 않는다.
- GPT-5.5는 장면 분할과 문장 생성을 맡지만, 최종 공개 여부는 deterministic validator가 결정한다.
- `published` 상태만 학습 화면에서 열 수 있는 정상 결과다.
- `needs_repair` 또는 `blocked` 상태는 QA/운영자가 원인을 볼 수는 있지만 학습자 화면으로 이동시키지 않는다.
- 브라우저 `localStorage`, Render 임시 파일, GitHub Pages 캐시는 source of truth가 아니다.

## 생성 상태

- `queued`: 사용자가 URL을 넣어 작업이 대기 중이다.
- `processing`: worker가 영상, 자막, 프레임 근거를 수집하고 GPT-5.5 생성 루프를 실행 중이다.
- `needs_repair`: 검증에서 막혀 재생성 중이거나 재생성이 필요한 상태다.
- `blocked`: 최대 재생성 후에도 공개 기준을 통과하지 못했다.
- `approved`: 품질 검증은 통과했지만 canonical artifact publish 확인이 끝나지 않았다.
- `published`: 품질 검증과 artifact 확인이 모두 끝났고 학습 화면으로 열 수 있다.

## Evidence Package

생성 시작 시 다음 근거 묶음이 있어야 한다.

- 원본 URL
- 다운로드된 `source.mp4`
- VTT/ASR cue
- video duration
- audio sentence boundary
- visual scene cut 후보
- visual caption/OCR boundary 후보
- frame sample manifest

제목, 썸네일, oEmbed 정보만으로 만든 결과는 차단한다.

## 장면 분할 규칙

- 가능한 한 음성 문장이 끝나는 지점에서 장면을 끊는다.
- 화면 자막이나 교육 주제가 바뀌면 장면 분리 후보로 강제 검토한다.
- 한 장면에는 하나의 판단 주제만 둔다.
- 장면 시간은 단조 증가해야 하며 겹치면 안 된다.
- 한 장면은 30초를 넘기지 않는다.
- 영상 파일, JSON의 `startMs/endMs`, 화면에 보이는 설명은 서로 맞아야 한다.

## 학습 내용 규칙

- 원본 음성/자막의 핵심 교육 내용은 누락하지 않는다.
- 쉬운말로 바꾸되 핵심 명사, 장소, 대상은 삭제하지 않는다.
- `말해요`, `알려요`는 무엇을 누구에게 말하는지 반드시 포함한다.
- 행동 장면은 `상황`, `해야 할 일`, `이유`, `하지 말아요`, `확인 질문`을 모두 가져야 한다.
- 행동 카드는 1개에서 3개만 허용한다.
- 확인 질문의 정답은 반드시 하나만 허용한다.
- 질문은 다음 장면을 봐야 알 수 있는 내용이면 안 된다.
- 정답과 헷갈리는 선택지가 둘 다 맞는 구조면 안 된다.

## 쉬운말 차단 규칙

다음 유형은 학습자 화면에 남으면 차단한다.

- 어려운 한자어: `유입`, `차단`, `숙지`, `저지대`, `고립`
- 기계번역체 또는 어색한 문장: `찾기해야`, `가기해야`, `가능할 수`
- 자동자막 오인식으로 보이는 단어: `나리`, `훈화`, `채소`
- 과도한 확신 표현: `안전합니다`
- 대상이 빠진 행동: `말해요`, `알려요`만 단독으로 쓰는 문장

## Artifact 규칙

- canonical storage는 Cloudflare R2다.
- immutable path는 `/generated/{id}/quality-v1/...` 형식을 쓴다.
- 필수 artifact는 `source.mp4`, `scenario.json`, 가능한 경우 `source.vtt`, evidence manifest다.
- publish 전 `scenario.json`과 `source.mp4`는 HEAD 요청으로 200 응답을 확인한다.
- GitHub Pages에는 검수 완료된 데모와 UI만 올라가고, 새 URL 생성물은 canonical artifact URL에서 읽는다.

## Repair Loop

- GPT-5.5는 최대 4회 전체 재생성을 수행한다.
- 실패 사유는 `qualityReport.issues[]` 코드로 다시 입력한다.
- patch 수정은 금지한다. 실패하면 전체 scenario를 다시 생성한다.
- 4회 실패하면 `blocked`로 끝내고 학습 화면으로 공개하지 않는다.
