# XMINAL — Master Plan

**Status:** v0.1.0 built · brand assets landed · see `EXECUTION-PLAN.md` for the phase-by-phase build order
**Source inventory:** `FEATURE_MATRIX.md` (125 projects, 125/125 mapped)
**Providers:** Default = OpenCode (`opencode/inkling-2-small-free`, keyless). 47 providers + 258 model aliases (models.dev snapshot 2026-11-08). User will adjust later. Bedrock/Vertex/Azure need native adapters (not built).
**License target:** MIT
**Working dir:** `/workspace/projects/ff`

---

## 1. Executive summary

**xminal** ek provider-agnostic terminal coding agent + orchestration platform hai jo 125 MIT projects ke best features ko ek hi product me laata hai.

Core idea:

> **Core small rakho, baaki sab adapters/skills/plugins se jodo.**

Hum 125 projects ko reimplement nahi karenge. Strategy:

- **Native** — jo core differentiator hai (agent loop, modes, sessions, memory, orchestration, security)
- **Borrow** — MIT code/algorithms/skills (TUI patterns, eval harness, skill packs)
- **Integrate** — external agents/tools via MCP, ACP, PTY, HTTP (Claude Code, Codex, OpenCode, browsers, Telegram)
- **Reference** — design inspiration only

Isse v1 jaldi ship hota hai aur baaki features plugin ecosystem me grow karte hain.

### Product pillars

1. **Any provider** — 40+ APIs, local models, failover, quota routing
2. **Any workflow** — Plan/Build/Compose/Yolo, spec-driven, Ralph loops
3. **Any scale** — single agent → subagents → worktree fleets → swarms
4. **Anywhere** — TUI, headless, HTTP/ACP server, Telegram, mobile
5. **Safe by default** — sandbox, secrets broker, audit receipts, provenance
6. **Remembers** — sessions, memory, codebase wiki, beads graph
7. **Cheap** — output compression, context pruning, token budgets, cost logs

---

## 2. Guiding principles

| Principle | Matlab | Source inspiration |
|---|---|---|
| Provider-agnostic | Koi bhi OpenAI/Anthropic/Gemini-compatible API + local | OpenCode, OpenCodex, Pi-ai |
| Local-first | Data/project local; cloud optional | OpenClaw, Atomic, Moltis |
| Composable | Core + adapters + skills + plugins | Pi, rpi, Open-Harness |
| Observable | Har tool call, cost, token, diff track ho | AgentSight, Trae, AgentDiff |
| Reversible | Undo, rewind, checkpoints, branch | Reasonix, Codewhale, Plandex |
| Safe | Sandbox default-on, secrets never to model | Codewhale, authsome, DvalinCode |
| Fast | ms startup, low RAM | jcode, NullClaw, 3code |
| Interoperable | MCP, ACP, LSP, DAP, Git | OpenCode, OpenHands, Martty |

---

## 3. High-level architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          INTERFACES                                   │
│  TUI  │  Headless CLI  │  HTTP/WS Server  │  ACP Server  │  MCP      │
│  Telegram/Slack/Discord  │  Mobile companion  │  GitHub Actions       │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│                         AGENT RUNTIME                                 │
│  Session Manager (branch/resume/rewind/checkpoint)                    │
│  Agent Loop (plan → act → observe → verify)                          │
│  Modes: Plan | Build | Compose | Review | Yolo                       │
│  Permission Engine: Ask | Auto-Review | Full Access                   │
│  Subagents | Swarm | Ralph Loops | Council | Worktree Fleet           │
│  Context Engine: pruning, compression, retrieval, TurnMemory          │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│                         CAPABILITY LAYER                              │
│  Providers/Router  │  Tools  │  Memory  │  Skills  │  Plugins         │
│  MCP Client/Server │  ACP    │  LSP/DAP │  Browser │  Search/RAG      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│                         PLATFORM LAYER                                │
│  Sandbox (bubblewrap/seatbelt/docker)  │  Secrets Broker              │
│  Audit/Provenance (hash chain, Git notes)  │  Cost/Telemetry           │
│  Config (xminal.toml)  │  Storage (SQLite/JSONL/Blobs)  │  Updates         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Repository layout (monorepo)

```
xminal/
├── apps/
│   ├── cli/                 # xminal binary: TUI + headless
│   ├── server/              # HTTP/WS + ACP server
│   └── desktop/             # optional Tauri shell (later)
├── packages/
│   ├── core/                # agent loop, modes, permissions, sessions
│   ├── config/              # xminal.toml schema, profiles, doctor
│   ├── providers/           # adapter interface + implementations
│   ├── router/              # failover, cost, quota, capability routing
│   ├── tools/               # fs, bash, search, edit, lsp, dap, browser
│   ├── memory/              # session store, FTS5, markdown, wiki, beads
│   ├── context/             # pruning, compression, TurnMemory, retrieval
│   ├── orchestrator/        # subagents, worktrees, ralph, council, swarm
│   ├── sandbox/             # backends + secrets + policy engine
│   ├── skills/              # SKILL.md loader, registry, packs
│   ├── plugins/             # plugin host (Lua first, TS later)
│   ├── mcp/                 # MCP client pool + server
│   ├── acp/                 # ACP client/server
│   ├── bridge/              # telegram/slack/discord/webhooks
│   ├── telemetry/           # cost, traces, audit, provenance
│   └── sdk/                 # embeddable TypeScript/Python SDK
├── skills/                  # bundled skill packs (spec, TDD, review...)
├── templates/               # project templates / AGENTS.md presets
├── evals/                   # SWE-bench harness, skill benchmarks
├── docs/
└── scripts/                 # release, packaging, Termux
```

---

## 5. Tech stack — options & recommendation

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A. TypeScript + Bun monorepo** | Fastest dev; best MCP/SDK ecosystem; React/Ink TUI; Bun compiles to ARM64 binary; easy plugin loading | Higher RAM than Rust/Zig; startup ~50–100ms | **Recommended for v1** |
| B. Rust core + TS TUI | jcode-level perf; single binary; memory safe | 3–5x dev time; provider churn painful | v2 option |
| C. Go core + TS TUI | Single static binary; simple concurrency | TUI ecosystem weaker; plugins harder | Alternative |
| D. Hybrid: TS core + Rust native addons (ripgrep, tree-sitter, PTY) | Near-Rust speed where it matters | Build complexity | Incremental path |

**Recommendation:** Start with **A**, keep performance-critical pieces behind native interfaces (ripgrep/tree-sitter/PTY), and keep core logic UI-independent so a Rust core swap is possible later. Target **Linux ARM64 / Termux** from day 1 (source: 3code, Reasonix, NullClaw packaging lessons).

**Runtime requirements:** Node/Bun 20+, SQLite (bundled), optional Docker, optional bubblewrap.

---

## 6. Provider layer (default = OpenCode; user to adjust later)

Built-in providers (all OpenAI-compatible unless noted):

| Provider | Type | Auth | Notes |
|---|---|---|---|
| opencode | openai | **keyless** | default; free models; endpoint may rate-limit (429 FreeUsageLimitError) |
| openai / anthropic (native) / gemini (native) | adapter | env key | |
| openrouter, groq, deepseek, mistral, xai, cerebras, cohere, togetherai, fireworks, perplexity, moonshotai(+cn), huggingface, github (GitHub Models), nvidia, deepinfra, sambanova, novita, friendli, nebius, poe, ollama_cloud, zai, zhipuai, minimax (anthropic-compatible), stepfun(+cn), siliconflow, volcengine, 302ai, venice, vercel | openai | env key | |
| alibaba (DashScope) | openai | env key | qwen |
| ollama, ollama_cn, lmstudio, vllm, llama_cpp, koboldcpp, textgen, gpt4all, openwebui | local | dummy key | OpenAI-compatible |

Model aliases ship as `provider/model` (e.g. `opencode/inkling-2-small-free`, `anthropic/claude-sonnet-5-5`) with real context/output limits and $/Mtok pricing from models.dev. 258 aliases in `src/config/default-models.ts` (generated). Users override via `models` in global/project config. Router tries primary → all credentialed providers on retryable errors (429/5xx/network); non-retryable 4xx fails fast.

### 6.1 Adapter interface

```ts
interface ProviderAdapter {
  id: string;
  capabilities: {
    tools: boolean;
    streaming: boolean;
    vision: boolean;
    audio: boolean;
    video: boolean;
    pdf: boolean;
    reasoning: boolean;
    promptCache: boolean;
    embeddings: boolean;
  };
  chat(req: ChatRequest): AsyncIterable<ChatEvent>;
  countTokens?(req: ChatRequest): Promise<number>;
}

type WireProtocol =
  | "openai-chat"        // /v1/chat/completions
  | "openai-responses"   // /v1/responses
  | "anthropic-messages"
  | "gemini"
  | "local";             // ollama / llama.cpp / lm studio
```

### 6.2 Router policies

- **failover** — primary → secondary on 429/5xx/timeout
- **cost** — cheapest model meeting capability floor
- **latency** — fastest recent P50
- **quota** — route to account with remaining 5h/7d quota
- **capability** — vision/audio/long-context routing
- **task** — planner model vs executor model split (Reasonix pattern)
- **budget** — hard token/cost cap per session (`/autonomous` pattern from Prime Agent)

### 6.3 Security

- API keys never enter model context
- Credential broker with OAuth2/PKCE + encrypted vault (authsome pattern)
- Key redaction in logs and tool output (ThinkWatch pattern)
- Per-provider data-use flags (training allowed or not)

### 6.4 Config sketch (`xminal.toml`)

```toml
[provider]
default = "provider-a/fast-model"
planner = "provider-b/reasoning-model"
executor = "provider-a/fast-model"
fallback = ["provider-c/backup-model"]

[router]
policy = ["quota", "cost", "capability", "latency"]

[limits]
max_tokens_per_turn = 32000
max_cost_per_session = 2.00
```

Default `defaultModel = "opencode/inkling-2-small-free"`; `fallbackModels = []`; resolution order = primary → fallbacks → credentialed providers.

---

## 7. Agent runtime

### 7.1 Modes

| Mode | Access | Use |
|---|---|---|
| **Plan** | Read-only + analysis | Design, review, spec |
| **Build** | Full tools | Implementation |
| **Compose** | Multi-step workflow + hooks | Feature delivery |
| **Review** | Read-only + diff tools | Code review, verification |
| **Yolo** | Full access, no prompts | Sandbox/CI only |

Sources: OpenCode, Codewhale (Plan/Work/Operate), MiMo (Plan/Build/Compose), Smelt (Normal/Plan/Apply/Yolo).

### 7.2 Permission engine

- **Ask** — har destructive action pe prompt
- **Auto-Review** — risk score + rule engine; low-risk auto, high-risk prompt
- **Full Access** — no prompts (never default)
- Path/command allowlists; protected paths (`~/.ssh`, `.env`, secrets)
- Per-tool, per-session, per-project overrides
- Approval inbox for parallel agents (Calyx pattern)

### 7.3 Session model

- Append-only JSONL events
- Branching + resume + attach (Tau, rpi, Prime Agent)
- Per-turn snapshots for rewind (Reasonix, Codewhale `/undo`)
- Content-addressed blobs for file state
- CRDT-free merge for parallel worktrees (diff-based)
- Session browser + fuzzy search (showagent)
- Cross-agent transcript import (OpenWork, showagent)

### 7.4 Context engine

- Token budget per model
- Priority: system > current task > recent turns > retrieved memory > old history
- Pruning with cache-aware boundaries (Reasonix)
- Summaries: TurnMemory-style (Keen Code)
- File skeletons via tree-sitter (Maki)
- Output compression for shell/build/test (rtk)
- Content-hash-anchored edits (Hashline/OH-MY-PI)
- Retrieval: FTS5 + optional embeddings (Hermes, ContextStream)

---

## 8. Tools catalog

### 8.1 Built-in tools

| Tool | Description | Source |
|---|---|---|
| `read` | File read with range + image/PDF | Pi, codehamr |
| `write` | Create/overwrite with diff preview | codehamr |
| `edit` | Hash-anchored patch/line edit | OH-MY-PI, Pi |
| `multi_edit` | Multiple edits atomically | Plandex |
| `bash` | Shell exec with safety checks + timeout | OpenCode, VT Code |
| `bash_builtin` | In-process rg/find/sed/jq/head/tail | OH-MY-PI |
| `search` | ripgrep + glob + fuzzy | OpenCode, Maki |
| `code_index` | Tree-sitter symbols/skeletons | Maki, Moltis |
| `lsp` | 14 LSP ops (diagnostics, hover, refs, rename) | OH-MY-PI, OpenCode |
| `dap` | 28 debug ops (breakpoints, step, eval) | OH-MY-PI, Grinta |
| `browser` | Real logged-in browser via extension/MCP | Browse, BrowserSkill |
| `web_search` | Search + fetch + cite | Agent Code, gptme |
| `todo` | Task list with dependencies | Task Master, ralph-tui |
| `subagent` | Spawn isolated agent | OpenCode, Deep Agents |
| `worktree` | Create/merge isolated worktree | Orca, Rove |
| `memory` | Read/write long-term memory | Hermes, pi-mem |
| `beads` | Issue graph claim/update | Beads |
| `git` | status/diff/log/commit/branch | GitClaw, AgentPlane |
| `verify` | Run tests/lint/typecheck gates | Grinta, SWE-agent |

### 8.2 Tool safety

- Command allow/deny lists
- Destructive command detection (`rm -rf`, `git reset --hard`, force push)
- Network egress policy
- Sandbox required for Yolo/autonomous modes
- Output size caps + truncation with full log reference (rtk)

---

## 9. Memory & knowledge

| Layer | Storage | Purpose | Source |
|---|---|---|---|
| Session | JSONL + SQLite index | Resume/branch/search | Tau, rpi |
| Working memory | In-context | Current task | — |
| Long-term memory | Markdown files + FTS5 | Preferences, lessons, decisions | pi-mem, Hermes |
| Codebase wiki | Markdown generated | Architecture docs | OpenWiki |
| Code index | SQLite + tree-sitter | Symbol search, skeletons | Maki, Moltis |
| Issue graph | SQLite (optional Dolt) | Long-horizon task tracking | Beads |
| Cross-session | MCP server | Shared decisions/lessons | ContextStream |
| Provenance | Git notes/refs | Who wrote which line | AgentDiff |

Memory lifecycle:

- **Write**: after task completion, reflection pass extracts lessons (pi-reflect)
- **Update**: `/refine` evidence-backed updates (Prime Agent)
- **Forget**: TTL + relevance decay + manual prune
- **Export/import**: Markdown + JSON for portability

---

## 10. Orchestration

### 10.1 Levels

| Level | Mechanism | Source |
|---|---|---|
| L0 | Single agent | codehamr, Pi |
| L1 | Subagents (planner/coder/explorer/reviewer) | OpenCode, Kimi, Deep Agents |
| L2 | Parallel worktrees | Orca, wmux, Rove, amux |
| L3 | Ralph loops (fresh context, verify, retry) | ralph family, LoopTroop |
| L4 | LLM Council (multi-model planning) | LoopTroop |
| L5 | Swarm with conflict detection | jcode, Ruflo, DeerFlow |

### 10.2 Ralph loop contract

```
spec → plan → implement → verify → (pass? done : fresh context retry)
```

- Hard iteration cap
- Time cap
- Budget cap
- Independent verifier (different model optional)
- Artifacts: plan.md, task list, test report, diff

### 10.3 Worktree orchestrator

- One task = one worktree + branch
- Auto-merge only with confirmation or clean fast-forward
- Hunk-level diff adoption (wmux)
- Conflict detection: alert peers when a file changes (jcode, Concord)
- SSH-resilient session (Rove)
- Kanban view (Nimbalyst, amux)

### 10.4 External agent integration

Run existing agents as workers, not competitors:

- Claude Code, Codex, Gemini CLI, OpenCode, Pi, Aider via PTY/ACP
- ACP is the preferred structured channel
- MCP is the preferred tool/data channel
- Per-session MCP toggles (agent-deck)

---

## 11. Security, sandbox, audit

| Control | Implementation | Source |
|---|---|---|
| Sandbox | bubblewrap (Linux), seatbelt (macOS), Docker/Podman, micro-VM optional | Codewhale, Pi, AgentBox |
| Secrets | Encrypted vault; inject at request time; no raw keys in prompts | authsome, ThinkWatch |
| Egress | Domain allowlist/denylist; block metadata endpoints | DvalinCode |
| Filesystem | Project-scoped; block `~/.ssh`, `.aws`, `.env`, keychains | Codewhale |
| Audit | Hash-chained JSONL of every action | DvalinCode, GitClaw |
| Provenance | Git notes per line/commit with agent + prompt hash | AgentDiff |
| Observability | eBPF trace (optional), token/cost/tool metrics | AgentSight, Trae |
| Approvals | Risk-scored; inbox for parallel agents | Calyx, Codewhale |
| Prompt injection | Tool output sanitization; untrusted-content taint tracking | — |

**Default posture:** sandbox ON for autonomous modes; Ask permissions for manual mode; Full Access only with explicit flag + warning.

---

## 12. TUI / UX

### Layout

```
┌─ xminal ────────────────────────────────────────────── model · mode · $cost ─┐
│ Session: feature-auth-oauth            Branch: main · WT: task-42       │
├───────────────────────────────────────────────┬──────────────────────────┤
│ Chat / agent transcript                       │ Context / files          │
│                                               │ ▸ src/auth.ts            │
│  ❯ add OAuth PKCE flow                        │ ▸ tests/auth.spec.ts     │
│  ● plan ...                                   │                          │
│  ● read src/auth.ts                           │ Tasks                    │
│  ● edit src/auth.ts (+42 −7)                  │ ☐ schema                 │
│  ● test → pass                                │ ☐ provider               │
│                                               │ ☑ callback               │
├───────────────────────────────────────────────┴──────────────────────────┤
│ Diff preview / approval prompt / command palette                          │
├───────────────────────────────────────────────────────────────────────────┤
│ ↑↓ scroll · Tab pane · Ctrl+K commands · Ctrl+P plan · Ctrl+D diff       │
└───────────────────────────────────────────────────────────────────────────┘
```

### UX features

- Command palette + slash commands (`/plan`, `/build`, `/undo`, `/rewind`, `/diff`, `/receipts`, `/mcp`, `/skills`, `/beads`, `/mode`, `/model`, `/cost`)
- Inline diff review with accept/reject per hunk (Calyx, Plandex)
- Streaming tool traces with collapsible detail (Keen Code style summaries)
- Image/LaTeX inline rendering (jcode)
- Session browser + fuzzy search (showagent)
- Kanban dashboard (Nimbalyst, CliDeck)
- Onboarding wizard (OpenClaw)
- `xminal doctor` diagnostics (Claw Code, Grinta)
- Vim keys optional (Smelt)
- Themes + accessibility

---

## 13. Interop & bridges

| Protocol/Channel | Direction | Source |
|---|---|---|
| MCP client | xminal → external tools | OpenCode, openHarness |
| MCP server | external agents → xminal memory/tools | ContextStream, Beads |
| ACP client | xminal → external agents | Martty, OpenHands |
| ACP server | editors → xminal | Hermes, Codewhale, Kimi |
| LSP | xminal → language servers | OpenCode, OH-MY-PI |
| DAP | xminal → debuggers | OH-MY-PI, Grinta |
| HTTP/WS | xminal server API | OpenHands SDK, AgenC |
| Telegram | remote control + approvals | Untether, 5dive |
| Slack/Discord/WhatsApp | notifications + triggers | OpenClaw, NullClaw |
| GitHub Actions | CI agent workflows | gh-aw |
| Webhooks | Slack/Linear/GitHub triggers | Open SWE, OpenHands |

---

## 14. Config, state, storage

```
~/.xminal/                      # global
├── config.toml             # providers, router, limits, UI
├── profiles/               # named provider/account profiles
├── skills/                 # user skills
├── plugins/                # user plugins
├── memory/                 # global markdown memory
├── cache/                  # models, indexes, downloads
└── logs/                   # audit, receipts, cost

<project>/.xminal/              # project-local
├── config.toml             # overrides
├── AGENTS.md               # project rules (synced)
├── sessions/               # JSONL + index
├── memory/                 # project memory
├── wiki/                   # generated codebase docs
├── beads.db                # issue graph
├── snapshots/              # content-addressed file states
└── receipts/               # audit trails
```

- Config precedence: CLI flags > env > project > global > defaults
- `xminal init` scaffolds `.xminal/` and `AGENTS.md`
- Import from Claude Code/OpenCode/Codex sessions

---

## 15. Roadmap (milestones + acceptance criteria)

### v0.1 — Walking skeleton (2–3 weeks)
- [x] Scaffold + build (tsc) + npm pack
- [x] REPL shell + slash commands (TUI-lite; Ink TUI deferred)
- [x] 3 native-capable adapters + OpenAI-compatible adapter (47 providers)
- [x] Tools: read/write/edit/bash/glob/grep/list/todo/memory/skills/checkpoint/git/worktree/verify/web/diagnostics/mcp/subagent
- [x] Session JSONL + resume + branch + checkpoints
- [x] Permission engine (Ask/Auto/Full) + protected paths + hash-chained audit
- **AC:** `xminal` starts, reads a repo, makes a file edit, tests pass, session resumes.

### v0.2 — Daily driver (3–4 weeks)
- [x] Provider router + failover + cost tracking
- [x] Plan/Build/Compose/Review/YOLO modes
- [x] MCP client (stdio; server side deferred)
- [ ] LSP diagnostics (diagnostics tool added; language servers not wired)
- [ ] Diff preview + approval
- [ ] `xminal doctor`, onboarding wizard
- [ ] Global/project config + profiles
- **AC:** works on a real repo; plan mode never writes; MCP server connects.

### v0.3 — Memory + safety (3–4 weeks)
- [ ] FTS5 session search
- [ ] Markdown memory + write/update/forget
- [ ] Codebase index (tree-sitter) + wiki
- [ ] Sandbox backends + protected paths
- [ ] Secrets broker + redaction
- [ ] Checkpoints/rewind/undo + receipts
- **AC:** rewind restores exact state; secrets never appear in transcripts; sandbox blocks egress.

### v0.4 — Orchestration (4–5 weeks)
- [ ] Subagents (explore/plan/code/review)
- [ ] Worktree orchestrator + Kanban
- [ ] Ralph loop engine + verification gates
- [ ] Task graph (PRD → tasks → beads)
- [ ] Parallel fan-out (1 prompt → N tasks)
- **AC:** 3 tasks run in parallel worktrees; conflicting file alerts; loop stops at cap.

### v0.5 — Skills + plugins (3–4 weeks)
- [ ] SKILL.md loader + registry
- [ ] Hooks (pre/post tool, session start/end)
- [ ] Lua plugin host (Smelt pattern)
- [ ] Bundled packs: spec, TDD, review, security, compliance
- [ ] Skill benchmark harness
- **AC:** third-party skill installs and runs; hooks enforce policy.

### v0.6 — Interop + remote (3–4 weeks)
- [ ] ACP client/server
- [ ] Browser tool (real logged-in browser)
- [ ] Telegram bridge + approvals
- [ ] HTTP/WS server + SDK
- [ ] Session browser + import from other agents
- **AC:** xminal controlled from Telegram; external Claude Code runs as worker; editor connects via ACP.

### v0.7 — Hardening + evals (3–4 weeks)
- [ ] SWE-bench harness
- [ ] Tool-safety test suite
- [ ] Provider contract tests
- [ ] Performance: startup <150ms, RAM <150MB idle
- [ ] Audit/provenance reports
- **AC:** benchmark score recorded; all safety tests pass.

### v1.0 — Release
- [ ] Packaging: npm, standalone binaries (linux-x64/arm64, macOS, Windows), Termux script
- [ ] Docs + migration guides
- [ ] Stable plugin/skill API
- **AC:** install on Android/Termux and desktop; upgrade path works.

### v1.x — Beyond
- Swarms, council planning, self-improvement, cloud sandboxes, mobile app, compliance packs, marketplace.

---

## 16. Testing & evaluation

| Type | Scope | Tool |
|---|---|---|
| Unit | core loop, permissions, router | Vitest/Bun test |
| Integration | provider adapters against mocks + live smoke | contract tests |
| Golden sessions | replay JSONL, assert diffs | custom harness |
| Tool safety | destructive commands, path escapes, egress | adversarial suite |
| TUI | snapshot rendering | custom |
| Eval | SWE-bench Verified / Lite | mini-swe-agent harness |
| Skill eval | SKILL.md pass rate across models | skill-optimizer pattern |
| Performance | startup, RAM, tokens/turn | benchmarks in CI |

**CI gates:** lint, typecheck, unit, integration-mock, safety. Live-model tests nightly with budget cap.

---

## 17. Packaging & distribution

- npm: `npm i -g xminal`
- Standalone: Bun compile or pkg → `xminal-linux-x64`, `xminal-linux-arm64`, `xminal-darwin-*`, `xminal-win-*`
- Termux: `scripts/install-termux.sh` (Node/Bun + binary)
- Docker image: `ghcr.io/<org>/xminal`
- Update channel: signed manifests + checksums
- Config migration: versioned schema

---

## 18. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Scope explosion (125 features) | Never ships | Tiers + plugin architecture; v1 core only |
| Source list inaccuracies (stars/links/licenses) | Legal/technical | Verify every repo before borrowing; keep attribution file |
| Provider API drift | Breakage | Adapter contract tests; nightly smoke |
| Context limits | Bad quality | Pruning + retrieval + compression + planner/executor split |
| Sandbox escape | Security | Default sandbox; no network in Yolo; audit |
| Prompt injection via tool output | Data exfiltration | Taint tracking, output sanitization, egress policy |
| Windows/Termux portability | Adoption | CI matrix; pure-JS fallbacks; ARM64 builds |
| Performance | UX | Native addons (rg/tree-sitter/PTY); lazy loading |
| Upstream license changes | Legal | Pin versions; vendor critical MIT code |
| Ad model / branding confusion | Product | Decide business model separately; MIT core |

---

## 19. Open decisions (need user input)

1. **Providers** — DONE (default opencode; 47 providers + 258 model aliases baked in). User said they'll finalize/update later; Bedrock/Vertex/Azure need native adapters — not built yet.
2. **Stack** — confirm TypeScript/Bun vs Rust/Go.
3. **Platform priority** — Termux/Android first, desktop first, or both?
4. **Base strategy** — greenfield vs fork OpenCode vs fork Pi. Recommendation: greenfield core, borrow Pi TUI/provider design, integrate others.
5. **Name/brand** — `xminal` internal, final name?
6. **Business model** — MIT + ads (Freebuff style), open-core, or pure OSS?
7. **Team/time budget** — solo/team, hours per week; roadmap will rescale.
8. **Must-have integrations** — Claude Code, Codex, Gemini CLI, OpenCode, Aider?

---

## 20. Immediate next steps

1. User adjusts provider list later (Bedrock/Vertex/Azure native adapters are the likely gaps).
2. Live smoke against real credentials once user adds a key (opencode free tier currently returns 429 FreeUsageLimitError; local ollama/lmstudio not running).
3. README + release packaging (npm publish needs user's explicit approval).
4. v0.2: LSP diagnostics, Ink TUI, MCP server, Telegram live test.

---

## Appendix A — Feature coverage

- **125/125 projects** mapped in `FEATURE_MATRIX.md`
- 4 ecosystem layers covered
- 11 flagship deep-dives incorporated (Hermes, OpenCode, Claw Code, Pi, Orca, OpenHands, Codewhale, OH-MY-PI, Reasonix, Prime Agent, jcode)

## Appendix B — Attribution

All borrowed code/skills must retain original MIT copyright notices. Maintain `THIRD_PARTY_NOTICES.md` with repo URL, commit, license, and files used.
