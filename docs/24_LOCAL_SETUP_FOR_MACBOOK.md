# 24_LOCAL_SETUP_FOR_MACBOOK

## 목적

맥북 로컬 Codex가 바로 실행 가능한 개발 환경을 먼저 만든다.

## 전제

- Apple Silicon MacBook 기준
- 최신 macOS
- Xcode Command Line Tools 설치 가능
- Homebrew 사용 가능

## 권장 설치 순서

1. Xcode Command Line Tools
2. Homebrew
3. Node.js LTS
4. pnpm
5. Rust toolchain
6. Tauri CLI
7. FFmpeg
8. Python 3.11+ (로컬 CV나 스크립트용)
9. Git LFS(optional)

## 예시 명령

```bash
xcode-select --install

/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install node pnpm rustup-init ffmpeg python git-lfs
rustup-init -y
source "$HOME/.cargo/env"

cargo install tauri-cli

git lfs install
```

## 권장 로컬 체크

```bash
node -v
pnpm -v
rustc -V
cargo -V
ffmpeg -version
python3 --version
```

## 환경 변수 파일

`.env.local` 예시

```bash
OPENAI_API_KEY=
GOOGLE_API_KEY=
ENABLE_BROWSER_FALLBACK=true
ENABLE_SAM2=false
DEFAULT_SHADOW_DELAY_MS=4000
```

## 초기 실행 플로우

```bash
pnpm install
pnpm dev
pnpm dev:desktop
```

## 필수 점검

- [ ] Screen Recording 권한 허용
- [ ] 마이크 권한 허용(음성 질의 사용 시)
- [ ] 데모용 샘플 영상 준비
- [ ] 외부 모니터 연결 여부 확인

## Codex에게 바로 맡길 일

- 설치 여부를 점검하는 `scripts/check-env.sh` 생성
- `.env.example` 생성
- `README.md`에 부팅 절차 추가
