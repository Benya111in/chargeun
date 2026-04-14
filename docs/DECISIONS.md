# DECISIONS

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
