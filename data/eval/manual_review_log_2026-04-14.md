# Manual Review Log 2026-04-14

> Generated from `data/eval/manual_review_runs.json` by `pnpm qa:sync`.

## Automated Audit Snapshot

- command: `pnpm eval:audit`
- scope: 5 annotated fixtures, grounded rule integrity, review fallback, audio-missing case
- manual walkthrough coverage: 0/5 clips passed

## Fixture Walkthrough Queue

| clip id                        | scenario                                                       | automated audit | manual UI walkthrough | notes                                                                                                           |
| ------------------------------ | -------------------------------------------------------------- | --------------- | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `fire-door-control-001`        | 복도와 계단으로 빠져나가며 문을 닫는 화재 대피 장면            | pass            | pending               | 안전한TV 원본에서 local clip 추출 완료. Shadow replay와 grounded KR_FIRE_04 설명 흐름, ASR/OCR 근거 확인만 남음 |
| `fire-stair-no-audio-001`      | 오디오 없이 비상구와 계단 표지만 보이는 화재 대피 장면         | pass            | pending               | 무음 actual clip 준비 완료. audio 없이도 grounded 유지와 no-audio fallback UI 확인만 남음                       |
| `earthquake-desk-001`          | 실내에서 흔들림이 시작되어 탁자 아래로 몸을 숨기는 장면        | pass            | pending               | 행정안전부 원본에서 local clip 추출 완료. 실제 UI walkthrough와 음성/근거 확인만 남음                           |
| `earthquake-after-shaking-001` | 흔들림이 멈춘 뒤 가스와 전기를 끄고 출구를 확보하는 장면       | pass            | pending               | 행정안전부 원본에서 local clip 추출 완료. after_shaking 설명과 근거 흐름 확인만 남음                            |
| `review-unknown-empty-001`     | 근거가 거의 없는 빈 장면으로 review fallback을 강제하는 케이스 | pass            | pending               | 3초 black actual clip 생성 완료. review_official 강등과 action/report/do_not 숨김 확인만 남음                   |

## User-Facing QA

- [ ] 버튼만으로 처음부터 끝까지 시연 가능
- [ ] Panic Mode가 한눈에 이해됨
- [ ] 쉬운 설명이 장황하지 않음
- [ ] evidence drawer가 심사자에게 설명 가능함
- [ ] cache delete와 consent modal이 캡처 흐름을 막지 않음

## Current Notes

- 실제 clip walkthrough는 `data/eval/manual_review_runs.json`의 status를 갱신하며 누적한다.
- macOS Screen Recording 권한이 허용되면 native capture와 browser fallback을 같은 표 기준으로 다시 검수한다.
