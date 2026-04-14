# KNOWN_ISSUES

- macOS ScreenCaptureKit 실연결은 아직 스텁 단계다.
- Windows capture는 문서화 및 TODO만 있다.
- 음성 입력은 버튼 intent 우선이며 STT는 후속 단계다.
- 데모 데이터는 mock 세션을 사용하므로 실제 캡처 drift는 아직 검증되지 않았다.
- Shadow Player의 auto-pause는 현재 marker 기반 UI 검증 단계이며 실제 segment detector 연동은 후속 작업이다.
- browser live preview fallback은 켜졌지만 아직 shadow buffer나 perception packet 입력으로는 연결되지 않았다.
- native mac capture는 source enumerate와 logical session bookkeeping까지 구현됐지만 실제 frame/audio stream bridge는 아직 미구현이다.
- `swift test`는 현재 로컬 툴체인에서 `XCTest`/`Testing` 모듈을 바로 찾지 못해 smoke executable 검증으로 대체하고 있다.
