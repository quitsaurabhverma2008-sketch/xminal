// Capability awareness tests — offline, no network.
const test = require("node:test");
const assert = require("node:assert");

const { renderCapabilitySummary, renderMcpStatus, renderToolList } = require("../dist/core/capabilities");
const { capabilityTools } = require("../dist/tools/capability-tool");

function findTool(name) {
  const tool = capabilityTools.find((t) => t.name === name);
  assert.ok(tool, `tool ${name} not registered`);
  return tool;
}

function stubContext(overrides = {}) {
  return {
    cwd: process.cwd(),
    session: {},
    config: { mcpServers: {} },
    permissions: { check: async () => ({ allowed: true, reason: "test" }) },
    memory: { renderForPrompt: () => "" },
    skills: { relevant: () => [{ name: "verify" }, { name: "review" }] },
    mcp: {
      listServerNames: () => ["github"],
      status: async () => [
        { name: "github", enabled: true, status: "ok", toolCount: 3, toolNames: ["create_issue"] },
        { name: "dead-server", enabled: true, status: "error", toolCount: 0, error: "spawn failed" },
      ],
    },
    ...overrides,
  };
}

test("renderToolList marks read-only tools and truncates descriptions", () => {
  const out = renderToolList([
    { name: "read", description: "Read a file. Extra details here.", readOnly: true },
    { name: "bash", description: "Run a command. It can do anything.", readOnly: false },
  ]);
  assert.match(out, /read \(read-only\) — Read a file\./);
  assert.match(out, /bash — Run a command\./);
});

test("renderCapabilitySummary is compact and mentions tools, MCP and skills", () => {
  const summary = renderCapabilitySummary({
    tools: [
      { name: "read", description: "Read a file.", readOnly: true },
      { name: "edit", description: "Edit a file.", readOnly: false },
    ],
    mcpServers: ["github"],
    relevantSkills: ["verify"],
  });
  assert.match(summary, /<CAPABILITIES>/);
  assert.match(summary, /read \(read-only\)/);
  assert.match(summary, /MCP servers configured: github/);
  assert.match(summary, /Skills for this request: verify/);
  assert.ok(summary.length < 1500, "the prompt block must stay small");
});

test("renderCapabilitySummary without MCP says how to find one", () => {
  const summary = renderCapabilitySummary({ tools: [{ name: "read", description: "Read." }], mcpServers: [], relevantSkills: [] });
  assert.match(summary, /MCP servers: none configured/);
  assert.match(summary, /mcp_search/);
});

test("renderMcpStatus surfaces dead servers instead of hiding them", () => {
  const out = renderMcpStatus([
    { name: "ok-server", status: "ok", toolCount: 2 },
    { name: "broken", status: "error", toolCount: 0, error: "ENOENT" },
    { name: "off", status: "disabled", toolCount: 0 },
  ]);
  assert.match(out, /ok-server: ok — 2 tools/);
  assert.match(out, /broken: FAILED — ENOENT/);
  assert.match(out, /off: disabled/);
});

test("capabilities tool reports tools, MCP status and skills", async () => {
  const tool = findTool("capabilities");
  assert.equal(tool.readOnly, true);
  const result = await tool.run({}, stubContext());
  assert.match(result.content, /Tools:/);
  assert.match(result.content, /ok — 3 tools visible/);
  assert.match(result.content, /FAILED — spawn failed/);
  assert.match(result.content, /verify, review/);
});

test("mcp_search is read-only and returns structured hits", async () => {
  const tool = findTool("mcp_search");
  assert.equal(tool.readOnly, true);
  const result = await tool.run({ query: "github", limit: 3 }, stubContext());
  assert.ok(!result.isError, result.content);
  assert.match(result.content, /github/i);
  assert.match(result.content, /docs:/);
});

test("mcp_add writes a DISABLED entry into the global config", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-cap-"));
  const previousHome = process.env.HOME;
  const previousXDG = process.env.XDG_CONFIG_HOME;
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
  try {
    // config module reads HOME at call time via paths.ts — recompute by requiring fresh
    delete require.cache[require.resolve("../dist/config/paths")];
    const paths = require("../dist/config/paths");
    const written = paths.globalConfigPath();
    // clear any previous global config influence
    fs.mkdirSync(path.dirname(written), { recursive: true });
    const tool = findTool("mcp_add");
    const result = await tool.run({ id: "brave" }, stubContext({ cwd: home }));
    assert.match(result.content, /Added "brave"/);
    const saved = JSON.parse(fs.readFileSync(written, "utf8"));
    assert.equal(saved.mcpServers.brave.enabled, false, "entries are written disabled");
    assert.ok(Array.isArray(saved.mcpServers.brave.command), "placeholder command preserved");
  } finally {
    process.env.HOME = previousHome;
    if (previousXDG !== undefined) process.env.XDG_CONFIG_HOME = previousXDG;
    fs.rmSync(home, { recursive: true, force: true });
    delete require.cache[require.resolve("../dist/config/paths")];
  }
});
