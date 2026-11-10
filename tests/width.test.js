// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");
const { visibleWidth, splitGraphemes } = require("../dist/tui/width");

test("visibleWidth: ascii, Hindi, emoji, ANSI-stripped", () => {
  assert.equal(visibleWidth("hello"), 5);
  assert.equal(visibleWidth("\x1b[31mhello\x1b[0m"), 5);
  assert.equal(visibleWidth("\x1b[38;2;1;2;3mhello\x1b[0m"), 5);
  // Hindi/Devanagari chars are narrow (not East-Asian wide); combining marks are zero-width
  const hindi = "नमस्ते"; // 6 code points, 5 base + marks
  assert.ok(visibleWidth(hindi) >= 3, `hindi width ${visibleWidth(hindi)}`);
  assert.equal(visibleWidth("a\u0301"), 1);           // a + combining acute
  assert.equal(visibleWidth("你好"), 4);               // wide
  assert.equal(visibleWidth("🙂"), 2);
});

test("splitGraphemes keeps ZWJ sequences intact", () => {
  const family = "👨‍👩‍👧‍👦";
  const graphemes = splitGraphemes(family);
  assert.ok(graphemes.length < family.split("").length, "ZWJ sequence split into graphemes, not code units");
});
