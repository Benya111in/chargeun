# 02 macOS Capture

## 사용 시점

ScreenCaptureKit, 권한, source enumerate, session start/stop, frame/audio event bridge를 구현하거나 고칠 때 사용한다.

## Source Docs

- `docs/05_NATIVE_CAPTURE_MAC.md`
- `docs/16_DATA_MODELS_AND_API_CONTRACTS.md`
- `docs/25_CODEX_PROMPTS_BY_DOMAIN.md`

## Prompt

```text
native/mac-capture 모듈을 만들어라.
목표는 ScreenCaptureKit 기반으로 디스플레이 또는 윈도우를 캡처하고 프레임/오디오 이벤트를 Tauri 앱으로 전달하는 것이다.

요구사항:
- 권한 체크 및 권한 안내 흐름
- source enumeration
- session start/stop
- frame event with timestamp
- audio event with timestamp
- error event
- 앱이 죽지 않는 안전한 브리지

shared-types 의 CaptureSession과 이벤트 contract를 사용해라.
Swift 코드, Tauri bridge, 간단한 smoke test, 사용법 문서를 함께 만들어라.
```
