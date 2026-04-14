# Demo Rehearsal Checklist

> Generated from `data/eval/rehearsal_runs.json` by `pnpm qa:sync`.

## 3-Minute Run

- [ ] 3분 시연 10회 연속 성공 (0/10)
- [x] 앱 시작 후 10초 안에 핵심 화면 진입
- [x] Shadow Player가 중심 화면으로 유지
- [x] 네트워크 불안정해도 fallback 경로로 시연 유지
- [x] 음성 기능을 꺼도 버튼 기반 설명이 유지

## Release-Day Checks

- [ ] 권한 요청/재시도 동작
- [ ] 전체 모니터 캡처 성공
- [ ] 특정 창 캡처 성공
- [x] 오디오 없는 세션 fallback 확인
- [x] evidence drawer와 cache delete 버튼 확인
- [x] low confidence fallback 확인
- [x] 플랜B 화면 녹화/스크린샷 백업 준비

## Run Log

| date | operator | path | result | notes |
| ---- | -------- | ---- | ------ | ----- |
| `2026-04-14` | Codex | demo scenario + automated checks | in_progress | actual native rehearsal blocked by macOS Screen Recording permission; native voice/audio runtime smoke only |
