// secret-scan: allow
/**
 * The spec artifacts: the store on disk, the parsers, the traceability
 * analysis, the clarification session and the constitution.
 *
 * Everything runs offline against a temporary directory.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createFeature,
  resolveFeature,
  setCurrentFeature,
  readArtifact,
  writeArtifact,
  listFeatures,
  shortName,
  featuresDir,
  currentFeaturePath,
} = require("../dist/core/spec/store");
const { SPEC_TEMPLATE, PLAN_TEMPLATE, TASKS_TEMPLATE } = require("../dist/core/spec/templates");
const { parseRequirements, parseTasks, parseUserStories, extractTask } = require("../dist/core/spec/parse");
const { analyzeCoverage, renderCoverageReport } = require("../dist/core/spec/coverage");
const { scanCoverage, selectQuestions, integrateAnswer, renderQuestion } = require("../dist/core/spec/clarify");
const {
  loadConstitution,
  bumpVersion,
  renderConstitutionForPrompt,
  checkConstitution,
} = require("../dist/core/spec/constitution");

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ── fixtures ──────────────────────────────────────────────────────────

const SPEC_FIXTURE = `# Feature Specification: User auth

## User Scenarios & Testing

### User Story 1 - Password login (Priority: P1)

**Why this priority**: it unlocks the product
**Independent Test**: log in with a valid account
**Acceptance Scenarios**

1. **Given** a registered user, **When** they submit valid credentials, **Then** the session starts
2. **Given** a wrong password, **When** they submit it, **Then** the login fails

### Edge Cases

- The account is locked after three failures

## Requirements

- **FR-001** [US1]: System MUST validate the session token before it serves a request
- **FR-002** [US1]: System MUST record a failed login attempt in the audit log

## Success Criteria

- **SC-001**: Every acceptance scenario passes in CI

## Assumptions

- The user store already exists
`;

const TASKS_FIXTURE = `# Tasks

## Phase 1

- [ ] T001 [P] [US1] Validate the session token in src/auth/token.ts
- [ ] T002 [US1] Record the failed login attempt in src/auth/audit.ts
- [x] T003 [P] [US2] Polish the README in README.md
`;

const COVERAGE_SPEC = `# Feature Specification: Session tokens

## User Scenarios & Testing

### User Story 1 - Token validation (Priority: P1)

**Acceptance Scenarios**

1. **Given** a request with a token, **When** the handler runs, **Then** an expired token is rejected

### Edge Cases

- The clock is wrong

## Requirements

- **FR-001** [US1]: System MUST validate the session token before it serves a request
- **FR-002** [US1]: System MUST expire an idle session after 30 minutes
- **FR-003**: System MUST [NEEDS CLARIFICATION: which providers are supported?] send a password reset email
- **FR-004**: System MUST record every rejected request
- **FR-005**: System MUST validate the session token before it serves a request

## Success Criteria

- **SC-001**: The token check runs on every request
`;

const COVERAGE_TASKS = `# Tasks

## Phase 1

- [ ] T001 [P] [US1] Validate the session token in src/auth/token.ts
- [ ] T002 [US1] Polish the readme in README.md
`;

const CONSTITUTION_FIXTURE = `# Project Constitution
**Version**: 1.0.0 | **Ratified**: 2026-11-12 | **Last Amended**: 2026-11-12

## Core Principles

### I. Offline-First
- MUST: Every capability works without network access.
- MUST NOT: Add a runtime dependency without a maintainer decision.
- SHOULD: Keep the offline path the default.

### II. Tested-Code
- MUST: Every change ships with a test.
- MUST NOT: Commit a credential file.
`;

// ── the store ─────────────────────────────────────────────────────────

test("createFeature makes the first feature 001- and writes the templates", () => {
  const dir = tmpDir("xminal-spec-");
  try {
    const { paths, created } = createFeature(dir, "Implement OAuth2 for the API");
    assert.equal(created, true);
    assert.equal(path.basename(paths.dir), "001-oauth2-api-implementation");
    assert.equal(path.basename(paths.spec), "spec.md");
    assert.equal(path.basename(paths.plan), "plan.md");
    assert.equal(path.basename(paths.tasks), "tasks.md");
    assert.equal(path.basename(paths.clarify), "clarify.json");

    assert.equal(fs.readFileSync(paths.spec, "utf8"), SPEC_TEMPLATE);
    assert.equal(fs.readFileSync(paths.plan, "utf8"), PLAN_TEMPLATE);
    assert.equal(fs.readFileSync(paths.tasks, "utf8"), TASKS_TEMPLATE);
    assert.ok(fs.existsSync(paths.clarify));

    const current = JSON.parse(fs.readFileSync(currentFeaturePath(dir), "utf8"));
    assert.equal(current.feature_directory, "001-oauth2-api-implementation");
    assert.equal(current.title, "oauth2-api-implementation");
    assert.ok(current.created);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a second feature gets 002-", () => {
  const dir = tmpDir("xminal-spec-");
  try {
    createFeature(dir, "Implement OAuth2 for the API");
    const second = createFeature(dir, "Add a user login screen");
    assert.equal(path.basename(second.paths.dir), "002-add-user-login-screen");
    assert.equal(second.created, true);
    assert.deepEqual(listFeatures(dir), ["001-oauth2-api-implementation", "002-add-user-login-screen"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the same title twice is idempotent and does not clobber", () => {
  const dir = tmpDir("xminal-spec-");
  try {
    const first = createFeature(dir, "Implement OAuth2 for the API");
    fs.writeFileSync(first.paths.spec, "hand written spec\n", "utf8");

    const again = createFeature(dir, "Implement OAuth2 for the API");
    assert.equal(again.created, false);
    assert.equal(again.paths.dir, first.paths.dir);
    assert.equal(fs.readFileSync(first.paths.spec, "utf8"), "hand written spec\n");
    assert.deepEqual(listFeatures(dir), ["001-oauth2-api-implementation"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveFeature reads current.json and returns undefined when it is missing", () => {
  const dir = tmpDir("xminal-spec-");
  try {
    assert.equal(resolveFeature(dir), undefined);

    fs.mkdirSync(featuresDir(dir), { recursive: true });
    fs.writeFileSync(
      currentFeaturePath(dir),
      JSON.stringify({ feature_directory: "007-demo", created: "2026-11-12T00:00:00.000Z", title: "demo" }),
      "utf8",
    );
    const resolved = resolveFeature(dir);
    assert.ok(resolved);
    assert.equal(path.basename(resolved.dir), "007-demo");

    // a broken current.json is not a crash
    fs.writeFileSync(currentFeaturePath(dir), "{not json", "utf8");
    assert.equal(resolveFeature(dir), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("setCurrentFeature points the project at a feature", () => {
  const dir = tmpDir("xminal-spec-");
  try {
    createFeature(dir, "Implement OAuth2 for the API");
    createFeature(dir, "Add a user login screen");
    setCurrentFeature(dir, "001-oauth2-api-implementation");
    assert.equal(path.basename(resolveFeature(dir).dir), "001-oauth2-api-implementation");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("write/read round-trip is byte-identical", () => {
  const dir = tmpDir("xminal-spec-");
  try {
    const { paths } = createFeature(dir, "Implement OAuth2 for the API");
    const content = "# spec\n\n- **FR-001**: System MUST validate the token ✅\n\n";
    const file = writeArtifact(dir, "spec", content);
    assert.equal(file, paths.spec);
    assert.equal(readArtifact(dir, "spec"), content);
    assert.equal(fs.readFileSync(paths.spec, "utf8"), content);

    writeArtifact(dir, "plan", "plan body");
    writeArtifact(dir, "tasks", "tasks body");
    assert.equal(readArtifact(dir, "plan"), "plan body");
    assert.equal(readArtifact(dir, "tasks"), "tasks body");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("shortName drops the stop words and keeps the feature readable", () => {
  assert.equal(shortName("Implement OAuth2 for the API"), "oauth2-api-implementation");
  assert.equal(shortName("Add a user login screen"), "add-user-login-screen");
  assert.equal(shortName("Fix the flaky parser"), "fix-flaky-parser");
});

// ── the parsers ───────────────────────────────────────────────────────

test("parseRequirements reads the ids, the text and the story", () => {
  const requirements = parseRequirements(SPEC_FIXTURE);
  assert.deepEqual(requirements.map((requirement) => requirement.id), ["FR-001", "FR-002", "SC-001"]);
  assert.equal(requirements[0].kind, "FR");
  assert.equal(requirements[0].story, "US1");
  assert.equal(requirements[0].text, "System MUST validate the session token before it serves a request");
  assert.equal(requirements[2].kind, "SC");
  assert.equal(requirements[2].text, "Every acceptance scenario passes in CI");
});

test("parseUserStories reads the story, its priority and its acceptance scenarios", () => {
  const stories = parseUserStories(SPEC_FIXTURE);
  assert.equal(stories.length, 1);
  assert.equal(stories[0].id, "US1");
  assert.equal(stories[0].title, "Password login");
  assert.equal(stories[0].priority, "P1");
  assert.equal(stories[0].acceptance.length, 2);
  assert.ok(stories[0].acceptance[0].startsWith("Given a registered user"));
  assert.ok(stories[0].acceptance[0].endsWith("the session starts"));
  assert.ok(stories[0].acceptance[1].includes("Then the login fails"));
});

test("parseTasks reads the id, the markers, the text and the files", () => {
  const tasks = parseTasks(TASKS_FIXTURE);
  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].id, "T001");
  assert.equal(tasks[0].parallel, true);
  assert.equal(tasks[0].story, "US1");
  assert.equal(tasks[0].text, "Validate the session token");
  assert.deepEqual(tasks[0].files, ["src/auth/token.ts"]);
  assert.equal(tasks[1].parallel, false);
  assert.deepEqual(tasks[1].files, ["src/auth/audit.ts"]);
  assert.equal(tasks[2].id, "T003");
});

test("extractTask returns the verbatim block of one task", () => {
  const block = extractTask(TASKS_FIXTURE, "T001");
  assert.ok(block.startsWith("- [ ] T001 [P] [US1] Validate the session token"));
  assert.ok(!block.includes("T002"));
  assert.equal(extractTask(TASKS_FIXTURE, "T404"), undefined);

  const withNote = "- [ ] T010 [US1] Do the thing in src/a.ts\n  - note: keep it small\n- [ ] T011 [US1] Other in src/b.ts\n";
  const note = extractTask(withNote, "T010");
  assert.ok(note.includes("- note: keep it small"));
  assert.ok(!note.includes("T011"));
});

// ── coverage ──────────────────────────────────────────────────────────

test("analyzeCoverage maps the requirements to the tasks and reports the gaps", () => {
  const analysis = analyzeCoverage({ spec: COVERAGE_SPEC, tasks: COVERAGE_TASKS });

  assert.equal(analysis.metrics.totalRequirements, 6);
  assert.equal(analysis.metrics.totalTasks, 2);
  assert.equal(analysis.metrics.coveragePct, 17);
  assert.ok(analysis.metrics.critical >= 1);

  const row = analysis.rows.find((candidate) => candidate.requirementId === "FR-002");
  assert.ok(row);
  assert.equal(row.hasTask, false);
  assert.deepEqual(row.taskIds, []);

  const covered = analysis.rows.find((candidate) => candidate.requirementId === "FR-001");
  assert.equal(covered.hasTask, true);
  assert.deepEqual(covered.taskIds, ["T001"]);
  assert.ok(covered.note.includes("keyword match"));

  const coverageGap = analysis.gaps.find((gap) => gap.id === "GAP-COVERAGE-FR-002");
  assert.ok(coverageGap);
  assert.equal(coverageGap.category, "coverage");
  assert.equal(coverageGap.severity, "critical"); // FR-002 belongs to the P1 story

  const ambiguity = analysis.gaps.find((gap) => gap.category === "ambiguity");
  assert.ok(ambiguity);
  assert.equal(ambiguity.severity, "high");
  assert.ok(ambiguity.summary.includes("NEEDS CLARIFICATION"));

  const unrequested = analysis.gaps.find((gap) => gap.category === "unrequested");
  assert.ok(unrequested);
  assert.equal(unrequested.severity, "medium");
  assert.ok(unrequested.locations.join(",").includes("T002"));

  const duplication = analysis.gaps.find((gap) => gap.category === "duplication");
  assert.ok(duplication);
  assert.equal(duplication.severity, "medium");
  assert.ok(duplication.locations.includes("spec.md:FR-001"));
  assert.ok(duplication.locations.includes("spec.md:FR-005"));
});

test("renderCoverageReport is deterministic", () => {
  const analysis = analyzeCoverage({ spec: COVERAGE_SPEC, tasks: COVERAGE_TASKS });
  const first = renderCoverageReport(analysis);
  const second = renderCoverageReport(analysis);
  assert.equal(first, second);
  assert.ok(first.includes("| FR-001 |"));
  assert.ok(first.includes("| GAP-COVERAGE-FR-002 |"));
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:/.test(first));
});

// ── the clarification session ─────────────────────────────────────────

test("scanCoverage reports the twelve categories", () => {
  const entries = scanCoverage(SPEC_FIXTURE);
  assert.equal(entries.length, 12);
  const names = entries.map((entry) => entry.category);
  for (const expected of [
    "functional scope",
    "domain/data model",
    "interaction/UX",
    "non-functional",
    "integrations",
    "edge cases",
    "constraints",
    "terminology",
    "completion signals",
    "security/privacy",
    "performance",
    "observability",
  ]) {
    assert.ok(names.includes(expected), `missing category ${expected}`);
  }
  for (const entry of entries) {
    assert.ok(["clear", "partial", "missing"].includes(entry.status));
    assert.ok(entry.detail.length > 0);
  }
});

test("selectQuestions asks one question per unresolved category, at most five", () => {
  const questions = selectQuestions(SPEC_FIXTURE, 5);
  assert.ok(questions.length > 0);
  assert.ok(questions.length <= 5);
  assert.equal(new Set(questions.map((question) => question.topic)).size, questions.length);

  const status = new Map(scanCoverage(SPEC_FIXTURE).map((entry) => [entry.category, entry.status]));
  for (const question of questions) {
    assert.notEqual(status.get(question.topic), "clear");
    assert.ok(question.options.includes(question.recommended));
    assert.ok(question.question.endsWith("?"));
  }

  const rendered = renderQuestion(questions[0]);
  assert.ok(rendered.includes("**Question:**"));
  assert.ok(rendered.includes("**Recommended:**"));
  assert.ok(rendered.includes("| Option | Choice |"));
});

test("integrateAnswer is pure, records the answer and removes the marker", () => {
  const spec = "# Spec\n\n## Requirements\n\n- **FR-001**: System MUST [NEEDS CLARIFICATION: which providers?] send the email\n";
  const before = spec;
  const question = {
    id: "Q1",
    topic: "functional scope",
    question: "Which part of the request is inside the scope?",
    options: ["Only the happy path", "Everything"],
    recommended: "Only the happy path",
    section: "## Requirements",
    sessionDate: "2026-11-12",
  };

  const result = integrateAnswer(spec, question, "Only the happy path");
  assert.equal(spec, before); // the input is never touched
  assert.equal(result.changed, true);
  assert.notEqual(result.spec, spec);
  assert.ok(!result.spec.includes("[NEEDS CLARIFICATION:"));
  assert.ok(result.spec.includes("Only the happy path"));
  assert.ok(result.spec.includes("## Clarifications"));
  assert.ok(result.spec.includes("### Session 2026-11-12"));
  assert.ok(result.spec.includes("- Q: Which part of the request is inside the scope? → A: Only the happy path"));

  // a second answer does not create a second Clarifications section
  const second = integrateAnswer(result.spec, question, "Everything");
  assert.equal((second.spec.match(/^## Clarifications$/gm) || []).length, 1);
  assert.ok(second.spec.includes("### Session 2026-11-12"));
});

// ── the constitution ──────────────────────────────────────────────────

test("loadConstitution parses the version and the principles", () => {
  const dir = tmpDir("xminal-spec-");
  try {
    assert.equal(loadConstitution(dir), undefined);

    fs.mkdirSync(path.join(dir, ".xminal"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".xminal", "constitution.md"), CONSTITUTION_FIXTURE, "utf8");

    const constitution = loadConstitution(dir);
    assert.ok(constitution);
    assert.equal(constitution.version, "1.0.0");
    assert.equal(constitution.ratified, "2026-11-12");
    assert.equal(constitution.lastAmended, "2026-11-12");
    assert.equal(constitution.isTemplate, false);
    assert.equal(constitution.principles.length, 2);
    assert.equal(constitution.principles[0].id, "I");
    assert.equal(constitution.principles[0].title, "Offline-First");
    assert.deepEqual(constitution.principles[0].must, ["Every capability works without network access."]);
    assert.deepEqual(constitution.principles[0].should, ["Keep the offline path the default."]);
    assert.deepEqual(constitution.principles[0].mustNot, ["Add a runtime dependency without a maintainer decision."]);
    assert.equal(constitution.principles[1].title, "Tested-Code");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bumpVersion raises the version", () => {
  assert.equal(bumpVersion("1.2.3", "patch"), "1.2.4");
  assert.equal(bumpVersion("1.2.3", "minor"), "1.3.0");
  assert.equal(bumpVersion("1.2.3", "major"), "2.0.0");
  assert.equal(bumpVersion("v1.2.3", "minor"), "v1.3.0");
  assert.equal(bumpVersion("not-a-version", "patch"), "not-a-version");
});

test("renderConstitutionForPrompt puts the MUST rules first and stays bounded", () => {
  const dir = tmpDir("xminal-spec-");
  try {
    fs.mkdirSync(path.join(dir, ".xminal"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".xminal", "constitution.md"), CONSTITUTION_FIXTURE, "utf8");
    const constitution = loadConstitution(dir);

    const full = renderConstitutionForPrompt(constitution, 1000);
    assert.ok(full.indexOf("MUST:") < full.indexOf("MUST NOT:"));
    assert.ok(full.indexOf("MUST NOT:") < full.indexOf("SHOULD:"));

    const bounded = renderConstitutionForPrompt(constitution, 120);
    assert.ok(bounded.length <= 120);
    assert.ok(bounded.endsWith("…[truncated]"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("checkConstitution flags a dependency manifest change as critical", () => {
  const dir = tmpDir("xminal-spec-");
  try {
    fs.mkdirSync(path.join(dir, ".xminal"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".xminal", "constitution.md"), CONSTITUTION_FIXTURE, "utf8");
    const constitution = loadConstitution(dir);

    const findings = checkConstitution(constitution, ["package.json"]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, "critical");
    assert.equal(findings[0].file, "package.json");
    assert.equal(findings[0].principle, "Offline-First");
    assert.ok(findings[0].message.includes("dependency"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("checkConstitution flags secrets, missing tests and new network calls", () => {
  const dir = tmpDir("xminal-spec-");
  try {
    fs.mkdirSync(path.join(dir, ".xminal"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".xminal", "constitution.md"), CONSTITUTION_FIXTURE, "utf8");
    const constitution = loadConstitution(dir);

    const secret = checkConstitution(constitution, [".env"]);
    assert.equal(secret.length, 1);
    assert.equal(secret[0].severity, "critical");

    const withoutTest = checkConstitution(constitution, ["src/core/a.ts"]);
    assert.equal(withoutTest.length, 1);
    assert.equal(withoutTest[0].severity, "major");

    const withTest = checkConstitution(constitution, ["src/core/a.ts", "tests/a.test.js"]);
    assert.equal(withTest.length, 0);

    const diff = [
      "diff --git a/src/net.ts b/src/net.ts",
      "--- a/src/net.ts",
      "+++ b/src/net.ts",
      "@@ -1 +1 @@",
      "+const res = await fetch(url);",
    ].join("\n");
    const withNetwork = checkConstitution(constitution, ["src/net.ts"], diff);
    const network = withNetwork.find((finding) => finding.severity === "minor");
    assert.ok(network);
    assert.equal(network.file, "src/net.ts");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
