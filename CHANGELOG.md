# Changelog

All notable changes to XMINAL are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: semver.

## [Unreleased]

## [0.27.1] — 2026-11-13

**`xminal web-ui` actually serves the web UI now.**

### Fixed

- **`xminal web-ui` silently became `xminal run "web-ui"`** — the dispatch had a `case "web-ui"` but `web-ui` was missing from `KNOWN_COMMANDS` in the argument parser, so the words `web-ui` were passed to the agent as a *prompt*. The whole CLI (0.25.0 → 0.27.0) was affected; the TUI's `/web-ui` command was not (it calls the server directly). Reported by a live run: the agent received "web-ui" and correctly answered it had nothing to implement.
- **Regression guard**: `tests/cli-routing.test.js` pins the invariant — `parseArgs(["web-ui"])` must route to `web-ui`, and every `case "x"` label in the CLI dispatch must exist in `KNOWN_COMMANDS` (prevents the whole class of "documented but unroutable" commands).

### Tests

- 264/264 (+4: web-ui routing, flags, dispatch↔KNOWN_COMMANDS invariant, unknown-words→`run` fallback preserved).

## [0.27.0] — 2026-11-13

**The browser UI grew a spine — a complete Ekko-Studio-style agent workspace, wired end-to-end into the agent's permission system.**

### Added

- **Rewritten web client** (`xminal web-ui` / `/web-ui` / `GET /`): light, Ekko-Studio-style page. Left icon rail with dedicated pages — Chat, Sessions, Model, Mode, Effort, Permissions, Approvals, Usage, Connection, Commands, Share/Export, Settings, About — plus a collapsible session sidebar (search, pin, rename, delete, per-session cost), a top bar with session title · turns/tokens/cost chip with context-window % · connection pill · Stop button, and a composer with model/mode/effort/permission pills.
- **Approval flow, end to end**: the agent's ask-permission prompts now stream as SSE `permission` events (`id`, `tool`, `arguments`, `risk`, `reason`) and resolve through **`POST /v1/agent/permission`** (`{id, approve|decision, always}`). "Approve & always allow" sticks for the rest of the browser session — server-side, session-keyed; your global config is never rewritten, and protected-path hard-denies always apply. If the browser tab closes mid-approval the pending ask auto-denies (with a connection-close hook and a finally-block sweep) so the agent can never hang on a ghost prompt.
- **Effort + permission mode per request**: `/v1/agent/stream` accepts `effort` (`low|medium|high|max` → per-turn output token budget) and `permissionMode` (`ask|auto|full`) and applies them to the run before it starts.
- **Enriched `/v1/models`**: every entry now carries `context_window`, `max_output_tokens`, `pricing` (prompt/completion per MTok) and a `free` flag (all-zero pricing counts as free). 258 models · 46 providers.
- **Command palette (Ctrl+K)** in the page: fuzzy search across commands, pages, sessions and models; arrow keys + Enter.
- **Slash-command menu** in the composer: `/mode /model /variant /compact /clear /verify /map /diff /constitution /spec /skills /mcp /tools /cost /audit /status /help` with Tab/arrows/Enter navigation.
- **Message actions** (hover / always on touch): copy, edit & resend, regenerate, thumbs up/down, delete; file attachments (paperclip or drag-drop, 2 MB cap, sent as `--- file: name ---` blocks); KaTeX math rendering via CDN (auto-rendered, silently skipped offline — nothing else breaks); **Share/Export** page (copy conversation as Markdown, download session JSON, copy session ID); **Usage** page (turns, tokens, cost bar, context-window meter, per-session breakdown); **Approvals** page (pending + decision history); **Permissions** page (see/reset always-allowed tools).
- **Malformed JSON → 400** (was 500) on every POST endpoint.
- **Tests**: 260/260 — new: malformed-JSON 400 for all POST routes, `/v1/agent/permission` unknown-id 404, enriched page markers (`id="sbar"`, `id="rail"`, `id="ta"`, permission-endpoint wiring), `message`/`input` accepted as prompt aliases.

### Changed

- The web client page source is still embedded in `src/server/web.ts` (byte-exact — round-trip verified against the raw source during release verification) and now replaces the previous dark client wholesale.
- The permissions core passes tool **args** through to the ask handler (TUI/REPL handlers unchanged — extra parameter is additive), and gains a session-scoped `allowTool()` so "always allow" never leaks across sessions or past the protected-path hard-deny.

### Notes

- Risk vocabulary mapping: permission manager `dangerous` → `high`, `risky` → `medium`, `safe` → `low`. In `ask` mode every non-safe tool prompts; in `auto` mode only dangerous tools prompt (risky auto-allows); in `full` mode nothing prompts; protected-path reads/writes always deny without asking.
- KaTeX is the page's only CDN fetch (math rendering); everything else — including all agent functionality — is self-contained and works offline against a local `xminal serve`.

## [0.26.0] — 2026-11-13

**The web UI grew up — a real agent chat client, dark and Ekko-grade, in zero deps.**

### Added

- **Full agent chat client** served by `xminal serve`: sidebar with live sessions (rename/switch via `/v1/sessions`), mode & model pills (model autodetected from `/v1/models`), turn/token/cost counters, and **streaming answers with live tool-call cards** (◐ spinning `bash: …` / `read: …` / etc with collapsible args and output, red when the tool errored). Markdown-ish rendering with fenced code blocks, `COPY` buttons, inline code, bold, headings, links.
- **`/v1/agent/stream`** — new SSE endpoint streaming structured events: `session`, `status` (includes free-quota fallback messages, e.g. `groq/openai/gpt-oss-120b`), `text`, `reasoning` (for thinking models), `tool_call`, `tool_result`, `usage`, `done` (with `stoppedReason`), `error`. `xminal web-ui` and `/web-ui` in the TUI now serve this client instead of the bare page.
- **`xminal web-ui`** opens it in your browser automatically (`/web-ui` in the TUI does the same on 127.0.0.1:8787, or the next free port).
- **Empty-prompt guards**: `/v1/agent/stream` returns 400 without touching the model.
- **Tests**: 258/258 (new: empty-prompt rejection for `/v1/agent/stream`; the web UI test now asserts the full client markers: `id="sidebar"`, `id="modelSelect"`, `tool-head`).

### Fixed

- **The served page had a JavaScript syntax error** (raw `\n` inside regex literals and string literals in the template literal rendered as real newlines — every client threw on load). The renderer is now syntax-validated in CI-style checks: the built page's `<script>` is extracted and checked with `node --check` during release verification.

## [0.25.0] — 2026-11-12

**`xminal web-ui` — XMINAL ka apna browser UI, zero deps, MIT, in-family.**

### Added

- **The XMINAL web UI**: `xminal web-ui` starts the local server and opens it in your browser (`/web-ui` in the TUI does the same, opening `http://127.0.0.1:8787` by default). The page is a full chat client: dark theme matching the TUI, session sidebar (from `/v1/sessions`), SSE-streamed answers, markdown-ish rendering with code fences + copy button, model/mode/turns/cost pills, Esc to stop, clear-conversation button. Built into XMINAL itself — no external service, no new dependency.
- **TUI `/web-ui` (and `/web`)**: starts (or reuses) the local server on the first free port from 8787, prints the URL in the transcript, opens your browser.
- **Server routes for the UI**: `POST /v1/chat/completions` (already OpenAI-compatible, SSE streaming), plus `GET /health`, `GET /v1/models`, `GET /v1/sessions` — all covered by new HTTP-level tests.
- **`xminal web-ui [--port N] [--host H] [--token T]`**: same as `xminal serve` but opens the browser automatically.
- The web page auto-detects the configured default model and fills the pill; Ctrl+C in the terminal stops the server.

### Changed

- **Tests**: 6 new HTTP-level tests for the web UI (page serves, content-type, /health, /v1/models, /v1/sessions, /v1/chat/completions rejects empty prompt offline). 257/257 green.
- The TUI browser-open for `/web-ui` is skipped during tests (`XMINAL_WEB_UI_NO_OPEN=1`).

## [0.24.0] — 2026-11-12

**The skills.sh catalog — 20,000 skills, offline, searchable from everywhere.**

### Added

- **The whole skills.sh registry ships in the package** (`data/skills-catalog.json`, built from the public skills.sh sitemaps by `scripts/fetch-skills-catalog.py` — 20,000 skills, 1 MB minified) and is **searchable offline** everywhere the MCP catalog already was.
- **`/skills` opens the skills.sh catalog overlay in the TUI** (a direct analogue of `/mcp`): type to filter, `↑↓` to move, `Enter` for details, `Ctrl+A` to install into `.xminal/skills/`. No network needed to browse or search.
- **`skill_registry_search`** is now backed by the offline catalog (was: live fetch of the sitemap). **`skill_install`** finds the exact entry and downloads the GitHub tarball (no npx, no Node 22, no OIDC).
- **`xminal skills search <query>`** and **`/skill-search`** use the offline catalog; **`xminal skills install`** and **`/skill-install`** accept the exact name or the full `owner/repo/skill` id.
- **Install by id**: `xminal skills install mattpocock/skills/tdd` installs that exact skill without guessing.
- **Tests**: the catalog has its own suite (20,000 entries present, ids well-formed, `tdd` lands on `mattpocock/skills/tdd`, meta reports count and fetch date) and the TUI e2e harness feeds the script robustly (one line per 300 ms tick so a lone Esc never coalesces with printable text).

### Changed

- **E2E harness stability**: the TUI end-to-end test no longer races the boot render; each script line is written 300 ms apart.
- **`/skills` (bare) now opens the catalog overlay** — `/skills --lock` and `/skills --verify` keep the classic flag-style handler.

## [0.23.1] — 2026-11-12

**The rendering bug that broke every inline code span — and screenshots proof it.**

### Fixed

- **`wrapAnsi` split SGR escape sequences mid-token**: a token with zero visible width (a pure escape sequence — e.g. the inline-code background) was treated as "a word wider than the whole line", so the lone ESC byte was emitted as its own row and the sequence body printed as literal text — every inline-code span in a long line broke the layout and leaked raw `[48;2;30;30;30m`-style output into the screen. Slices that consume only escapes are now accepted verbatim.
- **Tool output no longer reaches the model with raw ANSI bytes** — `renderObservation` strips every escape sequence before the model sees it, so the model can no longer echo terminal escapes back into its reply. The shared `util/ansi.ts` `stripAnsi` was upgraded to the full grammar (CSI, colon-SGR, OSC→BEL/ST, single-char ESC) to match; the observation path uses it.
- **The built-in TUI palettes are now covered by a golden-frame snapshot** (`tests/golden/palette.txt`, `tests/tui-e2e.test.js`): the settled `/help` frame is compared byte-for-byte after normalizing the volatile spans (workspace path, token/cost counters, placeholder rotation). Regenerate with `UPDATE_GOLDEN=1 node tests/tui-e2e.test.js`.

### Changed

- **Layout contract**: the six indent conventions are now named constants in `src/tui/chat-lines.ts` (`CONTENT_COL`, `RULE_COL`, `DETAIL_COL`, `RULE`, `BODY_COL`, `CONTINUATION`) and documented in `docs/FRONTENDS.md`.
- **README screenshots regenerated** from the live TUI with the wrapAnsi fix (inline code with backgrounds now renders correctly).
- **`wrapAnsi` shows zero-width tokens attached** instead of pushing the lone ESC byte as its own row.

## [0.23.0] — 2026-11-12

**The rendering pass: opencode's ± diff bands, a code-fence gutter with continuation markers, a rendered-cell table grid — and one provider catalog.**

### Added

- **The edit/write diff card renders the opencode ± background bands** (`#20303b` / `#37222c` — the theme tokens existed, nothing rendered them), plus a `… N more diff lines` footer.
- **Code fences**: a thin left gutter separates the code surface from prose; wrapped long lines carry a `↪` continuation marker (indistinguishable from new code lines before); keyword highlighting for 16 languages (was 4).
- **`src/tui/chat-lines.ts`**: the chat-line renderer extracted out of the `startTui` closure — width in, rows out, unit-tested without a PTY (`tests/chat-lines.test.js`).
- **`tests/session-repair.test.js`**: session-resume repair covered by tests.

### Fixed

- **Tables** measure the **rendered** cell (markdown-aware) and budget `cols*2+1` — a column of `**bold**` no longer overruns its slot, and clipping is ANSI-safe.
- **± rows in the diff card are background-tinted**, not just foreground-colored.
- **Checkpoints**: checkpoint blobs are written `0600` and checkpoint directories `0700` (best effort — a no-op on FAT/exFAT shared storage, documented as such).
- **Permissions**: `mcp_call` is explicitly classified (names the external server), `capabilities`/`mcp_search`/`skill_registry_search`/`mcp_add`/`skill_install` are classified correctly, and the skills fallback is documented-first (`when_to_use` + triggers) instead of first-12-alphabetical.
- **Provider catalog drift eliminated**: `PROVIDER_CATALOG` (`src/config/providers.ts`) is the single source of truth — the TUI's `PROVIDERS`, the router's `PROVIDER_DEFAULT_MODELS` and `defaultConfig()`'s providers were three copies that had drifted (togetherai, siliconflow `.com`/`.cn`, minimax's adapter type, gemini). `provider-defaults.ts` is deleted.

### Changed

- **60 uncalled exports removed** (19 deleted outright, 39 demoted to internal — e.g. `toolGlyph`, `diffFiles`, `pagerank`); `Agent.phase()` (never called) removed.
- **Shared helpers deduplicated**: `costOf()` (render.ts + CostTracker), `keepBg` (theme.ts), `WORDMARK` (render/TUI/classic banner), `estimateTokens` (tool-usage is the single implementation), `openExternal` (used by classic REPL and TUI).
- **SECURITY.md** documents the config permission hardening (0600/0700 at startup), checkpoint plaintext, and the shared-storage no-op mode.

## [0.22.0] — 2026-11-12

**The audit-driven hardening release: honest diffs, honest quota errors, an agent that knows what it can do, and a native skills.sh installer.**

### Added

- **Capability awareness**: the system prompt carries a `<CAPABILITIES>` block — every tool with a read-only marker and one-line purpose, the configured MCP servers, and the skills ranked for the current request. New read-only `capabilities` tool runs the full async snapshot, including **per-MCP status** (a dead server now reports `FAILED — <reason>` instead of vanishing silently).
- **`mcp_search`** tool: searches the built-in 3,832-server offline catalog from inside the agent (previously human-only).
- **`mcp_add`** tool: registers a catalog entry in `~/.xminal/config.json` (disabled, with a placeholder command, approval-gated).
- **Native skills.sh registry installer** (`src/skills/registry.ts`): `xminal skills search <query>` / `xminal skills install <name>` / `/skill-search` / `/skill-install` / `skill_registry_search` + `skill_install` tools. Works from the public sitemap + GitHub codeload — no npx, no Node 22, no OIDC. Zero-dep tar.gz reader with a path-traversal guard, symlink refusal, 25 MB / 500-file caps; installs are recorded with a skills.sh-v2-compatible **`computedHash`** (SHA-256 of `path\0byteLen\0content`, sorted by path — test vector verified against `# hi\n`) in `.xminal/skills.lock.v2.json`. The index is cached on disk for 24 h.
- **`/clear-key <provider>`** command (the palette advertised it; it did not exist).
- **Session repair on load**: an interrupted tool-call turn gets synthetic tool responses (`[interrupted: …]`) instead of poisoning the next provider request (which providers reject with a 400).
- **Signal handlers**: SIGTERM/SIGHUP/SIGINT and uncaughtException now restore the terminal (alternate screen off, cursor visible), flush the session and exit cleanly — Android can kill the app without warning.
- **`skill_registry_search` / `skill_install`** in the tool registry.

### Fixed

- **The diff engine was wrong**: a 2-line edit reported +6 −6. Real LCS line diff with `@@ -a,b +c,d @@` hunk headers (`src/util/diff.ts`).
- **Quota errors were misclassified**: a 429 with a free-quota body now classifies as `quota` (not "rate limited"), carries `retry-after`, and the fallback notice names the model that will actually serve next, says when the pool may be shared, and how long to wait. Non-quota failures skip to the next candidate instead of aborting the chain; a per-session exhausted set stops re-probing dead models; usage events tag the model that actually answered; the candidate loop has a hard attempt cap (12).
- **The context meter showed cumulative spend** as "% of the window". It now shows the current prompt's token estimate; the sidebar labels spend separately ("spent this session").
- **The formatter rewrote the model's words** (`...` → `.`). Model output now reaches the reader byte-for-byte.
- **`visibleWidth` was wrong for colon-form SGR (`ESC[38:2:…m`) and ST-terminated OSC** (counted escapes as glyphs — every row containing them was padded wrong). One width engine (`src/tui/ansi.ts`): grapheme-safe, ZWJ sequences, word-aware wrapping, no split surrogate pairs. The markdown renderer's duplicate width table is gone.
- **The condenser never saw the tool schemas** (`estimateTokens(String(8000))` measured the digits `"8000"`). It now counts `schemaChars/4` from the actual serialized defs (measured ≈12 KB, ≈3,000 tokens, re-sent every turn).
- **Tool arguments were silently "repaired"**: malformed JSON became `{}` and the tool ran with no arguments. Malformed calls are now refused with an actionable observation, and args are validated against each tool's own JSON-Schema-lite (required fields + top-level types) before execution.
- **The audit chain broke on restart** (verify said "BROKEN"). The log rehydrates seq/prev from disk.
- **Run-state**: `finished → running` is refused properly (`startTurn()` funnel).
- **Scroll pinning**: pushing a line while the user is scrolled up no longer snaps the viewport to the bottom.
- **Provider keys** written 0600 (they were world-readable); `~/.xminal` chmod 0700 at startup and added to the default protected paths.
- **Redaction**: `gsk_…` (Groq), `nvapi-…` (NVIDIA), `hf_…` (Hugging Face), `sk-*` variants and `API_KEY`-style field names are now scrubbed from tool output sent to the model.
- **Palette**: 19 advertised commands had no implementation; they were removed or implemented. The remaining palette is mechanically audited against both the TUI and classic handlers.

### Changed

- `ink`, `react`, `react-reconciler` moved to **optionalDependencies** — the built-in TUI needs nothing; phones can `npm install -g xminal --omit=optional`.
- Mouse reporting is **off by default on Android** (it broke tap-to-scroll in Termux).
- **Dead code removed**: `DANGEROUS_PATTERNS`/`RISKY_PATTERNS` (the live risk engine is `core/risk.ts`), `src/tui/layout.ts`, the **60 exported symbols** no file referenced (19 deleted outright, 39 demoted to internal), `Agent.phase()`, `provider-defaults.ts`.
- **Single provider catalog** (`src/config/providers.ts`): the TUI list, the router's `PROVIDER_DEFAULT_MODELS` and `defaultConfig()`'s providers were three copies that had drifted (togetherai, siliconflow `.com`/`.cn`, minimax anthropic vs openai, gemini's adapter type). One canonical 46-entry list; everything reads it.
- **The diff card gained the opencode ± background bands** (`#20303b` added / `#37222c` removed — the theme tokens existed, nothing rendered them) with a `… N more diff lines` footer.
- **Code fences**: a thin left gutter on every code row, `↪` continuation markers for wrapped long lines, and keyword highlighting for 16 languages (was 4).
- **Tables**: the grid is budgeted `cols*2+1` and **measures rendered cells**, so a column of `**bold**` no longer overruns its slot.
- **Checkpoint blobs** are written `0600`, checkpoint directories `0700` (best effort; documented as a no-op on shared storage).
- **Session resume repair is tested**: interrupted tool-call turns get synthetic tool responses (`tests/session-repair.test.js`).
- **SECURITY.md** documents the checkpoint plaintext reality and the shared-storage no-op mode.



## [0.21.0] — 2026-11-12

**Everything that was left is done: durable specs, a real condenser, an explicit run state, the architect split, the working set, skill validation and the trajectory.**

### Added

- **Durable feature artifacts** (`src/core/spec/`): `spec.md`, `plan.md` and `tasks.md` per feature under `.xminal/features/<NNN-slug>/`, a pointer file, sequential numbering, idempotent creation. The spec carries `FR-###` requirements, user stories with acceptance scenarios, edge cases and success criteria; the task list uses the machine-checkable `- [ ] T001 [P] [US1] …` form.
- **A traceability analyzer** (`src/core/spec/coverage.ts`): requirement → task → file, with the gaps (uncovered requirement, unmapped task, `[NEEDS CLARIFICATION]` marker, duplicated requirement) and a deterministic report.
- **A versioned project constitution** (`src/core/spec/constitution.ts`): `MUST` / `SHOULD` / `MUST NOT` principles, semantic versioning, injected into the prompt and checked against the change — a dependency added against a "no new dependency" rule is a **critical** finding.
- **A bounded clarification session** (`src/core/spec/clarify.ts`): the spec is scanned against twelve requirement categories, at most five questions are asked (scope → security → UX → technical), and every answer is written back into the spec.
- **A real condenser** (`src/core/condenser.ts`): condensation triggers on the real token budget (not a message count), protects the head, keeps a suffix sized to the budget, never splits a tool call from its result, refuses to drop less than 10 %, and summarises with the model — cumulatively, so the summary never decays. The mechanical digest is the fallback when no model answers.
- **An explicit run state** (`src/core/run-state.ts`): idle / running / awaiting_confirmation / paused / stopped / finished / error / stuck, one mutation funnel, illegal transitions refused, every transition recorded (`/state`).
- **The architect/editor split** (`src/core/architect.ts`): a read-only planner writes the plan, a fresh editor implements it — the long-dead `plannerModel` / `executorModel` settings now work (`/architect`).
- **The working set** (`src/core/chat-files.ts`): `/add`, `/drop`, `/ls`, `/read` and `/tokens`. Files in the chat are excluded from the repository map and the prompt states what may be changed.
- **Skill progressive disclosure** (`src/skills/manifest.ts`): the `skill` tool gained `outline` (sections + shipped files) and `read` (one file, path traversal blocked) — a skill no longer dumps 40 KB.
- **Skill validation** (`src/skills/validate.ts`): `xminal skill validate` checks the frontmatter, the name, the description, the size, stray dev files and missing references.
- **The trajectory** (`src/core/trajectory.ts`): every action of a run is written to `.xminal/sessions/<id>/trajectory.json` as it happens, and `/traj` aggregates the runs (`xminal stats`).
- A CI job for a **self-hosted Termux runner** (label `android-termux`, disabled until one is registered).

### Fixed

- The action/observation pair is now recorded per tool call, so a denied action is distinguishable from a failed tool.
- The permission prompt moves the run into `awaiting_confirmation` and back, so a crash while waiting is visible.

### Notes

- 195/195 tests green. The reference repositories were read locally (superpowers, spec-kit, aider, OpenHands, SWE-agent); nothing was copied and nothing depends on them.


## [0.20.0] — 2026-11-12

**The agent got smarter: it reads the repo as a graph, edits like a pro, refuses to loop, and judges commands by what they actually do.**

The ideas below were studied in five open-source projects (superpowers, spec-kit,
aider, OpenHands, SWE-agent). Nothing was copied and nothing depends on them —
the implementations below are XMINAL's own TypeScript, and every behaviour is
covered by offline tests.

### Fixed

- **The repository map was empty for any project with 400+ files.** Two walks shared one file counter, so the second pass yielded nothing. The map is now built in a single pass and always returns the files it scanned.
- **`echo "rm -rf /"` was classified as a destructive command.** The risk rules matched the whole command line. Commands are now split into their real segments (quotes respected) and judged per segment — a string that merely mentions a dangerous word is no longer dangerous, while `rm -r -f /` and `rm  -rf  /` are now caught.
- **A failed edit told the model nothing.** "oldString not found" is now a report: the nearest matching block with its line numbers, whether the replacement is already in the file, and — for `multi_edit` — which of the other edits were applied, so the model does not repeat them.
- **The model could not tell a failed command from one that printed "exit 1".** Every tool result is now a typed observation (ok / failed / empty / timeout / denied / error) with the exit code, the duration, and an explicit note when the output was empty, truncated or timed out.

### Added

- **Repository map v2** (`src/core/repo-map.ts`): definitions and references with line numbers, an ident-level graph, a weighted PageRank over it, and the request's own identifiers boosted. A file that important files depend on now ranks high even when the request never mentions it. Important project files (package.json, tsconfig, …) are always in the map.
- **Skill triggers and a bootstrap** (`src/skills/bootstrap.ts`): skills can declare *when to use* them (`when_to_use`, `triggers` in the frontmatter); the list is ranked for the current request, and the agent is told to load a relevant skill **before** it acts.
- **Risk analysis** (`src/core/risk.ts`, `src/core/shell-segments.ts`): four-valued risk (LOW/MEDIUM/HIGH/UNKNOWN), structural rails (fetch-to-exec, catastrophic-delete), and prompt-injection scanning of tool output. An analyser that cannot decide fails closed.
- **Stuck detection** (`src/core/stuck.ts`): the same failing action twice, or a streak of errors, produces one corrective nudge ("do not retry it unchanged") instead of burning turns.
- **Edit failure reports** (`src/core/edit-report.ts`): the nearest matching block, found with a line-ratio comparison.

### Notes

- 148/148 tests green (23 new ones covering the risk rules, the edit reports, the stuck detector, the observations and the bootstrap).


## [0.19.0] — 2026-11-12

**The agent now sees the repository as a map and reviews changes as facts — not as guesses.**

### Added

- **Repository map** (`src/core/repo-map.ts`): the project is scanned once into a compact map of file *signatures* (exports, classes, interfaces, types). Files are ranked by how well they match the current request and by how many other files import them, so the backbone of the project comes first. The map is character-budgeted and injected into the prompt — the agent knows what exists without the repository being loaded into the context.
- **Diff analysis** (`src/core/review.ts`): the facts of a change are computed deterministically — protected paths touched (critical), dependency manifests and lockfiles changed (major), deleted files, large removals without additions (major), source changed without any test change (minor), oversized diffs (minor). In review mode these facts and the diff itself go into the prompt, so findings are concrete: severity + `file:line`, never speculation.
- **New commands**:
  - `/map` (and `/map <query>`) — the ranked repository map in the TUI;
  - `/diff` — the working-tree diff plus its risk flags;
  - `/verify` — run the project's verify command on the spot and show the real output;
  - `xminal map [query]` — the map, headless;
  - `xminal verify` — run the verify command headless and exit with its code (handy in CI).
- The project brief is remembered as a project fact ("verify command: …") so later sessions start with it.

### Notes

- 123/123 tests green. The map and the diff analysis are covered by offline tests (signature extraction, ranking, import-graph centrality, diff parsing, severity rules, budgets).


## [0.18.0] — 2026-11-11

**The agent now runs a real coding workflow — brief, phases, and a verification loop that cannot lie.**

### Added

- **The coding workflow** (`src/core/workflow.ts`): understand → inspect → plan → implement → verify → review → summarize. The phase is derived from the work that actually happened (a read marks *inspect*, a write marks *implement*) and the rule for the current phase is injected into the prompt. Explicit in compose/plan mode, implicit but ordered in build mode.
- **Task brief** (`src/core/requirements.ts`): every request becomes a bounded brief — goal, kind, constraints, acceptance criteria, edge cases and the verification step — re-injected on every turn so the requirements survive implementation. A request that names an action but no target ("make it better") yields exactly one clarifying question; a clear request is never delayed.
- **Project brief** (`src/core/project-context.ts`): the repository's instruction files, layout, language mix and build/test commands are detected once, offline, and injected into the prompt. The verify command is detected from `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `pom.xml`, `build.gradle` or `Makefile`.
- **Verification loop** (`src/core/verify-runner.ts`): after a turn that changed files, the project's verify command runs and its **real** output is fed back to the model; a failure gets a bounded fix-and-retry round (`autoVerifyRepairs`). The turn summary shows `verify ✓` / `verify ✗`. The agent is told never to claim a test passed unless it ran and passed.
- Review mode now starts from `git diff` and must report findings with a severity and a `file:line` — suspicions are not reported as confirmed bugs.
- Settings: `verifyCommand`, `autoVerify`, `autoVerifyRepairs`, `verifyTimeoutMs`.
- `docs/WORKFLOW.md`.

### Fixed

- **A model that ran out of free quota now falls through to the provider's other free models.** The router used to try one model per provider, so a daily-quota error ended the turn after two or three candidates. It now keeps a queue and enqueues the provider's next free models (free first, biggest context first), announcing the switch in the transcript: `opencode/inkling-2-small-free: free-tier quota reached — switching to opencode/crouton-alpha-free`.
- The model picker labels the context window as `ctx 1.0M` — a bare "1.0M" next to "FREE" is easily mistaken for the provider's daily allowance.
- The system prompt caches the project rules and the project brief instead of re-reading them on every turn (the prompt is rebuilt per request — on a free daily allowance that matters).

### Notes

- 115/115 tests green, including offline agent-level tests that drive the whole verify loop against a scripted local model server.


## [0.17.0] — 2026-11-11

**Two rendering bugs that made the UI look broken: the composer had holes in its background, and the whole screen vibrated.**

### Fixed

- **The composer panel had "silver" gaps in it.** Every styled fragment ends with a reset, and a reset also clears the background — so the moment the metadata row printed the model name, the panel fill stopped and the terminal's own colour showed through the middle of the box. Now the fill is re-applied after every reset (`keepBg`), and the composer, the user-message box, the tool cards, the diff cards and the sidebar all keep one continuous background.
- **The screen vibrated.** Every frame ended with a newline on the bottom row, which makes the terminal scroll by one line — the whole UI then jumped up on each repaint (very visible while the spinner was running). The frame is now exactly screen-height with no trailing newline, so the UI is locked to the viewport.
- The composer closes with a blank row, like opencode: its `╹`/`▀` notch only appears with a translucent prompt background, and the default theme is opaque.
- The Ink engine got the same treatment (no notch).
- **The frame now uses the real terminal size.** The old code clamped the width to 40 and the height to 16 columns/rows, so on a smaller screen (a phone in landscape, a split pane) the frame was drawn larger than the viewport — the terminal wrapped and scrolled, which is the second half of the "vibration". The frame is now exactly the terminal's size, and the layout adapts (narrow mode below 44 columns).

### Added

- Two regression tests: the frame must be exactly screen-height and must not end with a newline, and the composer band must not contain a reset that breaks its fill.

### Notes

- 96/96 tests green. The README screenshots were regenerated from the fixed UI.


## [0.16.0] — 2026-11-11

**The TUI is now pixel-ported from opencode's own source — theme, geometry and glyphs.**

### Changed

- **The theme is opencode's default palette, not Tokyo Night.** Background `#0a0a0a`, raised `#141414`, composer `#1e1e1e`, text `#eeeeee`, muted `#808080`, border `#484848`, error `#e06c75`, warning `#f5a742`, success `#7fd88f`, info `#56b6c2` — the exact tokens from opencode v2's theme assets.
- **Agent colours follow opencode's categorical order** (blue, purple, green, orange, red): build = blue, plan = purple, compose = green, review = orange, yolo = red.
- **The session column is padded like opencode's scroll container** — 2 columns of side padding (1 below 44 columns), so every rule, label and message starts on the same column as upstream.
- **The composer is opencode's band**: a `┃` rule in the agent colour, the raised fill, the textarea, the metadata row (`Build · model provider · variant`) inside the band, and the `╹` + `▀` strip that closes it.
- **The footer is opencode's**: workspace + branch on the left (`~/my-app:main`), context usage and cost on the right, followed by the `shift+tab agents` / `ctrl+p commands` hints.
- **A session tab rail** at the top (the session name as a tab, plus `+`), like opencode's session tabs.
- **Tool rows follow opencode's inline/block split**: a 2-column icon cell with the label after it (`Read src/a.ts`, `Glob "*.ts" in src`), and shell/git calls rendered as a block card — `$ command`, then the output, inside the raised panel with the (background-coloured) `┃` rule.
- **The assistant footer line** is opencode's: `Build · model · 5.4s · 1901.2 tok/s`.
- **Markdown tokens are opencode's**: heading `#9d7cd8`, link `#fab283`, code `#7fd88f`, strong `#f5a742`, quote `#e5c07b`.
- The Ink engine (`XMINAL_TUI_ENGINE=ink`) got the same palette, composer and footer.

### Added

- `scripts/media/capture-screenshots.py` — regenerates every README screenshot from a live PTY session, so the docs can never drift from the UI.
- The rasterizer behind it now defers the line wrap like a real terminal (it used to drift one row per line) and uses opencode's background.

### Fixed

- The session column is painted with the theme background on every row (unpainted cells fell back to the terminal's own background).
- The placeholder uses opencode's own samples: `Ask anything… "Fix a TODO in the codebase"`.
- The turn summary shows tokens per second, like upstream.

### Notes

- 94/94 tests green. The e2e TUI tests assert the new frame (footer hint, composer meta row).


## [0.15.0] — 2026-11-11

**Every slash command works in the TUI, the security model got teeth, and the npm package went from 62 MB to 3.5 MB.**

### Fixed

- **The vendored OpenCode engine could never start** — the launcher looked for `vendor/opencode/packages/...` while the checkout lives at `vendor/packages/...`. Engine discovery is now resolution-based (`$XMINAL_OPENCODE_ENGINE` → `<pkg>/vendor` → `<pkg>/../opencode`) and a missing checkout produces a clear message with the three ways to fix it, instead of a silent failure.
- **Most slash commands were swallowed by the TUI palette** — `/skills`, `/memory`, `/tasks`, `/config`, `/audit` and friends were listed in the palette but did nothing. They now run *inside* the TUI (output rendered into the transcript, no alternate-screen exit).
- **`--platform` / `--tail` were not parsed as value flags** — `xminal mcp search pdf --platform mobile` silently ignored the filter. `platform`, `tail`, `limit` and `max-cost` now take a value.
- **`/mcp search` dropped the first word of the query** — an off-by-one in the filter removed the term next to the flag.
- **The wheel scrolled the chat instead of the overlay** — with `/mcp` or `/sessions` open, scrolling moved the transcript. Now the wheel always moves the selection inside an overlay.
- **`/mode` was not native** — it now opens a mode picker (build / plan / compose / review / yolo) inside the TUI.
- **The global config was not owner-only** — `~/.xminal/config.json` holds provider API keys. It is written `0600` and re-hardened on every start.
- **`prepare.cjs` claimed a "committed dist/"** — `dist/` is gitignored, so a checkout without devDependencies had no way to build. It now fails with an actionable message instead of pretending.
- **`XMINAL_LOG` was a console level only** — `XMINAL_LOG=1` (or a path) now also writes a redacted log file: `~/.xminal/xminal.log` by default, mode `600`, with provider failures, tool errors and permission denials.
- **`xminal config` printed the raw provider API keys** — the whole config was dumped to stdout, ready to be pasted into a bug report. Every secret-looking value is now masked (`gsk_…dU (56 chars)`), and `xminal config global|project` prints masked JSON.

### Added

- **Native TUI commands**: `/rename`, `/branch`, `/rewind`, `/checkpoints`, `/undo`, `/compact`, `/cost`, `/audit`, `/status`, `/permissions`, `/docs` — all inside the TUI, all without leaving the alternate screen.
- **Security hardening**:
  - writes **outside the workspace** are `dangerous` (denied unless approved) — an agent can no longer edit `~/.bashrc` or `/etc`;
  - **reads of protected paths** (`.env`, `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config/gh`) are `dangerous` too — they used to be auto-approved in `auto` mode and would leak into the model context;
  - shell commands that clearly write outside the workspace are flagged;
  - tool output and error lines are **redacted** before they reach the screen.
- **`npm run verify:package`** — packs the tarball, installs it into a throwaway prefix and runs the CLI. Added to CI on all three operating systems: this is what catches packaging breakage (a broken `prepare`, a missing file, a wrong `bin`).
- **`npm run verify:secrets`** — a secret scan over every tracked file, wired into CI as its own job.
- **`Ctrl+A` in the `/mcp` overlay adds the selected server to the config** — it writes a **disabled** entry into `~/.xminal/config.json` (previous file kept as `config.json.bak`) with a visible placeholder for the run command and the docs URL. XMINAL refuses to invent an npm package name that may not exist.
- **Documentation**: `docs/INSTALL.md`, `docs/FRONTENDS.md`, `docs/MCP.md`, `docs/TROUBLESHOOTING.md`, `docs/SECURITY.md`.
- **`Session.setTitle()`** — session rename is now a first-class API.

### Changed

- **The npm tarball no longer ships `vendor/`** — 62 MB unpacked / 5,443 files → **3.5 MB / 179 files**. The package is now small enough to install anywhere. The vendored engine still works from a git checkout or an external checkout via `XMINAL_OPENCODE_ENGINE`; the built-in TUI (default) and the Ink engine cover every device.
- The MCP overlay now renders the config snippet from `mcpConfigSnippet()` — one source of truth instead of a hand-rolled copy.
- **End-to-end TUI tests** (`tests/tui-e2e.test.js`) boot the real TUI over a pipe and assert the frame, the in-TUI slash commands and that the alternate screen is never left.
- **`@inkjs/ui` is gone** — it was only used for the spinner, and it pulls in `deepmerge` with an open prototype-pollution advisory. The spinner is now a local component: 3 runtime dependencies instead of 4, `npm audit` clean.

### Notes

- 94/94 tests green (security, config-write and end-to-end TUI tests). CI: Ubuntu/macOS/Windows × Node 20/22, plus package-smoke and secret-scan jobs.

## [0.14.0] — 2026-11-11

**Sessions work in the TUI: `/new`, `/sessions`, `/resume` — with search.**

### Fixed

- **`/new` and `/sessions` did nothing in the TUI** — they were not handled natively and fell through to the classic REPL, which leaves the alternate screen and waits for a keypress. Both now work inside the TUI: `/new` creates a session and switches to it, `/sessions` and `/resume` open the session picker.
- **Overlay selection counter was out of sync** — the sessions/MCP overlays drew from `overlay.index` while ↑/↓ moved `paletteIndex`, so the selection never moved and Enter always picked the first row.

### Added

- **Searchable session picker** (`/sessions`, `/resume`) — search by title, id or date; each row shows title, short id, relative time ("20h ago") and message count; the first row is `+ new session`.
- **Session switching inside the TUI** — picking a session rebuilds the runtime against that session (mode/model carried over, permissions re-wired) and clears the transcript, exactly like the REPL's restart path.
- `/new` now switches to a fresh session in-place instead of dropping to the classic REPL.

### Notes

- 79/79 tests green.

## [0.13.0] — 2026-11-11

**Model list fixes + a 3,832-server MCP catalog + first-run model update.**

### Fixed

- **Non-free models showed a FREE badge.** The catalog builder defaulted a *missing* price to `0`, so every model whose price models.dev does not publish was marked free. Unknown pricing is now unknown (shown as `—`), and only an explicit `0/0` counts as free — the live catalog reports ~316 genuinely free models instead of ~1,900.
- **Model names were truncated** in the picker (`alias.slice(0, 26)`). The alias now gets the room it needs; the optional columns (context window, price, provider) drop from the right instead of cutting the name.
- Price column shows the real `$input/$output` per Mtok (previously the whole row was clipped).

### Added

- **MCP catalog** — 3,832 public MCP servers shipped offline with the package (`data/mcp-catalog.json`), built from the Smithery registry + GitHub by `scripts/fetch-mcp-catalog.py`.
  - search by **name**, by **what it does** ("work"), or by **platform** (`LINUX` / `WINDOWS` / `MOBILE`)
  - TUI: `/mcp` opens the searchable overlay, `Enter` shows details + the `mcpServers` snippet to paste into `~/.xminal/config.json`
  - shell: `xminal mcp search pdf --platform mobile`
- **First-run model update** — on a fresh install the catalog is stale, so XMINAL now says so before the wait ("updating model catalog — first run downloads the live models.dev list…") and confirms afterwards ("model catalog updated · N models · M free"). Same in the TUI and in headless `xminal run`.

### Notes

- 79/79 tests green (10 new: catalog search/filter/limits + free-detection).
- The catalog is a data file, not a network call — searching works offline.

## [0.12.6] — 2026-11-11

**Opencode-exact message boxes + agent language rule.**

### Changed

- **The built-in TUI now uses opencode's own box rules**, taken from the vendored source (`vendor/packages/tui/src/routes/session/index.tsx`):
  - user messages: SplitBorder `┃` in the agent colour, raised background, 1 row / 2 column inner padding (was a thick `▍` bar glued to the text)
  - composer: the same `┃` border instead of `▍`
  - tool rows: 3-column indent with a 2-column icon slot, opencode's glyphs (`→` read, `←` write, `✱` glob/grep, `%` web_fetch, `◈` web_search, `↳` subagent) and opencode's pending labels ("Reading file…", "Preparing write…", "Finding files…")
  - reasoning now has its own opencode-style dim block behind a muted `┃` bar (previously dropped entirely)
  - tool output stays collapsed silently — the "N more line(s)" helper line is gone
- **Agent language rule** — the system prompt now says: reply in English (Hinglish is fine for casual chat) and switch languages only when the user explicitly asks. Previously a Hindi prompt produced a Hindi answer with no guard.

### Notes

- Verified side by side against opencode's vendored markup rendered through Ink (`assets/opencode-parity.png`).
- The Ink engine (`XMINAL_TUI_ENGINE=ink`) and the vendored OpenCode engine (`XMINAL_TUI_ENGINE=opencode`) are unchanged; this release aligns the default, Android-safe TUI with the same visual language.

## [0.12.5] — 2026-11-11

**Respin of 0.12.4 — identical code.** npm accepted the 0.12.4 publish but never replicated
its 18 MB tarball to the public registry (the same stall that hit 0.12.0). 0.12.5 is the
installable release; the GitHub release asset works either way.

## [0.12.4] — 2026-11-11

**Model fallback fixed, agent text limit removed, second dogfood demo (SAURABH).**

### Fixed

- **"Model is unavailable" now falls back instead of dying.** The router treated a model-level failure (model retired / quota exhausted) as *non-retryable*, so it stopped at the first candidate and reported the misleading `all 13 candidate providers failed` while never trying a second model. Model-level errors are now retried on the next candidate, and the suffix only claims the whole chain was exhausted when it really was.
- **Fallback chain is meaningful again**: one candidate per *provider* (deduped by provider identity, not by adapter type — every OpenAI-compatible provider used to collapse into the first one), local servers that are not running are skipped, and each provider contributes a model that actually exists in the catalog (the static default-model table had stale aliases such as `nvidia/nemotron-…` while the catalog ships `nvidia/nvidia/nemotron-…`).
- Picking a dead model now still answers: XMINAL transparently switches to a working model, reports which model answered, and prints an actionable hint instead of a stack of provider errors.

### Changed

- **Agent text limit removed**: `limits.maxTokensPerTurn` now defaults to `0` = unlimited (the model's own output limit governs). `effort` still acts as an explicit cap when you want one (`low` 1024 / `medium` 4096 / `high` 16384 / `max` unlimited).
- Quota errors now explain the opencode free tier (~1M tokens/day, tracked server-side by opencode — XMINAL cannot reset it) and point at providers you hold a key for.

### Added

- **Second dogfood demo** — [quitsaurabhverma2008-sketch/saurabh](https://github.com/quitsaurabhverma2008-sketch/saurabh): the word SAURABH as 1,400 dust particles that scatter on the wind and swirl back, written by XMINAL in 3 turns / ~23k tokens / $0. The README animation is a real headless render of the page's own script.
- `scripts/media/` — the capture pipeline (PTY capture → ANSI rasterizer → PNG/GIF, plus the headless canvas page renderer) so every demo asset in this repo is reproducible.

## [0.12.3] — 2026-11-10

**Docs & media: XMINAL builds a project — README with the demo, screenshots and the build log.**

### Added

- **Dogfood demo** — XMINAL was given a one-paragraph spec and built a complete terminal Snake game in **~13 minutes** on Android using free-tier models ($0). Published as [quitsaurabhverma2008-sketch/xminal-snake](https://github.com/quitsaurabhverma2008-sketch/xminal-snake).
- **README showcase** — a "Built with XMINAL" section with a real terminal capture (8-frame GIF rendered from a live PTY session), the build stats table, and a refreshed screenshot gallery (session with tool activity + markdown, command palette, model picker, provider wizard, 42-column phone layout, boot screen).
- **Capture pipeline** — an ANSI→PNG rasterizer (Pillow + FiraCode, block/box glyphs drawn as rectangles) that turns a recorded terminal session into images and animated GIFs.

### Notes

- Only docs/assets changed in this release — no code changes.
- The demo game needed 3 human fix-ups (helpers that returned a function instead of a string, and screen helpers that wrote to stdout instead of returning their escape sequence); the agent itself wrote the game.

## [0.12.2] — 2026-11-10

**Bug-fix release: variant effort, memoized rendering, wheel-scroll.**

### Fixed

- **Variant (effort) was display-only** — now `low`/`medium`/`high`/`max` caps the per-turn `max_tokens` sent to providers (1024/4096/16384/full). `/variant` overlay shows the real budgets
- **Keystroke lag** — `styledLine` and `renderChatLines` are memoized; echo latency measured at ~25–40 ms on-device
- **Touch/mouse wheel scroll was dead** — the parser fed `Number('<64;10;5M')` into the wheel matcher → always NaN; fixed, plus the scroll indicator is back in the footer (`▲ scrolled ↑ N — PgDn to tail`)

## [0.12.1] — 2026-11-10

**Identical to 0.12.0; fixes the broken npm payload of 0.12.0 (tarball 404).**

- Same code, same features (Ink engine, mouse-input rewrite, working line, queue) — no functional changes.
- The npm publish of 0.12.0 was partially applied (packument accepted, tarball never replicated — 404 across registry + replicate). 0.12.1 is the installable release.
- `npm i -g xminal@0.12.1` gets you everything 0.12.0 promised.

## [0.12.0] — 2026-11-10

**XMINAL on Ink — readymade TUI toolkit, full opencode visual language.**

### Added

- **Ink engine** (`XMINAL_TUI_ENGINE=ink xminal`) — the complete OpenCode look rebuilt on **Ink 8** (React for the terminal) + **@inkjs/ui** (Select, Spinner, TextInput…) with **yoga-layout**'s WebAssembly flexbox engine — zero native modules, runs on Android/Termux and every desktop. Gradient boot logo with reveal, alt-screen, markdown code blocks, tool rows (`→ ~ $ ✱ ± ◈`), sidebar (Todo/Context/Session/Skills & MCP), spinner-driven **working** row, **queue** row, **permission** bar, usage/cost footer with `⇧N queued` chip — all Ink components over XMINAL's runtime.
- `XMINAL_TUI_ENGINE=ink` opt-in; built-in TUI stays the default everywhere. Ink engine requires Node ≥ 22 (ink 8 `engines`); falls back to the built-in TUI on anything older or without a TTY.

### Fixed

- Mouse input garbage: SGR wheel/button sequences typed into the composer as raw `[<64;…` text — the input pipeline is now a single-owner CSI lexer (PTY regression-tested).
- Long bash/git commands now wrap across rows instead of clipping; spinner animates at 11 Hz while the agent runs; Esc interrupts a running turn; Ctrl+L redraws; Delete and batched arrow keys work.

### Notes

- Built-in TUI (ANSI, hand-rolled) remains the default on every platform — mobile/Termux included.
- Ink engine is additive; existing `XMINAL_TUI_ENGINE=opencode` (vendored engine, desktop-only, Bun required) still works.
- `docs/OPENCODE-ENGINE.md` documents both engines; CHANGELOG entries explain trade-offs.

## [0.11.0] — 2026-11-10

**XMINAL × OpenCode — literal vendored engine (opt-in), everywhere it can run.**

### Added

- **OpenCode engine** (`XMINAL_TUI_ENGINE=opencode xminal`) — the actual OpenCode v2.2.7 TUI, vendored verbatim into the repo (MIT, `vendor/LICENSE-opencode`, `vendor/NOTICE`) and wired to XMINAL's runtime through `vendor/packages/xminal-bridge` — an in-process implementation of the OpenCode server contract (SSE, transcript projection, tool/reasoning/text streaming, permissions, models/providers/agents/commands). No HTTP server, no SQLite, no network required by the API layer itself. Only a 4-line patch in `vendor/packages/tui/src/app.tsx` injects XMINAL's transport into their client.
- npm package now ships `vendor/` so macOS/Linux/Windows desktop users get the engine out of the box (requires Bun on PATH). Android/Termux keeps the built-in TUI — no public `@opentui/core-android-arm64` prebuilt exists; the engine detects this and falls back with a warning (never silently).
- **CI matrix** — Ubuntu/macOS/Windows × Node 20/22.
- `docs/OPENCODE-ENGINE.md` — how the engine works, platform support, build & caveats.

### Changed

- `package.json` version 0.11.0; `files` now includes `vendor/`.

### Honest notes

- Engine is opt-in everywhere; built-in TUI remains the default on every platform including desktop.
- The engine cannot run on Android/Termux until a bionic `libopentui.so` is published or vendored (upstream blocker, not XMINAL's code).
- Bridge implements the happy path end-to-end; unimplemented features (fork/revert/compact/delete/rename) return honest 501s — never fake success.
- The vendored tree carries 3 pre-existing typecheck diagnostics (@types/node `zlib.zstdCompressSync` and `module.registerHooks` drift) — unrelated to the port; runtime unaffected.

## [0.10.0] — 2026-11-10

**XMINAL × environment cleanup + full TUI/output-rendering redesign.** Removes everything tied to the sandbox the project was bootstrapped in, and transforms the terminal experience from plain-text output into a structured, layered interface.

### Removed (xcomb-environment residue)

- `BRAIN.md`, `PLAN.md`, `EXECUTION-PLAN.md`, `FEATURE_MATRIX.md` — internal working notes with machine-specific paths and process history (not curated product docs). Their substance moved to a private backup and a curated `docs/ROADMAP.md` + `docs/DEVELOPMENT.md`. No git history rewrite.
- `src/tui/clone-tui.ts.bak` — accidentally committed duplicate (v0.7.0), dead code.
- `src/tui/engine.ts` — unused legacy layout/theme helpers.
- `src/tui/tui.ts` + the `XMINAL_TUI_ENGINE=opentui` re-exec path — the experimental OpenTUI/Bun renderer, dead since v0.6.0; XMINAL is pure Node.
- `dist/` is no longer committed — built on demand via `prepare` (git-URL/npm installs) and from source.

### Changed

- `package.json` description no longer claims OpenTUI (Zig core); honest wording ("pure Node", 46 built-in providers).
- MCP `initialize` `clientInfo.version` now reports the real package version (was hardcoded `0.1.0`).
- `/brain` and `/features` commands replaced by `/docs` (prints `docs/ROADMAP.md`).
- `/report`'s issue-tracker link and palette docs updated; README counts synced to reality (46 providers, 258 bundled aliases / ~1,960 effective).
- `scripts/install.sh` fallback tarball now points at v0.10.0.
- AGENTS.md: 51 tests, dist policy, repo docs policy.
- Telegram bridge documented as experimental (never live-tested).

### Added

- **opencode visual system, exact** — Tokyo Night hexes matching opencode's `tokyonight` theme (bg `#1a1b26`, panel `#1e2030`, element `#222436`, primary `#82aaff`, keyword `#c099ff`, success `#c3e88d`, number `#ff966c`, warning `#ffc777`, error `#ff757f`). User messages render as raised-bg boxes with a mode-colored left border; assistant text is plain and indented; the bottom composer gets the opencode layout: decreased-raised fill, mode-colored left border, a `╹`-notched metadata row (`build · model` left, effort right — or a braille spinner + `esc interrupt` while working), and a hints footer (`⇥ agents`, real usage readout right). Sidebar rebuilt into `Todo` / `Context` / `Session` / `Skills & MCP` blocks with bold headings. Boot is silent — no banner, like opencode's session screen. Tool rows use opencode glyphs (`→ ← ~ $ ✱ ± ◈ ◇ ▣ …`) with a braille spinner while pending. Code blocks draw flush-left on the element background; fenced-code borders replaced by the language label; link/strong/list/heading colors match opencode's markdown mapping.
- **Tool activity renderer** (`src/tui/output/tool-activity.ts`) — compact per-tool presentation: icon, kind label, target, duration, success/failure state, for read/write/edit/multi_edit/glob/grep/list/bash/git/verify/web_fetch/web_search/task/mcp_call/memory/skill/todo/checkpoint/worktree/diagnostics/think. Multi-line diffs from edit/write tools collapse to a `+N −M` header with a tinted, capped unified-diff preview.
- **Structured assistant output engine** — `renderMarkdown` gains task lists, GitHub-style callouts, a proper three-tier heading hierarchy (H1 amber bold / H2 bright bold / H3 muted bold), narrow-table fallback (key — value stacked rows under ~46 cols).
- **Multiline composer** — Ctrl+J (or Shift+Enter in capable terminals) inserts a newline; the input area grows to four lines and shrinks back; Enter submits.
- **Terminal-width awareness everywhere** (40/50/60/80/100/120 cols) — model picker, status bar, overlays and sidebar adapt; long paths and commands are clipped, never wrapped mid-escape.
- **Model picker** shows each model's context window and input/output price from the live/cached catalog (never hardcoded), free-first ordering preserved.
- Command palette and list overlays show an empty state ("no matches …") instead of a blank panel.

### Fixed

- Piped/non-TTY sessions rendered **zero frame rows** — `process.stdout.rows ?? Number(process.env.LINES) ?? 24` produced `NaN` (NaN is not nullish), so `Math.max(16, NaN)` was `NaN` and the frame loop never ran. Same for columns.
- Assistant/system lines containing ANSI escapes were hard-wrapped by raw character count, mangling colors mid-sequence — chat wrapping is now ANSI-aware (`wrapAnsi`, shared by the markdown engine).
- Sidebar chat clipping used `line.length` (escape sequences included), chopping styled lines at the divider — now uses visible-width clipping.
- `diffCounts` never matched edit/write result headers (looked for a `(` directly before `+N`) — header parsing is scoped to the first line and accepts the real `(1 replacement, +12 −4)` format.

### Changed

- The built-in pure-Node TUI lives at `src/tui/tui.ts` (renamed from `clone-tui.ts`; the dead OpenTUI/Bun path is removed).
- Status bar now shows **mode (color by mode) · model · effort · context % · session cost** — real values only.
- Footer shows busy state + scroll position + actual keybindings (⌃p commands · ⌃j newline · ⇥ mode).

### Notes

- Not published to npm by this change; cut the release per `docs/DEVELOPMENT.md`.
- Telegram bridge remains experimental until exercised against a real bot.

## [0.9.2] — 2026-11-09

**Published on npm: `xminal@0.9.2`** (`npm install -g xminal`).

### Fixed

- **Sidebar "1% used" was a hardcoded literal** — now computed for real from the session's input tokens against the active model's context window (`resolveModel`), memoized per model spec; falls back to 128K on resolution failure.

## [0.9.1] — 2026-11-09

**Published on npm: `xminal@0.9.1`** (`npm install -g xminal`).

### Added

- **Code block syntax highlighting** — fenced code renders with keywords in Tokyo Night purple, strings/numbers in amber, comments muted, and verbatim source otherwise (ts/js/py/sh; unknown languages render plain green). Highlighting runs post-wrap so long lines stay wrapped correctly.

### Fixed

- **Code highlighting bug** — the token regex built from a template literal matched a literal backspace instead of a word boundary (`\b` vs `\\b`), so no highlighting ever applied. Replaced with one literal regex (comments // or #, strings, numbers, words); keywords now actually highlight (purple).
- **Keyword colors too similar to strings** — keywords use Tokyo Night purple (`fgPurple`), distinct from string amber and comment muted gray.

## [0.9.0] — 2026-11-09

**Published on npm: `xminal@0.9.0`** (`npm install -g xminal`).

### Added

- **Markdown rendering system** (`src/tui/markdown.ts`) — block+inline rendered ANSI: ATX headings, bold/italic/inline code, fenced code (verbatim, green, `│` gutter, language header, no reformatting), nested lists, ordered lists, blockquotes, horizontal rules, **grid-rendered tables** (width-capped, inline code supported), links. Streaming-safe: unterminated fences render gracefully, no crash, no flicker between raw and rendered modes (raw is never shown). Memoized per `(text, width)`.
- **Content-aware output quality engine** (`src/tui/format.ts`) — prose-only normalization (`!!!→!`, redundant `::`/`;`/`---`/`****` collapse) with hard content boundaries: fenced code, URLs, JSON, diffs, commands byte-exact; single formatting authority; unit tests for Hindi/English mix, URLs, code fences, excessive punctuation.
- **Grapheme-aware width engine** (`src/tui/width.ts`) — Intl.Segmenter + East-Asian wide ranges + combining-mark zero-width + ZWJ emoji = 2; ANSI-aware `visibleWidth`, `graphemeSlice`, `splitGraphemes`. Used by wrap/clip/table/composer.
- **Diff-tinted tool output** — `diffTint`/`isLikelyDiff` in format.ts; additions green, removals red, hunks accent, file headers muted.
- **Status bar shows the real effort state** (was hardcoded `max`).

### Fixed

- **Assistant conversation rendering** — replaced raw-text wrap with the markdown renderer; paragraph wrap no longer drops content (word-fit accumulator bug in `wrapPlain`).
- **Render storms** — full-frame repaints per token throttled via `requestRender()` + `flushRender()` (carried from 0.8.1).

### Tests

- New suites: `width.test.js` (Devanagari, emoji, ZWJ, ANSI), `format.test.js` (fences preserved; prose normalized; diff detection), `markdown.test.js` (headings, tables, unicode, incomplete fences). **51/51 pass.**

### Docs

- README: Markdown rendering, output quality engine, width engine, diff tint sections.

## [0.8.1] — 2026-11-09

**Published on npm: `xminal@0.8.1`** (`npm install -g xminal`).

### Fixed

- **Input box showed nothing while typing long messages** — text now keeps the caret visible by sliding left (horizontal viewport window), like every sane terminal. Caret is always in view; your input no longer disappears off the right edge.
- **ANSI-unsafe frame clip** — the clipper sliced raw bytes mid-escape-sequence, mangling long colored lines. It now walks the string, preserves escape sequences, and clips at exactly w visible columns.
- **Output scroll back** — SGR mouse mode (wheel up/down scrolls 4 lines) is enabled while the TUI is active; over an open palette/picker, the wheel moves that picker's selection instead of the chat. PgUp/PgDn/wheel bounds are now clamped to available scrollback. When scrolled up, the bottom-left status shows `▲ scrolled N · PgDn tail`.
- **`XMINAL_MOUSE=0`** — disables mouse capture entirely (restores terminal text selection); enablement is restored on exit (`?1000l ?1006l`). Follows the tui-design skill's rule: mouse capture must always have an opt-out for text selection.
- **Repaint storm while streaming** — token bursts re-rendered the whole frame every token. Renders are now coalesced to ~33 fps (`requestRender()`) with a final `flushRender()` on completion. Slow phones stay smooth on long outputs.
- **Overlong API key entry in the provider wizard** — masked input now keeps only the trailing visible characters within the panel width.

### Tooling

- `skills` project skill **tui-design** installed (`npx skills add https://github.com/hyperb1iss/hyperskills --skill tui-design`; security panel: Safe / 0 alerts / Low Risk). `skills-lock.json` pins the skill by hash and is committed; downloaded files under `.agents/` are gitignored.

## [0.8.0] — 2026-11-09

**Published on npm: `xminal@0.8.0`** (`npm install -g xminal`).

### Added

- **Live model catalog from models.dev** — refreshes automatically on interactive TUI boot (24h TTL). New models — including newly-free ones — appear automatically without a release. `xminal models` shows catalog source (bundled · cache · fresh), count and free count; `xminal models refresh` forces an immediate fetch (writes `~/.xminal/cache/models.json`, chmod 600; 1940 models with 314 free as of fetch). `XMINAL_MODELS_OFFLINE=1` disables, `XMINAL_MODELS_TTL_HOURS` tunes the TTL. Catalog misses fall back to the cached catalog; everything works offline with bundled/cached data and `~/.xminal/config.json` is never rewritten with fetched models.
- **`/model` is provider-scoped** — with an OpenRouter model active, `/model` shows only OpenRouter models. **Ctrl+S** toggles between *this provider* and *all providers*; the title always displays the current scope.
- **FREE badge** next to every zero-cost model in the picker.
- **Free-first ordering everywhere** — in the picker, in `xminal models`, in the alias list: free models always sort before paid ones.

### Added (tests)

- Unit tests for the catalog: snapshot→alias conversion, providers without text/tool models are skipped, user aliases win, free-first sort, resolveModel falls back to the cached catalog. 37/37 pass.

### Docs

- README: new "Live model catalog (models.dev)" section, scoped-`/model` screenshots (provider scope + all-providers with free-first), config is never rewritten with fetched models, release cadence note, version/tests bumped.

## [0.7.5] — 2026-11-09

**Published on npm: `xminal@0.7.5`** (`npm install -g xminal`).

### Changed

- **Default models are now free where a free one exists** (verified against models.dev 2026-11-08). Updated: OpenRouter → `nvidia/nemotron-3.5-super-vl:free` · Mistral → `labs-leanstral-1-5-1` · Vercel → `reflection/beam-free` · Z.AI/ZhipuAI → `glm-4.7-flash` · Cohere → `north-mini-code-1-0` · Hugging Face → `zai-org/GLM-4.7-Flash` · LM Studio → `qwen/qwen3-coder-30b`. OpenCode (`inkling-2-small-free`) unchanged. NVIDIA NIM (`nvidia/nemotron-3.5-super-vl-120b-a12b`) unchanged. Providers with no public free model (Anthropic, OpenAI, DeepSeek, xAI, MiniMax, …) keep sane low-cost defaults.

### Added

- **Readable rate-limit errors** — `readError()` now parses OpenAI/Groq-style JSON error envelopes and returns the message + type (`…Limit 8000, Requested 18216 (rate_limit_exceeded)`) instead of a 2000-char JSON dump. Session shows a concrete recovery hint (`/new`, `/compact`, switch provider) on TPM/429.
- **Unit tests** for `readError` (OpenAI envelope, bare message, non-JSON fallback). 33/33 pass.

### Docs

- README: **zero built-in API keys** (all keys live in `~/.xminal/config.json`, chmod 600), **free default model table**, **rate-limit guidance**, `/report` command documented, stale Bun/OpenTUI mentions removed (fullscreen TUI is pure Node since 0.6.0).
- README.example config now uses a free OpenRouter model.

### Fixed

- **TUI and catalog default models now agree** with `PROVIDER_DEFAULT_MODELS` for all free-tier providers (previously drifted, e.g. `openrouter/auto`, `command-a-03-2025`).

## [0.7.4] — 2026-11-09

**Published on npm: `xminal@0.7.4`** (`npm install -g xminal`).

### Fixed

- **"Missing API key" after saving a key in `/provider`** — the interactive TUI wrote the key to `~/.xminal/config.json` correctly, but the running session kept a boot-time snapshot of the config; the router never saw it. `Runtime.setProviderKey()` now updates the in-memory config **and** persists only the `providers` section to the global config file (`providers` merged, other sections untouched). A `/provider` save now takes effect immediately — no restart needed — and fresh sessions resolve the key straight from `~/.xminal/config.json` (verified end-to-end: `setProviderKey` → `loadConfig` → `resolveModel`/`getApiKey` all return the saved key).
- **Provider wizard ready-dot was env-only** — saved keys under `config.providers[*].apiKey` now render the `+`/green indicator in `/provider`, not just env vars.
- **Wizard no longer wipes unrelated global settings by accident** — only the `providers` block is merged when saving keys, instead of re-serializing the whole boot-time config.

## [0.7.3] — 2026-11-09

**Published on npm: `xminal@0.7.3`** (`npm install -g xminal`).

### Added

- **`/report` (alias `/issue`)** — opens the GitHub issue tracker directly from within the TUI (`open`/`xdg-open`/`termux-open-url`/`gio`).
- **Key sanitizer** — strips non-ASCII/non-printable bytes from API keys before any network call; rejects with "key contains invalid characters" instead of throwing `Cannot convert argument to a ByteString`.
- **Friendlier validation errors** — `invalid_key`, `insufficient funds`, `HTTP timeouts`, `network errors`, `bad_chars` all mapped to plain human sentences.

### Fixed

- **`/help` showed only `/help`** — palette filter was never cleared after Enter; now Enter on `/help` clears the filter and shows the full catalog.
- **`/provider` and `/model` opened the filter palette instead of their wizards** — selected commands now short-circuit to their dedicated overlay.
- **`/` spectrum** — typing `/` with nothing after shows all 70+ commands (not a blank list).

### Verified

- Groq (`openai/gpt-oss-120b`) + NVIDIA NIM (`nvidia/nemotron-3.5-super-vl-120b-a12b`) confirmed live end-to-end with user-supplied keys.

## [0.7.2] — 2026-11-09

**Published on npm: `xminal@0.7.2`** (`npm install -g xminal`).

### Fixed

- **`/help` showed only `/help`** — the palette is opened by `/`-typing, which consumes the text as the filter query; after `/help<Enter>` the filter was cleared but the render order flushed the pre-clear state. All 70+ commands now render in `/help` / `/`-catalog with groups (Session · Agent · Providers · Tasks · Skills · MCP · Dev · Git · Usage · Setup · Audit · System).
- **`/provider` and `/model` opened the filter-only palette instead of the wizard** — `Enter` on `/provider` selected the `/provider` row in the palette, leaving input as `/provider` and showing only one match. Wizards now launch on selection.
- **`/` palette from typing** — all commands match `c.name.startsWith(query)`; typing `/` shows the full catalog (not a blank list).
- **Model picker lost when `/model<Enter>`** — now opens the picker overlay directly instead of the filter palette.
- **Footer hints** wrap with `↑↓` again (the `▶`/`▍` glyphs render on JetBrains Mono; arrows `↑↓←→` are in font).

### Added

- **Phone-width responsive rows** — 46-col layouts render correctly on Termux (hints collapse, sidebar hides, banner shrinks).
- **`/help` lists every command** — 70+ entries across 12 groups.
- **Provider list now 40+ entries** — including 302.AI, Venice, Vercel AI Gateway, Alibaba DashScope, MiniMax, SiliconFlow, Volcengine, Z.AI (GLM), ZhipuAI, Moonshot/Kimi, Fireworks, SambaNova, DeepInfra, NVIDIA NIM, GitHub Models — each with kind (LOCAL/FREE/BYOK), readiness dot (green + = ready), and the env var name needed for key.

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
