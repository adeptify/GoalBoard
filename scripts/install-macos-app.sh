#!/bin/bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "GoalBoard Desktop installation is available only on macOS." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="${1:-}"
APP_DIR="${GOALBOARD_APP_DIR:-$HOME/Applications}"
MOUNT_DIR=""

cleanup() {
  if [[ -n "$MOUNT_DIR" && -d "$MOUNT_DIR" ]]; then
    hdiutil detach "$MOUNT_DIR" -quiet || true
    rmdir "$MOUNT_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ -z "$SOURCE" ]]; then
  case "$(uname -m)" in arm64) ARCH="arm64" ;; *) ARCH="x64" ;; esac
  SOURCE="$(find "$REPO_ROOT/release/macos" -maxdepth 1 -type f -name "GoalBoard-*-macos-${ARCH}.dmg" -print 2>/dev/null | sort | tail -1)"
fi
if [[ -z "$SOURCE" || ! -e "$SOURCE" ]]; then
  echo "GoalBoard App or DMG not found. Build it first with pnpm desktop:build:macos, or pass a path." >&2
  exit 1
fi

if [[ "$SOURCE" == *.dmg ]]; then
  MOUNT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/goalboard-dmg.XXXXXX")"
  hdiutil attach "$SOURCE" -nobrowse -readonly -mountpoint "$MOUNT_DIR" -quiet
  SOURCE="$MOUNT_DIR/GoalBoard.app"
fi
if [[ ! -d "$SOURCE" || "$SOURCE" != *.app ]]; then
  echo "The selected source is not a GoalBoard.app bundle: $SOURCE" >&2
  exit 1
fi

mkdir -p "$APP_DIR"
TARGET="$APP_DIR/GoalBoard.app"
if [[ -e "$TARGET" ]]; then
  TRASH_TARGET="$HOME/.Trash/GoalBoard.app.$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$HOME/.Trash"
  mv "$TARGET" "$TRASH_TARGET"
  echo "Moved the previous app to $TRASH_TARGET"
fi
ditto "$SOURCE" "$TARGET"
echo "Installed GoalBoard to $TARGET"
if [[ "${GOALBOARD_SKIP_OPEN:-0}" != "1" ]]; then
  open "$TARGET"
fi
