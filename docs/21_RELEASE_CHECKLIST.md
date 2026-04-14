# 21_RELEASE_CHECKLIST

## 대회 전날 체크리스트

### 앱 실행
- [ ] macOS에서 앱 실행 가능
- [ ] 권한 요청/재시도 정상
- [ ] 데모용 샘플 세션 준비
- [ ] 네트워크 불안정 시 fallback 존재

### 캡처
- [ ] 전체 모니터 캡처 성공
- [ ] 특정 창 캡처 성공
- [ ] 오디오 있는 영상 동작
- [ ] 오디오 없는 영상 fallback 동작

### Shadow Player
- [ ] 4초 지연 유지
- [ ] pause/seek/replay 동작
- [ ] 세그먼트 marker 표시
- [ ] auto-pause 비활성화 토글 있음

### 설명
- [ ] basic/easy/action/reason 동작
- [ ] caregiver/report 동작 또는 안전하게 숨김
- [ ] do_not 표시 가능
- [ ] low confidence fallback 확인

### 음성
- [ ] intent 버튼 동작
- [ ] 마이크 동작
- [ ] TTS 재생 볼륨 적절
- [ ] 음성 실패 시 버튼 대체 가능

### 근거와 안전
- [ ] evidence drawer 작동
- [ ] action track에 rule id 존재
- [ ] 공식 근거 없는 행동 문장 없음
- [ ] cache delete 버튼 있음

### 발표 자료
- [ ] 데모 스크립트 프린트
- [ ] 앱 스크린샷 백업
- [ ] 화면 녹화 백업
- [ ] 플랜B 시연 흐름 준비

## 즉시 수정해야 하는 레드 플래그

- [ ] action track이 공식 rule 없이 출력됨
- [ ] Panic Mode가 장황함
- [ ] 앱 시작 후 10초 안에 핵심 화면이 안 뜸
- [ ] Shadow Player보다 원본 화면에 의존함
- [ ] 저신뢰 상태에서도 확신형 문장이 나옴
