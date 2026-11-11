const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const { defaultConfig, resolveModel, addGlobalMcpServer } = require("../dist/config/config");

test("default config ships providers and rejects unknown models", () => {
  const config = defaultConfig();
  assert.ok(Object.keys(config.providers).length >= 5);
  assert.throws(() => resolveModel(config, "definitely-not-a-model-or-provider"), /Unknown model/);
});

test("resolveModel resolves a local provider without a key", () => {
  const config = defaultConfig();
  const model = resolveModel(config, "ollama");
  assert.equal(model.provider, "ollama");
  assert.equal(model.providerConfig.type, "openai");
});

test("resolveModel(auto) fails clearly when no provider is available", () => {
  const config = defaultConfig();
  config.providers = {};
  assert.throws(() => resolveModel(config, "auto"), /No provider credentials/);
});

test("addGlobalMcpServer writes the entry disabled, keeps a backup and stays owner-only", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-cfg-"));
  const previousHome = process.env.HOME;
  const previousProfile = process.env.USERPROFILE;
  // os.homedir() reads HOME on posix and USERPROFILE on windows
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    const first = addGlobalMcpServer("demo-server", {
      command: ["npx", "-y", "demo"],
      enabled: false,
      url: "https://example.invalid/demo",
    });
    assert.equal(first.backup, undefined, "there was no config to back up yet");

    const configPath = path.join(home, ".xminal", "config.json");
    const mode = fs.statSync(configPath).mode & 0o777;
    assert.equal(mode, 0o600, "the config with server entries must be owner-only");

    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(parsed.mcpServers["demo-server"].enabled, false);
    assert.equal(parsed.mcpServers["demo-server"].url, "https://example.invalid/demo");

    // a second add backs up the file it just wrote
    const second = addGlobalMcpServer("other-server", { command: ["other"], enabled: false });
    assert.ok(second.backup && fs.existsSync(second.backup));
    const backup = JSON.parse(fs.readFileSync(second.backup, "utf8"));
    assert.ok(backup.mcpServers["demo-server"], "the backup must contain the previous entries");
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousProfile;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
