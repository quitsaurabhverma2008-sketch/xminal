// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");
const { formatAssistantText } = require("../dist/tui/format");

test("prose: repeated punctuation collapses, single punctuation survives", () => {
  assert.equal(formatAssistantText("Done!!!").trim(), "Done!");
  assert.equal(formatAssistantText("What?!?").trim(), "What?!?");
  assert.equal(formatAssistantText("Fine.").trim(), "Fine.");
});

test("code fences are preserved byte-exact", () => {
  const src = "```sh\nprintf 'a!!!b'\n```\n";
  assert.equal(formatAssistantText(src), src);
});

test("code fence with repeated punctuation inside is untouched", () => {
  const src = "```ts\nconst x = 'a!!!--b';\n// keep ::\n```\n";
  assert.equal(formatAssistantText(src), src);
});

test("prose around code fences is normalized, fences are not", () => {
  const src = "Great!!!\n```\na!!!b\n```\nDone!!!";
  const out = formatAssistantText(src);
  assert.ok(out.includes("a!!!b"));
  assert.ok(out.startsWith("Great!"));
  assert.ok(out.endsWith("Done!") === true || out.endsWith("Done!\n"));
});

test("excessive blank lines collapse to one", () => {
  assert.ok(!formatAssistantText("a\n\n\n\n\nb").includes("\n\n\n"));
});

const { isLikelyDiff, tintDiffRow } = require("../dist/tui/format");

test("isLikelyDiff detects unified diffs but not prose", () => {
  assert.equal(isLikelyDiff("diff --git a/x b/x\n+one\n-two"), true);
  assert.equal(isLikelyDiff("@@ -1,2 +1,3 @@\n-a\n+b"), true);
  assert.equal(isLikelyDiff("normal assistant sentence with + sign"), false);
});

test("tintDiffRow colors added/removed/hunk lines", () => {
  const green = (t) => `<g>${t}</g>`, red = (t) => `<r>${t}</r>`, accent = (t) => `<a>${t}</a>`, muted = (t) => `<m>${t}</m>`;
  assert.equal(tintDiffRow("+added line", null, muted, accent, green, red), "<g>+added line</g>");
  assert.equal(tintDiffRow("-removed line", null, muted, accent, green, red), "<r>-removed line</r>");
  assert.equal(tintDiffRow("@@ -1 +1 @@", null, muted, accent, green, red), "<a>@@ -1 +1 @@</a>");
  assert.equal(tintDiffRow("context unchanged", null, muted, accent, green, red), "context unchanged");
});
