# Manual Review Log 2026-04-14

## Automated Audit Snapshot

- command: `pnpm eval:audit`
- scope: 5 annotated fixtures, grounded rule integrity, review fallback, audio-missing case
- result: `2026-04-14` 기준 `5/5 fixtures passed`

## Fixture Walkthrough Queue

| clip id                        | scenario                      | automated audit | manual UI walkthrough | notes                                                   |
| ------------------------------ | ----------------------------- | --------------- | --------------------- | ------------------------------------------------------- |
| `fire-door-control-001`        | 화재 복도/문 닫기             | pass            | pending               | evidence drawer에서 source title과 matched signals 확인 |
| `fire-stair-no-audio-001`      | 오디오 없는 화재 대피         | pass            | pending               | OCR/object hint만으로 grounded 유지 확인                |
| `earthquake-desk-001`          | 지진 초기 보호                | pass            | pending               | Panic Mode 한눈성 확인                                  |
| `earthquake-after-shaking-001` | 흔들림 종료 후 가스/출구 확보 | pass            | pending               | after_shaking phase 자연스러움 확인                     |
| `review-unknown-empty-001`     | 빈 장면 review fallback       | pass            | pending               | action/report/do_not가 숨겨지는지 확인                  |

## User-Facing QA

- [ ] 버튼만으로 처음부터 끝까지 시연 가능
- [ ] Panic Mode가 한눈에 이해됨
- [ ] 쉬운 설명이 장황하지 않음
- [ ] evidence drawer가 심사자에게 설명 가능함
- [ ] cache delete와 consent modal이 캡처 흐름을 막지 않음

## Current Notes

- native Screen Recording 권한이 아직 `denied`라 macOS 실캡처 walkthrough는 권한 허용 뒤 다시 확인해야 함
- browser fallback과 demo scenario는 현재 코드 기준으로 우선 검토 대상
