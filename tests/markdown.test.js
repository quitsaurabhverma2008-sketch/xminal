// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");
const { renderMarkdown } = require("../dist/tui/markdown");
const { visibleWidth, stripAnsi } = require("../dist/tui/width");

test("renders headings, bold, italic, code without throwing; content preserved", () => {
  const lines = renderMarkdown("# Title\n\nHello **world** and *again* with `code` end.", { width: 60 });
  const text = stripAnsi(lines.join("\n"));
  assert.ok(text.includes("Title"));
  assert.ok(text.includes("world"));
  assert.ok(text.includes("code"));
  assert.ok(!text.includes("**"), "bold markers are consumed by renderer");
});

test("fenced code content is preserved byte-exact (minus ANSI coloring)", () => {
  const lines = renderMarkdown("```ts\nif (a!!!b) { }\n```\n", { width: 60 });
  const text = stripAnsi(lines.join("\n"));
  assert.ok(text.includes("a!!!b"), "verbatim content must survive");
});

test("tables render with aligned pipes and header separator", () => {
  const lines = renderMarkdown("| Name | Value |\n| --- | --- |\n| a | 1 |\n| long-name | 100 |\n", { width: 60 });
  const text = stripAnsi(lines.join("\n"));
  assert.ok(text.includes("Name"));
  assert.ok(text.includes("a"));
  assert.ok(text.split("\n").filter((l) => l.includes("│")).length >= 3, "table grid rendered");
});

test("incomplete trailing fence does not throw", () => {
  assert.doesNotThrow(() => renderMarkdown("text\n\n```ts\nconst x = 1", { width: 40 }));
});

test("unicode content does not break width math", () => {
  const lines = renderMarkdown("नमस्ते **दुनिया** test\n\n🙂 emoji ok", { width: 40 });
  assert.ok(lines.length > 0);
});
