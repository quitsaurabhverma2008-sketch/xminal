// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");

const {
  makeActivity,
  completeActivity,
  renderActivity,
  toolTarget,
  kindLabel,
  diffCounts,
} = require("../dist/tui/output/tool-activity");
const { stripAnsi } = require("../dist/tui/width");

test("toolTarget extracts the path for file tools", () => {
  assert.equal(toolTarget("edit", JSON.stringify({ path: "src/index.ts", oldString: "a", newString: "b" })), "src/index.ts");
  assert.equal(toolTarget("read", JSON.stringify({ path: "README.md" })), "README.md");
});

test("toolTarget extracts bash command and pattern", () => {
  assert.equal(toolTarget("bash", JSON.stringify({ command: "npm test" })), "npm test");
  assert.equal(toolTarget("grep", JSON.stringify({ pattern: "toolTarget", path: "src" })), "toolTarget");
});

test("toolTarget extracts server/tool for mcp_call", () => {
  assert.equal(toolTarget("mcp_call", JSON.stringify({ server: "fs", tool: "read_file", arguments: {} })), "fs/read_file");
});

test("toolTarget never throws on garbage input", () => {
  const out = toolTarget("bash", "{not json");
  assert.ok(typeof out === "string");
});

test("kindLabel groups related tools", () => {
  assert.equal(kindLabel("multi_edit"), "EDIT");
  assert.equal(kindLabel("glob"), "SEARCH");
  assert.equal(kindLabel("worktree"), "GIT");
  assert.equal(kindLabel("mcp_call"), "MCP");
});

test("diffCounts parses the (+N −M) result header", () => {
  assert.deepEqual(diffCounts("Edited foo.ts (1 replacement, +12 −4)"), { added: 12, removed: 4 });
  assert.deepEqual(diffCounts("Created bar.ts (+3 −0, 41 bytes)"), { added: 3, removed: 0 });
});

test("diffCounts falls back to counting unified diff lines", () => {
  const diff = "@@ -1,2 +1,3 @@\n ctx\n-old\n+new1\n+new2";
  assert.deepEqual(diffCounts(diff), { added: 2, removed: 1 });
});

test("completeActivity merges result: ok status, duration, counts, preview", () => {
  const a = makeActivity("edit", JSON.stringify({ path: "foo.ts" }));
  const done = completeActivity(a, false, "Edited foo.ts (1 replacement, +5 −2)\n@@ -1 +1 @@\n-old\n+new", a.startedAt + 42);
  assert.equal(done.status, "ok");
  assert.equal(done.durationMs, 42);
  assert.equal(done.added, 5);
  assert.equal(done.removed, 2);
  assert.ok(Array.isArray(done.preview));
  assert.ok(done.extraLines >= 2);
});

test("completeActivity marks failures honestly", () => {
  const a = makeActivity("bash", JSON.stringify({ command: "false" }));
  const done = completeActivity(a, true, "exit code 1", a.startedAt + 10);
  assert.equal(done.status, "err");
});

test("renderActivity shows a pending indicator before the result lands", () => {
  const a = makeActivity("read", JSON.stringify({ path: "x.ts" }));
  const line = stripAnsi(renderActivity(a, 60));
  assert.ok(line.includes("READ"));
  assert.ok(line.includes("x.ts"));
  assert.ok(!line.includes("ms"));
});

test("renderActivity shows duration + counts after completion", () => {
  const a = makeActivity("edit", JSON.stringify({ path: "foo.ts" }));
  const done = completeActivity(a, false, "Edited foo.ts (+2 −1)", a.startedAt + 150);
  const line = stripAnsi(renderActivity(done, 60));
  assert.ok(line.includes("EDIT"));
  assert.ok(line.includes("+2"));
  assert.ok(line.includes("−1"));
  assert.ok(line.includes("150ms"));
});
