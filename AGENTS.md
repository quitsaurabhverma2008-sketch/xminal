# AGENTS.md — instructions for coding agents working on XMINAL

## Commands

- Build: `npm run build` (tsc → `dist/`)
- Verify everything (build + 148 tests): `npm run verify`
- Run the CLI from source: `npm run build && node dist/index.js doctor`
- Tests: `npm test` (node:test, no network required; tests run against `dist/`)

## The coding workflow (what the agent itself does)

- `src/core/requirements.ts` — the request becomes a bounded brief (goal, constraints, acceptance, edge cases, verification); an action without a target gets exactly one clarifying question.
- `src/core/project-context.ts` — the repository's instructions, layout and build/test commands, detected offline; also detects the project's verify command.
- `src/core/workflow.ts` — the phases understand → inspect → plan → implement → verify → review → summarize; the phase follows the work that actually happened.
- `src/core/verify-runner.ts` — runs the project's verify command after a change and feeds the real output back; the agent may never claim a test passed unless it ran and passed.
- `src/core/repo-map.ts` — the ranked repository map (file signatures + import-graph centrality) that goes into the prompt.
- `src/core/review.ts` — the deterministic diff analysis behind review mode (severity + file:line facts).
- `src/core/risk.ts` + `src/core/shell-segments.ts` — commands are judged per segment; `src/core/stuck.ts` stops repeated failures; `src/core/observation.ts` gives every tool result a typed outcome; `src/core/edit-report.ts` explains a failed edit.

## Conventions

- Language: TypeScript strict, CommonJS output, Node >= 18. The core CLI + built-in TUI have zero runtime dependencies; the optional Ink engine (`XMINAL_TUI_ENGINE=ink`) adds 3 (ink, react, react-reconciler).
- Never commit secrets or `.xminal/` runtime state (gitignored). `dist/` is gitignored; rebuild with `npm run build` (the `prepare` script builds it for git-URL installs).
- Sessions/checkpoints/usage live under `.xminal/` (gitignored).
- Keep the CLI honest: no fabricated features, no invented URLs, and no silent behavior — surface errors, never swallow them.
- Public docs live in `docs/` (only `AGENTS.md`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `LICENSE` + `docs/`); keep them in sync with the code.
- Before every push: `npm run verify` and make sure CI is green.
