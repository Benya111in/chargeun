# GitHub Pages URL 생성 페이지

## 공개 경로

- GitHub Pages: `https://benya111in.github.io/chargeun/#/url-generator`
- 로컬 확인: `http://127.0.0.1:4173/#/url-generator`

## 원칙

GitHub Pages는 정적 파일만 배포하므로 OpenAI API key를 안전하게 보관할 수 없다.
따라서 `#/url-generator`는 브라우저에서 직접 OpenAI key를 쓰지 않고, 별도 생성 API 서버를 호출한다.

## 생성 API 서버

현재 서버 계약은 다음 endpoint를 사용한다.

- `POST /api/generate-practice-from-url`
- body: `{ "sourceUrl": "https://www.youtube.com/watch?v=..." }`
- response: `{ "record": GeneratedScenarioRecord }`

서버는 다음 환경변수를 사용한다.

- `OPENAI_API_KEY`
- `OPENAI_GENERATION_MODEL=gpt-5.5`
- `GENERATOR_ALLOWED_ORIGINS=https://benya111in.github.io`

## GitHub Pages에서 API 서버 연결하기

GitHub repository variable에 다음 값을 설정한다.

- `GENERATOR_API_BASE=https://<생성 API 서버 도메인>`

그 다음 GitHub Pages workflow를 다시 실행하면 프론트엔드 빌드에
`VITE_GENERATOR_API_BASE`로 들어간다.

임시로는 URL query로도 연결할 수 있다.

```text
https://benya111in.github.io/chargeun/?apiBase=https://<생성 API 서버 도메인>#/url-generator
```

이 값은 브라우저 `localStorage`에 저장되며, 생성 페이지의 “저장된 주소 지우기” 버튼으로 제거할 수 있다.

## 보안 메모

- OpenAI API key는 GitHub Pages HTML, JS, localStorage에 넣지 않는다.
- 생성 API는 허용된 origin만 CORS로 받는다.
- 품질 검사를 통과하지 못한 자동 생성 결과는 학습 화면으로 저장하지 않는다.
