#!/bin/bash
set -euo pipefail

for APP in "${GOALBOARD_APP_DIR:-$HOME/Applications}/GoalBoard.app" "/Applications/GoalBoard.app"; do
  if [[ -d "$APP" ]]; then
    open "$APP"
    echo "Started GoalBoard: $APP"
    exit 0
  fi
done

echo "GoalBoard.app is not installed. Run pnpm desktop:install:macos or drag it from the DMG into Applications." >&2
exit 1
