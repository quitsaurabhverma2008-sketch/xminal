const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  estimateTokens,
  recordToolUsage,
  loadToolUsage,
  formatTokens,
} = require("../dist/core/tool-usage");

function tempCwd() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "xminal-usage-"));
}

test("estimateTokens is chars/4 and never under-counts non-empty text", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("1234"), 1);
  assert.ok(estimateTokens("hello world") >= 2);
});

test("tool usage records, aggregates and formats per tool and MCP", () => {
  const cwd = tempCwd();
  recordToolUsage(cwd, { tool: "bash", server: "xminal", model: "auto", argTokens: 10, resultTokens: 30, isError: false, durationMs: 5 });
  recordToolUsage(cwd, { tool: "bash", server: "xminal", model: "auto", argTokens: 10, resultTokens: 50, isError: true, durationMs: 7 });
  recordToolUsage(cwd, { tool: "mcp_call", server: "filesystem", detail: "read_file", model: "auto", argTokens: 20, resultTokens: 120, isError: false, durationMs: 20 });
  recordToolUsage(cwd, { tool: "mcp_call", server: "filesystem", detail: "write_file", model: "auto", argTokens: 40, resultTokens: 10, isError: false, durationMs: 8 });

  const summary = loadToolUsage(cwd);
  assert.equal(summary.totalCalls, 4);
  assert.equal(summary.totalTokens, 10 + 30 + 10 + 50 + 20 + 120 + 40 + 10);
  assert.equal(summary.totalErrors, 1);

  const bash = summary.byTool.find((bucket) => bucket.name === "xminal/bash");
  assert.ok(bash);
  assert.equal(bash.calls, 2);
  assert.equal(bash.tokens, 100);
  assert.equal(bash.errors, 1);

  const fsRead = summary.byTool.find((bucket) => bucket.name === "filesystem/read_file");
  assert.equal(fsRead.tokens, 140);
  const fsWrite = summary.byTool.find((bucket) => bucket.name === "filesystem/write_file");
  assert.equal(fsWrite.tokens, 50);

  assert.equal(formatTokens(950), "950");
  assert.equal(formatTokens(12_340), "12.3k");
  assert.equal(formatTokens(2_500_000), "2.50M");
});
