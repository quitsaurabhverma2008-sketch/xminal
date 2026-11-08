const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { PermissionManager } = require("../dist/core/permissions");

function tempCwd() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "xminal-perm-"));
}

test("read-only tools are always allowed", async () => {
  const manager = new PermissionManager(tempCwd(), "ask", []);
  const decision = await manager.check("read", { path: "anything" });
  assert.equal(decision.allowed, true);
});

test("auto mode approves low-risk shell commands but not dangerous ones", async () => {
  const cwd = tempCwd();
  const manager = new PermissionManager(cwd, "auto", []);
  assert.equal((await manager.check("bash", { command: "ls" })).allowed, true);
  assert.equal((await manager.check("bash", { command: "git status" })).allowed, true);
  assert.equal((await manager.check("bash", { command: "rm -rf /tmp/example" })).allowed, false);
  assert.equal((await manager.check("bash", { command: "sudo apt update" })).allowed, false);
});

test("ask mode denies risky actions when no handler is set", async () => {
  const manager = new PermissionManager(tempCwd(), "ask", []);
  assert.equal((await manager.check("bash", { command: "ls" })).allowed, false);
});

test("protected paths are denied even in auto mode", async () => {
  const cwd = tempCwd();
  const manager = new PermissionManager(cwd, "auto", [".env", "~/.ssh"]);
  const decision = await manager.check("write", { path: ".env" });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /protected path/);
});

test("full mode allows everything except protected paths", async () => {
  const cwd = tempCwd();
  const manager = new PermissionManager(cwd, "full", [".env"]);
  assert.equal((await manager.check("bash", { command: "rm -rf /tmp/example" })).allowed, true);
  assert.equal((await manager.check("write", { path: ".env" })).allowed, false);
});
