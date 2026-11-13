# InkFlow — built live from the web UI

This file was written by the XMINAL agent itself, in three turns, through the
web UI's `/v1/agent/stream` endpoint (free model: `groq/openai/gpt-oss-120b`):

1. **Build** — `write` tool created `index.html` end-to-end; the agent replied `INKPATH index.html`.
2. **Bug fix** — "the Done filter shows all todos" → the agent edited the predicate and verified with `grep`.
3. **Crash fix** — `ReferenceError: Cannot access 'persist' before initialization` on first run → the agent moved the seeding block below the `persist` definition and verified with `grep` + a jsdom smoke test (3 sample todos render).

Open it directly in any browser — it is one self-contained file, zero dependencies, dark Ekko-style theme, `localStorage` persistence (`inkflow_todos`), all/active/done filters.

```sh
# regenerate it yourself
xminal web-ui
# then ask: "Build a single-page todo app called InkFlow …"
```
