// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");
const { renderMarkdown } = require("../dist/tui/markdown");
const { stripAnsi } = require("../dist/tui/width");

test("task list renders checkbox rows", () => {
  const out = renderMarkdown("- [ ] pending thing\n- [x] done thing", { width: 60 });
  const text = stripAnsi(out.join("\n"));
  assert.ok(text.includes("[ ] pending thing"));
  assert.ok(text.includes("[x] done thing"));
});

test("callout renders a colored label, not raw bracket tokens", () => {
  const out = renderMarkdown("> [!WARNING] disk is full", { width: 60 });
  const text = stripAnsi(out.join("\n"));
  assert.ok(text.includes("WARNING"));
  assert.ok(!text.includes("[!WARNING]"));
});

test("H1 and H3 headings get different emphasis", () => {
  const h1 = renderMarkdown("# Big", { width: 60 }).join("\n");
  const h3 = renderMarkdown("### Small", { width: 60 }).join("\n");
  const violet = "38;2;192;153;255"; // opencode markdownHeading — #c099ff
  assert.ok(h1.includes(violet), "H1 should use violet");
  assert.ok(!h3.includes(violet), "H3 should not use violet");
});

test("narrow table falls back to key — value rows instead of a grid", () => {
  const table = "| Name | Role |\n|---|---|\n| Ada | engineer |";
  const out = renderMarkdown(table, { width: 34 });
  const text = stripAnsi(out.join("\n"));
  assert.ok(text.includes("Ada"));
  assert.ok(text.includes("engineer"));
  assert.ok(!text.includes("─"), "no grid rules on narrow terminals");
  assert.ok(text.includes("Role"), "keeps the column label");
});

test("wide tables still render as a grid", () => {
  const table = "| Name | Role |\n|---|---|\n| Ada | engineer |";
  const out = renderMarkdown(table, { width: 80 });
  const text = stripAnsi(out.join("\n"));
  assert.ok(text.includes("─"));
  assert.ok(text.includes("Ada"));
});

test("fenced code block with language renders without throwing", () => {
  const out = renderMarkdown("```ts\nconst x: number = 1;\n```", { width: 60 });
  const text = stripAnsi(out.join("\n"));
  assert.ok(text.includes("const x: number = 1;"));
  assert.ok(text.includes("ts"));
});
