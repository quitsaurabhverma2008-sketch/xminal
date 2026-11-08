# XMINAL — Feature Matrix
## Har project ka unique feature + xminal me integration decision

**Legend**
- **Decision**: `Native` = xminal ke andar build, `Borrow` = MIT code/algorithm reuse, `Integrate` = MCP/ACP/PTY/CLI/HTTP se connect, `Reference` = design inspiration only
- **Priority**: `P0` = MVP (v0.1–0.3), `P1` = v0.4–0.6, `P2` = v1+
- Source: `mit_terminal_coding_agents_100plus.txt` / `.md` (125 projects, 4 layers, 11 deep-dives)
- Note: stars/links in the source list need verification before borrowing code.

---

## A. Standalone Terminal Coding Agents & Harnesses

| # | Project | Unique feature to extract | xminal Decision | Priority |
|---|---------|---------------------------|-------------|----------|
| 1 | OpenClaw | Onboarding wizard + multi-channel bridges (Discord/Slack/WhatsApp/iMessage/Teams) | Native (wizard) + Integrate (channels) | P1 |
| 2 | Hermes Agent | Persistent FTS5/trigram memory, auto skill synthesis, ACP, 300+ models | Native (memory/skills) + Integrate (ACP) | P0 |
| 3 | Superpowers | Spec → TDD → subagent dispatch → review methodology | Borrow (skill pack) | P0 |
| 4 | Everything Claude Code | 28 specialist roles, 125 guides, 60 workflows, security rules | Borrow (skill packs) | P2 |
| 5 | OpenCode | build/plan modes, @general subagent, 75+ providers, LSP, MCP pooling | Reference / fork candidate | P0 |
| 6 | Claw Code | `claw doctor`, container-first, offline skill installs | Native (doctor, offline skills) | P0 |
| 7 | Pi | pi-tui differential rendering, pi-ai unified API, JSON/RPC/print, sandbox | Borrow (TUI + provider API) | P0 |
| 8 | Orca | 30+ agents in worktrees, coordinator→worker, inline diff, mobile | Native (worktree orchestrator) | P1 |
| 9 | OpenHands | REST/WS Agent Server, Docker sandboxes, scheduled/webhook automations | Native (server) + Integrate (Docker) | P1 |
| 10 | DeerFlow 2.0 | Long-horizon harness, Textual TUI, sub-agent orchestration, per-thread sandbox | Native (long-horizon mode) | P1 |
| 11 | Ruflo | Recursive multi-agent swarms, policy-ledger pipelines | Native (swarm) | P2 |
| 12 | nanobot | ~4k-line lightweight agent, scheduled tasks, multi-channel | Reference (light mode) | P2 |
| 13 | Codewhale | Plan/Work/Operate, Ask/Auto-Review/Full, `/undo`, `/receipts`, ACP | Native (modes, receipts, undo) | P0 |
| 14 | OH-MY-PI | In-process Bash + 58 utils, Hashline edits, 14 LSP, 28 DAP, advisor review | Native (tools, hashline) | P0 |
| 15 | DeepSeek-Reasonix | Static binary, planner/executor split, per-turn rewind, Extension Protocol | Native (rewind, split sessions) | P0 |
| 16 | Deep Agents Code | ACP server, subagent spawning, human-in-the-loop approvals | Native (HITL) | P1 |
| 17 | Beads | Dolt graph issue tracker + persistent agent memory (`bd`, `beads-mcp`) | Integrate first, Native later | P1 |
| 18 | Kilo Code CLI | Orchestrator mode, 500+ models, workspace checkpointing | Native (checkpoints) | P1 |
| 19 | Happy | E2E-encrypted mobile companion, parallel session runner | Integrate (mobile bridge) | P1 |
| 20 | OpenWork | Skills/commands/plugins, imports Claude Code session history | Native (session import) | P1 |
| 21 | Prime Agent | RLM + persistent IPython tool, `/refine`, daemon sessions, heartbeat, budgets | Native (REPL tool, budgets) | P2 |
| 22 | jcode | 19.1ms startup, 3.3MB sessions, swarm conflict alerts, inline images/LaTeX | Native (perf targets, media) | P1 |
| 23 | SWE-agent | Agent-Computer Interface, SWE-bench harness, Docker isolation | Borrow (eval harness) | P1 |
| 24 | Devika | Prompt → step-by-step plan → research → build/debug | Reference | P2 |
| 25 | OpenCodex | Universal provider proxy, API translation, 40+ providers, failover | Native (provider router) | P0 |
| 26 | OpenWiki | Auto codebase wiki, syncs AGENTS.md/CLAUDE.md | Native (wiki) | P1 |
| 27 | DeepCode | Papers/specs → verified full-stack implementations | Reference | P2 |
| 28 | Bolt.new | WebContainer full-stack scaffold/run/deploy | Integrate | P2 |
| 29 | Plandex | 2M-token context, diff staging sandbox, branching, plan review | Native (staging, branching) | P0 |
| 30 | MiMo Code | Plan/Build/Compose, memory, hooks, worktrees | Native (compose mode, hooks) | P1 |
| 31 | Smol Developer | Embeddable repo-generation agent | Borrow (SDK pattern) | P2 |
| 32 | Trae Agent | Lakeview step summaries, JSON trajectory recording | Native (trajectory log) | P1 |
| 33 | Camofox Browser | Stealth headless browser, fingerprint spoofing, REST API | Integrate | P2 |
| 34 | Open SWE | Slack/Linear/GitHub triggers → cloud sandbox → PR | Integrate (webhooks) | P2 |
| 35 | Claurst | Rust Claude Code rewrite, KAIROS persistent workflows | Reference | P2 |
| 36 | BrowserSkill | Drive logged-in Chrome/Edge via local daemon + extension | Integrate | P1 |
| 37 | Kimi Code CLI | Video clip input, `/mcp-config`, coder/explore/plan subagents, ACP | Native (media input, subagents) | P1 |
| 38 | NullClaw | 678KB Zig binary, ~1MB RAM, <2ms start, 18 channels | Reference (footprint targets) | P2 |
| 39 | gh-aw | Markdown workflows → sandboxed GitHub Actions | Integrate | P2 |
| 40 | gptme | Shell/IPython/file tools, local RAG, tmux control, web | Native (RAG, tmux) | P1 |
| 41 | Grok CLI | xAI Grok provider adapter | Integrate | P1 |
| 42 | Atomic Agent | Local llama.cpp control loop, browser driving, OpenAI-compatible serve | Native (serve mode) | P1 |
| 43 | agent-of-empires | tmux + worktree session manager, mobile web UI | Borrow (session manager) | P1 |
| 44 | ralph-orchestrator | Hat-based multi-phase Ralph loop | Native (loop engine) | P1 |
| 45 | Tau | Readable Python Pi port, branching JSONL sessions | Borrow (session model) | P0 |
| 46 | Moltis | Zero-unsafe, 2300+ tests, code index, voice I/O | Reference (voice, tests) | P2 |
| 47 | Nanocoder | Ollama/LM Studio/OpenRouter + XML tool fallback | Native (fallback parser) | P0 |
| 48 | ralph-tui | Task-list-driven autonomous execution/verification TUI | Native (task loop) | P1 |
| 49 | Agentless | 3-phase localization → repair → patch validation | Borrow (repair pipeline) | P2 |
| 50 | Nimbalyst | Visual + terminal worktrees, Kanban, visual diff | Native (Kanban/diff UI) | P1 |
| 51 | Ouroboros | Self-evolving identity/memory, self-rewrites behind review gate | Native (self-improve, gated) | P2 |
| 52 | Neovate Code | Plugin system, multi-provider, headless automation | Native (plugin API) | P1 |
| 53 | Awesome CLI Coding Agents | Curated directory + automated star updater | Reference (docs/updater) | — |
| 54 | oh-my-agent | Portable `.agents/`, stop-hook gates, independent judges | Native (judge/gates) | P1 |
| 55 | Maki | Tree-sitter skeleton index, in-process code execution, Lua plugins | Native (skeleton index, Lua) | P1 |
| 56 | agent-deck | Worktree-aware TUI, per-session MCP toggles | Native (MCP toggles) | P1 |
| 57 | Pydantic Deep Agents | Live Run Forking, parallel branches merged by AI judge | Native (fork/merge) | P2 |
| 58 | VT Code | Native OS sandbox, shell safety, multi-provider failover | Native (shell safety) | P0 |
| 59 | Concord MCP | Shared work state, file-claim overlap detection, live messaging | Integrate (MCP) | P1 |
| 60 | AgentSight | eBPF syscall-level observability for agents | Integrate | P2 |
| 61 | Groq Code CLI | Groq fast-inference provider | Integrate | P1 |
| 62 | GitClaw | Git-native agent identity, Ed25519-signed actions | Native (signed commits/actions) | P2 |
| 63 | AgentBox | Docker/VM/cloud sandbox runner + encrypted secrets | Integrate | P1 |
| 64 | amux (mixpeek) | Single-file tmux multiplexer, web dashboard, watchdog, REST | Borrow (dashboard/watchdog) | P1 |
| 65 | ThinkWatch Lite | API/MCP gateway, key redaction, cost logs, risky-tool blocking | Native (gateway/guard) | P0 |
| 66 | Claudexor | Multi-account quota tracking + rotation | Native (quota router) | P1 |
| 67 | wmux | One prompt → 8 parallel worktree tasks, hunk-level diff adoption | Native (fan-out) | P1 |
| 68 | AgentBridge | Claude + Codex live peers, mid-turn review, quota handoff | Native (peer sessions) | P2 |
| 69 | Calyx | Unified approval inbox, status sidebar, diff review | Native (approval inbox) | P1 |
| 70 | MulmoTerminal | PTY grid, tmux persistence, Web Push notifications | Native (web push) | P2 |
| 71 | flameox | Profiling workloads, artifact provenance, run comparison | Integrate | P2 |
| 72 | codex-profiles | Isolated account profiles, token-safe switching | Native (profiles) | P2 |
| 73 | rpi (pi-rust) | 9 composable crates, crash-resumable JSONL, plugin ABI | Borrow (crate boundaries) | P1 |
| 74 | Rove | Worktree+branch per task, SSH-resilient sessions, scriptable API | Native (SSH-resilient sessions) | P1 |
| 75 | LoopTroop | LLM Council → PRD → beads → Ralph loops | Native (council) | P1 |
| 76 | amux (andyrewlee) | tmux/worktree TUI, minisign-verified releases, confirm-gated merges | Borrow | P2 |
| 77 | CliDeck | WhatsApp-style dashboard, live status, autopilot routing | Native (dashboard) | P1 |
| 78 | aisw | Profile switching + repo-to-account shell guards | Native (guards) | P1 |
| 79 | GridBash | Terminal grid + MCP coordination server | Native (grid layout) | P2 |
| 80 | DvalinCode | Org policy engine, OS network egress, hash-chained audit | Native (policy/audit) | P1 |
| 81 | 3code | Token-efficient agent, Termux support | Native (Termux target) | P0 |
| 82 | great_cto | 34–70 specialist agents + compliance gates (PCI/HIPAA/SOC2/GDPR) | Borrow (compliance pack) | P2 |
| 83 | AgenC Core | Daemon session lifecycle, background agents, local models | Native (daemon) | P1 |
| 84 | authsome | Credential broker, OAuth2/PKCE injection, 45 providers | Native (credential broker) | P1 |
| 85 | openHarness | 78 slash commands, 42 tools, OAuth 2.1 MCP, hooks, SDKs | Native (command/tool catalog) | P1 |
| 86 | Crewly | Dev/QA/PM role orchestration without tmux | Native (roles) | P2 |
| 87 | intentic | Docker sandbox + worktree per agent + Cloudflare tunnel | Integrate | P2 |
| 88 | 5dive | Cron/heartbeat scheduling, Telegram control | Native (scheduler) | P1 |
| 89 | Keen Code | TurnMemory summaries, Markdown plan artifacts | Native (context compression) | P1 |
| 90 | AgentPlane | Git-native task→plan→approve→implement→verify workflow | Native (workflow state) | P1 |
| 91 | skill-optimizer | Benchmarks SKILL.md across models, rewrites till pass | Native (skill eval) | P2 |
| 92 | Martty | Native ACP client TUI, image preview, session history | Native (ACP client) | P1 |
| 93 | OpenCastle | Compiles one project definition to native configs for other harnesses | Native (config export) | P1 |
| 94 | pi-mem | Plain-Markdown persistent memory, zero deps | Native (memory files) | P0 |
| 95 | Crab Code | Anthropic/OpenAI/DeepSeek/Bedrock/Vertex adapters | Integrate (provider adapters) | P1 |
| 96 | Untether | Telegram voice/text bridge, permission buttons, cost tracking | Integrate | P1 |
| 97 | Smelt | Normal/Plan/Apply/Yolo, Lua scripting, Vim keys, parallel subagents | Native (Lua plugin + Vim mode) | P1 |
| 98 | showagent | Unified session browser, fuzzy search, transcript conversion | Native (session browser) | P2 |
| 99 | clausona | Quota-aware multi-account routing, shared skills/history | Borrow (routing algorithm) | P1 |
| 100 | pi-reflect | Session-transcript analysis → surgical AGENTS.md rule updates | Native (reflect engine) | P2 |
| 101 | opencode-rust | 21-crate Rust OpenCode reimplementation, HTTP server | Reference | P2 |
| 102 | AgentDiff | Per-line Git blame/provenance, signed attributions | Native (provenance) | P1 |
| 103 | ContextStream | Cross-session MCP memory (decisions/lessons/code index) | Native (memory MCP) | P1 |
| 104 | NEEDLE | Deterministic bead queue state machine, headless dispatch | Native (queue engine) | P1 |
| 105 | Grinta | Durable checkpoints, LSP/DAP, validation gates, `doctor` | Native (validation gates) | P0 |
| 106 | ralph-harness | PROMPT.md + specs + fresh-context iterations + hard caps | Native (loop caps) | P1 |
| 107 | memcode (Memorix) | Bundled memory platform + MCP memory server | Integrate | P2 |
| 108 | AshlrCode | 45+ tools, 18 skills, KAIROS autopilot, multi-provider failover | Borrow (KAIROS pattern) | P2 |
| 109 | mini-swe-agent | ~100-line agent, 65% SWE-bench, Docker/Bubblewrap/Modal | Borrow (eval baseline) | P1 |
| 110 | OpenHands SDK | Python SDK + REST/WS Agent Server + TS client | Native (SDK/server) | P1 |
| 111 | GitHub Spec Kit | Spec-Driven Development toolkit | Borrow (spec templates) | P1 |
| 112 | Claude Task Master | PRD → dependency-tracked tasks, 36-tool MCP | Native (task graph) | P1 |
| 113 | wshobson/agents | 94 plugins / 202 agents / 185 skills with format adapters | Borrow (catalog/adapters) | P1 |
| 114 | CrewAI | Role-playing multi-agent framework | Integrate | P2 |
| 115 | AutoGPT-Code-Ability | Coding ability package for autonomous agents | Reference | P2 |
| 116 | rtk | Compresses/filters noisy shell/build/test output before model | Native (output compression) | P1 |
| 117 | Browse (Anomaly) | Real logged-in browser MCP | Integrate | P1 |
| 118 | HumanLayer Skills | Control-loop skills for brownfield codebases | Borrow (skill pack) | P1 |
| 119 | n-skills | Curated plugin/skill marketplace | Borrow (marketplace format) | P1 |
| 120 | Agent Code (Avala) | Fullscreen TUI, ACP editor embedding, web search, opt-in telemetry | Native (telemetry opt-in) | P2 |
| 121 | codehamr | Minimal 4-tool agent (bash/read/write/edit) | Native (minimal mode) | P0 |
| 122 | Agent Terminal | AI-aware workspace isolation + structured output capture | Native (workspace isolation) | P1 |
| 123 | crabcode (Blankeos) | Pure-Rust OpenCode-style TUI | Reference | P2 |
| 124 | OpenHarness (HKUDS) | Ohmo personal+coding agent | Reference | P2 |
| 125 | Open-Harness (MaxGfeller) | Code-first composable TS agent SDK | Borrow (SDK design) | P2 |

---

## Coverage summary

- **Total projects covered:** 125/125
- **Native builds:** ~72
- **Borrow (MIT code/skills):** ~20
- **Integrate (MCP/ACP/CLI/HTTP):** ~22
- **Reference only:** ~11

## Top 20 features that Freebuff currently lacks (highest leverage)

1. Plan/Build/Compose + permission postures (OpenCode/Codewhale/MiMo)
2. Durable sessions: resume, branch, rewind, checkpoints (Reasonix/Tau/Grinta)
3. Provider router with translation + failover (OpenCodex/ThinkWatch)
4. Persistent memory + codebase index + wiki (Hermes/OpenWiki/Maki)
5. Subagents + parallel worktree orchestration (OpenCode/Orca)
6. Ralph/autonomous loops with verification (ralph family/LoopTroop)
7. Skills + hooks + plugin system (Superpowers/OpenWork/Smelt)
8. MCP client + server + ACP interop (OpenCode/OpenHands/Martty)
9. Sandbox + secrets broker + audit receipts (Codewhale/authsome/DvalinCode)
10. Diff staging + inline review + approval inbox (Plandex/Calyx)
11. Browser automation on real logged-in browser (Browse/BrowserSkill)
12. Token/context compression (rtk/Keen/Hashline/Maki)
13. LSP + DAP integration (OH-MY-PI/Grinta)
14. Multi-account quota routing (Claudexor/clausona)
15. Remote/mobile bridges (Happy/Untether/5dive/CliDeck)
16. Self-improvement/reflection (Hermes/pi-reflect/Ouroboros)
17. Eval harness (SWE-agent/mini-swe/skill-optimizer)
18. Session browser + transcript conversion (showagent)
19. Provenance/audit (AgentDiff/GitClaw/AgentSight)
20. Single-binary/Termux packaging (Reasonix/NullClaw/3code)
