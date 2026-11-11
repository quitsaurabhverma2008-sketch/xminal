// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");

const { PermissionManager } = require("../dist/core/permissions");
const { redactSecrets } = require("../dist/util/redact");

const fs = require("node:fs");
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-sec-"));
process.on("exit", () => { try { fs.rmSync(cwd, { recursive: true, force: true }); } catch {} });
const manager = new PermissionManager(cwd, "ask", [".env", "~/.ssh", "~/.aws", "~/.gnupg", "~/.config/gh"]);

test("reads inside the workspace are safe", () => {
  const risk = manager.classifyTool("read", { path: "src/index.ts" });
  assert.equal(risk.risk, "safe");
});

test("reading a protected file is dangerous — it would leak into the model context", () => {
  const risk = manager.classifyTool("read", { path: ".env" });
  assert.equal(risk.risk, "dangerous");
  assert.ok(/protected/.test(risk.reason));
  const ssh = manager.classifyTool("read", { path: path.join(os.homedir(), ".ssh", "id_rsa") });
  assert.equal(ssh.risk, "dangerous");
});

test("bash that writes outside the workspace is dangerous", () => {
  const risk = manager.classifyTool("bash", { command: `rm -rf ${path.join(os.homedir(), "notes")}` });
  assert.equal(risk.risk, "dangerous");
  assert.ok(/outside the workspace|home directory/.test(risk.reason));
});

test("bash inside the workspace stays allowed", () => {
  const risk = manager.classifyTool("bash", { command: "mkdir -p src && echo hi > src/a.txt" });
  assert.notEqual(risk.risk, "dangerous");
});

test("writing inside the workspace is risky, not dangerous", () => {
  const risk = manager.classifyTool("write", { path: "src/new.ts" });
  assert.equal(risk.risk, "risky");
});

test("writing outside the workspace is dangerous", () => {
  const risk = manager.classifyTool("write", { path: path.join(os.homedir(), ".bashrc") });
  assert.equal(risk.risk, "dangerous");
  assert.ok(/outside the workspace/.test(risk.reason));
});

test("writing a protected path is dangerous", () => {
  const risk = manager.classifyTool("write", { path: ".env" });
  assert.equal(risk.risk, "dangerous");
});

test("the project's own .xminal state directory stays writable", () => {
  assert.equal(manager.isOutsideWorkspace(".xminal/sessions/x.json"), false);
  assert.equal(manager.isOutsideWorkspace("src/index.ts"), false);
  assert.equal(manager.isOutsideWorkspace("../escape.txt"), true);
});

test("secrets are redacted before they reach the screen", () => {
  const result = redactSecrets("key sk-abcdefghijklmnopqrstuvwxyz123456 and ghp_abcdefghijklmnopqrstuvwxyz1234");
  assert.ok(!result.text.includes("sk-abcdefghijklmnopqrstuvwxyz123456"));
  assert.ok(!result.text.includes("ghp_abcdefghijklmnopqrstuvwxyz1234"));
  assert.ok(result.count >= 2);
});
