# 06_NATIVE_CAPTURE_WINDOWS

## 목표

Windows용 경로를 문서화하고, 대회 전이나 이후에 병렬 개발 가능한 수준으로 상세 설계를 남긴다. 맥북에서 바로 구현하지 못해도 **설계와 인터페이스**는 macOS와 맞춘다.

## 기술 축

- Windows.Graphics.Capture
- GraphicsCapturePicker
- WASAPI loopback for system audio
- Tauri bridge

## 구현 과업

### A. 캡처 선택기
- 디스플레이/창 선택
- 노란 캡처 테두리 확인
- 세션 저장

### B. 비디오 프레임 처리
- Direct3D surface -> CPU/GPU-friendly frame path
- 타임스탬프 정렬
- 해상도 옵션
- 프레임 드롭 대응

### C. 오디오 수집
- WASAPI loopback
- 채널/샘플레이트 정규화
- drift 처리

### D. 브리지
- Windows native layer -> Tauri event bridge
- macOS와 동일한 session/frame/audio event schema 유지

## macOS와 맞춰야 하는 인터페이스

- 시작/정지/일시정지 command
- frame/audio event
- source enumeration
- hasAudio / sourceType / displayName metadata

## 완료 기준

- 대회 직전까지 구현 불가해도 문서만으로 타 개발자가 바로 착수 가능
- mac capture 모듈과 같은 app contract를 유지
- Windows 전용 risk list와 fallback 포함

## 위험 요소

- 오디오 loopback과 프레임 타임스탬프 drift
- GPU surface 복사 비용
- 다른 모니터 DPI/scale 이슈
- anti-capture 보호 콘텐츠

## Codex에게 바로 맡길 일

- macOS 경로와 동일한 TypeScript contract 정의
- `native/windows-capture` 스캐폴드 생성
- Windows 구현 TODO를 이 파일 기준으로 코드 주석과 stub로 남기기
