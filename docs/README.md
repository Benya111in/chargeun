# 안심트랙 Live Codex 작업 패키지

이 ZIP은 **맥북 로컬 Codex**가 바로 읽고 실행할 수 있도록 만든 경진대회용 구현 패키지입니다. 목표는 아래 한 줄로 정의합니다.

> **현재 모니터에 보이는 재난안전 영상을 사용자 동의 하에 캡처하고, 3~5초 지연된 Shadow Player 위에서 판단 지점별 세그먼트와 멀티트랙 설명을 제공하는 인지접근성 재난 안내 플레이어를 만든다.**

## 이 패키지의 사용 방법

1. `00_START_HERE.md`부터 읽습니다.
2. `20_CODEX_EXECUTION_ORDER.md` 순서대로 작업합니다.
3. 각 분야 파일의 `Codex에게 바로 맡길 일` 절을 그대로 작업 지시 프롬프트로 써도 됩니다.
4. 가장 먼저 **macOS 단일 데모 경로**를 완성하고, Windows/브라우저는 문서화 후 분리 구현합니다.
5. 최종 목표는 **심사위원 앞에서 3분 안에 보여줄 수 있는 polished demo**입니다.

## 권장 MVP 범위

- macOS 데스크톱 앱(Tauri 2)
- ScreenCaptureKit 기반 모니터/창 캡처
- 4초 지연 Shadow Player
- 화재/지진 공식 행동요령 grounding
- 세그먼트 단위 멀티트랙 카드
- 음성 재설명(“다시”, “더 쉽게”, “왜?”, “지금 뭐 해?”)
- Panic Mode
- 근거 패널

## 폴더 안 파일 구성

- `00_START_HERE.md`: Codex 운영 원칙, 전체 목표, 우선순위
- `01_PROJECT_SCOPE_AND_SUCCESS_METRICS.md`: 제품 범위와 성공 기준
- `02_SYSTEM_ARCHITECTURE.md`: 전체 구조 및 데이터 흐름
- `03_REPO_BOOTSTRAP_AND_STANDARDS.md`: 저장소 부트스트랩 및 개발 규칙
- `04_PRODUCT_UX_ACCESSIBILITY_REQUIREMENTS.md`: UX/인지접근성 요구사항
- `05_NATIVE_CAPTURE_MAC.md`: macOS 캡처 상세 구현
- `06_NATIVE_CAPTURE_WINDOWS.md`: Windows 캡처 상세 구현
- `07_BROWSER_CAPTURE_FALLBACK.md`: 브라우저 fallback 설계
- `08_SHADOW_PLAYER_AND_BUFFER_ENGINE.md`: 지연 버퍼/재생 엔진
- `09_PERCEPTION_PIPELINE.md`: ASR/OCR/화면 파싱/추적
- `10_HAZARD_CLASSIFIER_AND_SEGMENT_ENGINE.md`: 재난 분류/세그먼트 엔진
- `11_RULE_KB_AND_GROUNDING.md`: 공식 행동요령 지식베이스
- `12_LLM_ORCHESTRATION_AND_PROMPTS.md`: LLM 호출과 프롬프트 설계
- `13_VOICE_REALTIME_AND_TTS.md`: 음성 상호작용
- `14_FRONTEND_PLAYER_UI.md`: 플레이어/HUD/UI 구현
- `15_BACKEND_STORAGE_AND_JOBS.md`: 저장소/워커/백그라운드 작업
- `16_DATA_MODELS_AND_API_CONTRACTS.md`: 타입/스키마/API
- `17_SAFETY_PRIVACY_AND_COMPLIANCE.md`: 안전/프라이버시 가드레일
- `18_EVALUATION_AND_QA.md`: 평가/테스트/수작업 검수
- `19_DEMO_RUNBOOK_AND_PITCH.md`: 실제 시연 흐름
- `20_CODEX_EXECUTION_ORDER.md`: Codex 작업 순서표
- `21_RELEASE_CHECKLIST.md`: 릴리즈 직전 점검표
- `22_POST_DEMO_BACKLOG.md`: 대회 이후 확장 항목

## 전체 산출물 기준

최소 산출물은 아래 7개입니다.

- 실행 가능한 macOS 앱 1개
- 재난안전 데모 영상 2종(화재/지진)
- Shadow Player 동작 데모
- 멀티트랙 UI 동작 데모
- 공식 근거 패널
- 음성 재설명 동작
- 발표용 스크립트와 녹화본

## Codex에게 기본적으로 요구할 태도

- 질문을 최소화하고 합리적 가정을 문서에 남긴다.
- 실패하더라도 막히지 말고 fallback을 구현한다.
- 기능보다 **시연 완성도**를 우선한다.
- 실시간 정확도보다 **안전한 grounding과 좋은 UX**를 우선한다.
