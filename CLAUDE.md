# CLAUDE.md — 864zeros Sovereign OS

## What this project is

An autonomous build pipeline for 864zeros LLC. Two AI agents (CEO: Claude Opus, Worker: Gemini) communicate via an A2A protocol server to identify market gaps in the Google Workspace Add-on marketplace, generate technical blueprints, and build micro-SaaS products — with human approval gates at key checkpoints via Telegram.

## Architecture

```
paperclip.config.json    — Master config: agents, orchestration pipeline, budget, gates
a2a_server.js            — A2A protocol server (HTTP, port 3000). Agent registry + task queue
research_logic.js        — Market gap scanner. Uses Gemini API (or curated fallback) → writes research/PROPOSAL.json
messaging_bridge.js      — Telegram bot bridge. Polls A2A for approval tasks, sends to Telegram, relays responses
```

## Pipeline flow

identify_gap → technical_blueprint → **wait_for_approval** → circular_agent_build → unit_test_gate → **wait_for_approval** → deployment

## Environment variables

Set these as **Codespace secrets** (GitHub Settings > Codespaces > Secrets):

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Optional | Enables live Gemini market scanning. Falls back to curated data without it |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram bot from @BotFather. Runs in dry-run mode without it |
| `TELEGRAM_CHAT_ID` | Optional | Your Telegram chat ID for approval notifications |

Non-secret defaults are set automatically by the session-start hook:
- `A2A_PORT=3000`, `A2A_HOST=127.0.0.1`, `A2A_URL=http://127.0.0.1:3000`

## Commands

```bash
node a2a_server.js           # Start the A2A server
node research_logic.js       # Run market gap scan (needs A2A server running)
node messaging_bridge.js     # Start Telegram bridge (needs A2A server running)
npm run lint                 # ESLint
npm test                     # Node built-in test runner
```

## Development setup

This repo is designed for **cloud-only development** — no local install needed.

- **Claude Code on the web**: SessionStart hook (`.claude/hooks/session-start.sh`) auto-installs deps
- **GitHub Codespaces**: Open in browser, secrets are injected automatically, run `claude` in terminal
- Works from phone, Chromebook, tablet — anything with a browser

## Key decisions

- Zero external npm runtime deps — only Node built-ins. ESLint is a devDependency only.
- ES modules throughout (`"type": "module"`)
- `.env` file is gitignored. Use Codespace secrets or session env for API keys.
- The A2A server is the backbone — all agents communicate through it, never directly.

## Current status

- A2A server: working, tested
- Market scanner: working (curated fallback active, Gemini integration ready)
- Telegram bridge: working (dry-run mode without token)
- Next: build the first product from PROPOSAL.json (likely the Legal Contract Review Sidebar)
