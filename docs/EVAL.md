# The XMINAL eval suite

One task per feature, each run against the **real agent** in a throwaway project
and checked against an **observable outcome** — a file that must exist, a test
that must pass, a tool that must show up in the transcript. Nothing is taken on
the agent's word.

```sh
npm run build
node scripts/run-eval.cjs                       # the whole suite
node scripts/run-eval.cjs --only write,todo     # a subset
node scripts/run-eval.cjs --model groq/openai/gpt-oss-120b
node scripts/run-eval.cjs --keep                # keep the scratch projects
```

The runner writes `eval-report.json` (per-task result, duration, turns, tokens,
cost) and exits non-zero if any task fails.

---

## The tasks

| # | Task | Cluster | What it proves |
|---|---|---|---|
| 1 | `write` | files | a file is created with the exact content asked for |
| 2 | `edit` | files | one line changes, the neighbours survive |
| 3 | `multi-edit` | files | three separate edits land in one turn |
| 4 | `read` | files | the agent reads a file and answers from it |
| 5 | `grep` | search | a symbol is located by search, with the file and line |
| 6 | `glob` | search | files are listed by pattern |
| 7 | `bash` | shell | a command runs and its output lands on disk |
| 8 | `bash-failure` | shell | a failing command is reported, exit code included |
| 9 | `todo` | tasks | work is tracked on the todo list (`.xminal/todos.json`) |
| 10 | `memory` | tasks | a fact is remembered for the project (`.xminal/memory/entries.jsonl`) |
| 11 | `git-commit` | git | a change is committed in a git project |
| 12 | `worktree` | git | a worktree/branch is created |
| 13 | `verify-fix` | verify | a failing test is diagnosed, fixed and re-run green |
| 14 | `checkpoint` | verify | a change is checkpointed and rolled back |
| 15 | `mcp` | mcp | a file is read **through an MCP server**, not the built-in read tool |
| 16 | `subagent` | agents | work is delegated to a subagent |
| 17 | `plan-mode` | modes | plan mode plans and writes nothing |
| 18 | `capabilities` | discovery | the agent discovers what it can do |
| 19 | `project` | everything | a real project is built: code, tests, docs — and the tests pass |

The last one is the kitchen sink. The agent is asked to build a small CommonJS
project — `src/slugify.js`, `test/run.js`, `README.md` — and to run the test
until it passes. It needs the write tool, the bash tool, the edit tool (if the
first attempt is wrong), the run-state workflow, and enough turns to iterate.


## The last run

`groq/openai/gpt-oss-120b` (a free model) — **19/19 passed**, 281 s, 557,916 tokens, **$0.0151** for the whole suite. The report of that run is checked in as [`eval-report.json`](eval-report.json).

```
files 4/4 · search 2/2 · shell 2/2 · tasks 2/2 · git 2/2 · verify 2/2
mcp 1/1 · agents 1/1 · modes 1/1 · discovery 1/1 · everything 1/1
```

Two runs of the suite have passed 19/19 (the second one is the report above) — the results are not a lucky roll of the dice.

---

## How the checks work

Every task gets its own temporary project. The runner seeds it (a broken test,
a git repo, an MCP server config), runs

```sh
xminal run "<prompt>" --json --new --permission full --max-turns 14 --model <model>
```

and then inspects the result:

- **files** — does the file exist, does it hold what was asked for, are the
  neighbouring lines intact?
- **commands** — is the test green when run again *outside* the agent?
- **state** — does `.xminal/todos.json` hold the todos, does the project memory
  hold the fact?
- **transcript** — did the agent actually use the tool the task is about
  (`grep`, `mcp_call`, a subagent), or did it fake it with something else?

The transcript is read from the session's own `events.jsonl`, so the check sees
what really happened, not what the final answer claims.

---

## Honesty notes

- The suite needs a working model. The default is `groq/openai/gpt-oss-120b`
  (a free model); any provider alias works.
- `mcp` starts XMINAL's own MCP server (`xminal mcp --serve`) as the server
  under test — no external service, no network.
- The suite never runs on a repository you care about: every task lives in
  `mktemp -d` and is deleted afterwards.
- A failing task is a **result**, not a bug in the harness: the runner reports
  the exact reason (`↳` under the task) so a failure is actionable.
