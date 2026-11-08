# AGENTS.md — instructions for coding agents working on XMINAL

## Commands

- Build: `npm run build` (tsc → `dist/`)
- Verify everything (build + 24 tests): `npm run verify`
- Run the CLI from source: `npm run build && node dist/index.js doctor`
- Tests: `npm test` (node:test, no network required)

## Conventions

- Language: TypeScript strict, CommonJS output, Node >= 18, zero runtime dependencies.
- Never commit secrets or `.xminal/` runtime state (gitignored). `dist/` is gitignored; rebuild with `npm run build`.
- Sessions/checkpoints/usage live under `.xminal/` (gitignored). When changing the tool schema, update `FEATURE_MATRIX.md` and `EXECUTION-PLAN.md`.
- Keep the CLI honest: no fabricated features, no invented URLs, and no silent behavior — surface errors, never swallow them.
- Before every push: `npm run verify` and make sure CI is green.
