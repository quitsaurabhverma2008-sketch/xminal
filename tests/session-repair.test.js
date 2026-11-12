// Session resume repair tests — offline.
const test = require("node:test");
const assert = require("node:assert");

const { closeDanglingToolCalls } = require("../dist/core/session");

const assistant = (toolCalls) => ({
  role: "assistant",
  content: "",
  toolCalls: toolCalls.map((id) => ({ id, name: "bash", arguments: "{}" })),
});
const tool = (id) => ({ role: "tool", toolCallId: id, name: "bash", content: "ok" });

test("a dangling tool_call turn gets synthetic interrupted results", () => {
  const history = [
    { role: "user", content: "do it" },
    assistant(["c1", "c2"]),
  ];
  const repaired = closeDanglingToolCalls(history);
  const tools = repaired.filter((m) => m.role === "tool");
  assert.equal(tools.length, 2, "every missing tool result is synthesized");
  assert.equal(tools[0].toolCallId, "c1");
  assert.equal(tools[1].toolCallId, "c2");
  assert.match(tools[0].content, /interrupted/i);
});

test("answered tool calls are not duplicated", () => {
  const history = [
    { role: "user", content: "do it" },
    assistant(["c1", "c2"]),
    tool("c1"),
  ];
  const repaired = closeDanglingToolCalls(history);
  const toolCalls = repaired.filter((m) => m.role === "tool").map((m) => m.toolCallId);
  assert.deepEqual(toolCalls.sort(), ["c1", "c2"]);
});

test("a fully-answered turn is untouched", () => {
  const history = [{ role: "user", content: "hi" }, assistant(["c1"]), tool("c1")];
  assert.equal(closeDanglingToolCalls(history).length, 3);
});

test("interrupted message keeps the assistant's words", () => {
  const history = [
    assistant(["c9"]),
  ];
  const repaired = closeDanglingToolCalls(history);
  assert.equal(repaired[0].role, "assistant");
  assert.equal(repaired[1].toolCallId, "c9");
});
