# XMINAL — Troubleshooting

Start here:

```bash
xminal doctor      # Node, platform, config paths, credentials, writability, git, sandbox, skills, MCP
xminal version
xminal models      # providers, credential status, catalog source + freshness
xminal audit tail  # last 10 permission decisions
```

`xminal doctor` exits non-zero when a check fails, which makes it usable in
scripts and CI.

---

## "Model is unavailable" / free-tier quota exhausted

**Symptom**

```
Model is unavailable
insufficient_quota / quota exceeded
429 ... Limit 8000, Requested 18216 (rate_limit_exceeded)
all 13 candidate providers failed
```

**What XMINAL does**

The router builds a candidate chain for every request:

1. the model you asked for,
2. `fallbackModels` from your config,
3. one model per provider that is actually usable (has a key, or is keyless /
   free). Local servers (Ollama, LM Studio, vLLM, …) are skipped unless you
   asked for them explicitly — they are usually not running.

Model-level failures (retired model, exhausted quota) are treated as
*retryable*, so the next candidate is tried instead of dying on the first one.
Only when the whole chain is exhausted does the message say
`all N candidate providers failed`. When another model does answer, XMINAL says
which one answered.

**What to do**

| Situation | Fix |
|---|---|
| OpenCode's free tier | it is about 1M tokens/day, tracked **server-side by opencode** — XMINAL cannot reset it. Wait for the reset, or use another provider |
| 429 / TPM on a free tier | the tier is small: `/new` (fresh session), `/compact` (shrink the history), switch provider with `/model` |
| Your model was retired | `/model` → pick another entry from the catalog |
| Every provider fails | you probably have no usable credential: `xminal doctor`, section *Providers* |

Pin your own chain in `~/.xminal/config.json`:

```json
{
  "defaultModel": "groq/openai/gpt-oss-120b",
  "fallbackModels": ["nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b", "zai/glm-4.7-flash"]
}
```

Free-tier providers that need no key (OpenCode) or a free account (Groq,
Cohere, NVIDIA NIM, Z.AI, Mistral, LM Studio) are listed in the README with
their default model.

---

## npm blocks the install scripts ("install scripts blocked")

**Symptom** (npm ≥ 12)

```
1 package had install scripts blocked because they are not covered by allowScripts:
  xminal@0.14.0 (prepare: node scripts/prepare.cjs)
```

or, after installing from git, `xminal: command not found` /
`Cannot find module .../dist/index.js`.

**Cause** — npm 12 does not run dependency install scripts unless they are
covered by `allowScripts`. XMINAL's `prepare` script is what builds `dist/`,
and `dist/` is not committed to the repository.

**Fix**

```bash
# global install, one-off
npm install -g --allow-scripts=xminal git+https://github.com/quitsaurabhverma2008-sketch/xminal.git

# or build it yourself — no policy involved
git clone https://github.com/quitsaurabhverma2008-sketch/xminal.git
cd xminal && npm install && npm run build && npm link
```

For a local (non-global) install npm points at `npm install-scripts ls` /
`npm install-scripts approve <pkg>` instead.

More: [INSTALL.md](INSTALL.md).

---

## A slash command does nothing in the TUI

**Symptom** — you type `/memory` (or `/verify`, `/git`, `/skills`, …) in the
built-in TUI, press Enter, and nothing happens. The text may stay in the
composer, or the palette may show `no matches for "…"`.

**Why** — typing `/` opens the command palette, and the palette matches
*command names* by prefix. Enter picks the highlighted row:

- commands the TUI implements natively run (see below),
- commands it does **not** implement are swallowed — Enter does nothing,
- a command with arguments (`/memory add hello`) matches no palette row at
  all, so the text is discarded on Enter.

**Native in the built-in TUI**

`/new` · `/rename` · `/sessions` · `/resume` · `/undo` · `/checkpoints` ·
`/rewind` · `/compact` · `/branch` · `/model` · `/provider` · `/connect` ·
`/set-key` · `/variant` · `/effort` · `/reasoning` · `/mcp` · `/docs` ·
`/cost` · `/audit` · `/permissions` · `/status` · `/help` · `/clear` ·
`/report` · `/issue` · `/exit` · `/quit`

Typing just `/` lists the whole palette, so you can see what the TUI will
actually run.

Everything else (`/mode`, `/models`, `/verify`, `/memory`, `/skills`,
`/skill`, `/tasks`, `/todo`, `/diff`, `/git`, `/worktree`, `/ralph`,
`/doctor`, `/tools`, `/budget`, `/init`, `/config`, `/env`, `/setup`,
`/version`, `/about`, `/theme`, `/clear-key`, `/mcp-tools`, `/mcp-call`,
`/mcp-catalog`, …) exists in the **classic REPL**:

```bash
xminal --no-tui          # the classic REPL with the full command set
```

**In the Ink engine** (`XMINAL_TUI_ENGINE=ink`) there is no palette and no
slash commands at all: only `/exit`, `/quit`, `/mode…` and `/clear` work.
Anything else prints `command not available in this build`.

---

## The mouse wheel does not scroll

**Symptom** — the wheel does nothing, or the terminal's text selection is
broken.

**Cause** — XMINAL enables SGR mouse capture (`?1000h` + `?1006h`) by default,
so the terminal stops sending scroll events to the shell and the TUI handles
them (4 lines per notch).

**Fix**

```bash
XMINAL_MOUSE=0 xminal      # disable mouse capture entirely
```

`XMINAL_MOUSE=0` (also `off` / `false`) restores normal terminal behaviour —
including text selection. `PgUp` / `PgDn` always work, with or without mouse
capture.

Two more wheel details:

- Over the command / model / provider / effort overlays the wheel moves the
  **selection** instead of scrolling the chat.
- Over the `/mcp` and `/sessions` overlays the wheel scrolls the chat behind
  the overlay — use `↑` / `↓` there.

---

## The Ink engine does not start (or falls back immediately)

**Symptom**

```
ink engine failed (...); falling back to the built-in TUI.
```

**Cause** — the Ink engine needs **Node ≥ 22** (Ink 8 declares
`engines.node >= 22`). On Node 18 or 20 the bundle does not load.

**Fix**

```bash
node -v                 # must be >= 22 for the Ink engine
XMINAL_TUI_ENGINE=ink xminal
```

The built-in TUI is the fallback and works on Node ≥ 18. The Ink engine also
needs a TTY; without one XMINAL says `ink engine needs a TTY … falling back to
classic REPL`.

---

## The vendored OpenCode engine will not start

**Symptom**

```
opencode engine not installed: no OpenCode checkout found. Options: run from a
git checkout (vendor/ is included there), point XMINAL_OPENCODE_ENGINE at an
opencode checkout, or use the built-in TUI (default) / XMINAL_TUI_ENGINE=ink.
```

or

```
opencode engine needs Bun on PATH (https://bun.sh)
```

or

```
opencode engine is not supported on this platform (no android-arm64 native
renderer); using the built-in TUI.
```

**Causes and fixes**

| Cause | Fix |
|---|---|
| The npm tarball does not ship `vendor/` | use a git checkout, or point `XMINAL_OPENCODE_ENGINE` at an OpenCode checkout |
| Bun is not installed | install Bun (https://bun.sh); `XMINAL_BUN` overrides the binary lookup |
| Android/Termux | not supported — `@opentui/core` has no `android-arm64` build. Use the built-in TUI or the Ink engine |

See [FRONTENDS.md](FRONTENDS.md).

---

## Android / Termux

| Symptom | Explanation / fix |
|---|---|
| `xminal` prints a plain REPL instead of the fullscreen UI | the TUI needs a TTY; `XMINAL_TUI=1` forces it, `xminal --no-tui` accepts the REPL |
| The UI is cramped or rows are clipped | the layout is designed for ~40 columns and up; make the terminal wider (`termux-wake-lock`, landscape) |
| The first launch hangs for a few seconds | the model catalog is fetched from models.dev in the background; `XMINAL_MODELS_OFFLINE=1` disables it |
| `/report` does not open a browser | Termux needs `termux-open-url` from the Termux:API add-on; otherwise the URL is printed for you to copy |
| The vendored OpenCode engine is unavailable | expected — no `android-arm64` native renderer exists |
| `xminal doctor` reports `Sandbox: bwrap not found` | expected on Android — the sandbox backend is optional and disabled by default |

The built-in TUI is pure Node: no native modules, no build tools.

---

## Where the state lives

XMINAL writes no log file. What looks like "logs" are the receipts and the
session transcript:

| Path | What it is |
|---|---|
| `~/.xminal/config.json` | global config, provider keys, `mcpServers` |
| `~/.xminal/cache/models.json` | cached models.dev catalog (mode 600) |
| `~/.xminal/memory/` | global memory entries |
| `<project>/.xminal/sessions/<id>/events.jsonl` | session transcript (every message, tool call and tool result) |
| `<project>/.xminal/sessions/index.json` | session index (titles, timestamps, message counts) |
| `<project>/.xminal/checkpoints/` | automatic pre-edit checkpoints (`/undo`) |
| `<project>/.xminal/receipts/audit.jsonl` | hash-chained permission decisions |
| `<project>/.xminal/receipts/tool-usage.jsonl` | per-tool call/token metering (`/tools`) |
| `<project>/.xminal/todos.json` | the task list |

`XMINAL_LOG=debug` does **not** open a log file — the logging helper in
`src/util/log.ts` is not wired into the current code paths.

---

## Resetting the model catalog cache

The catalog is read at runtime only; `~/.xminal/config.json` is never rewritten
with fetched models. The cache is `~/.xminal/cache/models.json`.

```bash
# 1. drop the cache and let it refresh on the next interactive start
rm ~/.xminal/cache/models.json
xminal models refresh      # or: xminal   (refreshes in the background when stale)

# 2. point the cache somewhere else
XMINAL_MODELS_CACHE=/tmp/xminal-models.json xminal models refresh

# 3. stay offline (bundled + cached data only, no network calls)
XMINAL_MODELS_OFFLINE=1 xminal

# 4. change the freshness window (hours; 0 = refresh on every launch)
XMINAL_MODELS_TTL_HOURS=6 xminal
```

| Variable | Effect |
|---|---|
| `XMINAL_MODELS_CACHE` | path of the catalog cache file (default `~/.xminal/cache/models.json`) |
| `XMINAL_MODELS_OFFLINE` | `1` disables the background refresh entirely |
| `XMINAL_MODELS_TTL_HOURS` | cache lifetime in hours (default 24; `0` forces a refresh every launch) |

Check what is in use:

```bash
xminal models     # prints the catalog source (bundled · cache · fresh), counts and the cache path
```

---


### Other environment variables

| Variable | What it does |
|---|---|
| `XMINAL_DEFAULT_EFFORT` | sets the effort (low/medium/high/max) the TUI starts with — the TUI default is `max` |
| `XMINAL_SERVER_TOKEN` | bearer token for `xminal serve` — the same value as the `--token` flag |
| `XMINAL_PERMISSION_MODE` | overrides the permission mode (`ask`/`auto`/`full`) for the process |
| `XMINAL_MODEL` | overrides the configured default model for the process |


## Still stuck?

```bash
xminal doctor
```

Then report it: `/report` inside the TUI (or
[the issue tracker](https://github.com/quitsaurabhverma2008-sketch/xminal/issues/new)).
Include the output of `xminal version`, `xminal doctor` and the exact command
you ran. Security issues go to the private channel described in
[SECURITY.md](SECURITY.md), not the public tracker.
