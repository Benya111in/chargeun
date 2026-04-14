# Demo Rehearsal Checklist

## 3-Minute Run

- [ ] 3분 시연 10회 연속 성공
- [ ] 앱 시작 후 10초 안에 핵심 화면 진입
- [ ] Shadow Player가 중심 화면으로 유지
- [ ] 네트워크 불안정해도 fallback 경로로 시연 유지
- [ ] 음성 기능을 꺼도 버튼 기반 설명이 유지

## Release-Day Checks

- [ ] 권한 요청/재시도 동작
- [ ] 전체 모니터 캡처 성공
- [ ] 특정 창 캡처 성공
- [ ] 오디오 없는 세션 fallback 확인
- [ ] evidence drawer와 cache delete 버튼 확인
- [ ] low confidence fallback 확인
- [ ] 플랜B 화면 녹화/스크린샷 백업 준비

## Run Log

| date         | operator | path                             | result      | notes                                                                |
| ------------ | -------- | -------------------------------- | ----------- | -------------------------------------------------------------------- |
| `2026-04-14` | Codex    | demo scenario + automated checks | in progress | actual native rehearsal blocked by macOS screen recording permission |
