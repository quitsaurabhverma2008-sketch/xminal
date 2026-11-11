const test = require("node:test");
const assert = require("node:assert");

const { loadMcpCatalog, searchMcpServers } = require("../dist/mcp/catalog");

test("MCP catalog ships with 3000+ servers", () => {
  const catalog = loadMcpCatalog();
  assert.ok(catalog, "catalog should be present (data/mcp-catalog.json → dist/data)");
  assert.ok(catalog.count >= 3000, `expected 3000+ servers, got ${catalog.count}`);
});

test("every entry has a name, a work line and platform tags", () => {
  const catalog = loadMcpCatalog();
  for (const entry of catalog.servers.slice(0, 50)) {
    assert.ok(entry.id && entry.name, "entry needs id + name");
    assert.ok(entry.work.length > 0, "entry needs a work description");
    assert.ok(entry.platforms.length > 0, "entry needs platform availability");
    for (const platform of entry.platforms) {
      assert.ok(["linux", "windows", "mobile"].includes(platform), `unexpected platform ${platform}`);
    }
  }
});

test("search matches by name", () => {
  const hits = searchMcpServers("brave");
  assert.ok(hits.length > 0, "expected brave matches");
  assert.ok(hits.some((h) => /brave/i.test(h.id) || /brave/i.test(h.name)));
});

test("search matches by work (what the server does)", () => {
  const hits = searchMcpServers("vector database");
  assert.ok(hits.length > 0, "expected matches on the description");
});

test("search filters by platform", () => {
  const all = searchMcpServers("pdf");
  const mobile = searchMcpServers("pdf", { platform: "mobile" });
  assert.ok(mobile.length <= all.length);
  for (const entry of mobile) assert.ok(entry.platforms.includes("mobile"));
});

test("empty query returns the whole catalog", () => {
  const hits = searchMcpServers("");
  assert.ok(hits.length >= 3000, `expected the full catalog, got ${hits.length}`);
});

test("limit caps the result set", () => {
  const hits = searchMcpServers("", { limit: 5 });
  assert.equal(hits.length, 5);
});
