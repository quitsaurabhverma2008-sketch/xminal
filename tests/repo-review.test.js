// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildRepoMap, renderRepoMap, repoMapSummary, extractDefinitions, extractReferences } = require("../dist/core/repo-map");
const { parseDiff, analyzeDiff, renderFindings, reviewSummary } = require("../dist/core/review");

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ── repository map ─────────────────────────────────────────────────────
test("definitions are extracted with their line numbers", () => {
  const defs = extractDefinitions(
    [
      "export function greet(name) {}",
      "export class Session {}",
      "export interface Brief { goal: string }",
      "export type Mode = 'build' | 'plan';",
      "export async function load() {}",
    ].join("\n"),
  );
  const names = defs.map((d) => d.name);
  assert.ok(names.includes("greet"));
  assert.ok(names.includes("Session"));
  assert.ok(names.includes("Brief"));
  assert.ok(names.includes("Mode"));
  assert.ok(names.includes("load"));
  const greet = defs.find((d) => d.name === "greet");
  assert.equal(greet.line, 1, "the line number must be 1-based");
  assert.equal(greet.kind, "def");
});

test("references are extracted from the calls a file makes", () => {
  const refs = extractReferences("const x = chargeInvoice(1);\nrender();\n");
  const names = refs.map((r) => r.name);
  assert.ok(names.includes("chargeInvoice"));
  assert.ok(names.includes("render"));
});

test("the map ranks the files that match the request first", () => {
  const dir = tmpDir("xminal-map-");
  try {
    fs.mkdirSync(path.join(dir, "src"));
    fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "billing.ts"), "export function chargeInvoice() {}\nexport class Invoice {}\n");
    fs.writeFileSync(path.join(dir, "src", "colors.ts"), "export function paint() {}\n");
    fs.writeFileSync(path.join(dir, "node_modules", "pkg", "index.js"), "export function invoiceHidden() {}\n");
    const map = buildRepoMap(dir, "fix the invoice charging bug");
    const paths = map.entries.map((e) => e.path);
    assert.ok(paths.includes("src/billing.ts"));
    assert.ok(!paths.includes("node_modules/pkg/index.js"), "node_modules must be skipped");
    const top = map.entries.find((e) => e.path === "src/billing.ts");
    assert.ok(top.score > 0, "the matching file must score above zero");
    assert.ok(top.symbols.some((s) => s.name === "chargeInvoice"));
    assert.ok(top.symbols[0].line >= 1, "symbols carry their line number");
    const rendered = renderRepoMap(map);
    assert.ok(rendered.includes("src/billing.ts"));
    assert.ok(repoMapSummary(map).includes("scanned"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the map finds the backbone of the project through its import graph", () => {
  const dir = tmpDir("xminal-map3-");
  try {
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "core.ts"), "export function core() {}\n");
    fs.writeFileSync(path.join(dir, "src", "a.ts"), 'import { core } from "./core";\nexport function a() {}\n');
    fs.writeFileSync(path.join(dir, "src", "b.ts"), 'import { core } from "./core";\nexport function b() {}\n');
    fs.writeFileSync(path.join(dir, "src", "c.ts"), 'import { a } from "./a";\nexport function c() {}\n');
    const map = buildRepoMap(dir, "");
    const core = map.entries.find((e) => e.path === "src/core.ts");
    const a = map.entries.find((e) => e.path === "src/a.ts");
    assert.ok(core.referencedBy >= 1, "core.ts is referenced by other files");
    assert.ok(a.referencedBy >= 1);
    const rendered = renderRepoMap(map);
    assert.ok(rendered.includes("central files"));
    assert.ok(rendered.includes("src/core.ts"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the map is never empty for a big repository (regression)", () => {
  const dir = tmpDir("xminal-map4-");
  try {
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    for (let i = 0; i < 450; i += 1) {
      fs.writeFileSync(path.join(dir, "src", `f${i}.ts`), `export function thing${i}() {}\n`);
    }
    const map = buildRepoMap(dir, "");
    assert.ok(map.entries.length > 100, `the map must not be empty, got ${map.entries.length}`);
    assert.ok(map.scanned >= 450, `every file must be scanned, got ${map.scanned}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the rendered map stays inside its character budget", () => {
  const dir = tmpDir("xminal-map2-");
  try {
    fs.mkdirSync(path.join(dir, "src"));
    for (let i = 0; i < 40; i += 1) {
      fs.writeFileSync(path.join(dir, "src", `file-${i}.ts`), `export function thing${i}() {}\n`);
    }
    const map = buildRepoMap(dir, "thing");
    const rendered = renderRepoMap(map, { maxChars: 300 });
    assert.ok(rendered.length <= 300, `the map must be bounded, got ${rendered.length}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── diff review ───────────────────────────────────────────────────────
const SAMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,3 +10,4 @@ export function main() {
-  const old = 1;
+  const fresh = 2;
+  console.log("debug");
diff --git a/.env b/.env
index 3333333..4444444 100644
--- a/.env
+++ b/.env
@@ -1,2 +1,2 @@
-SECRET=old
+SECRET=new
diff --git a/package.json b/package.json
index 5555555..6666666 100644
--- a/package.json
+++ b/package.json
@@ -1,3 +1,4 @@
   "name": "demo",
+  "dependencies": { "left-pad": "1.0.0" },
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
--- a/src/old.ts
+++ /dev/null
@@ -1,30 +0,0 @@
-export const gone = true;
`;

test("the diff parser counts added and removed lines per file", () => {
  const files = parseDiff(SAMPLE_DIFF);
  const app = files.find((f) => f.path === "src/app.ts");
  assert.equal(app.added, 2);
  assert.equal(app.removed, 1);
  assert.ok(app.addedLines.length === 2);
  const deleted = files.find((f) => f.path === "src/old.ts");
  assert.equal(deleted.isDeleted, true);
});

test("the analysis flags the facts: protected paths, dependencies, deletions, missing tests", () => {
  const analysis = analyzeDiff(SAMPLE_DIFF, { protectedPaths: [".env"] });
  const critical = analysis.findings.find((f) => f.severity === "critical");
  assert.ok(critical, "a protected path must be flagged");
  assert.equal(critical.file, ".env");
  assert.ok(analysis.findings.some((f) => f.severity === "major" && f.file === "package.json"));
  assert.ok(analysis.findings.some((f) => f.severity === "major" && f.file === "src/old.ts"));
  assert.ok(analysis.findings.some((f) => f.message.includes("no test file changed")));
  assert.deepEqual(analysis.testFiles, []);
  assert.ok(analysis.sourceFiles.includes("src/app.ts"));
});

test("a clean diff produces no findings and a readable summary", () => {
  const clean = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
-export const a = 1;
+export const a = 2;
diff --git a/test/a.test.ts b/test/a.test.ts
--- a/test/a.test.ts
+++ b/test/a.test.ts
@@ -1,2 +1,2 @@
-test("a", () => {});
+test("a", () => assert.ok(true));
`;
  const analysis = analyzeDiff(clean);
  assert.deepEqual(analysis.findings, []);
  assert.equal(analysis.added, 2);
  assert.equal(analysis.removed, 2);
  assert.ok(reviewSummary(analysis).includes("+2/-2"));
  assert.ok(renderFindings(analysis).includes("No automatic risk flags"));
});

test("findings are rendered with a severity and a file reference", () => {
  const analysis = analyzeDiff(SAMPLE_DIFF, { protectedPaths: [".env"] });
  const rendered = renderFindings(analysis);
  assert.ok(rendered.includes("[critical] .env"));
  assert.ok(rendered.includes("[major]"));
});
