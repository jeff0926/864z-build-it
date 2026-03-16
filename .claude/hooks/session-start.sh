#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "[session-start] Installing dependencies..."
cd "$CLAUDE_PROJECT_DIR"

# Install npm dependencies (idempotent — skips if node_modules is cached)
npm install

# Persist environment defaults for the session
cat >> "$CLAUDE_ENV_FILE" <<'ENVEOF'
export A2A_PORT=3000
export A2A_HOST=127.0.0.1
export A2A_URL=http://127.0.0.1:3000
ENVEOF

echo "[session-start] Done."
