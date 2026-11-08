const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { Agent } = require("../dist/core/agent");
const { Session } = require("../dist/core/session");
const { PermissionManager } = require("../dist/core/permissions");
const { MemoryStore } = require("../dist/memory/store");
const { SkillRegistry } = require("../dist/skills/loader");
const { McpManager } = require("../dist/mcp/client");
const { ToolRegistry } = require("../dist/tools/registry");
const { allTools } = require("../dist/tools/index");
const { defaultConfig } = require("../dist/config/config");

function makeAgent(cwd) {
  const config = defaultConfig();
  const session = Session.create(cwd, { model: "auto", mode: "auto" });
  const tools = new ToolRegistry();
  tools.registerAll(allTools());
  return new Agent({
    cwd,
    config,
    session,
    permissions: new PermissionManager(cwd, "full", []),
    tools,
    memory: new MemoryStore(cwd),
    skills: new SkillRegistry(cwd),
    mcp: new McpManager({}),
    mode: "build",
    model: "auto",
  });
}

test("compactHistory keeps tool-call assistant and its results together", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-compact-"));
  const agent = makeAgent(cwd);
  const calls = [{ id: "c1", name: "bash", arguments: '{"command":"ls"}' }];
  agent.history.push(
    { role: "user", content: "u1" },
    { role: "assistant", content: "", toolCalls: calls },
    { role: "tool", toolCallId: "c1", name: "bash", content: "file1" },
    { role: "tool", toolCallId: "c1", name: "bash", content: "file2" },
    { role: "user", content: "u2" },
  );

  const removed = agent.compactHistory(2);
  assert.equal(removed, 1, "cut should back off from a tool boundary");
  assert.equal(agent.history.length, 5, "compacted marker + pair kept intact");
  assert.equal(agent.history[0].role, "user");
  assert.match(agent.history[0].content, /earlier messages/);
  assert.equal(agent.history[1].role, "assistant");
  assert.ok(Array.isArray(agent.history[1].toolCalls));
  assert.equal(agent.history[2].role, "tool");
  assert.equal(agent.history[3].role, "tool");
  assert.equal(agent.history[4].role, "user");
  assert.equal(agent.history[4].content, "u2");
});

test("compactHistory is a no-op under the window", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-compact-"));
  const agent = makeAgent(cwd);
  agent.history.push({ role: "user", content: "u1" });
  assert.equal(agent.compactHistory(8), 0);
  assert.equal(agent.history.length, 1);
});
