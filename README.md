<div align="center">

<img src="assets/logo.svg" width="720" alt="XMINAL — Every coding agent. One terminal." />

[![ci](https://github.com/quitsaurabhverma2008-sketch/xminal/actions/workflows/ci.yml/badge.svg)](https://github.com/quitsaurabhverma2008-sketch/xminal/actions/workflows/ci.yml)

```
██╗  ██╗███╗   ███╗██╗███╗   ██╗ █████╗ ██╗
╚██╗██╔╝████╗ ████║██║████╗  ██║██╔══██╗██║
 ╚███╔╝ ██╔████╔██║██║██╔██╗ ██║███████║██║
 ██╔██╗ ██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║
██╔╝ ██╗██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗
╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝
```

**XMINAL** — Every coding agent. One terminal.

`v0.5.0` · MIT · Node ≥ 18 · zero runtime dependencies

</div>

---

XMINAL is a provider-agnostic terminal coding agent and orchestration platform. It fuses the best ideas from 125 MIT-licensed terminal-agent projects into one hackable TypeScript core — streaming agent loop, tool calling, modes, sessions, memory, subagents, MCP, permissions — and exposes it through one `xminal` command.

## Requirements

- **Bun ≥ 1.4** for the fullscreen TUI (same choice as opencode: Zig-native OpenTUI engine). Install with `npm i -g bun`.
- Node ≥ 18 for classic REPL (`xminal --no-tui`).

## Features

- **Every provider** — OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI, Cerebras, Cohere, Together, Fireworks, Moonshot, Hugging Face, GitHub Models, Ollama, LM Studio, llama.cpp, vLLM and more (**47 built-in providers, 258 models** with real pricing/context). Default is **OpenCode's free models** (no key required).
- **Every workflow** — Plan → Build → Compose → Review → YOLO modes, plus Ralph loops that keep iterating until your verification command passes.
- **Every scale** — one agent, background subagents, parallel git worktrees, cost-aware routing.
- **Transparent** — every tool call is metered: `/tools` (or drop-in `/mcp`) shows calls, ≈tokens (chars/4) and errors per tool and per MCP server; totals persist in `.xminal/receipts/tool-usage.jsonl`.
- **Safe by default** — ask/auto/full permission modes, protected paths (`.env`, `~/.ssh`…), hash-chained audit receipts, automatic file checkpoints + undo.
- **Remembers** — JSONL sessions with resume/branch/rewind, Markdown memory with search, project-agnostic skills (`~/.agents/skills`).
- **Everywhere** — interactive REPL, headless `xminal run --json`, OpenAI-compatible HTTP server with SSE, Telegram bridge.

## Quickstart

```bash
# single command (npm registry):
npm install -g xminal

# or from the GitHub release asset without npm:
npm install -g https://github.com/quitsaurabhverma2008-sketch/xminal/releases/download/v0.1.1/xminal-0.1.1.tgz

# or from source:
git clone https://github.com/quitsaurabhverma2008-sketch/xminal.git
cd xminal
npm install && npm run build && npm link   # installs the `xminal` command

xminal doctor       # sanity-check your environment
xminal              # start the agent
```

Set a provider key (or use the built-in OpenCode free models):

```bash
export OPENROUTER_API_KEY=sk-or-...
xminal doctor
xminal "fix the failing test"
```

## Commands

```
xminal                          interactive REPL
xminal "task"                   one-shot autonomous run
xminal run [flags]              headless: --json, --quiet, -m provider/model, --session <id>
xminal resume [id|latest]       continue a session
xminal ralph <task> --verify <cmd> [--iterations N]
xminal worktree <list|create|remove|merge>
xminal serve [--port 8787] [--host 127.0.0.1] [--token T]
xminal telegram [--token T]
xminal mcp --serve            # expose XMINAL tools as an MCP stdio server
xminal audit [verify|tail]    # inspect / verify the hash-chained audit log
xminal skills install <path|git-url>   # add a skill (also --global)
xminal skills --lock | --verify         # trust / verify the skills lockfile
xminal init | doctor | models | sessions | skills | mcp | config | version
```

In the REPL, `/` commands: `/mode plan|build|compose|review|yolo` · `/model` · `/models` · `/memory add|search|forget` · `/ralph` · `/verify` · `/diff` · `/undo` · `/rewind <id>` · `/sessions` · `/status` · `/cost` · `/tools` · `/audit` · `/compact` · `/doctor` · `/help` · `/exit`.

## Configuration

```jsonc
// ~/.xminal/config.json  (global) · .xminal/config.json  (project overrides global)
{
  "defaultModel": "opencode/inkling-2-small-free",   // or e.g. "openai/gpt-6-luna", "anthropic/claude-sonnet-5-5"
  "models": { "cheap": { "provider": "groq", "model": "openai/gpt-oss-20b" } },
  "permissions": { "mode": "auto", "protectedPaths": [".env", "~/.ssh"] },
  "limits": { "maxTurns": 40, "maxCostPerSession": 5 },
  "verifyCommand": "npm test"
}
```

Model references are `provider/model` or a configured alias. `xminal models` lists every alias with pricing/context. Env vars: `XMINAL_MODEL`, `XMINAL_PERMISSION_MODE`, plus the usual `*_API_KEY`s (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, …).

## Safety model

| Risk | Meaning | Behavior (auto) |
|---|---|---|
| safe | `read/glob/grep/list/task/todo/memory/skill/web_fetch/…` | always allowed |
| risky | file edits, `npm install`, `git commit`, shell | auto-approved |
| dangerous | `rm -rf`, `sudo`, curl-pipe-shell, protected paths | asks / denied without a handler |

Protected paths are denied even in `full` mode. Every allow/deny is appended to `.xminal/receipts/audit.jsonl` (hash-chained). Checkpoints are made before every edit (`/undo` to restore).

## HTTP server

```bash
xminal serve --port 8787 --token $TOKEN

curl localhost:8787/health
curl -H "Authorization: Bearer $TOKEN" localhost:8787/v1/models
curl -H "Authorization: Bearer $TOKEN" -X POST -H 'content-type: application/json' \
     -d '{"prompt":"list TODOs in this repo"}' localhost:8787/v1/agent
# or drop-in OpenAI-compatible: POST /v1/chat/completions (streams SSE)
# built-in web UI: open http://127.0.0.1:8787/ in a browser
```

## Status (honest)

**v0.1.1** — build green, 28/28 tests, packaged and on PATH as `xminal`. Releases: [v0.1.1](https://github.com/quitsaurabhverma2008-sketch/xminal/releases/tag/v0.1.1) · CI green on `main`. Not yet verified against live LLM endpoints from this machine (OpenCode free tier is rate-limited here; no API keys present). Bedrock/Vertex/Azure native adapters are not built. npm publish pending maintainer approval. See `EXECUTION-PLAN.md` (18 phases), `PLAN.md`, `FEATURE_MATRIX.md`, `BRAIN.md`.

## Development

```bash
npm run build     # tsc → dist/
npm test          # 16 tests (node:test, no network needed)
npm pack          # tarball for release
```

## License

MIT — see `LICENSE`.
