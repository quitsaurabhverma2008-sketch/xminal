import React from "react";
import { renderToString } from "ink";
import { App } from "./entry";
import { createStore } from "./store";

const base = {
  model: "opencode/inkling-2-small-free",
  mode: "build" as const,
  sessionTitle: "fix the failing test",
  sessionShortId: "abcdef12",
  branch: "main",
};
const fakeRuntime: any = {
  agent: { mode: "build", modelSpec: "opencode/inkling-2-small-free", getCost: () => ({ inputTokens: 0, outputTokens: 0, costUsd: 0 }), run: async () => {}, setMode: () => {}, setCallbacks: () => {}, abort: () => {} },
  skills: { list: () => [] },
  mcp: { listServerNames: () => [] },
  session: { id: "x", meta: { title: "t" } },
  setMode: () => {},
  setAskHandler: () => {},
};

const empty = createStore({ ...base });
console.log("========= HOME (empty transcript, boot) =========");
console.log(renderToString(<App store={empty} runtime={fakeRuntime} onExit={() => undefined} />));

const busy = createStore({ ...base, input: "fix the login bug — streaming now", busy: true, inputTokens: 2100, ctxWindow: 128000 });
busy.pushLine("user", "fix the login bug");
busy.pushLine("assistant", "Tracing through the session creation path now…");
console.log("========= BUSY (gradient + working row) =========");
console.log(renderToString(<App store={busy} runtime={fakeRuntime} onExit={() => undefined} />));

const perm = createStore({ ...base, pendingPermission: { tool: "bash", reason: "rm -rf /" } });
perm.pushLine("user", "clean the repo");
console.log("========= PERMISSION PROMPT =========");
console.log(renderToString(<App store={perm} runtime={fakeRuntime} onExit={() => undefined} />));
