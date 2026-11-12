// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { RunStateMachine, RUN_TRANSITIONS } = require("../dist/core/run-state");
const { condense, condensationReasons, estimatePromptTokens, pickForgetRange, mechanicalSummary } = require("../dist/core/condenser");
const { parsePlan, renderPlanForEditor, runArchitect } = require("../dist/core/architect");
const { ChatFilesStore, renderChatFiles, resolveChatPath } = require("../dist/core/chat-files");
const { summarizeTrajectories, renderTrajectorySummary, writeTrajectory } = require("../dist/core/trajectory");

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ── run state ──────────────────────────────────────────────────────────
test("the run state machine allows and refuses transitions", () => {
  const machine = new RunStateMachine();
  assert.equal(machine.current, "idle");
  assert.equal(machine.transition("running").ok, true);
  assert.equal(machine.current, "running");
  const refused = machine.transition("idle");
  assert.equal(refused.ok, false);
  assert.match(refused.rejection, /illegal transition/);
  assert.equal(machine.current, "running", "a refused transition must not change the state");
});

test("a transition to the same state is a no-op", () => {
  const changes = [];
  const machine = new RunStateMachine((change) => changes.push(change));
  machine.transition("running");
  const before = machine.transitions.length;
  const again = machine.transition("running");
  assert.equal(again.ok, true);
  assert.equal(machine.transitions.length, before, "no event for a self-transition");
});

test("the error → running path is legal (retry with more room)", () => {
  const machine = new RunStateMachine();
  machine.transition("running");
  assert.equal(machine.transition("error").ok, true);
  assert.equal(machine.transition("running").ok, true);
  assert.equal(machine.current, "running");
});

test("every state has a transition table", () => {
  for (const state of Object.keys(RUN_TRANSITIONS)) {
    assert.ok(Array.isArray(RUN_TRANSITIONS[state]));
  }
});

// ── condenser ──────────────────────────────────────────────────────────
test("the condenser triggers on the event count and on the token budget", () => {
  const messages = Array.from({ length: 100 }, (_, i) => ({ role: "user", content: "m".repeat(100) + i }));
  const byEvents = condensationReasons(messages, { maxEvents: 80, keepFirst: 4, maxTokensRatio: 0.8, minProgress: 0.1 });
  assert.ok(byEvents.reasons.has("events"));
  assert.equal(byEvents.requirement, "soft");

  const byTokens = condensationReasons(messages, { maxEvents: 1000, keepFirst: 4, maxTokensRatio: 0.1, minProgress: 0.1 }, 1000);
  assert.ok(byTokens.reasons.has("tokens"));
  assert.equal(byTokens.requirement, "hard");
});

test("the condenser protects the head and keeps a suffix", () => {
  const messages = Array.from({ length: 50 }, (_, i) => ({ role: "user", content: `message ${i}` }));
  const result = condense(messages, { maxEvents: 10, keepFirst: 4, maxTokensRatio: 0.8, minProgress: 0.1 });
  assert.equal(result.condensed, true);
  assert.ok(result.forgotten > 0);
  assert.equal(result.messages[0].content, "message 0", "the head is protected");
  assert.ok(result.messages.some((m) => m.role === "summary"));
  assert.ok(result.messages[result.messages.length - 1].content.startsWith("message 49"));
});

test("the condenser never splits a tool call from its result", () => {
  const messages = [
    { role: "user", content: "do it" },
    { role: "assistant", content: "", toolCalls: [{ id: "c1" }] },
    { role: "tool", content: "result", toolCallId: "c1" },
    ...Array.from({ length: 30 }, (_, i) => ({ role: "assistant", content: `later ${i}` })),
  ];
  const range = pickForgetRange(messages, 1, 5);
  // the cut must not land between the assistant tool call and its tool result
  assert.ok(!(range.end === 2 && messages[1].toolCalls?.length), "the pair must stay together");
  const result = condense(messages, { maxEvents: 5, keepFirst: 1, maxTokensRatio: 0.8, minProgress: 0.1 });
  assert.ok(result.messages.every((m, index) => {
    const next = result.messages[index + 1];
    return !(m.toolCalls?.length && next?.role !== "tool");
  }));
});

test("the condenser refuses to drop almost nothing", () => {
  const messages = Array.from({ length: 10 }, (_, i) => ({ role: "user", content: `m${i}` }));
  const result = condense(messages, { maxEvents: 9, keepFirst: 4, maxTokensRatio: 0.8, minProgress: 0.5 });
  assert.equal(result.condensed, false);
  assert.ok(result.skipped);
});

test("the summary is cumulative — the previous summary is passed on", () => {
  const seen = [];
  const messages = Array.from({ length: 40 }, (_, i) => ({ role: "user", content: `m${i}` }));
  condense(messages, { maxEvents: 10, keepFirst: 2, maxTokensRatio: 0.8, minProgress: 0.1 }, (_dropped, previous) => {
    seen.push(previous);
    return "SUMMARY";
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0], "", "the first condensation has no previous summary");
});

test("the token estimate grows with the content", () => {
  assert.ok(estimatePromptTokens([{ role: "user", content: "x".repeat(400) }]) > 90);
  assert.ok(mechanicalSummary([{ role: "user", content: "hello" }]).includes("hello"));
});

// ── architect ──────────────────────────────────────────────────────────
test("a plan is parsed from JSON and from a bullet list", () => {
  const fromJson = parsePlan('{"goal":"g","steps":[{"path":"src/a.ts","action":"modify","rationale":"r"}]}');
  assert.equal(fromJson.goal, "g");
  assert.equal(fromJson.steps[0].path, "src/a.ts");

  const fromBullets = parsePlan("Goal line\n- src/b.ts — because it is wrong");
  assert.equal(fromBullets.steps[0].path, "src/b.ts");
  assert.ok(fromBullets.steps[0].rationale.includes("wrong"));
});

test("the editor receives the plan", async () => {
  let editorInput = "";
  const result = await runArchitect("add a feature", {
    planner: async () => '{"goal":"g","steps":[{"path":"src/a.ts","action":"create","rationale":"r"}]}',
    editor: async (plan) => {
      editorInput = plan;
      return "done";
    },
    plannerModel: "p",
    editorModel: "e",
  });
  assert.ok(editorInput.includes("src/a.ts"));
  assert.ok(editorInput.includes("add a feature"));
  assert.equal(result.editorText, "done");
  assert.equal(result.plan.steps.length, 1);
  assert.ok(renderPlanForEditor(result.plan, "x").includes("1. create src/a.ts"));
});

// ── chat files ─────────────────────────────────────────────────────────
test("the chat files hold the working set", () => {
  const store = new ChatFilesStore();
  assert.equal(store.add("/tmp/a.ts"), true);
  assert.equal(store.add("/tmp/a.ts"), false, "adding twice is a no-op");
  store.add("/tmp/b.ts", "read-only");
  assert.equal(store.editable().length, 1);
  assert.equal(store.readOnly().length, 1);
  const rendered = renderChatFiles(store, "/tmp");
  assert.ok(rendered.includes("a.ts"));
  assert.ok(rendered.includes("Read-only"));
  assert.equal(store.drop("/tmp/a.ts"), true);
  assert.equal(store.drop("/tmp/a.ts"), false);
});

test("a chat path resolves relative to the project", () => {
  assert.equal(resolveChatPath("/project", "src/a.ts"), path.resolve("/project/src/a.ts"));
});

// ── trajectory ─────────────────────────────────────────────────────────
test("the trajectory summary aggregates the runs", () => {
  const dir = tmpDir("xminal-traj-");
  try {
    for (const [id, status] of [["s1", "done"], ["s2", "done"], ["s3", "error"]]) {
      writeTrajectory(dir, id, {
        info: {
          model: "m",
          exitStatus: status,
          costUsd: 0.01,
          inputTokens: 10,
          outputTokens: 5,
          turns: 1,
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:01:00.000Z",
        },
        trajectory: [{ action: "read", observation: "o", response: "", executionTime: 5 }],
      });
    }
    const summary = summarizeTrajectories(dir);
    assert.equal(summary.runs, 3);
    assert.equal(summary.byStatus.done, 2);
    assert.equal(summary.byStatus.error, 1);
    assert.equal(summary.totalSteps, 3);
    assert.ok(renderTrajectorySummary(summary).includes("done: 2"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
