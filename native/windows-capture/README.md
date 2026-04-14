# windows-capture

Windows 구현은 macOS contract와 맞춘 stub 단계입니다.

## 구현 예정

- Windows.Graphics.Capture
- GraphicsCapturePicker
- WASAPI loopback audio
- Direct3D surface to frame bridge
- macOS와 동일한 frame/audio/session event schema

## 위험 요소

- loopback 오디오 drift
- GPU surface 복사 비용
- DPI 및 scale 이슈
- 보호 콘텐츠의 anti-capture 제한
