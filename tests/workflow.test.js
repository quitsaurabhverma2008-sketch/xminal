// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadProjectBrief, renderProjectBrief, detectProjectCommands } = require("../dist/core/project-context");
const { analyzeRequest } = require("../dist/core/requirements");
const {
  newWorkflowState,
  noteTool,
  noteVerified,
  noteReviewed,
  currentPhase,
  renderWorkflow,
} = require("../dist/core/workflow");
const { runVerify, renderVerifyResult, verifySummary, resolveVerifyCommand } = require("../dist/core/verify-runner");

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ── project context ────────────────────────────────────────────────────
test("the project brief detects the project's own commands", () => {
  const dir = tmpDir("xminal-ctx-");
  try {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { test: "node --test", build: "tsc" } }));
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "# rules");
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, "src", "a.ts"), "export const a = 1;");
    fs.writeFileSync(path.join(dir, "src", "b.ts"), "export const b = 2;");
    const brief = loadProjectBrief(dir);
    assert.equal(brief.testCommand, "npm test");
    assert.equal(brief.buildCommand, "npm run build");
    assert.equal(brief.verifyCommand, "npm test && npm run build");
    assert.deepEqual(brief.instructionFiles, ["AGENTS.md"]);
    assert.equal(brief.language, "TypeScript");
    const rendered = renderProjectBrief(brief);
    assert.ok(rendered.includes("AGENTS.md"));
    assert.ok(rendered.includes("npm test"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a configured verify command wins over the detected one", () => {
  const dir = tmpDir("xminal-ctx2-");
  try {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
    assert.equal(resolveVerifyCommand(dir, "  make check  "), "make check");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("rust and go projects get their own commands", () => {
  const dir = tmpDir("xminal-ctx3-");
  try {
    fs.writeFileSync(path.join(dir, "Cargo.toml"), "[package]");
    assert.equal(detectProjectCommands(dir).test, "cargo test");
    fs.rmSync(path.join(dir, "Cargo.toml"));
    fs.writeFileSync(path.join(dir, "go.mod"), "module x");
    assert.equal(detectProjectCommands(dir).test, "go test ./...");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── requirements ───────────────────────────────────────────────────────
test("a clear request produces a brief with acceptance and verification", () => {
  const brief = analyzeRequest("fix the crash in src/parser.ts when the input is empty", { verifyCommand: "npm test" });
  assert.equal(brief.kind, "fix");
  assert.equal(brief.ambiguity, "none");
  assert.ok(brief.acceptance.length > 0);
  assert.ok(brief.verification.some((v) => v.includes("npm test")));
  assert.ok(brief.summary.includes("Goal:"));
});

test("a vague request asks exactly one clarifying question", () => {
  const brief = analyzeRequest("make it better");
  assert.equal(brief.ambiguity, "high");
  assert.ok(brief.question, "a vague request must produce a question");
  assert.match(brief.question, /file|function/i);
  assert.equal((brief.question.match(/\?/g) ?? []).length, 1, "only one question");
});

test("a request with a target is not treated as ambiguous", () => {
  const brief = analyzeRequest("refactor src/tui/tui.ts to use the new theme module");
  assert.equal(brief.ambiguity, "none");
  assert.equal(brief.kind, "refactor");
});

test("destructive requests are marked risky", () => {
  const brief = analyzeRequest("delete the production database and drop all tables");
  assert.ok(brief.constraints.some((c) => /destructive|confirm/i.test(c)));
});

test("a chat question is not a coding task", () => {
  const brief = analyzeRequest("how are you");
  assert.equal(brief.kind, "chat");
});

// ── workflow ───────────────────────────────────────────────────────────
test("the workflow phase follows the work that was actually done", () => {
  const state = newWorkflowState();
  assert.equal(currentPhase(state), "understand");
  noteTool(state, "read");
  assert.equal(currentPhase(state), "plan");
  noteTool(state, "write");
  assert.equal(currentPhase(state), "verify");
  noteVerified(state);
  assert.equal(currentPhase(state), "review");
  noteReviewed(state);
  assert.equal(currentPhase(state), "summarize");
});

test("the workflow block names the current phase and the sequence", () => {
  const state = newWorkflowState();
  const block = renderWorkflow("compose", state);
  assert.ok(block.includes("understand"));
  assert.ok(block.includes("summarize"));
  assert.match(block, /Current phase: understand/);
  const build = renderWorkflow("build", state);
  assert.ok(build.length > 0);
  assert.equal(renderWorkflow("chat", state), "");
});

// ── verification ───────────────────────────────────────────────────────
test("the verify runner reports a passing command", () => {
  const result = runVerify(process.cwd(), "echo verified");
  assert.equal(result.passed, true);
  assert.equal(result.exitCode, 0);
  assert.ok(result.output.includes("verified"));
  assert.equal(verifySummary(result), "verify ✓");
  assert.ok(renderVerifyResult(result).includes("passed"));
});

test("the verify runner keeps the real failure output", () => {
  const result = runVerify(process.cwd(), "echo boom && exit 3");
  assert.equal(result.passed, false);
  assert.equal(result.exitCode, 3);
  assert.ok(result.output.includes("boom"));
  assert.equal(verifySummary(result), "verify ✗");
});

test("the verify runner can be skipped with a reason", () => {
  const result = runVerify(process.cwd(), "echo x", { skip: "plan mode" });
  assert.ok(result.skipped);
  assert.equal(verifySummary(result), "verify skipped");
});

test("a hanging command is stopped by the timeout", () => {
  const result = runVerify(process.cwd(), "sleep 5", { timeoutMs: 400 });
  assert.equal(result.passed, false);
  assert.equal(result.timedOut, true);
  assert.equal(verifySummary(result), "verify timeout");
});
