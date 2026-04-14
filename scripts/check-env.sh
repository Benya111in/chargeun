#!/usr/bin/env bash

set -euo pipefail

check() {
  local label="$1"
  local cmd="$2"

  if command -v "${cmd%% *}" >/dev/null 2>&1; then
    printf '[ok] %s\n' "$label"
  else
    printf '[missing] %s\n' "$label"
  fi
}

echo 'Checking local toolchain for AnsimTrack Live'
check 'node' 'node'
check 'pnpm' 'pnpm'
check 'rustc' 'rustc'
check 'cargo' 'cargo'
check 'swift' 'swift'
check 'ffmpeg' 'ffmpeg'
check 'python3' 'python3'

if [ -f ".env.local" ]; then
  echo '[ok] .env.local'
else
  echo '[missing] .env.local'
fi
