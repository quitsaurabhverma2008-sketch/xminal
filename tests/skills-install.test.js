const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { installSkill } = require("../dist/skills/install");
const { SkillRegistry } = require("../dist/skills/loader");

test("skills install copies a local skill folder into the project", () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-skill-src-"));
  const skillDir = path.join(src, "demo-skill");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    "---\nname: demo-skill\ndescription: demo installed skill\n---\n\n# Demo\n",
  );

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-skill-dest-"));
  const result = installSkill(cwd, skillDir);
  assert.equal(result.name, "demo-skill");
  assert.equal(result.source, "folder");
  assert.ok(fs.existsSync(path.join(result.destination, "SKILL.md")));

  const registry = new SkillRegistry(cwd);
  const found = registry.list().find((skill) => skill.name === "demo-skill");
  assert.ok(found);
  assert.equal(found.source, "project");
});

test("skills install fails honestly for a folder without SKILL.md", () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-skill-bad-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-skill-dest-"));
  assert.throws(() => installSkill(cwd, src), /No SKILL\.md/);
});
