# The coding workflow

XMINAL's agent does not "type code at a prompt". It runs a workflow, and the
workflow is visible: the phase it is in, the brief it is working from, and
the verification it actually ran.

```
understand → inspect → plan → implement → verify → review → summarize
```

Each phase has one rule. The rule for the current phase is injected into the
prompt, so the model always knows what is expected next.

| Phase | Rule |
|---|---|
| understand | restate the goal, the constraints and what "done" means |
| inspect | read the relevant files, the project instructions and the tests |
| plan | write a short plan (or a todo list) before editing |
| implement | focused, reviewable edits that follow the project's conventions |
| verify | run the project's verification command and fix what you broke |
| review | re-read your own diff: correctness, regressions, tests, edge cases, security |
| summarize | report what changed, how it was verified, what is left |

The phase is derived from the work that actually happened during the turn —
reading a file marks *inspect* done, writing one marks *implement* done. There
is no separate bookkeeping for the model to keep.

## The task brief

Before the first tool call, the request is turned into a short brief:

```
Goal: the reported behaviour is fixed
Kind: fix
Done when: the reported behaviour is fixed; the failure no longer reproduces; no unrelated behaviour changed
Edge cases: the same input that triggered the bug; the surrounding behaviour stays intact
Verify: run `npm test` and report the real result; re-run the reproduction before reporting the fix
```

The brief is deterministic (no model call, no network) and it is re-injected on
every turn of the task, so the acceptance criteria survive into the
implementation and the verification.

### When to ask, when not to

A request is **ambiguous** when it names an action but no target
("make it better", "fix it"). In that case the brief carries a single
clarifying question, and the agent asks exactly one before touching anything.

A request with a concrete target is never delayed by a question — vague
wording ("improve", "clean up") only lowers the ambiguity to *low*, which
means: state your assumption and proceed.

## The project brief

Before editing, XMINAL collects what it needs to know about the repository —
once, offline, bounded:

```
Project: xminal · TypeScript
Instructions: read AGENTS.md before editing
Layout: src (TypeScript×3)
Commands: npm test · npm run build
Verify after a change: npm run verify
```

The verify command is detected from the project's own build files:

| Project | Detected |
|---|---|
| `package.json` | `npm test`, `npm run build`, `npm run verify` (or `npm run typecheck`) |
| `Cargo.toml` | `cargo test` |
| `go.mod` | `go test ./...` |
| `pyproject.toml` / `pytest.ini` | `python -m pytest -q` |
| `pom.xml` | `mvn -q test` |
| `build.gradle` | `./gradlew test` |
| `Makefile` | `make test` |

A configured `verifyCommand` always wins over the detected one.

## The repository map

The model should know *what exists* without the whole repository being loaded
into the context. XMINAL builds a compact map of the project:

```
central files (most imported):
  src/tools/types.ts (32 import(s)) — ToolResult, SubagentOptions, ToolContext, Tool
  src/util/fs.ts (26 import(s)) — expandHome, ensureDir, readJson, writeJson
  src/config/types.ts (17 import(s)) — PermissionMode, ProviderConfig, ModelConfig
```

How it works:

1. every text file is scanned once (bounded: 400 files, the head of each file);
2. the **signatures** are extracted — exported functions, classes, interfaces, types;
3. the **import graph** is built, so the files most of the project depends on
   come first;
4. the files that match the **current request** are ranked to the top;
5. the result is rendered into a character budget and injected into the prompt.

The agent is told to read a file before editing it — the map is a map, not a
substitute for the code.

```bash
xminal map "verify runner"     # the map, ranked for a query
```

In the TUI: `/map` (or `/map <query>`).

## Reviewing a change

`/review` does not guess — it computes the facts first (`src/core/review.ts`):

| Fact | Severity |
|---|---|
| a protected path (`.env`, `~/.ssh`) was modified | critical |
| a dependency manifest changed | major |
| a lockfile changed | major |
| a file was deleted | major |
| many lines removed and nothing added | major |
| source changed but no test changed | minor |
| a very large diff | minor |

```
Diff: 4 file(s), +5/-3
- [critical] .env:2 — a protected path was modified …
- [major] package.json — a dependency manifest changed …
```

In review mode these facts and the diff itself are injected into the prompt, so
the model argues about the change instead of guessing what changed. Findings
it reports carry a severity and a `file:line`; a suspicion is never presented
as a confirmed bug.

In the TUI: `/diff` shows the diff and the flags.

## Verification is not optional

After a turn that changed files, XMINAL runs the project's verify command and
feeds the **real** output back to the model:

```
[verify] npm test → passed (1.8s)
[verify] npm test → failed (exit 1, 0.9s)
… the real failure output …
```

If it fails, the agent gets another turn to fix what it broke (bounded by
`autoVerifyRepairs`), and the failure output is fed back verbatim — a failure
that is unrelated to the change is reported as such, never hidden.

The turn summary shows the result honestly:

```
Build · inkling-2-small-free · 5.4s · 1901.2 tok/s · verify ✓
```

### Running it by hand

```bash
xminal verify        # headless: run the project's verify command, exit with its code
```

In the TUI: `/verify` runs it on the spot and shows the real output.

### Settings

| Setting | Default | Meaning |
|---|---|---|
| `verifyCommand` | detected | the command that verifies the project |
| `autoVerify` | `true` | run it after a change |
| `autoVerifyRepairs` | `1` | how many fix-and-retry rounds are allowed |
| `verifyTimeoutMs` | `120000` | kill the command after this long |

```json
{ "verifyCommand": "npm run verify", "autoVerify": true, "autoVerifyRepairs": 2 }
```

## Review mode

`/review` starts with the diff, not the repository:

- `git diff` first, then only the files it touches;
- findings carry a severity (critical / major / minor) and a `file:line`;
- a suspicion is never reported as a confirmed bug;
- "nothing found" is a valid result.

## Free-tier reality

opencode's free models have a **daily** allowance, tracked server-side. Every
turn re-sends the whole context, so a 64k-token conversation burns the
allowance quickly (64k × ~15 turns ≈ 1M tokens).

What XMINAL does about it:

- when a model runs out of quota, the router **switches to the provider's next
  free model** automatically and says so in the transcript;
- `/compact` shrinks the context, which lowers the tokens sent per turn;
- the model picker labels the context window as `ctx 1.0M` — that number is
  the window size, not the daily allowance.
