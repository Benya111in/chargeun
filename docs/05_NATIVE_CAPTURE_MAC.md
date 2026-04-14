# 05_NATIVE_CAPTURE_MAC

## 목표

macOS에서 **ScreenCaptureKit** 기반으로 모니터 또는 특정 창을 캡처하고, 비디오 프레임과 오디오를 안정적으로 앱 내부로 전달한다.

## 우선순위

1. 전체 모니터 캡처
2. 특정 창 캡처
3. 시스템 오디오 수집
4. 프레임/오디오를 Tauri로 전달
5. 캡처 대상 전환

## 구현 과업

### A. 권한 처리
- Screen Recording 권한 요구 흐름 구현
- 권한 부재 시 안내 모달
- 권한 후 앱 재실행 또는 재확인 로직
- 사용자 취소 경로 처리

### B. 소스 선택기
- 가능한 디스플레이 목록 조회
- 가능한 윈도우 목록 조회
- 제목/썸네일 표시
- 선택 결과를 세션에 저장

### C. 스트림 생성
- ScreenCaptureKit stream 구성
- 30fps 목표
- 해상도 프로필(720p/1080p)
- audio enabled 옵션
- 프레임 콜백 처리
- 타임스탬프 동기화

### D. 앱 브리지
- Swift -> Rust/Tauri bridge
- raw frame 직접 전달이 무거우면 공유 메모리 또는 임시 인코딩 경로 사용
- 세션 제어(start/pause/stop)
- 이벤트 emitter 설계

### E. 오류 처리
- 권한 취소
- 디스플레이 분리
- 윈도우 종료
- 오디오 unavailable
- 과부하 프레임 드롭

## 출력 인터페이스

```ts
type MacCaptureEvent =
  | { type: "session-started"; sessionId: string; width: number; height: number; hasAudio: boolean }
  | { type: "frame"; sessionId: string; tsMs: number; width: number; height: number; pixelBufferRef: string }
  | { type: "audio"; sessionId: string; tsMs: number; pcmRef: string; sampleRate: number; channels: number }
  | { type: "error"; sessionId: string; code: string; message: string }
  | { type: "session-stopped"; sessionId: string }
```

## 완료 기준

- macOS에서 10분 연속 캡처 안정 동작
- 4초 지연 Shadow Player의 입력으로 사용 가능
- 오디오와 비디오 타임스탬프 오차가 관리 가능한 수준
- 캡처 재시작 시 앱이 죽지 않음

## Codex에게 바로 맡길 일

- `native/mac-capture` Swift 패키지 생성
- ScreenCaptureKit 기반 캡처 세션 구현
- Tauri command/event bridge 구현
- 기본 선택기와 권한 가이드 화면 연결
- smoke test 작성
