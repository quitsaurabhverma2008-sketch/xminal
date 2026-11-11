# Frontends: built-in, Ink, OpenCode-vendored (all opt-in or default)

XMINAL ships three frontends — pick the one that fits your terminal:

| Engine | Env var | Status | Stack |
|---|---|---|---|
| Built-in TUI (default) | — | everywhere | pure Node, zero native deps |
| **Ink engine** | `XMINAL_TUI_ENGINE=ink` | everywhere Node ≥ 22 (Android/Termux included) | [Ink 8](https://github.com/vadimdemedes/ink) + @inkjs/ui + yoga **WASM** |
| OpenCode vendored engine | `XMINAL_TUI_ENGINE=opencode` | macOS/Linux/Windows only | verbatim opencode v2.2.7 (Bun required) |

The **Ink engine** is the closest path to a true opencode experience on every device — it is a real framework, not a hand-rolled ANSI painter: React components, hooked state, Flexbox layout via yoga (WebAssembly — no native modules to install or build). Same opencode visual language: gradient boot logo, raised user box with mode-colored left border, fenced markdown, tool activity rows, sidebar, working row, queue, permission bar.

```bash
XMINAL_TUI_ENGINE=ink xminal
```

Requires Node ≥ 22 (ink 8 engines). No Bun. No native builds. Falls back to the built-in TUI otherwise.

---



1. **Built-in TUI** (default everywhere) — pure Node/ANSI, opencode-styled. Works on macOS, Linux, Windows, Android/Termux. Zero native dependencies.
2. **OpenCode engine** (`XMINAL_TUI_ENGINE=opencode`) — the literal [OpenCode](https://github.com/anomalyco/opencode) v2.2.7 terminal UI, vendored into this repo under `vendor/` (MIT, see `vendor/LICENSE-opencode` + `vendor/NOTICE`), wired to XMINAL's runtime instead of an HTTP server.

## How it works

```
┌───────────────────┐   XMINAL runtime    ┌──────────────────────────┐
│  vendored OpenCode│  ─────────────────  │  xminal-bridge           │
│  TUI (Solid.js)   │  in-process "fetch" │  (vendor/packages/…)     │
│  packages/tui     │  ←────────────────  │  OpenCode server contract │
└───────────────────┘                      └──────────────────────────┘
```

- The TUI talks to an object shaped like opencode's HTTP client, but the transport is **in-process**: `xminal-bridge` answers every `/api/*` call against XMINAL's runtime — no network, no SQLite, no ports.
- Streaming (reasoning, text, tool lifecycle, usage) flows through the real OpenCode SSE wire format; the vendored TUI renders it unmodified.
- XMINAL's agent loop, permissions engine, sessions, providers and model catalog are what actually runs underneath. XMINAL is still XMINAL — only the pixels are OpenCode's.
- Only one file of upstream code is patched: `vendor/packages/tui/src/app.tsx` (+4 lines, lets the launcher inject the shim transport instead of the HTTP client).

## Running it

```bash
# desktop only (macOS / Linux / Windows). Requires Bun: https://bun.sh
# from a git checkout (the npm tarball does NOT ship vendor/ — see below)
git clone https://github.com/quitsaurabhverma2008-sketch/xminal.git
cd xminal && npm install && npm run build
XMINAL_TUI_ENGINE=opencode node dist/index.js
```

Already have an opencode checkout? Point XMINAL at it:

```bash
XMINAL_OPENCODE_ENGINE=/path/to/opencode XMINAL_TUI_ENGINE=opencode xminal
```

XMINAL looks for the engine in this order: `$XMINAL_OPENCODE_ENGINE` → `<package>/vendor` → `<package>/../opencode`. When it finds nothing it says so plainly and names the three options — it never pretends to start the engine.

On Android/Termux the engine cannot run: there is no public prebuilt `@opentui/core-android-arm64` native renderer (upstream ships darwin/linux/win32 targets only). XMINAL detects this and falls back to the built-in TUI with a clear warning — never silently.

## Honest limitations

- **Bridge coverage is the happy path** — create session, prompt, streamed reply, tool calls, interactive permissions, model/provider/agent/command lists, usage accounting. Unimplemented: fork, revert, compact, session delete/rename, command execution over the bridge, MCP actions from the palette, form flows. Those return honest `501`s — never fake success.
- The vendored tree currently carries 3 pre-existing typecheck diagnostics (`@types/node` `zlib.zstdCompressSync`, `module.registerHooks` drift). They do not affect the Bun runtime.
- Engine requires Bun on `PATH` (`XMINAL_BUN` overrides the binary lookup).
- **The npm tarball does not ship `vendor/`** (~70 MB of source). Since v0.15.0 the published package is 3.5 MB / 179 files — small enough to install anywhere, and the vendored engine runs from a git checkout or an external checkout via `XMINAL_OPENCODE_ENGINE`. The built-in TUI (default) and the Ink engine cover every device.
- The built-in TUI and the Ink engine are the supported frontends on Android/Termux; see `docs/FRONTENDS.md`.

## Updating the vendored copy

1. Download a new `anomalyco/opencode` tag tarball.
2. Replace `vendor/packages/*`, `vendor/patches`, `vendor/bun.lock`, `vendor/package.json`, `vendor/bunfig.toml` from the new tag.
3. Re-apply the 4-line transport patch in `packages/tui/src/app.tsx`.
4. Re-run `bun install`, `bun check --no-script -b` inside `vendor/`, and the XMINAL bridge smoke checks.
5. Bump XMINAL's version and CHANGELOG.
