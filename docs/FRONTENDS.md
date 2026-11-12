# XMINAL — Frontends

XMINAL ships three frontends. The **built-in TUI is the default everywhere**;
the other two are opt-in through `XMINAL_TUI_ENGINE`.

| Frontend | Enable with | Needs | Runs on | Status |
|---|---|---|---|---|
| **Built-in TUI** (default) | — | Node ≥ 18, zero native deps | macOS, Linux, Windows, **Android/Termux** | Default everywhere |
| **Ink engine** | `XMINAL_TUI_ENGINE=ink` | Node **≥ 22** (Ink 8 `engines`), 4 pure-JS deps | Everywhere Node ≥ 22 runs, Termux included | Opt-in, feature-light |
| **Vendored OpenCode engine** | `XMINAL_TUI_ENGINE=opencode` | **Bun** + a checkout containing `vendor/` | macOS / Linux / Windows only | Opt-in, desktop only |

All three drive the same runtime: the same agent loop, tools, permissions,
sessions, providers and model catalog. Only the pixels differ.

## Fallbacks

XMINAL never fails silently:

| Situation | What happens |
|---|---|
| `XMINAL_TUI_ENGINE=ink` on Node < 22, or the Ink bundle fails to load | warning, then the built-in TUI |
| `XMINAL_TUI_ENGINE=opencode` without Bun / without `vendor/` / on Android | warning, then the built-in TUI |
| Not a TTY (piped stdin, CI) | the classic REPL |
| The TUI itself throws | warning, then the classic REPL |

```bash
xminal --no-tui        # force the classic REPL
XMINAL_TUI=1 xminal    # force the TUI even without a TTY (testing)
```

---

## 1. Built-in TUI (default)

Hand-rolled ANSI renderer, opencode's visual language (Tokyo Night), alternate
screen, sidebar, Markdown rendering, diff-tinted tool output, mouse capture.

| Key | Action |
|---|---|
| `/` | open the command palette (it filters as you type) |
| `Ctrl+P` | toggle the command palette |
| `Tab` | cycle agent mode: build → plan → compose → review → yolo |
| `Enter` | submit the prompt |
| `Ctrl+J` (or `Shift+Enter`) | newline in the composer (it grows to 4 lines) |
| `Esc` | close the overlay · interrupt a running turn · clear queued messages |
| `Ctrl+C` | quit |
| `Ctrl+L` | redraw the screen |
| `PgUp` / `PgDn` | scroll the transcript by 8 lines |
| `↑` / `↓` | move the selection in an overlay; move the caret between lines in a multiline composer |
| `Ctrl+S` (model overlay only) | toggle scope: *this provider* ↔ *all providers* |
| Mouse wheel | scroll 4 lines per notch; over the command / model / provider / effort overlays it moves the selection instead |
| `y` / `N` | answer the permission prompt |

Overlays: command palette, `/model`, `/provider` (key wizard), `/variant`
(effort), `/mcp` (catalog), `/skills` (skills.sh catalog), `/sessions` (session picker).

Notes:

- The sidebar appears above 120 columns; the layout reflows down to ~40 columns.
- Mouse capture is on by default, **except on Android** where it breaks
  tap-to-scroll in Termux — there it starts off and `XMINAL_MOUSE=1` turns it
  on. `XMINAL_MOUSE=0` turns it off anywhere.
- Slash commands the TUI does not implement natively (`/verify`, `/memory`,
  `/git`, …) run through the classic renderer **inside the
  alternate screen** — no leave/return flicker; you stay in the same session.
  (`/skills` is native: it opens the skills.sh catalog overlay — `↑↓` move,
  type to filter, `Enter` shows details, `Ctrl+A` installs into
  `.xminal/skills/`.)

## The message-layout contract

Every transcript row follows one of six named conventions (constants in
`src/tui/chat-lines.ts`):

| # | Row | Columns |
|---|---|---|
| 1 | user panel | heavy rule `┃` at col 0, accent-coloured by agent mode, body at col 3, symmetric padding |
| 2 | assistant body | content col 3, markdown-rendered |
| 3 | reasoning | amber `┃` at col 3, body at col 5 |
| 4 | tool rows | glyph at col 3, continuation at col 5 |
| 5 | tool error detail | col 5, redacted, muted |
| 6 | ok / err / system | col 3, `ok` green / `err` red, diff hunks re-join col 0 and get tinted |

Rendering lives in `src/tui/chat-lines.ts` (`renderStyledLine`), extracted
from the `startTui` closure so rows can be unit-tested without a PTY
(`tests/chat-lines.test.js`).

## 2. Ink engine (`XMINAL_TUI_ENGINE=ink`)

The same UI rebuilt on Ink 8 (React for the terminal), with
yoga-layout's WebAssembly flexbox engine — no native modules to compile.

```bash
XMINAL_TUI_ENGINE=ink xminal
```

| Key | Action |
|---|---|
| `Enter` | submit the prompt |
| `Ctrl+J` | newline |
| `Tab` | cycle agent mode |
| `Esc` | interrupt the running turn |
| `Ctrl+C` | quit |
| `y` / `a` / `n` | permission prompt: once · always · reject |

Honest limits — this engine is the least complete of the three:

- **No command palette and no slash commands.** Only `/exit`, `/quit`, `/mode…`
  and `/clear` are handled; every other `/command` prints
  `command not available in this build`.
- No mouse support — scrolling and overlays are keyboard-only.
- The caret is pinned to the end of the input (no arrow-key editing).
- It needs Node ≥ 22. On older Node, ink 8 does not load and XMINAL falls back
  to the built-in TUI with a warning.

## 3. Vendored OpenCode engine (`XMINAL_TUI_ENGINE=opencode`)

The literal OpenCode v2.2.7 terminal UI, vendored verbatim into `vendor/`
(MIT — see `vendor/LICENSE-opencode` and `vendor/NOTICE`) and wired to XMINAL's
runtime through `vendor/packages/xminal-bridge`, an in-process implementation of
the OpenCode server contract: no HTTP server, no SQLite, no network.

```bash
# desktop only; requires Bun (https://bun.sh)
git clone https://github.com/quitsaurabhverma2008-sketch/xminal.git
cd xminal && npm install && npm run build
XMINAL_TUI_ENGINE=opencode node dist/index.js
```

Requirements and constraints:

- **Bun on `PATH`** (`XMINAL_BUN` overrides the binary lookup).
- **A checkout that contains `vendor/`.** The npm tarball does **not** ship
  `vendor/`, so `npm install -g xminal` cannot run this engine. The launcher
  looks for the checkout in this order:
  1. `$XMINAL_OPENCODE_ENGINE` (an external OpenCode checkout),
  2. `<package root>/vendor` (a git checkout),
  3. `<package root>/../opencode` or `<package root>/../../opencode`.
- **Desktop only.** `@opentui/core` publishes no `android-arm64` native build,
  so the engine refuses to start on Android/Termux and XMINAL falls back to the
  built-in TUI with a warning.

Keybindings are opencode's own (see `vendor/packages/tui/src/config/keybind.ts`):

| Key | Action |
|---|---|
| `Ctrl+P` | command palette |
| `Ctrl+C` / `Ctrl+D` / `Ctrl+X` then `Ctrl+Q` | exit |
| `Ctrl+L` | clear the screen |
| `Ctrl+O` | recent sessions and projects |
| `Ctrl+X` (leader) + `n` | new session |
| `Ctrl+X` (leader) + `l` | list sessions |
| `Ctrl+X` (leader) + `b` | toggle the sidebar |
| `Ctrl+X` (leader) + `e` | open the prompt in an external editor |
| `Ctrl+X` (leader) + `w` | close the session tab |
| `Ctrl+X` (leader) + `x` | export the session |

The bridge covers the happy path (sessions, streaming, tool calls,
permissions, model/provider/agent/command lists, usage). Features it does not
implement return honest `501`s — it never fakes success.

## How to pick

| Situation | Use |
|---|---|
| Phone, Termux, SSH, or any terminal you do not control | built-in TUI |
| You want the opencode look and run Node ≥ 22 | `XMINAL_TUI_ENGINE=ink` |
| You want literally opencode's UI, on macOS/Linux/Windows, and have Bun + a checkout | `XMINAL_TUI_ENGINE=opencode` |
| CI, pipes, scripts | `xminal run --json "…"` — no TUI involved |

The built-in TUI is the one to trust: it has the widest platform support, the
most complete command set, and no external runtime requirements.

See also [OPENCODE-ENGINE.md](OPENCODE-ENGINE.md) for the vendored engine's
internals.
