const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { spawn } = require("node:child_process");

const os = require("node:os");
const fs = require("node:fs");
const indexJs = path.resolve(__dirname, "..", "dist", "index.js");

function rpc(child, message) {
  child.stdin.write(JSON.stringify(message) + "\n");
}

function waitForLine(child) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const index = buffer.indexOf("\n");
      if (index >= 0) {
        cleanup();
        resolve(buffer.slice(0, index));
      }
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`MCP server exited early (code ${code})`));
    };
    const cleanup = () => {
      child.stdout.removeListener("data", onData);
      child.removeListener("exit", onExit);
    };
    child.stdout.on("data", onData);
    child.on("exit", onExit);
  });
}

test("mcp stdio server answers initialize, tools/list and tools/call", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-mcp-test-"));
  const child = spawn(process.execPath, [indexJs, "mcp", "--serve"], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });
  try {
    rpc(child, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } } });
    const initResponse = JSON.parse(await waitForLine(child));
    assert.equal(initResponse.id, 1);
    assert.equal(initResponse.result.serverInfo.name, "xminal");

    rpc(child, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });

    rpc(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const listResponse = JSON.parse(await waitForLine(child));
    const names = listResponse.result.tools.map((tool) => tool.name);
    for (const expected of ["read", "write", "bash", "verify", "task", "think"]) {
      assert.ok(names.includes(expected), `missing tool ${expected}`);
    }

    rpc(child, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "think", arguments: { thought: "mcp test" } } });
    const callResponse = JSON.parse(await waitForLine(child));
    assert.ok(callResponse.result.content[0].text.includes("mcp test"));
  } finally {
    child.kill("SIGTERM");
  }
});
