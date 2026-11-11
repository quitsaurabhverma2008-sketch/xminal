# AGENTS.md — instructions for coding agents working on XMINAL

## Commands

- Build: `npm run build` (tsc → `dist/`)
- Verify everything (build + 51 tests): `npm run verify`
- Run the CLI from source: `npm run build && node dist/index.js doctor`
- Tests: `npm test` (node:test, no network required; tests run against `dist/`)

## Conventions

- Language: TypeScript strict, CommonJS output, Node >= 18. The core CLI + built-in TUI have zero runtime dependencies; the optional Ink engine (`XMINAL_TUI_ENGINE=ink`) adds 4 (ink, react, react-reconciler, @inkjs/ui).
- Never commit secrets or `.xminal/` runtime state (gitignored). `dist/` is gitignored; rebuild with `npm run build` (the `prepare` script builds it for git-URL installs).
- Sessions/checkpoints/usage live under `.xminal/` (gitignored).
- Keep the CLI honest: no fabricated features, no invented URLs, and no silent behavior — surface errors, never swallow them.
- Public docs live in `docs/` (only `AGENTS.md`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `LICENSE` + `docs/`); keep them in sync with the code.
- Before every push: `npm run verify` and make sure CI is green.
