const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { MemoryStore } = require("../dist/memory/store");
const { SkillRegistry } = require("../dist/skills/loader");

function tempCwd() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "xminal-test-"));
}

test("memory add, search, list, forget", () => {
  const cwd = tempCwd();
  const memory = new MemoryStore(cwd);
  const entry = memory.add("prefer small focused diffs", ["style"], "project");
  assert.ok(memory.search("focused").some((result) => result.id === entry.id));
  assert.equal(memory.list("project").length, 1);
  assert.equal(memory.forget(entry.id), true);
  assert.equal(memory.list("project").length, 0);
});

test("skills are discovered and loaded from project .xminal/skills", () => {
  const cwd = tempCwd();
  const dir = path.join(cwd, ".xminal", "skills", "demo-skill");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    "---\nname: demo-skill\ndescription: Use when testing the demo flow.\n---\n\n# Demo\n\nDo the demo.\n",
  );
  const registry = new SkillRegistry(cwd);
  const demo = registry.list().find((skill) => skill.name === "demo-skill");
  assert.ok(demo);
  assert.equal(demo.source, "project");
  assert.match(registry.load("demo-skill"), /Demo/);
});

test("todo persistence lives under .xminal", () => {
  const cwd = tempCwd();
  const file = path.join(cwd, ".xminal", "todos.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify([{ id: "abc", text: "ship", status: "pending", priority: "high" }]));
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(raw[0].text, "ship");
});
