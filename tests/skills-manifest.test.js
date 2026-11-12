const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildManifest, readSkillFile, SKILL_BYTE_LIMIT } = require("../dist/skills/manifest");
const { validateSkillDir, validateAll } = require("../dist/skills/validate");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeSkill(root, folder, skillMd, extraFiles = {}) {
  const dir = path.join(root, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), skillMd);
  for (const [relative, content] of Object.entries(extraFiles)) {
    const file = path.join(dir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
}

const DEMO_SKILL_MD = [
  "---",
  "name: demo-skill",
  "description: Use when you need the demo flow.",
  "when_to_use: demo time",
  "triggers: demo, sample",
  "---",
  "",
  "# Demo Skill",
  "",
  "## Overview",
  "",
  "The demo skill explains the demo.",
  "",
  "## Steps",
  "",
  "1. run the demo",
  "",
].join("\n");

test("buildManifest summarizes a skill folder without reading the heavy parts", () => {
  const root = tempDir("xminal-manifest-");
  const skillDir = writeSkill(root, "demo-skill", DEMO_SKILL_MD, {
    "references/a.md": "reference body",
    "scripts/x.sh": "#!/bin/sh\necho hi\n",
    "templates/t.md": "template body",
  });

  const manifest = buildManifest(skillDir, "demo-skill");

  assert.equal(manifest.name, "demo-skill");
  assert.equal(manifest.description, "Use when you need the demo flow.");
  assert.equal(manifest.whenToUse, "demo time");
  assert.deepEqual(manifest.triggers, ["demo", "sample"]);
  assert.deepEqual(manifest.sections, ["Overview", "Steps"]);
  assert.deepEqual(manifest.references, ["references/a.md"]);
  assert.deepEqual(manifest.scripts, ["scripts/x.sh"]);
  assert.deepEqual(manifest.templates, ["templates/t.md"]);
  assert.equal(manifest.bytes, Buffer.byteLength(DEMO_SKILL_MD, "utf8"));
  assert.equal(manifest.truncated, false);
});

test("buildManifest flags a SKILL.md that reached the size cap", () => {
  const root = tempDir("xminal-manifest-big-");
  const filler = "x".repeat(25_000);
  const skillDir = writeSkill(root, "big-skill", `---\nname: big-skill\ndescription: Use when big.\n---\n\n${filler}\n`);

  const manifest = buildManifest(skillDir, "big-skill");

  assert.equal(manifest.truncated, true);
  assert.ok(manifest.bytes >= SKILL_BYTE_LIMIT);
  assert.ok(manifest.bytes >= 25_000);
});

test("readSkillFile reads inside the skill folder and refuses to escape it", () => {
  const root = tempDir("xminal-manifest-read-");
  const skillDir = writeSkill(root, "demo-skill", DEMO_SKILL_MD, { "references/a.md": "reference body" });

  const ok = readSkillFile(skillDir, "references/a.md");
  assert.deepEqual(ok, { content: "reference body" });

  const escape = readSkillFile(skillDir, "../../etc/passwd");
  assert.ok(escape.error, "expected an error for a path outside the skill folder");
  assert.equal(escape.content, undefined);
  assert.match(escape.error, /outside the skill folder/);

  const absolute = readSkillFile(skillDir, "/etc/passwd");
  assert.ok(absolute.error);
  assert.equal(absolute.content, undefined);

  const missing = readSkillFile(skillDir, "references/nope.md");
  assert.ok(missing.error);
  assert.equal(missing.content, undefined);
});

test("readSkillFile refuses a symlink that points out of the skill folder", () => {
  const root = tempDir("xminal-manifest-link-");
  const skillDir = writeSkill(root, "demo-skill", DEMO_SKILL_MD, { "references/a.md": "reference body" });
  const outside = path.join(root, "outside.md");
  fs.writeFileSync(outside, "secret");
  fs.symlinkSync(outside, path.join(skillDir, "references", "escape.md"));

  const escaped = readSkillFile(skillDir, "references/escape.md");
  assert.ok(escaped.error);
  assert.equal(escaped.content, undefined);
});

const BROKEN_SKILL_MD = [
  "---",
  "name: other-name",
  "description: Does the thing.",
  "---",
  "",
  "# Broken",
  "",
  "See references/missing.md and run scripts/missing.sh.",
  "",
].join("\n");

const BROKEN_CODES = [
  "bad-name-charset",
  "description-not-use-when",
  "dev-file-in-skill",
  "missing-reference",
  "missing-script",
  "name-mismatch",
];

test("validateSkillDir reports every defect of a broken skill", () => {
  const root = tempDir("xminal-validate-broken-");
  const skillDir = writeSkill(root, "broken_skill", BROKEN_SKILL_MD, { "test-foo.md": "scratch" });

  const issues = validateSkillDir(skillDir);
  const codes = issues.map((issue) => issue.code).sort();

  assert.deepEqual(codes, BROKEN_CODES);
  assert.equal(issues.length, BROKEN_CODES.length);
  for (const issue of issues) {
    assert.equal(issue.skill, "broken_skill");
    assert.ok(issue.message.length > 0);
    assert.ok(issue.path.length > 0);
    assert.ok(issue.severity === "error" || issue.severity === "warn");
  }
  assert.equal(issues.find((issue) => issue.code === "dev-file-in-skill").severity, "error");
  assert.equal(issues.find((issue) => issue.code === "name-mismatch").severity, "warn");
});

test("validateSkillDir says nothing about a clean skill", () => {
  const root = tempDir("xminal-validate-clean-");
  const skillDir = writeSkill(
    root,
    "clean-skill",
    [
      "---",
      "name: clean-skill",
      "description: Use when you need a clean example.",
      "---",
      "",
      "# Clean",
      "",
      "Do the thing. See references/a.md for details.",
      "",
    ].join("\n"),
    { "references/a.md": "reference body" },
  );

  assert.deepEqual(validateSkillDir(skillDir), []);
});

test("a description that does not start with Use when is a warning", () => {
  const root = tempDir("xminal-validate-desc-");
  const skillDir = writeSkill(
    root,
    "plain-skill",
    "---\nname: plain-skill\ndescription: Handles the plain flow.\n---\n\n# Plain\n\nDo it.\n",
  );

  const issues = validateSkillDir(skillDir);
  const warn = issues.find((issue) => issue.code === "description-not-use-when");
  assert.ok(warn, "expected a description-not-use-when issue");
  assert.equal(warn.severity, "warn");
});

test("a development file inside the skill folder is an error", () => {
  const root = tempDir("xminal-validate-dev-");
  const skillDir = writeSkill(
    root,
    "dev-skill",
    "---\nname: dev-skill\ndescription: Use when dev files leak in.\n---\n\n# Dev\n\nDo it.\n",
    { "test-foo.md": "scratch", "CREATION-LOG.md": "log" },
  );

  const issues = validateSkillDir(skillDir);
  const devIssues = issues.filter((issue) => issue.code === "dev-file-in-skill");
  assert.equal(devIssues.length, 2);
  assert.equal(devIssues[0].severity, "error");
});

test("a body that points at a missing reference file warns", () => {
  const root = tempDir("xminal-validate-ref-");
  const skillDir = writeSkill(
    root,
    "ref-skill",
    "---\nname: ref-skill\ndescription: Use when a reference is missing.\n---\n\n# Ref\n\nSee references/gone.md.\n",
  );

  const issues = validateSkillDir(skillDir);
  const missing = issues.find((issue) => issue.code === "missing-reference");
  assert.ok(missing, "expected a missing-reference issue");
  assert.equal(missing.severity, "warn");
  assert.match(missing.path, /gone\.md$/);
});

test("the remaining lint rules fire on their own defect", () => {
  const root = tempDir("xminal-validate-rules-");

  const noFrontmatter = writeSkill(root, "no-frontmatter", "# Title\n\nSome body.\n");
  const codes = (dir) => validateSkillDir(dir).map((issue) => issue.code);
  assert.ok(codes(noFrontmatter).includes("missing-frontmatter"));

  const emptyBody = writeSkill(
    root,
    "empty-body",
    "---\nname: empty-body\ndescription: Use when the body is empty.\n---\n",
  );
  assert.ok(codes(emptyBody).includes("empty-body"));

  const longDescription = writeSkill(
    root,
    "long-description",
    `---\nname: long-description\ndescription: Use when ${"a".repeat(600)}\n---\n\n# Long\n\nBody.\n`,
  );
  assert.ok(codes(longDescription).includes("description-too-long"));

  const longFrontmatter = writeSkill(
    root,
    "long-frontmatter",
    `---\nname: long-frontmatter\ndescription: Use when the frontmatter is long.\nextra: ${"b".repeat(1200)}\n---\n\n# Long\n\nBody.\n`,
  );
  assert.ok(codes(longFrontmatter).includes("frontmatter-too-long"));

  const tooLarge = writeSkill(
    root,
    "too-large",
    `---\nname: too-large\ndescription: Use when the skill is huge.\n---\n\n# Big\n\n${"c".repeat(25_000)}\n`,
  );
  assert.ok(codes(tooLarge).includes("skill-too-large"));
});

test("validateAll walks a root of skills and keeps the broken ones visible", () => {
  const cwd = tempDir("xminal-validate-all-");
  const root = path.join(cwd, "skills");
  fs.mkdirSync(root, { recursive: true });
  writeSkill(root, "broken_skill", BROKEN_SKILL_MD, { "test-foo.md": "scratch" });
  writeSkill(
    root,
    "clean-skill",
    "---\nname: clean-skill\ndescription: Use when you need a clean example.\n---\n\n# Clean\n\nDo it.\n",
  );
  fs.mkdirSync(path.join(root, "not-a-skill"), { recursive: true });

  const report = validateAll(cwd, ["skills"]);

  assert.equal(report.skills, 2);
  assert.equal(report.ok, false);
  const brokenIssues = report.issues.filter((issue) => issue.skill === "broken_skill");
  assert.deepEqual(brokenIssues.map((issue) => issue.code).sort(), BROKEN_CODES);
  assert.equal(report.issues.some((issue) => issue.skill === "clean-skill"), false);
  assert.equal(report.issues.some((issue) => issue.skill === "not-a-skill"), false);
});
