// Chat-line renderer unit tests — ANSI-in, ANSI-out, no PTY needed.
const test = require("node:test");
const assert = require("node:assert");

const { renderStyledLine } = require("../dist/tui/chat-lines");
const { visibleWidth, stripAnsi, graphemeSlice } = require("../dist/tui/width");
const { makeActivity } = require("../dist/tui/output/tool-activity");

const w = 60;
const rowWidth = (row) => visibleWidth(row);

function activityOf(name, argsRaw, patch = {}) {
  const base = makeActivity(name, argsRaw);
  return { ...base, ...patch, status: patch.status ?? "ok" };
}

test("every assistant row fits the width", () => {
  const line = { kind: "assistant", text: "Here is **bold** and `code` and a [link](https://example.com)." };
  for (const row of renderStyledLine(line, w, { mode: "build" })) {
    assert.ok(rowWidth(row) <= w, `row too wide (${rowWidth(row)}): ${JSON.stringify(row)}`);
  }
});

test("the user panel renders a raised card with the mode bar", () => {
  const rows = renderStyledLine({ kind: "user", text: "hello world" }, w, { mode: "plan" });
  assert.ok(rows.length >= 3);
  for (const row of rows) assert.ok(rowWidth(row) <= w);
  assert.match(stripAnsi(rows[0]), /^┃/);
});

test("reasoning rows carry the amber rule", () => {
  const rows = renderStyledLine({ kind: "reasoning", text: "thinking" }, w, { mode: "build" });
  for (const row of rows) assert.match(row, /┃/);
});

test("an edit diff renders a card with the ± background bands", () => {
  const preview = [
    "@@ -1,2 +1,2 @@",
    "-const x = 1;",
    "+const x = 2;",
    " context line",
  ];
  const line = { kind: "tool", text: "", activity: activityOf("edit", JSON.stringify({ path: "src/a.ts" }), { preview, added: 1, removed: 1 }) };
  const rows = renderStyledLine(line, w, { mode: "build" });
  const all = rows.join("\n");
  // #20303b (added) and #37222c (removed) as 48;2 backgrounds
  assert.ok(all.includes("48;2;32;48;59"), "the + row must carry the added-band background");
  assert.ok(all.includes("48;2;55;34;44"), "the - row must carry the removed-band background");
  for (const row of rows) assert.ok(rowWidth(row) <= w, `row too wide: ${JSON.stringify(row)}`);
});

test("a bash tool renders a command card with the ┃ rule", () => {
  const activity = activityOf("bash", JSON.stringify({ command: "npm test" }), { output: ["ok line"], status: "ok" });
  const line = { kind: "tool", text: "", activity };
  const rows = renderStyledLine(line, w, { mode: "build" });
  assert.ok(rows.length >= 2);
  for (const row of rows) assert.ok(rowWidth(row) <= w);
});

test("ok rows with a unified diff get tinted", () => {
  const line = { kind: "ok", text: "@@ -1 +1 @@\n-old\n+new" };
  const rows = renderStyledLine(line, w, { mode: "build" });
  const joined = rows.join("\n");
  assert.ok(/\x1b\[/.test(joined), "the diff rows must be coloured");
});

test("secret-looking content is redacted from ok/err rows", () => {
  const secret = "gsk_" + "A".repeat(24);
  const line = { kind: "err", text: `failed with ${secret} in the body` };
  const rows = renderStyledLine(line, w, { mode: "build" });
  assert.ok(!rows.join("\n").includes(secret), "the raw secret must not reach the row");
});

test("a very long ok row is wrapped, never clipped", () => {
  const line = { kind: "ok", text: "word ".repeat(60) };
  const rows = renderStyledLine(line, w, { mode: "build" });
  assert.ok(rows.length > 1);
  for (const row of rows) assert.ok(rowWidth(row) <= w);
});

test("stray ANSI from tool output does not leak into the user-facing row width", () => {
  const line = { kind: "ok", text: "\x1b[31m" + "x".repeat(80) + "\x1b[0m" };
  for (const row of renderStyledLine(line, w, { mode: "build" })) {
    assert.ok(rowWidth(row) <= w);
  }
});
