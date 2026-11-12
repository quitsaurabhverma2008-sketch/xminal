// Offline skills.sh catalog tests — no network.
const test = require("node:test");
const assert = require("node:assert");

const { loadSkillsCatalog, searchSkillsCatalog, skillsCatalogMeta } = require("../dist/skills/catalog");

test("skills catalog ships with 20,000 skills", () => {
  const catalog = loadSkillsCatalog();
  assert.ok(catalog, "catalog should be present (data/skills-catalog.json → dist/data)");
  assert.ok(catalog.count >= 20000, `expected 20,000 skills, got ${catalog.count}`);
});

test("every entry has an owner/repo/skill id and a skills.sh URL", () => {
  const catalog = loadSkillsCatalog();
  for (const entry of catalog.skills.slice(0, 200)) {
    assert.match(entry.id, /^[^/\s]+\/[^/\s]+\/[^/\s]+$/, `bad id: ${entry.id}`);
    assert.equal(entry.url, `https://skills.sh/${entry.id}`);
    assert.equal(entry.id, `${entry.owner}/${entry.repo}/${entry.name}`);
    assert.ok(entry.name.length > 0 && entry.owner.length > 0 && entry.repo.length > 0);
  }
});

test("search lands on the mattpocock tdd skill by name", () => {
  const hits = searchSkillsCatalog("tdd", { limit: 10 });
  assert.ok(hits.length > 0, "expected tdd matches");
  assert.ok(hits.some((h) => h.name === "tdd"));
});

test("search finds skills by owner/repo", () => {
  const hits = searchSkillsCatalog("mattpocock");
  assert.ok(hits.length > 0);
  assert.ok(hits.every((h) => /mattpocock/i.test(h.id)));
  assert.ok(hits.some((h) => h.name === "tdd"));
});

test("exact name match ranks first", () => {
  const hits = searchSkillsCatalog("grill-me", { limit: 5 });
  assert.equal(hits[0].name, "grill-me");
});

test("limit caps the result set", () => {
  assert.equal(searchSkillsCatalog("", { limit: 5 }).length, 5);
  assert.equal(searchSkillsCatalog("a", { limit: 7 }).length, 7);
});

test("empty query lists the catalog rather than nothing", () => {
  const hits = searchSkillsCatalog("", { limit: 100 });
  assert.equal(hits.length, 100);
});

test("meta reports count and fetch date", () => {
  const meta = skillsCatalogMeta();
  assert.ok(meta);
  assert.ok(meta.count >= 20000);
  assert.ok(typeof meta.fetchedAt === "string" && meta.fetchedAt.length > 0);
});
