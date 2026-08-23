#!/bin/bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "GoalBoard macOS releases must be built on macOS." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION="$(node -p "require('$REPO_ROOT/package.json').version")"

case "$(uname -m)" in
  arm64) RELEASE_ARCH="arm64" ;;
  x86_64) RELEASE_ARCH="x64" ;;
  *) echo "Unsupported macOS architecture: $(uname -m)" >&2; exit 1 ;;
esac

export GOALBOARD_MACOS_ARCH="$RELEASE_ARCH"
pnpm --dir "$REPO_ROOT" build
"$SCRIPT_DIR/prepare-macos-runtime.sh"

(cd "$REPO_ROOT/desktop" && "$REPO_ROOT/node_modules/.bin/tauri" build --bundles app,dmg --ci)

BUNDLE_ROOT="$REPO_ROOT/desktop/src-tauri/target/release/bundle"
APP_PATH="$BUNDLE_ROOT/macos/GoalBoard.app"
DMG_PATH="$(find "$BUNDLE_ROOT/dmg" -maxdepth 1 -type f -name '*.dmg' -print -quit)"
if [[ ! -d "$APP_PATH" || -z "$DMG_PATH" || ! -f "$DMG_PATH" ]]; then
  echo "Tauri did not produce the expected GoalBoard.app and DMG." >&2
  exit 1
fi

OUTPUT_DIR="$REPO_ROOT/release/macos"
mkdir -p "$OUTPUT_DIR"
OUTPUT_DMG="$OUTPUT_DIR/GoalBoard-${VERSION}-macos-${RELEASE_ARCH}.dmg"
OUTPUT_ZIP="$OUTPUT_DIR/GoalBoard-${VERSION}-macos-${RELEASE_ARCH}.app.zip"
rm -f "$OUTPUT_DMG" "$OUTPUT_ZIP" "$OUTPUT_DMG.sha256" "$OUTPUT_ZIP.sha256"
cp "$DMG_PATH" "$OUTPUT_DMG"
ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$OUTPUT_ZIP"
(cd "$OUTPUT_DIR" && shasum -a 256 "$(basename "$OUTPUT_DMG")" > "$(basename "$OUTPUT_DMG").sha256")
(cd "$OUTPUT_DIR" && shasum -a 256 "$(basename "$OUTPUT_ZIP")" > "$(basename "$OUTPUT_ZIP").sha256")

echo "Built GoalBoard macOS release:"
echo "  $OUTPUT_DMG"
echo "  $OUTPUT_ZIP"
if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "  Signing: ad-hoc (Gatekeeper approval is still required for downloaded builds)"
else
  echo "  Signing: $APPLE_SIGNING_IDENTITY"
fi
