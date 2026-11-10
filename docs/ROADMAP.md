# XMINAL — Roadmap

> Curated roadmap. Working notes that used to live in `PLAN.md` / `EXECUTION-PLAN.md` /
> `FEATURE_MATRIX.md` / `BRAIN.md` were removed from the repo in v0.10.0; this file is the
> canonical, maintained version.

## Product thesis

One engine, one terminal, one professional experience — an opencode-class,
provider-agnostic coding agent distributed as an npm CLI. Local/phone-first,
free-tier-first, zero runtime dependencies.

**Deliberately not built:** GUI/Electron app, SaaS, hosted telemetry/sign-in,
Windows-native package, single-binary builds, OAuth device-code for GitHub Models,
real default sandbox (bwrap optional, none by default), agent marketplace, payments.

## Core pillars

1. **Any provider** — 47 built-in providers, local servers, failover, free-first model catalog (models.dev)
2. **Any workflow** — plan / build / compose / review / yolo modes, spec-driven, Ralph loops
3. **Any scale** — single agent → subagents → worktree fleets → swarms
4. **Anywhere** — TUI, headless `xminal run`, HTTP server, Telegram bridge (experimental), MCP server mode
5. **Safe by default** — permissions (ask/auto/full), protected paths, hash-chained audit receipts
6. **Remembers** — sessions, checkpoints, markdown memory, branch/rewind/resume
7. **Cheap** — budget caps, cost tracking, token metering

## Phase status (frozen at v0.10.0)

- [x] Foundation: language stack (TypeScript, CommonJS build, Node ≥ 18), CLI surface, config system
- [x] Provider layer: OpenAI-compatible + Anthropic + Gemini adapters; router with failover; cost tracking
- [x] Agent runtime: streaming loop, tool calling, modes, compaction (tool-pair safe)
- [x] Toolset: read/write/edit/multi_edit/glob/grep/list/bash/todo/memory/skill/checkpoint/git/worktree/verify/web_fetch/web_search/diagnostics/mcp/task/think
- [x] Sessions & memory: resume/branch/rewind/checkpoints/undo; hash-chained audit log; markdown memory with search
- [x] Safety: ask/auto/full permissions, protected paths, tool-output redaction, prompt-injection boundary
- [x] Orchestration: subagents (task), Ralph loop, worktree manager
- [x] MCP client (stdio) + XMINAL-as-MCP-server (`xminal mcp --serve`)
- [x] Interfaces: fullscreen TUI (pure Node), readline REPL, headless `--json`, OpenAI-compatible HTTP server
- [x] Distribution: npm (`npm i -g xminal`), GitHub release tarballs
- [~] Telegram bridge — implemented, never live-tested (needs bot token); marked experimental
- [~] HTTP server — implemented, binds 127.0.0.1, no load test; static bearer auth
- [ ] MCP server hardening, ACP stub, LSP servers
- [ ] Parallel worktree fleets with merge arbitration, swarm planner/executor
- [ ] v1.0: feature freeze, metrics vs aider/codex baseline, docs-complete

## Non-goals for v0.x

- GUI or Electron/Tauri desktop app (would be a separate product)
- Hosted accounts, sign-in, telemetry
- Paid-only dependencies
