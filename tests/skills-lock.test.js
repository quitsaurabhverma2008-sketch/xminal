const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { verifySkills, writeSkillsLock } = require("../dist/skills/loader");

function makeSkill(cwd, name, body) {
  const dir = path.join(cwd, ".xminal", "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${body}\n---\n\n# ${name}\n\n${body}\n`);
}

test("skills lock detects added, changed and removed skills", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-skills-"));
  makeSkill(cwd, "alpha", "version one");

  const locked = writeSkillsLock(cwd);
  assert.equal(locked, 1);

  let result = verifySkills(cwd);
  assert.equal(result.ok, true);
  assert.equal(result.total, 1);

  fs.writeFileSync(path.join(cwd, ".xminal", "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: version two\n---\n\n# alpha\n\nversion two\n");
  result = verifySkills(cwd);
  assert.equal(result.ok, false);
  assert.deepEqual(result.changed, ["alpha"]);

  writeSkillsLock(cwd);
  makeSkill(cwd, "beta", "new skill");
  result = verifySkills(cwd);
  assert.deepEqual(result.added, ["beta"]);

  fs.rmSync(path.join(cwd, ".xminal", "skills", "alpha"), { recursive: true, force: true });
  result = verifySkills(cwd);
  assert.deepEqual(result.removed, ["alpha"]);
});
