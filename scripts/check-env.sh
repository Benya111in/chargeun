#!/usr/bin/env bash

set -euo pipefail

missing_required=0

check_cmd() {
  local label="$1"
  local cmd="$2"
  local version_cmd="$3"
  local required="${4:-required}"

  if command -v "${cmd%% *}" >/dev/null 2>&1; then
    local version
    version="$($version_cmd 2>/dev/null | head -n 1 || true)"
    if [ -n "$version" ]; then
      printf '[ok] %s - %s\n' "$label" "$version"
    else
      printf '[ok] %s\n' "$label"
    fi
  else
    printf '[missing] %s (%s)\n' "$label" "$required"
    if [ "$required" = "required" ]; then
      missing_required=$((missing_required + 1))
    fi
  fi
}

check_path() {
  local label="$1"
  local path_cmd="$2"

  if eval "$path_cmd" >/dev/null 2>&1; then
    printf '[ok] %s\n' "$label"
  else
    printf '[missing] %s (required)\n' "$label"
    missing_required=$((missing_required + 1))
  fi
}

echo 'Checking local toolchain for AnsimTrack Live'
check_path 'xcode-select command line tools' 'xcode-select -p'
check_cmd 'brew' 'brew' 'brew --version'
check_cmd 'node' 'node' 'node -v'
check_cmd 'pnpm' 'pnpm' 'pnpm -v'
check_cmd 'rustc' 'rustc' 'rustc -V'
check_cmd 'cargo' 'cargo' 'cargo -V'
check_cmd 'swift' 'swift' 'swift --version'
check_cmd 'ffmpeg' 'ffmpeg' 'ffmpeg -version'
check_cmd 'python3' 'python3' 'python3 --version'

if [ -f ".env.local" ]; then
  echo '[ok] .env.local'
else
  echo '[missing] .env.local (optional, copy from .env.example if needed)'
fi

if [ -f ".env.example" ]; then
  echo '[ok] .env.example'
else
  echo '[missing] .env.example (required)'
  missing_required=$((missing_required + 1))
fi

if [ "$missing_required" -gt 0 ]; then
  printf '\nEnvironment check failed: %s required item(s) are missing.\n' "$missing_required"
  exit 1
fi

printf '\nEnvironment check passed.\n'
