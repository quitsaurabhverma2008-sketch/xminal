const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const { McpManager } = require("../dist/mcp/client");

const fixture = path.join(__dirname, "fixtures", "mcp-echo-server.cjs");

function manager() {
  return new McpManager({
    test: {
      command: [process.execPath, fixture],
      enabled: true,
      timeoutMs: 5000,
    },
  });
}

test("mcp manager lists tools from a stdio server", async () => {
  const mcp = manager();
  try {
    const tools = await mcp.listAllTools();
    const echo = tools.find((entry) => entry.server === "test" && entry.tool.name === "echo");
    assert.ok(echo, "expected the echo tool to be listed");
  } finally {
    mcp.closeAll();
  }
});

test("mcp manager calls a tool and returns the result", async () => {
  const mcp = manager();
  try {
    const result = await mcp.call("test", "echo", { text: "hello xminal" });
    const text = result?.content?.[0]?.text;
    assert.equal(text, "hello xminal");
  } finally {
    mcp.closeAll();
  }
});
