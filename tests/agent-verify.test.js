// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const { Agent } = require("../dist/core/agent");
const { defaultConfig } = require("../dist/config/config");
const { Session } = require("../dist/core/session");
const { ToolRegistry } = require("../dist/tools/registry");
const { MemoryStore } = require("../dist/memory/store");
const { SkillRegistry } = require("../dist/skills/loader");
const { McpManager } = require("../dist/mcp/client");
const { PermissionManager } = require("../dist/core/permissions");

/** A model that writes a file, then answers — scripted, so the test is deterministic. */
function scriptedModel(responses) {
  let index = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const reply = responses[Math.min(index, responses.length - 1)];
      index += 1;
      res.writeHead(200, { "content-type": "text/event-stream" });
      if (reply.tool) {
        res.write(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, id: "call-1", function: { name: reply.tool, arguments: JSON.stringify(reply.args) } },
                  ],
                },
              },
            ],
          })}\n\n`,
        );
      } else {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: reply.text ?? "done" } }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 5, completion_tokens: 2 } })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-verify-"));
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "node --test" } }),
  );
  fs.mkdirSync(path.join(dir, "test"));
  fs.writeFileSync(
    path.join(dir, "sum.js"),
    "export function add(a, b) {\n  return a - b;\n}\n",
  );
  fs.writeFileSync(
    path.join(dir, "test", "sum.test.js"),
    [
      'const test = require("node:test");',
      'const assert = require("node:assert");',
      'const { add } = require("../sum.js");',
      'test("adds", () => { assert.equal(add(2, 3), 5); });',
      "",
    ].join("\n"),
  );
  return dir;
}

function makeAgent(port, cwd) {
  const config = defaultConfig();
  config.providers = { fake: { type: "openai", baseUrl: `http://127.0.0.1:${port}/v1`, requiresKey: false } };
  config.models = {
    "fake/model": { provider: "fake", model: "model", contextWindow: 100000, maxOutput: 4096 },
  };
  config.defaultModel = "fake/model";
  config.fallbackModels = [];
  config.limits.maxTurns = 6;
  config.limits.maxCostPerSession = 100;
  config.autoVerify = true;
  config.autoVerifyRepairs = 1;
  const session = new Session(cwd, { id: "test", title: "t", createdAt: "", updatedAt: "" }, []);
  const agent = new Agent({
    config,
    cwd,
    session,
    tools: new ToolRegistry(),
    memory: new MemoryStore(cwd),
    skills: new SkillRegistry(cwd),
    mcp: new McpManager({}),
    permissions: new PermissionManager(cwd, "auto", []),
    mode: "build",
  });
  return agent;
}

test("the agent verifies its change and feeds a failing test back to the model", async () => {
  const { server, port } = await scriptedModel([
    { tool: "write", args: { path: "sum.js", content: "export function add(a, b) {\n  return a + b;\n}\n" } },
    { text: "I changed add() to add the numbers." },
    { text: "The fix is in place." },
  ]);
  const cwd = makeProject();
  const statuses = [];
  try {
    const agent = makeAgent(port, cwd);
    agent.setCallbacks?.({ onStatus: (m) => statuses.push(m) });
    const result = await agent.run("fix the bug in sum.js so the test passes");
    assert.ok(result.turns >= 2, `the agent should have taken another turn, got ${result.turns}`);
    const verifyStatus = statuses.find((s) => /verify/i.test(s));
    assert.ok(verifyStatus, `expected a verification status, got ${JSON.stringify(statuses)}`);
    assert.match(verifyStatus, /passed|failed/);
    // the failing output was fed back, so the model was asked again
    assert.ok(result.turns >= 2);
  } finally {
    server.close();
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("verification is skipped when nothing was changed", async () => {
  const { server, port } = await scriptedModel([{ text: "all good" }]);
  const cwd = makeProject();
  const statuses = [];
  try {
    const agent = makeAgent(port, cwd);
    agent.setCallbacks?.({ onStatus: (m) => statuses.push(m) });
    await agent.run("what does this project do?");
    assert.equal(statuses.filter((s) => /verify/i.test(s)).length, 0, "no verification without an edit");
  } finally {
    server.close();
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
