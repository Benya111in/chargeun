# 07_BROWSER_CAPTURE_FALLBACK

## 목표

데스크톱 앱이 아닌 상황이나 시연 보조용으로 브라우저 캡처 fallback을 제공한다.

## 범위

- `getDisplayMedia()` 기반 탭/창/화면 공유
- 오디오 가능 시 수집
- 현재 탭 최적화
- 데스크톱 캡처 실패 시 fallback

## 구현 과업

### A. 기본 공유 흐름
- 사용자 공유 버튼
- `getDisplayMedia()` 호출
- video track 수신
- audio track 존재 여부 확인
- stream 종료 이벤트 처리

### B. 세션 변환
- MediaStream -> analysis lane
- MediaStream -> live preview / shadow input
- 세션 메타데이터 저장

### C. 최적화 옵션
- prefer current tab
- tab audio 사용 시 경로 정리
- 가능하면 특정 region만 사용
- 브라우저 지원 체크

### D. 제약 고지
- 브라우저/OS 따라 오디오가 없을 수 있음
- 사용자가 매번 직접 공유 대상을 선택해야 함
- 지원하지 않는 브라우저일 수 있음

## UI 요구사항

- “브라우저 공유는 보조 기능입니다” 안내 문구
- 오디오 없음 상태를 명확히 표시
- 데스크톱 앱 모드로 전환 유도

## 완료 기준

- 브라우저 공유 stream을 받아 세그먼트 엔진이 동작
- 오디오 없는 영상도 텍스트/OCR 기반으로 최소 기능 유지
- stream 종료 시 앱이 정상 복구

## Codex에게 바로 맡길 일

- browser fallback 컴포넌트 구현
- getDisplayMedia session adapter 작성
- audio unavailable 시 fallback UI 작성
