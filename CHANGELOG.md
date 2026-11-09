# Changelog

All notable changes to XMINAL are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: semver.

## [Unreleased]

## [0.7.1] — 2026-11-09

**Published on npm: `xminal@0.7.1`** (`npm install -g xminal`).

### Fixed

- **Stale default model IDs** in the provider wizard: Groq default was `llama-3.3-70b-versatile` (removed from catalog; now `openai/gpt-oss-120b`), NVIDIA default was `nvidia/llama-3.1-nemotron-70b-instruct` (404; now `nvidia/nemotron-3.5-super-vl-120b-a12b`). These were rejecting otherwise-valid keys as `invalid_key`.

### Verified

- Live end-to-end against Groq (`openai/gpt-oss-120b`) and NVIDIA NIM (`nvidia/nemotron-3.5-super-vl-120b-a12b`) — agent loop + streaming + tool call all work with user-supplied keys.

## [0.7.0] — 2026-11-09

**Published on npm: `xminal@0.7.0`** (`npm install -g xminal`).

### Added

- **App-like TUI flow (opencode-style sidebar on the right)** — boots to a full-screen "Greeting" home: title bar with session + `+` button, tagline, sidebar sections (Greeting · Context · Session · Todos · Skills · MCP), blue-accent input box, model line with `max` badge, ctrl+p status bar.
- **`/` = full command catalog** — every XMINAL command (70+ entries across 10 groups: Session, Agent, Providers, Tasks, Skills, MCP, Dev, Git, Usage, Setup, Audit, System) in a single scrollable amber-highlighted list. Type to filter, ↑↓/PgUp/PgDn navigate, Enter runs, Esc closes.
- **`/provider` wizard** — pick from the full 40-provider catalog (green + = ready, muted - = needs key), enter a masked API key, **validate live** against the provider's `/chat/completions`, save on success.
- **`/model` picker** — 258 model aliases from models.dev (context + pricing), filterable, Enter sets the session's default model.
- **`/variant`** — set reasoning effort: low / medium / high / max (this session).

### Changed

- `/provider`, `/model`, `/variant`, `/help` now render **inside** the TUI (full-screen overlays) instead of leaving the alternate screen.
- Unknown `/commands` suggest close matches from the catalog instead of dumping to the classic renderer.

## [0.6.1] — 2026-11-09

**Published on npm: `xminal@0.6.1`** (`npm install -g xminal`).

### Fixed

- CRLF line endings — `LF` alone left the cursor mid-row and shifted the alternate screen sideways (corrupt render in strict terminals).
- Command palette now actually renders (state machine existed, renderer missing): `/` prefix filter + `↑↓` navigation + `Enter` to run + `Tab` complete + `Ctrl+P` toggle.
- `COLUMNS`/`LINES` env vars respected when `stdout.columns/rows` is unset (phones/Termux).
- Palette selected row spans full width with amber background + near-black text.

## [0.6.0] — 2026-11-09

**Published on npm: `xminal@0.6.0`** (`npm install -g xminal`).

### Added

- **Opencode-clone TUI (built-in default)** — a pure-Node fullscreen TUI matching opencode's design language: near-black background, dark input panels with blue accent bar, amber "max" badge, title bar with session + `+`, divider, streaming chat with `▍` accent markers, right sidebar (≥100 cols) with Greeting/Context/TODOS/SKILLS/MCP, status bar with `esc interrupt` / `ctrl+p commands`, `/` palette with prefix match + ↑↓, Tab cycles modes, Ctrl+P toggles palette.
- `XMINAL_TUI_ENGINE=opentui` opts into the experimental OpenTUI build (Bun required).

### Changed

- Default UI is now the built-in clone TUI on **all platforms** (no Bun required, works on Termux/Android).

## [0.5.4] — 2026-11-09

**Published on npm: `xminal@0.5.4`** (`npm install -g xminal`).

### Fixed

- **Phone-width (≈44–60 cols) terminal rendered garbled UI** — sidebar (42 cols) no longer shows below 100 cols, ASCII logo replaced by a compact one-line banner under 70 cols, header trimmed to model + cost under 60 cols. The fullscreen TUI now works on narrow terminals.

## [0.5.3] — 2026-11-09

**Published on npm: `xminal@0.5.3`** (`npm install -g xminal`).

### Fixed

- **TUI crashed with `EditBuffer is destroyed`** — `exitOnCtrlC: true` let OpenTUI tear down the input buffer while our ENTER handler still held references; now Ctrl+C goes through our own handler (clean teardown: stop input → `renderer.destroy()` → exit alternate screen → close runtime → exit 0), `/exit` uses the same path, and all agent callbacks no-op after `closed` so no async stream writes to a destroyed buffer.

## [0.5.2] — 2026-11-09

**Published on npm: `xminal@0.5.2`** (`npm install -g xminal`).

### Fixed

- **TUI crashed at startup on stock installs** — `renderer.on("resize", …)` called `renderer.resize()` internally, re-entering the resize path and corrupting the frame. Removed the handler; OpenTUI handles terminal resize natively.
- Fatal TUI errors now surface as a clear message instead of dumping the native stack (falls back to classic REPL).

## [0.5.1] — 2026-11-09

**Published on npm: `xminal@0.5.1`** (`npm install -g xminal`).

### Fixed

- **`xminal` silently fell back to classic REPL on machines where Node is the bin runtime** — `#!/usr/bin/env node` + OpenTUI's Bun-only FFI meant stock Node never reached the TUI. Now `xminal` (interactive TTY) re-execs itself under `bun` when available; if Bun is missing it prints a clear warning and starts classic REPL. Headless `xminal run` stays on Node.
- `BUN` env var overrides the bun binary lookup.

## [0.5.0] — 2026-11-08

**Published on npm: `xminal@0.5.0`** (`npm install -g xminal`).

### Changed

- **TUI rewritten on OpenTUI** — the same Zig-native render engine opencode uses. Imperative tree of `BoxRenderable`/`TextRenderable`/`ScrollBoxRenderable`/`InputRenderable` over Yoga flexbox layout: header bar (model · mode · cost), streaming chat with sticky scroll, sidebar (session title, cwd + git branch, TODOS synced from state, MCP servers, skills/tools counts), boxed `›` prompt with `/`-commands, and footer keybinding hints.
- Requires **Bun ≥ 1.4** for the TUI (same model as opencode). Node fallback remains classic REPL via `--no-tui` or automatic detection.
- Sidebar is full-height raised background; vertical scrollbar hidden when content fits.
- Agent streaming re-renders in place via `TextRenderable.content +=`.

### Added

- `XMINAL_TUI=1` forces TUI even on non-TTY (for testing/integration harnesses).


## [0.4.1] — 2026-11-08

**Published on npm: `xminal@0.4.1`** (`npm install -g xminal`).

### Fixed

- **Frame overflow bug**: header(3) + sidebar/chat + rule(1) + input(3) + footer(1) now exactly equals `rows()`; previously emitted `rows()+3` lines causing flicker/scroll corruption.
- **Stale cache**: wrapped-lines cache used `lines.length` as key — appends to an assistant line returned old content; now keys on `(lines.length, totalChars)`.
- **PTY height**: `sbHeight()` now reserves header+rule+input+footer — `rows()-8`.
- Palette overlay clamped to `effSb` rows so it never overflows the body area.
- Removed unused `inCodeBlock` state and tightened palette index clamping.


## [0.4.0] — 2026-11-08

**Published on npm: `xminal@0.4.0`** (`npm install -g xminal`).

### Changed

- **Tokyo Night theme** — the same palette opencode ships by default (`assets/tokyonight.json`): `darkStep1` background, `darkStep2` raised sidebar, `darkStep9` primary `#82aaff`, `darkStep11` muted `#828bb8`.
- **Sidebar restyled to match opencode**: full-height raised background (`raised` bg with fg-only resets), compact todo rows (`▶/✓/!/○`), MCP dot rows, session meta, location + git branch.
- Footer split into rule + muted keybinding line; logo line slimmer.

### Added

- `bgFill` helper for raised-bg sidebar rows; `fgClip` clips inner resets to foreground-only so the raised fill survives colored tokens.


## [0.3.0] — 2026-11-08

**Published on npm: `xminal@0.3.0`** (`npm install -g xminal`).

### Added

- **OpenCode-class TUI layout**: fullscreen alternate-screen UI with header (logo + session + model/mode/permission/cost), role-colored streaming chat, right-hand sidebar (session, location + git branch, TODOS synced from state, MCP servers + tool counts, skills/tools counters), boxed input, and footer.
- **`/`-command palette** with fuzzy prefix match, ↑/↓ navigation, Tab completion.
- **Ctrl+B** toggles sidebar · **Tab** cycles agent mode · **PgUp/PgDn** scrollback · **Ctrl+C** abort/quit.
- Sidebar collapses under 100 columns; `--no-tui` still falls back to classic REPL for non-TTY.
- Multiline paste now submits per line (embedded `\r`/`\n`).


## [0.2.0] — 2026-11-08

**Published on npm: `xminal@0.2.0`** (`npm install -g xminal`).

### Added

- **Fullscreen TUI** (XMINAL-branded): alternate-screen terminal UI with logo, model/mode/permission/cost status header, scrolling message area, boxed input with placeholder, `/`-command palette (prefix-match, Tab to complete), permission prompt rendered inline, PgUp/PgDn scrollback, manual scroll + position indicator.
- **F1** MCP/tool-usage panel · **F2** skills panel · **F3** status panel — `xminal` now looks like OpenCode but on-brand.
- `xminal --no-tui` flag and `XMINAL_TUI=1` env to force/fallback; automatic fallback to the classic REPL on TUI failure or non-TTY.
- Quitting mid-run (busy `/exit` or Ctrl+C) now aborts the agent before exiting.

### Fixed

- REPL multiline pasted input: embedded `\r`/`\n` are now processed as line submissions (was dropping all lines after the first).


## [0.1.2] — 2026-11-08

**Published on npm: `xminal@0.1.2`** (`npm install -g xminal`).

### Added

- Self-hosted landing page at `GET /landing` on `xminal serve` — full product showcase (hero, stats, 12 features, quickstart, 47-provider grid, safety model, comparison, roadmap, FAQ, npm/GitHub CTAs). Built via XMINAL's own headless agent (dogfooded), completed after OpenRouter free-tier daily quota exhausted.
- `site/` ships inside the npm package; `/landing` resolves the bundled asset first, cwd fallback for development.


## [0.1.1] — 2026-11-08

**Published on npm: `xminal@0.1.1`** (`npm install -g xminal`).

Patch release: hardening + distribution fixes + community-ready install path.

### Added
- Built-in web UI at `GET /` on `xminal serve` (streaming SSE chat page, self-contained, dark).
- `xminal skills install <path|git-url> [--global]` and `/skills install …` (folder or git URL, SKILL.md validated).
- Skills trust layer: `.xminal/skills.lock.json` sha256 lockfile; `xminal skills --lock|--verify`; REPL warns on drift.
- Per-tool and per-MCP-server token metering: `xminal` records every tool call (`/tools`, `/mcp` table, `run --json` `toolUsage`, `/cost` shows tool-token estimate).
- `xminal audit verify` and `/audit verify|tail` — SHA-256 hash-chain verifier for permission audit receipts.
- Secret redaction of tool output before the model sees it (private keys, `sk-*`, GitHub/Google/Slack tokens, JWTs) — strip to `[REDACTED:<label>]` with a notice; system prompt treats tool output as untrusted data.
- Repo secret-scan test (`tests/secrets.test.js`) and `AGENTS.md`.

### Fixed
- REPL: piped stdin was echoed and stalled after the first command; now queue-based input, clean non-TTY mode, exits on EOF.
- `Agent.compactHistory` could orphan tool results from their assistant; compaction now backs off to the tool-call boundary (unit-tested).
- Gemini adapter had duplicated unreachable code; gemini provider entry de-duplicated (single `gemini` key, aliases renamed).

### Changed
- `dist/` is committed so installs never need devDependencies; `prepare` skips the build when typescript is absent.
- README documents single-command install via release tarball; GitHub-URL npm install is broken in our environment (npm bug, deterministic ENOENT) — avoid recommending it.



- Built-in web UI at `GET /` (streaming chat via SSE against `/v1/chat/completions`) for any `xminal serve` instance; public page, API stays bearer-protected.
- Secret redaction before the model sees tool output: `redactSecrets` strips private-key blocks, `sk-*`/`ghp_*`/`github_pat_*`/`AIza*`/`xox*-*`/`sk-or-*`/`sk-ant-*` and JWTs from tool results (marked `[REDACTED:…]`), and the system prompt now treats tool output as untrusted data (prompt-injection boundary).
- `xminal skills install <path|git-url> [--global]` — install skills from a local folder or any git URL with SKILL.md (validated, clear error otherwise); also `/skills install` in the REPL.
- Skill trust/lockfile: project skills hashed into `.xminal/skills.lock.json` (`xminal skills --lock`, `xminal skills --verify`, `/skills --lock|--verify`); REPL warns on drift.
- Global agent instructions (`AGENTS.md`).

### Fixed

- REPL no longer loses or infinitely spins on piped stdin: input is queue-based, non-TTY piped lines are processed in order and the process exits on EOF/`/exit`; readline `terminal: true` only when stdin is a TTY (no more echo of piped input).
- `Agent.compactHistory("/compact")` could cut inside an assistant↔tool run, producing a session OpenAI/Anthropic reject ("tool call does not have a tool result"). Compaction now backs the boundary off to the assistant with tool calls. Same boundary handling as the model-context compactor (which was already safe).

### Changed

- Repo secret-scan test now honors a `secret-scan: allow` marker for intentional test fixtures.

## [0.1.0] — 2026-11-08

First runnable release.

### Added

- Agent runtime: streaming provider loop, tool calling, Plan/Build/Compose/Review/YOLO modes, context compaction, per-session cost/turn budgets, Ctrl+C abort.
- Providers: OpenAI-compatible adapter (all `*_API_KEY` / local), native Anthropic Messages, native Gemini; failover router with cost tracking; **47 built-in providers, 258 model aliases** (models.dev snapshot, 2026-11-08) with pricing/context; keyless **OpenCode** default (`opencode/inkling-2-small-free`).
- Tools: `read`, `write`, `edit`, `multi_edit`, `list`, `glob`, `grep`, `bash` (sandbox hook), `todo`, `memory`, `skill`, `checkpoint`, `git`, `worktree`, `verify`, `web_fetch`, `web_search`, `diagnostics`, `mcp_list`, `mcp_call`, `task`, `think`.
- Sessions: JSONL event log, resume/branch, checkpoints + `/undo`, rewind, hash-chained audit receipts, project/global Markdown memory with search, `~/.agents/skills` discovery.
- Safety: ask/auto/full permission engine, protected paths, dangerous/risky classifiers, never-prompt-safe read-only tools, `xminal audit verify` hash-chain verifier, SECURITY.md.
- Orchestration: `task` subagent tool, Ralph verify loop (`xminal ralph`), git worktree manager.
- MCP stdio server mode (`xminal mcp --serve`) exposing all XMINAL tools to any MCP client.
- Telemetry: per-tool and per-MCP token metering — `recordToolUsage` stamps every call into `.xminal/receipts/tool-usage.jsonl` (args/result tokens ≈ chars/4, errors, duration, model); `xminal` REPL shows it under `/mcp` and `/tools`; `xminal run --json` emits `toolUsage`.
- Interfaces: readline REPL + slash commands, headless `xminal run --json`, OpenAI-compatible HTTP server (`/v1/chat/completions` SSE, `/v1/agent`), Telegram bridge (long-poll).
- CLI: `xminal`, `run`, `resume`, `init`, `doctor`, `models`, `sessions`, `skills`, `mcp`, `config`, `serve`, `telegram`, `ralph`, `worktree`, `version`, `help`; on PATH via `npm link` / `~/.local/bin`.
- Docs: README, EXECUTION-PLAN (18 phases), PLAN, FEATURE_MATRIX (125/125), BRAIN.
- Tests: 20 `node:test` suites (config, permissions, sessions, memory/skills, MCP client fixture, MCP stdio server, secret-scan) — no network required.

### Known limitations

- Live LLM endpoints not smoked on this machine (OpenCode free tier returns 429; no keys present).
- Bedrock/Vertex/Azure native adapters missing (OpenAI-compatible coverage only).
- Ink-class streaming TUI and web UI not yet implemented.
- npm publish pending maintainer approval.
