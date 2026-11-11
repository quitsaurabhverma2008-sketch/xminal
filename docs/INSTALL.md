# XMINAL — Installation

## Requirements

| What you want | Needs |
|---|---|
| CLI + built-in TUI (default) | Node.js ≥ 18, npm |
| Ink engine (`XMINAL_TUI_ENGINE=ink`) | Node.js ≥ 22 (ink 8 `engines`), npm |
| Vendored OpenCode engine (`XMINAL_TUI_ENGINE=opencode`) | Bun on `PATH` **and** a checkout that contains `vendor/` — desktop OS only |
| Rebuild the offline MCP catalog | Python 3 + network (only for `scripts/fetch-mcp-catalog.py`) |
| Worktrees, `/diff`, `/git` | `git` |

The core has **no native dependencies** — the built-in TUI is pure Node, so there is
nothing to compile and no toolchain to install. The Ink engine adds 4 pure-JS
dependencies (`ink`, `@inkjs/ui`, `react`, `react-reconciler`).

See [FRONTENDS.md](FRONTENDS.md) for what each frontend really needs.

## Install from npm (recommended)

```bash
npm install -g xminal
xminal version
xminal doctor
```

`xminal doctor` prints your Node version, platform, config paths, provider
credentials, writable directories, git/bubblewrap/skill/MCP status, and exits
non-zero if a check fails.

What the published tarball contains:

| Included | Not included |
|---|---|
| `dist/` (compiled CLI + TUI), `data/mcp-catalog.json` (3,832 servers), `docs/`, `scripts/`, `assets/`, `site/` | `vendor/` — the vendored OpenCode engine (see below) |

The npm tarball deliberately does **not** ship `vendor/` (it would multiply the
package size), so an npm install gives you the built-in TUI and the Ink engine.
The vendored OpenCode engine only works from a git checkout or from an external
OpenCode checkout — see [FRONTENDS.md](FRONTENDS.md).

## Install from a git checkout

```bash
git clone https://github.com/quitsaurabhverma2008-sketch/xminal.git
cd xminal
npm install          # installs devDependencies (typescript, esbuild)
npm run build        # tsc → dist/  (+ bundles the Ink engine, copies data/)
node dist/index.js   # run it
```

To get an `xminal` command on your `PATH`:

```bash
npm link             # symlinks the package globally
# or
mkdir -p ~/.local/bin && ln -sfn "$PWD/dist/index.js" ~/.local/bin/xminal && chmod +x dist/index.js
```

`npm install` triggers the package's `prepare` script, which builds `dist/`.
`dist/` is **not** committed to the repository, so if that script does not run,
the checkout has no runnable CLI until you run `npm run build`.

### npm ≥ 12 and blocked install scripts

npm 12 blocks dependency install-time lifecycle scripts unless they are covered
by `allowScripts`, and prints a warning like:

```
1 package had install scripts blocked because they are not covered by allowScripts:
  xminal@0.14.0 (prepare: node scripts/prepare.cjs)

Run `npm install -g --allow-scripts=xminal` to allow these scripts once,
or `npm config set allow-scripts` to allow them for all global installs.
```

XMINAL needs its own `prepare` script to build `dist/`, so a git-URL install
can otherwise end up with a CLI that has no `dist/`. Three ways out:

```bash
# 1. allow the script for this package only (npm ≥ 12, one-off)
npm install -g --allow-scripts=xminal git+https://github.com/quitsaurabhverma2008-sketch/xminal.git

# 2. allow it for every global install from now on
npm config set allow-scripts

# 3. build it yourself — always works, no policy involved
git clone https://github.com/quitsaurabhverma2008-sketch/xminal.git
cd xminal && npm install && npm run build && npm link
```

For a **local** (non-global) install npm points at a different mechanism:
`npm install-scripts ls` to review, `npm install-scripts approve <pkg>` to allow.

`--dangerously-allow-all-scripts` runs every dependency's install script; it is
a blunt instrument and not needed for XMINAL.

## Install on Android / Termux

```bash
pkg update && pkg install nodejs
npm install -g xminal
cd my-project && xminal
```

- Termux's npm prefix is `$PREFIX`, so global installs land in `$PREFIX/bin`,
  which is already on `PATH`.
- Check `node -v`. The built-in TUI works on Node ≥ 18; the Ink engine needs
  Node ≥ 22.
- The vendored OpenCode engine **cannot** run on Android: `@opentui/core`
  publishes no `android-arm64` native build. XMINAL detects this and falls back
  to the built-in TUI with a warning.
- The built-in TUI is pure Node — no native modules, no build tools, no
  `bubblewrap` required.
- Terminal width matters: the UI is designed down to ~40 columns. Below that,
  rows start to clip.
- `/report` opens the issue tracker with `termux-open-url` when it is available.

## Release tarball

`scripts/install.sh` falls back to the GitHub release tarball when npm is
unreachable. The URL is version-pinned in that script:

```bash
npm install -g https://github.com/quitsaurabhverma2008-sketch/xminal/releases/download/v0.14.0/xminal-0.14.0.tgz
```

Check the current tag before using it — the pinned version in the script is not
updated automatically.

## After installing

```bash
export OPENROUTER_API_KEY=sk-or-...     # or any provider key
xminal doctor
xminal                                # interactive TUI
```

Inside the TUI: `/provider` (pick → paste key → live validation → save) or
`/model` (pick a model). Keys are stored only in `~/.xminal/config.json` on your
machine, or read from the environment. See [SECURITY.md](SECURITY.md).

## Where things live

| Path | Contents |
|---|---|
| `~/.xminal/config.json` | global config, provider keys, `mcpServers` |
| `~/.xminal/cache/models.json` | cached models.dev catalog (written with mode 600) |
| `~/.xminal/memory/` | global memory entries |
| `<project>/.xminal/config.json` | project config (overrides the global one) |
| `<project>/.xminal/sessions/` | session transcripts (`events.jsonl` + `index.json`) |
| `<project>/.xminal/checkpoints/` | automatic pre-edit checkpoints |
| `<project>/.xminal/receipts/` | `audit.jsonl` (hash chain) and `tool-usage.jsonl` |
| `<project>/.xminal/todos.json` | task list |
| `~/.agents/skills/` | global skills (`SKILL.md` folders) |

Project state (`.xminal/`) is gitignored by `xminal init`.

## Updating

```bash
npm install -g xminal@latest
npm view xminal version
xminal version
```

From a checkout:

```bash
git pull
npm install
npm run build
```

The model catalog updates itself in the background (24 h TTL); see
[TROUBLESHOOTING.md](TROUBLESHOOTING.md) for the cache variables.

## Uninstalling

```bash
npm uninstall -g xminal

# optional — remove your data
rm -rf ~/.xminal                  # global config, keys, cached catalog, memory
rm -rf <project>/.xminal          # sessions, checkpoints, audit receipts, todos
```

Nothing is written outside these two directories. The npm global prefix keeps a
copy of the package (`npm root -g`); `npm uninstall -g xminal` removes it.

## Broken install checklist

| Symptom | Check |
|---|---|
| `xminal: command not found` | `npm ls -g --depth=0` — the global bin directory is on `PATH` |
| `Cannot find module .../dist/index.js` | the build did not run: `npm run build` in a checkout, or reinstall from npm |
| `npm ERR! Unsupported engine` | Node < 18 — upgrade Node |
| TUI garbled / not fullscreen | not a TTY (piped input), or the terminal does not support the alternate screen — run `xminal` in a real terminal |
| Ink engine falls back immediately | `node -v` must be ≥ 22 |
| Vendored engine says "not installed" | no `vendor/` in the install — see [FRONTENDS.md](FRONTENDS.md) |

More: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
