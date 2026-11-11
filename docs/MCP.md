# XMINAL — MCP

Two different things share the name "MCP" in XMINAL:

1. **MCP client** — XMINAL can call tools exposed by MCP servers you configure.
2. **MCP catalog** — an offline directory of 3,832 public MCP servers that ships
   inside the package. It is a *catalogue*, not an installer.

Plus a third mode: `xminal mcp --serve` turns XMINAL itself into an MCP server
that exposes XMINAL's tools to any MCP client.

## The offline catalog

`data/mcp-catalog.json` (copied to `dist/data/` at build time) holds 3,832
entries built from the Smithery registry and GitHub by
`scripts/fetch-mcp-catalog.py`. Searching it never touches the network.

Each entry carries:

| Field | Meaning |
|---|---|
| `id` | qualified id, e.g. `brave/search` |
| `name` | display name |
| `work` | one-line description — what the server does |
| `url` | homepage / docs |
| `platforms` | `linux` · `windows` · `mobile` (Termux/Android counts as mobile) |
| `remote` | hosted over HTTP (no local install) |
| `uses` | popularity signal (Smithery use count or GitHub stars) |
| `source` | `smithery` or `github` |

In the shipped catalog: every entry lists `linux` and `windows`, 3,572 list
`mobile`, and 903 are flagged as hosted.

### Search matching

A query is matched in this order, best score first:

| Match | Score |
|---|---|
| exact id or name | 100 |
| id or name starts with the query | 80 |
| id or name contains the query | 60 |
| the description (`work`) contains the query | 40 |

Ties are broken by popularity (up to +15 for well-known servers).

## Searching from the shell

```bash
xminal mcp search pdf
xminal mcp search "browser automation"
xminal mcp search github --platform mobile   # see the parsing bugs below
```

Output (up to 40 hits):

```
MCP catalog: 3832 servers (smithery.ai registry + GitHub) — 25 match "pdf"
· pdf mcp · Agentic RAG over one PDF or a whole folder, with page-level evidence…
   jztan/pdf-mcp · LINUX/WINDOWS/MOBILE · https://github.com/jztan/pdf-mcp
```

### Known parsing bugs — read this before using `--platform`

The platform filter itself works (the catalog search excludes servers that do
not list that platform), but the CLI wrapper around it is currently broken in
two places:

| Invocation | What actually happens |
|---|---|
| `xminal mcp search pdf --platform mobile` | `--platform` is parsed as a valueless flag, so `mobile` becomes part of the query: it searches for the literal string `"pdf mobile"` → 0 matches |
| `/mcp search pdf --platform mobile` (classic REPL) | the platform is applied, but an off-by-one in the token filter leaves `"--platform"` in the query → 0 matches |
| `/mcp search --platform mobile` (classic REPL) | works: platform filter applied, empty query (lists the first 40 matching servers) |

So today, filter by platform in the classic REPL with the flag **before** any
query, or filter manually by reading the `LINUX/WINDOWS/MOBILE` tag on each
result line. The upstream fix belongs in `src/cli/args.ts` (add `platform` to
`VALUE_FLAGS`) and in the token filter in `src/cli/commands.ts`.

## Searching from the TUI

`/mcp` opens the catalog overlay inside the built-in TUI:

| Key | Action |
|---|---|
| type | filter by name or by what the server does |
| `↑` / `↓` | move the selection |
| `Enter` | show the entry: name, description, id, platform tags, URL, and the `mcpServers` snippet to paste |
| `Ctrl+A` | add the highlighted entry to `~/.xminal/config.json` (disabled, with a backup) |
| `Esc` | close the overlay |

The overlay shows up to 300 matches and displays the platform tags per row. It
has no platform filter of its own — the tags are shown so you can decide.

The mouse wheel moves the selection inside every overlay (including `/mcp` and
`/sessions`); it never scrolls the chat behind them.

## Adding a server to your config

MCP servers are configured in `~/.xminal/config.json` (global) or
`<project>/.xminal/config.json` (project override) under `mcpServers`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/home/me/projects"],
      "env": { "LOG_LEVEL": "warn" },
      "enabled": true,
      "timeoutMs": 30000
    }
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `command` | `string[]` | **required** — argv of the server process: first element is the executable, the rest are arguments |
| `env` | `Record<string,string>` | extra environment variables for that process (merged over your environment) |
| `enabled` | `boolean` | `false` keeps the entry but never starts it (default: enabled) |
| `timeoutMs` | `number` | per-request timeout in milliseconds (default: 30000) |

XMINAL speaks MCP over **stdio** (JSON-RPC 2.0, protocol `2024-11-05`): the
server must be a local process XMINAL can spawn. Entries in the catalog marked
`HOSTED` are HTTP services — they need a stdio bridge (for example
`mcp-remote`) in `command`.

Then check the wiring:

```bash
xminal mcp                     # lists configured servers and their tools
xminal doctor                  # MCP section
```

In the TUI, `/mcp` opens the catalog overlay; the classic REPL's `/mcp` lists
the configured servers and their tools. The agent can call them through the
`mcp_list` and `mcp_call` tools.

### The catalog does not install anything

The catalog stores **no launch command** — only a name, a description, the
platforms and a URL. XMINAL will not invent an npm package name, so the
snippet it prints carries a visible placeholder instead:

```json
{
  "mcpServers": {
    "brave-search": {
      "command": ["npx -y <npm-package-from-the-readme>"],
      "enabled": false,
      "url": "https://github.com/…"
    }
  }
}
```

`Ctrl+A` in the `/mcp` overlay writes exactly this into
`~/.xminal/config.json` (a backup of the previous file is kept next to it, as
`config.json.bak`) — **disabled**, so nothing starts until you are ready.

To finish the entry: open the entry's URL, read how that server is launched,
put **that** command in `command` and set `"enabled": true`. XMINAL will not
install a server for you, and it will not fetch a server's source at runtime.

Entries marked `HOSTED` are HTTP services; XMINAL speaks MCP over stdio, so
they need a stdio bridge (for example `mcp-remote`) in `command`.

## Rebuilding the catalog

The catalog is a generated data file. To regenerate it you need Python 3 and
network access:

```bash
python3 scripts/fetch-mcp-catalog.py
# usage: fetch-mcp-catalog.py [target-count] [out.json] [github-token]
```

| Argument | Default | Meaning |
|---|---|---|
| 1 | `3200` | target count; the script keeps up to `target × 2` entries |
| 2 | `data/mcp-catalog.json` | output path |
| 3 | `$GITHUB_TOKEN` | GitHub token (raises the search rate limit) |

What it does:

1. Queries the Smithery registry across ~100 topic terms (github, slack, pdf,
   filesystem, browser, …) — curated servers with descriptions and remote flags.
2. Queries the GitHub repository search for `topic:mcp-server`,
   `topic:model-context-protocol` and `topic:mcp-server in:name,description`,
   up to 12 pages per query, sorted by stars. It sleeps 2.2 s between pages to
   stay under the unauthenticated search rate limit.
3. Infers platform tags from keywords in the name and description: desktop-only
   wording (`docker`, `vscode extension`, `electron app`, …) → `linux`/`windows`;
   mobile wording (`android`, `ios`, `termux`, …) → all three.
4. Merges both sources, sorts by popularity, truncates to `target × 2`, and
   writes `data/mcp-catalog.json`.

Then rebuild so the file lands next to the compiled code:

```bash
npm run build        # tsc + Ink bundle + copies data/ → dist/data/
```

The file is ~1 MB and ships inside the npm tarball, so a normal install never
needs this step.

## XMINAL as an MCP server

```bash
xminal mcp --serve
```

Speaks MCP over stdio and exposes XMINAL's own tools (read, write, edit,
glob, grep, bash, …) to any MCP client. It is the same tool surface the agent
uses internally, so the same permission engine applies.

## See also

- [FRONTENDS.md](FRONTENDS.md) — where the `/mcp` overlay lives
- [SECURITY.md](SECURITY.md) — MCP servers are local processes that run with your privileges
