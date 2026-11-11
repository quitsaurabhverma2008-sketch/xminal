# Changelog

All notable changes to XMINAL are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: semver.

## [Unreleased]

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
