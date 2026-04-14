# Prompt Assets

이 디렉터리는 두 종류의 prompt 자산을 함께 관리한다.

- `prompts/*.md`: 앱 내부 오케스트레이션에 붙일 runtime prompt 골격
- `prompts/codex/*.md`: 로컬 Codex에 그대로 붙여 넣어 작업시킬 수 있는 도메인별 작업 prompt

## 운영 원칙

- macOS 단일 경로와 Shadow Player 중심 흐름을 우선한다.
- `action`과 `report`는 공식 rule grounding 없이는 만들지 않는다.
- 가장 저렴한 경로와 로컬 처리를 먼저 쓴다.
- API 키, 사용자 비밀, 배포용 자격 증명을 prompt에 하드코딩하지 않는다.
- 각 slice가 끝나면 검증, 문서 갱신, git commit까지 한 묶음으로 처리한다.

## Runtime Prompt Set

- `segment-reasoner.md`: `PerceptionPacket -> Segment` 판단용 system prompt
- `track-generator.md`: grounded rule을 6개 트랙으로 재작성하는 prompt
- `voice-reexplainer.md`: 현재 세그먼트 범위 안에서만 재설명하는 prompt

## Codex Prompt Set

- `codex/01-repository-bootstrap.md`
- `codex/02-macos-capture.md`
- `codex/03-shadow-player.md`
- `codex/04-rules-kb.md`
- `codex/05-perception-pipeline.md`
- `codex/06-hazard-segment-engine.md`
- `codex/07-multi-track-generator.md`
- `codex/08-ui-implementation.md`
- `codex/09-voice-intents.md`
- `codex/10-demo-mode-and-rehearsal.md`

## 사용 방법

1. 저장소 구현 작업을 위임할 때는 `prompts/codex/*.md`의 `Prompt` 블록을 그대로 사용한다.
2. 앱 내부 prompt를 손볼 때는 먼저 `docs/12_LLM_ORCHESTRATION_AND_PROMPTS.md`와 이 디렉터리의 runtime prompt 3종을 함께 수정한다.
3. 변경 후에는 `pnpm prompts:validate`로 자산 누락과 핵심 제약 문구를 확인한다.
