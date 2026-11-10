# XMINAL — Development guide

## Prerequisites

- Node.js ≥ 18
- npm

## Build & verify

```sh
npm ci            # install devDependencies (typescript, @types/node)
npm run build     # tsc → dist/
npm test          # node:test suites (no network required)
npm run verify    # build + tests — run this before every push
```

## Running from source

```sh
npm run build && node dist/index.js doctor
node dist/index.js            # interactive TUI
node dist/index.js run "ping" # headless
```

## Repo layout

- `src/` — TypeScript source (TUI in `src/tui/`, agent runtime in `src/core/`)
- `tests/` — `node:test` suites; run against the compiled `dist/` (build first)
- `dist/` — build output; **not committed** (built on demand / at `prepare`)
- `docs/` — roadmap and this guide
- `site/` — static landing page
- `assets/` — logo + screenshots

## Conventions

- TypeScript strict, CommonJS output, Node ≥ 18, **zero runtime dependencies**
- Never commit secrets or `.xminal/` runtime state (gitignored)
- When the tool schema changes, update the command catalog in `src/cli/commands.ts`
  and the TUI palette in `src/tui/clone-tui.ts`
- AGENTS.md lists the agent-facing instructions for coding agents on this repo

## Release checklist

1. Bump `version` in `package.json` and `src/version.ts`
2. Update README version strings
3. Add a `## [x.y.z]` entry to `CHANGELOG.md`
4. `npm run verify` (build + all tests green)
5. `npm pack` (sanity-check the file list; `dist/` builds via `prepare`)
6. Tag + GitHub release with notes
7. `npm publish --access public` (CI does not publish)
8. Verify `npm view xminal version` shows the new release

See `docs/ROADMAP.md` for what is intentionally not built.
