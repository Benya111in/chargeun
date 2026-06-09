# A1 Poster Source Notes

- Version: screenshot-free v3, revised after user review of the six reference slides.
- Main message: 700만 명 규모의 느린학습자를 위해 재난안전 영상을 한 장면·한 행동·한 질문 연습 카드로 바꾼다.
- No app screenshots are used.
- Canva/Figma assets are not required for this version; the poster is editable HTML/CSS and renders directly to PDF/PNG.

## Evidence Sources

- 대상 규모: 교육부 추정 및 중앙일보 보도 그래픽 재구성. Poster uses 13.59%, about 6.97 million people, and about 780,000 students.
- 소외 구조: 장애인복지법 시행규칙 기준, 국회 의안정보시스템 재구성, 지자체 조례 현황 연구 and press reports.
- 국회 입법: 22대 국회 기준 경계선지능인 지원 관련 법안 11건 발의, 통과 0이라는 공개 보도 내용을 포스터에 요약.
- 조례 한계: 지방자치단체 조례가 늘었으나 지원 체계성, 예산, 전담조직, 지역 간 지속성 한계가 있다는 연구 내용을 요약.
- 재난 행동 근거: 행정안전부 안전한TV, 국민재난안전포털(safekorea.go.kr)
- 접근성 설계 근거: 한국장애인개발원 장애인 재난안전 가이드, W3C COGA/WCAG, Easy Read/COGA principles.

## Reference Slide Content Integrated

- 대상 규모: 13.59%, 697만 명, 초중고생 78만 명, 30명 중 4명, 소대 중 3~4명.
- 소외 구조: 법적 기준의 절벽, 국회 입법 11회 시도 통과 0, 조례 중심 지원의 한계.
- 영상 분석 Agent: 0.1초 프레임 샘플링, ASR, OCR, 컷 변화량 후보, 멀티트랙 생성 계약.
- 재난안전 검토 Agent: Official RAG corpus, Hazard/Topic schema, semantic rule match, grounded output, ungrounded block.
- 쉬운말 변환 Agent: 한 문장 한 행동, 35자 안팎, 구체 동사, 핵심 단어 보존, 학습자/진행자 분리.
- 품질검사 Agent: generate -> judge -> issue code -> repair -> publish, six checks, needs_repair loop.

## Submission Note

- This version does not include a link slot. Add a short URL only if the final competition format requires it.
