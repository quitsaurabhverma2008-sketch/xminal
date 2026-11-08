# XMINAL — Execution Plan (15–20 phases → build → brand → release)

**Owner:** XMINAL team
**Working dir:** `/workspace/projects/ff`
**Status:** v0.1.0 built · 18/18 tests · `xminal` on PATH · brand assets landed (logo/LICENSE/README/CHANGELOG)
**Rule:** keep shipping until the whole project is running best-to-best. Do not skip a phase.

Legend: `[x]` done · `[~]` in progress · `[ ]` pending

---

## Phase 0 — Project hygiene & toolchain `[x]`

- **Deliverables:** Node 20 + TypeScript 5.9 build pipeline, `package.json` (bin `xminal` → `dist/index.js`), `.gitignore`, `npm pack` clean.
- **Acceptance:** `npm run build` passes; `npm test` 18/18 PASS; tarball 100+ files.

## Phase 1 — Brand identity `[x]`

- **Deliverables:** name `XMINAL`, tagline `EVERY CODING AGENT. ONE TERMINAL.`, signature cyan gradient, ASCII banner (`render.ts` + README hero), SVG logo (`brand/logo.svg`), `LICENSE`, `CHANGELOG.md`, `xminal --version` prints tagline.
- **Acceptance:** `xminal --version` → `xminal 0.1.0 — EVERY CODING AGENT. ONE TERMINAL.` ✓ logo on dark background ✓.

## Phase 2 — CLI surface `[x]`

- **Deliverables:** `xminal`, `xminal run`, `resume`, `init`, `doctor`, `models`, `sessions`, `skills`, `mcp`, `config`, `ralph`, `worktree`, `serve`, `telegram`, `version`, `help`; slash commands (`/mode`, `/model`, `/memory`, `/ralph` …).
- **Acceptance:** every subcommand exits 0/non-zero correctly; `--help` complete; SIGINT aborts safely.

### Phase 3 — Config system `[x]`

- **Deliverables:** global (`~/.xminal/config.json`) + project (`.xminal/config.json`) + env (`XMINAL_MODEL`, `XMINAL_PERMISSION_MODE`) merge; `xminal init`; profiles-ready shape.
- **Acceptance:** project overrides global; missing keys show honest warnings via `xminal doctor`.

## Phase 4 — Provider layer `[x]`

- **Deliverables:** OpenAI-compatible adapter, Anthropic native, Gemini native; router (failover, per-provider readiness, first-error surfacing); cost tracking; 47 built-in providers; 258 aliases from models.dev (2026-11-08 snapshot); keyless OpenCode default.
- **Acceptance:** `resolveModel` resolves every alias; `xminal models` readable; Bedrock/Vertex/Azure listed as pending native adapters.

## Phase 5 — Agent runtime `[x]`

- **Deliverables:** streaming loop, tool calls, parallel turns, modes (Plan/Build/Compose/Review/YOLO), compaction (tool-pair safe), budget cap, abort on Ctrl+C, ephemeral subagents.
- **Acceptance:** resumed sessions re-seed history; cost limit stops gracefully; protected paths never editable.

## Phase 6 — Toolset `[x]`

- **Deliverables:** `read/write/edit/multi_edit/list/glob/grep/bash/todo/memory/skill/checkpoint/git/worktree/verify/web_fetch/web_search/diagnostics/mcp_list/mcp_call/task/think`.
- **Acceptance:** `/verify` auto-detects project test command; `/ralph` iterates until verify passes or N iterations fail.

## Phase 7 — Sessions & memory `[x]`

- **Deliverables:** JSONL event log, resume/branch (`Session.branch`), checkpoints (auto before edits), `undo`, rewind, hash-chained audit receipts, Markdown memory with search + `~/.agents/skills` discovery.
- **Acceptance:** `undoLast` restores file bytes; audit chain verifiable; memory search ranks by tags.

## Phase 8 — Safety & permissions `[x]`

- **Deliverables:** modes ask/auto/full; protected paths (`.env`, `~/.ssh`, `~/.aws` …), dangerous/risky classifiers, audit log, sandbox hook (bwrap — `bwrap` not installed on this box), no secrets in prompts.
- **Acceptance:** `.env` denied even in full mode; `rm -rf`/`sudo` denied without approval; read-only tools always allowed.

## Phase 9 — Orchestration `[~]`

- **Deliverables:** `task` subagent tool (explore/plan/review/general), `runRalph` with verify loop, `worktree` tool + `xminal worktree` CLI.
- **Acceptance:** subagent gets fresh context + depth limit 1; ralph reports pass/fail with iteration count.

## Phase 10 — Interop: MCP · ACP · LSP · DAP `[x]`

- **Deliverables done:** MCP client (stdio JSON-RPC, initialize/list/call), `mcp_list`/`mcp_call` tools, offline echo fixture test, **XMINAL as MCP server (`xminal mcp --serve`)**, stdio protocol integration test.
- **Pending:** MCP server mode (`xminal serve` exists for HTTP; MCP stdio server not yet), ACP stub, LSP language servers for Python/Go/Rust, DAP for debugging.
- **Acceptance:** external MCP servers (filesystem, memory) callable from the agent; `xminal mcp` lists them.

## Phase 11 — Interfaces: REPL · headless · HTTP · Telegram · TUI `[x/~]`

- **Deliverables:** readline REPL with slash commands, headless `xminal run --json`, OpenAI-compatible HTTP server (`/v1/chat/completions` SSE + `/v1/agent`), **built-in streaming web UI (`/`)**, Telegram bridge (long-poll), cost status bar, banner.
- **Pending:** Ink-class streaming TUI.
- **Acceptance:** `curl /health` public; `/v1/agent` runs; Telegram responds (needs `TELEGRAM_BOT_TOKEN`).

## Phase 12 — Branding & docs `[x]`

- **Deliverables:** `README.md` (hero, quickstart, commands, config, safety model, honest v0.1 status), `CHANGELOG.md` (v0.1.0), `LICENSE` (MIT), `brand/logo.svg`, `scripts/install.sh`, `package.json` verify script + full `files` manifest.
- **Acceptance:** first screen explains XMINAL in 5 seconds; every CLI command documented with example.

## Phase 13 — Testing & quality gates `[x/~]`

- **Deliverables done:** 18 `node:test` suites (config, permissions, session, memory/skills, MCP fixture), no network needed, `npm pack --dry-run` clean (111 files incl. brand assets), pipe-safe exit codes.
- **Pending:** live provider contract tests (blocked: no credentials on this box), perf budget (startup <1s), npm publish dry-run.
- **Acceptance:** `npm test` 18/18; contract suite runs in CI once secrets exist.

## Phase 14 — Distribution & release `[~]`

- **Deliverables:** GitHub Release v0.1.0 with tarball + release notes ✓, repo PUBLIC with CI green ✓, `scripts/install.sh`.
- **Pending:** npm registry publish (`npm install -g xminal`) — needs user go-ahead; `npx xminal`.
- **Acceptance:** fresh machine: `npm i -g xminal && xminal doctor` → green in <5 min. **Needs user go-ahead for publish.**

## Phase 15 — Security hardening `[~]`

- **Deliverables done:** `SECURITY.md`, repo secret-scan test, `xminal audit verify` (hash-chain verifier), prompt-injection boundary guards (system prompt + tool-output redaction with `src/util/redact.ts`), skill hash lockfile (`xminal skills --lock|--verify`).
- **Acceptance:** planted canary secret never reaches the model; audit chain verifies ✓.

## Phase 16 — Ecosystem & skills marketplace `[ ]`

- **Deliverables:** XMINAL skill pack (repo maintenance, release, docs), MCP bundles curated list, plugin API stability, `xminal skills install` scaffold.
- **Acceptance:** 10 skills ship; skill install from folder + git works.

## Phase 17 — Advanced orchestration `[ ]`

- **Deliverables:** parallel worktree fleets with merge arbitration, swarm planner/executor split, cost-aware routing across cheap/strong models, background agents (daemon), cron/interval runs.
- **Acceptance:** 3 worktrees run agents in parallel and merge cleanly; router picks cheapest capable model.

## Phase 18 — v1.0 freeze `[ ]`

- **Deliverables:** feature-freeze, docs-complete, success metrics (tokens/$ per task vs aider/codex baseline), v1.0 tag, announcement assets.
- **Acceptance:** all phases green; `xminal` recommended for daily driver work on this repo.

---

## Sequencing

```
P0→P2→P3→P4→P5→P6→P7→P8  ── foundation (DONE)
        ╲→P9→P10→P11       ── orchestration + interop (IN PROGRESS)
                 ╲→P12      ── brand + docs (IN PROGRESS)
                          ╲→P13→P14→P15→P16→P17→P18
```

## Blockers / needs user

1. **Live LLM** — opencode free tier returns 429 on this box; unblock with OpenCode Go, an API key, or a local Ollama install.
2. **npm publish + GitHub repo/release** — needs user decision + repo URL.
3. **Telegram bot token** — for the bridge test.
4. **Bedrock/Vertex/Azure** — native adapters (scope decision).

## Links

- `PLAN.md` — strategy & roadmap detail
- `FEATURE_MATRIX.md` — 125/125 feature mapping
- `BRAIN.md` — current state, decisions, resume point
- `FEATURE_MATRIX.md` ↔ this file: each FEATURE_MATRIX row maps to a phase above
