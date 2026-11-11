// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");

const { PermissionManager } = require("../dist/core/permissions");
const { redactSecrets, maskConfigSecrets, maskSecretValue } = require("../dist/util/redact");

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
  // built at runtime so this file never contains a token-shaped literal
  const fakeKey = `sk-${"abcdefghijklmnopqrstuvwxyz".repeat(2)}`;
  const fakePat = `ghp_${"abcdefghijklmnopqrstuvwxyz".repeat(2)}`;
  const result = redactSecrets(`key ${fakeKey} and ${fakePat}`);
  assert.ok(!result.text.includes(fakeKey));
  assert.ok(!result.text.includes(fakePat));
  assert.ok(result.count >= 2);
});

test("config output masks provider keys", () => {
  const masked = maskConfigSecrets({
    providers: { openai: { apiKey: "sk-live-abcdefghijklmnop" }, groq: { apiKey: "gsk_abcdefghijklmnopqrstuvwxyz" } },
    nested: { deep: { token: "abcdefghijklmnopqrst" } },
    keep: "visible",
  });
  assert.ok(!masked.providers.openai.apiKey.includes("abcdefghijklmnop"));
  assert.ok(!masked.providers.groq.apiKey.includes("abcdefghijklmnopqrstuvwxyz"));
  assert.ok(!masked.nested.deep.token.includes("abcdefghijklmnopqrst"));
  assert.equal(masked.keep, "visible");
  assert.equal(maskSecretValue("short"), "*****");
  assert.ok(maskSecretValue("a".repeat(40)).startsWith("aaaa"));
});

test("`xminal config` never prints a raw provider key", () => {
  const { spawnSync } = require("node:child_process");
  const fsx = require("node:fs");
  const home = fsx.mkdtempSync(path.join(os.tmpdir(), "xminal-cfgout-"));
  try {
    fsx.mkdirSync(path.join(home, ".xminal"), { recursive: true });
    fsx.writeFileSync(
      path.join(home, ".xminal", "config.json"),
      JSON.stringify({ version: 1, providers: { demo: { type: "openai", baseUrl: "https://example.invalid", apiKey: "sk-live-THISISFAKEKEY1234567890" } } }),
    );
    const entry = path.join(__dirname, "..", "dist", "index.js");
    const result = spawnSync(process.execPath, [entry, "config"], {
      encoding: "utf8",
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.stdout.includes("THISISFAKEKEY1234567890"), "the raw key leaked into `xminal config`");
    assert.ok(result.stdout.includes("sk-l"), "the masked key should still be recognisable");
  } finally {
    fsx.rmSync(home, { recursive: true, force: true });
  }
});
