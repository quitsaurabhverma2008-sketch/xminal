# BRAIN.md — XMINAL

> Project brain. Read this first when resuming. Update after every session.

## 1. Project kya hai

**XMINAL** — ek all-in-one, provider-agnostic terminal coding agent + orchestration platform.
125 MIT-licensed terminal-agent projects ke best features ko ek product me laana.
Run command: `xminal`. Project folder: `/workspace/projects/ff` (folder name only; product name XMINAL).

## 2. Stack + hosting plan

- **Language:** TypeScript (Node 20+, CommonJS build via tsc)
- **Deps:** Node built-ins only at runtime; TypeScript + @types/node dev-only
- **Storage:** JSONL sessions, JSON config, Markdown memory, file snapshots
- **Hosting:** Local-first CLI — no server needed. Free distribution via npm + GitHub Releases.
- **License:** MIT

## 3. Parts + status

| Part | Status |
|---|---|
| BRAIN.md | done |
| Master plan (`PLAN.md`) | done (v0.1) |
| Feature matrix 125/125 (`FEATURE_MATRIX.md`) | done |
| Skills installed (`~/.agents/skills`) | done |
| Repo scaffold | done |
| Config + profiles + doctor | done |
| Provider adapters (OpenAI-compatible, Anthropic, Gemini, local) | done |
| Provider router (failover/cost/capability) | done (basic failover) |
| Agent loop + streaming + tool calling | done |
| Tools (read/write/edit/bash/search/glob/list/todo/memory/skills/task/worktree/git/verify) | done |
| Session store (resume/branch/rewind/checkpoint) | done |
| Permissions (Ask/Auto-Review/Full) + audit receipts | done |
| Memory (Markdown + search) | done |
| Skills loader | done |
| MCP client + manager | done |
| Subagents + Ralph loop + worktree orchestrator | done |
| CLI REPL + slash commands + headless run | done |
| HTTP server + Telegram bridge | done (untested against live services) |
| Tests + build + verify | done (18/18 tests, `npm test`) |
| Docs & brand (README, CHANGELOG, LICENSE, logo, install.sh, SECURITY.md) | done |
| MCP server mode (`xminal mcp --serve`) | done + tested |
| `xminal audit verify` + secret-scan test | done |
| CI workflow (`.github/workflows/ci.yml`) | done |
| Install `xminal` on PATH | done (~/.local/bin/xminal → dist/index.js) |

## 4. Important decisions

1. **Name:** XMINAL; binary `xminal`.
2. **Strategy:** core + adapters + skills + plugins; integrate external agents via MCP/ACP/PTY instead of reimplementing all 125.
3. **Stack:** TypeScript/Node 20 first (Bun not installed). Rust core later if perf needed.
4. **Providers:** default = OpenCode (`opencode/inkling-2-small-free`, keyless). 47 providers + 258 model aliases generated from models.dev snapshot (2026-11-08) in `src/config/default-models.ts` (aliases as `provider/model` with real limits + $/Mtok pricing). Bedrock/Vertex/Azure need native adapters — NOT built. User will adjust later. Global config regenerated (backup `~/.xminal/config.json.bak-20261108`, `.bak2`, `.bak3`).
5. **Language of UI:** English CLI, Hinglish-friendly messages optional.
6. **Safety:** sandbox hooks + permission engine; secrets never in prompts/logs.
7. **No paid-only dependencies.**

## 5. Next steps

1. Wait for user's provider list; add missing adapters/models + pricing.
2. Live provider smoke: opencode default returns 429 FreeUsageLimitError (free tier exhausted) — verify with user's key or OpenCode Go subscription later.
3. MCP client verified offline via `tests/mcp.test.js` (echo fixture). Telegram bridge still untested (needs token).
4. README + npm release packaging (needs user approval).
4. npm release + GitHub release once user confirms repo URL and publish.
5. Provider live smoke once user adds credentials (or OpenCode Go / local Ollama).
6. Iterate roadmap v0.2+ from `PLAN.md` + `EXECUTION-PLAN.md`.

## 6. Learnings applied

- Node 24 test glob issue — we target Node 20 but use glob-safe test script.
- MCP config uses `environment`, not `env`.
- Keep MCP servers minimal (token cost).
- No secrets in knowledge base.

## 7. Lessons (project-specific)

- Provider router gotcha: agent passed a resolved `ResolvedModel` object into `router.chat()`, so `fallbackModels` were never used and failover silently did nothing. Fix: router resolves the fallback chain when `request.model` is a spec string, and injects the actual `model` into `usage` events for cost tracking.
- Permission semantics: `ask` mode asks for non-safe tools only; `auto` allows risky but asks for dangerous; `full` allows all except protected paths (`.env`, `~/.ssh`). Safe tools (`read/glob/grep/list/task/...`) always allowed. Dangerous without handler → deny.
- Compaction must not cut inside a tool-result run: while the boundary message has `role === "tool"`, move the cut back to the assistant with `tool_calls`.
- Resume needs `this.history` seeded from `session.messages` for non-ephemeral agents, or a resumed agent forgets everything.
- `npm test` passes 18/18 (`tests/*.test.js`). `xminal` symlinked at `~/.local/bin/xminal` → `dist/index.js`.
- No provider keys on this machine (ollama/lmstudio not running), so live LLM path untested; server auth/models/health/agent endpoints verified locally.


## 8. Provider work log (2026-11-08)

- models.dev `api.json` (5.9 MB) fetched to `/tmp/opencode/models-dev-api.json`; used to generate model catalog.
- 258 aliases in `src/config/default-models.ts` — renamed `fireworks-ai→fireworks`, `novita-ai→novita`, `ollama-cloud→ollama_cloud` to match XMINAL provider keys.
- 47 providers: opencode (keyless), openai, anthropic (native), gemini (native, key `gemini`+`google`), openrouter, groq, deepseek, mistral, xai, cerebras, cohere, togetherai, fireworks, perplexity, moonshotai(+cn), huggingface, github (GitHub Models), nvidia, deepinfra, sambanova, novita, friendli, nebius, poe, ollama_cloud, zai, zhipuai, minimax (anthropic-compatible), stepfun(+cn), siliconflow, volcengine, 302ai, venice, vercel, alibaba (DashScope) + local: ollama, ollama_cn, lmstudio, vllm, llama_cpp, koboldcpp, textgen, gpt4all, openwebui.
- opencode provider requires no auth; adapter sends no `Authorization` when `requiresKey: false`. Without a header the endpoint answers HTTP 429 FreeUsageLimitError — surfaced honestly (router now yields the FIRST candidate's error with count of candidates tried).
- `ProviderRouter` fix: agents used to pass a resolved model object, silently disabling `fallbackModels`; now resolves fallback chain from spec strings and injects the actual model into usage events for cost tracking.
- `xminal doctor`: opencode counts as ready (requiresKey false). 10/47 providers need a key; 11 usable offline/free (+opencode).
- `xminal models` lists everything; `resolveModel(config, "auto")` picks opencode first.
- `npm test`: 18/18 pass. Global config backed up to `~/.xminal/config.json.bak-20261108`.

## 9. Branding (2026-11-08)

- Tagline: **EVERY CODING AGENT. ONE TERMINAL.**
- Wordmark logo: `brand/logo.svg` (dark rounded tile, cyan→blue→violet gradient, monospace "XMINAL").
- Banner in REPL / README hero identical. `xminal --version` prints tagline.
- `LICENSE` MIT · `CHANGELOG.md` v0.1.0 · `scripts/install.sh` (npm or source fallback) · package `files` includes brand assets (111-file tarball).

## 10. Tool usage telemetry (2026-11-08)

- Every registry tool call is recorded in `.xminal/receipts/tool-usage.jsonl` (model, tool, server, detail, arg/result tokens ≈ chars/4, error, duration).
- `/mcp` and `/tools` render the aggregate table (all-time, project); `xminal run --json` adds `toolUsage`.
- MCP calls attribute as `server/tool` via the `mcp_call` args; builtins attribute as `xminal/<tool>`.
- Honest limitation: provider-side input/output token split is not per tool; values are local estimates (cost shows in /cost, tool tokens shown separately).
