// secret-scan: allow
// Width engine tests — offline, no network, no fixtures beyond the strings
// written inline. Runs against dist/ (npm run build first).
const test = require("node:test");
const assert = require("node:assert");

const ansi = require("../dist/tui/ansi");
const width = require("../dist/tui/width");

const {
  stripAnsi,
  ansiAwareWidth,
  sliceToWidth,
  truncateToWidth,
  wrapAnsiByWidth,
  hasAnsi,
} = ansi;
const {
  visibleWidth,
  splitGraphemes,
  graphemeWidth,
  graphemeSlice,
  graphemeSliceToWidth,
  wrapAnsi,
  truncateToWidth: truncateToWidthFacade,
} = width;

const ESC = "\x1b";

/** True when the string contains a surrogate code unit that is not part of a pair. */
function hasLoneSurrogate(text) {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

// ─── the ANSI scanner ─────────────────────────────────────────────────────────

test("stripAnsi removes colon-form SGR sequences", () => {
  const coloured = `${ESC}[38:2:1:2:3mhello${ESC}[0m`;
  assert.equal(stripAnsi(coloured), "hello");
  assert.equal(visibleWidth(coloured), 5);
  assert.equal(ansiAwareWidth(coloured), 5);
  assert.equal(hasAnsi(coloured), true);
});

test("stripAnsi removes semicolon-form SGR sequences", () => {
  assert.equal(stripAnsi(`${ESC}[38;2;1;2;3mhello${ESC}[0m`), "hello");
  assert.equal(visibleWidth(`${ESC}[38;2;1;2;3mhello${ESC}[0m`), 5);
});

test("stripAnsi removes an OSC terminated by ST (ESC backslash)", () => {
  const link = `${ESC}]8;;https://example.com${ESC}\\link${ESC}]8;;${ESC}\\`;
  assert.equal(stripAnsi(link), "link");
  assert.equal(visibleWidth(link), 4);
});

test("stripAnsi removes an OSC terminated by BEL", () => {
  const title = `${ESC}]0;window title\x07hello`;
  assert.equal(stripAnsi(title), "hello");
  assert.equal(visibleWidth(title), 5);
});

test("a CSI nested inside an OSC is swallowed with the OSC", () => {
  const nested = `${ESC}]0;ti${ESC}[1mtle\x07`;
  assert.equal(stripAnsi(nested), "");
  assert.equal(visibleWidth(nested), 0);
});

test("the scanner handles the remaining escape flavours", () => {
  assert.equal(stripAnsi(`${ESC}[?25lhide${ESC}[?25h`), "hide"); // DEC private mode
  assert.equal(stripAnsi(`${ESC}[1;2;3Hcell`), "cell"); // cursor position
  assert.equal(stripAnsi(`${ESC}]8;;u${ESC}\\`), ""); // empty OSC
  assert.equal(stripAnsi(`${ESC}7saved`), "saved"); // single character escape
  assert.equal(hasAnsi("plain text"), false);
  assert.equal(hasAnsi("plain \x1b[0m text"), true);
});

// ─── visible width ────────────────────────────────────────────────────────────

test("visibleWidth measures wide, narrow and emoji text", () => {
  assert.equal(visibleWidth("hello"), 5);
  assert.equal(visibleWidth("你好世界"), 8);
  assert.equal(visibleWidth("e\u0301"), 1); // combining acute
  assert.equal(visibleWidth("\u00e9"), 1); // precomposed é
  assert.equal(visibleWidth("\u200d"), 0); // lone ZWJ (format char)
  assert.equal(visibleWidth("👨‍👩‍👧"), 2); // ZWJ family
  assert.equal(visibleWidth("👍🏽"), 2); // emoji + skin tone modifier
  assert.equal(visibleWidth("✅"), 2); // U+2705
  assert.equal(visibleWidth("─│┌┐"), 4); // box drawing
  assert.equal(visibleWidth(""), 0);
});

test("visibleWidth of an ANSI coloured string equals the plain length", () => {
  const plain = "hello world";
  const coloured = `${ESC}[1;31m${plain}${ESC}[0m`;
  assert.equal(visibleWidth(coloured), plain.length);
  assert.equal(visibleWidth(`${ESC}[38:2:1:2:3m${plain}${ESC}[0m`), plain.length);
  assert.equal(visibleWidth(`${ESC}]0;title\x07${plain}`), plain.length);
});

test("visibleWidth counts the real width of emoji runs (markdown slicer bug)", () => {
  // 30 × U+2705 is 60 columns — the old markdown implementation reported 30.
  const row = "✅".repeat(30);
  assert.equal(visibleWidth(row), 60);
  assert.equal(graphemeSliceToWidth(row, 40).columns, 40);
  assert.equal(graphemeSliceToWidth(row, 40).text, "✅".repeat(20));
});

test("splitGraphemes keeps ZWJ sequences and surrogate pairs intact", () => {
  const family = "👨‍👩‍👧‍👦";
  const clusters = splitGraphemes(family);
  assert.ok(clusters.length < family.length, "ZWJ sequence was split");
  assert.equal(clusters.length, 1);
  assert.equal(splitGraphemes("👍🏽").length, 1);
  assert.equal(splitGraphemes("ab").length, 2);
  for (const cluster of splitGraphemes("a👍🏽é👨‍👩‍👧")) {
    assert.ok(!hasLoneSurrogate(cluster), `lone surrogate in ${JSON.stringify(cluster)}`);
  }
});

test("graphemeWidth is exported and reports the column count", () => {
  assert.equal(graphemeWidth("a"), 1);
  assert.equal(graphemeWidth("你"), 2);
  assert.equal(graphemeWidth("✅"), 2);
  assert.equal(graphemeWidth("\u200d"), 0);
  assert.equal(graphemeWidth(""), 0);
});

// ─── slicing and truncation ───────────────────────────────────────────────────

test("sliceToWidth never splits a surrogate pair or a ZWJ cluster", () => {
  const family = "👨‍👩‍👧";
  const slice = sliceToWidth(`${family}x`, 2);
  assert.equal(slice.text, family);
  assert.equal(slice.width, 2);
  assert.equal(slice.consumed, family.length);
  assert.equal(slice.truncated, true);
  assert.ok(!hasLoneSurrogate(slice.text));

  const emoji = sliceToWidth("👍🏽abc", 2);
  assert.equal(emoji.text, "👍🏽");
  assert.equal(emoji.width, 2);
  assert.equal(emoji.consumed, "👍🏽".length);
  assert.ok(!hasLoneSurrogate(emoji.text));

  const wide = sliceToWidth("你好世界", 4);
  assert.equal(wide.text, "你好");
  assert.equal(wide.width, 4);
  assert.equal(wide.consumed, 2);
  assert.equal(wide.truncated, true);
});

test("sliceToWidth keeps escape sequences and reports the consumed units", () => {
  const slice = sliceToWidth(`${ESC}[31mhello${ESC}[0m world`, 5);
  assert.equal(slice.text, `${ESC}[31mhello`);
  assert.equal(slice.width, 5);
  assert.equal(slice.consumed, `${ESC}[31mhello`.length);
  assert.equal(slice.truncated, true);
});

test("sliceToWidth of a short string consumes everything", () => {
  const slice = sliceToWidth("hi", 10);
  assert.equal(slice.text, "hi");
  assert.equal(slice.width, 2);
  assert.equal(slice.consumed, 2);
  assert.equal(slice.truncated, false);
});

test("truncateToWidth adds an ellipsis and stays inside the budget", () => {
  const truncated = truncateToWidth("hello world", 8);
  assert.equal(truncated, "hello w…");
  assert.equal(ansiAwareWidth(truncated), 8);
  assert.ok(ansiAwareWidth(truncated) <= 8);

  const wide = truncateToWidth("你好世界", 5);
  assert.equal(wide, "你好…");
  assert.equal(ansiAwareWidth(wide), 5);

  const emoji = truncateToWidth("👨‍👩‍👧abc", 3);
  assert.equal(emoji, "👨‍👩‍👧…");
  assert.equal(ansiAwareWidth(emoji), 3);
  assert.ok(!hasLoneSurrogate(emoji));

  assert.equal(truncateToWidth("short", 20), "short");
  assert.equal(truncateToWidth("short", 20, "…"), "short");
  assert.equal(truncateToWidth("abcdef", 3, ""), "abc");
  assert.equal(ansiAwareWidth(truncateToWidth("abcdef", 3, "...")), 3);
  assert.equal(truncateToWidthFacade("hello world", 8), "hello w…");
});

test("graphemeSlice reports text, columns and consumed", () => {
  const slice = graphemeSlice("hello world", 5);
  assert.equal(slice.text, "hello");
  assert.equal(slice.columns, 5);
  assert.equal(slice.consumed, 5);
  assert.equal(slice.length, 5);
  assert.equal(String(slice), "hello");

  const structured = graphemeSliceToWidth("hello world", 5);
  assert.deepEqual(structured, { text: "hello", columns: 5, consumed: 5 });
});

// ─── wrapping ─────────────────────────────────────────────────────────────────

test("wrapAnsi wraps on the visible width and keeps the escape sequences", () => {
  const coloured = `${ESC}[31m${"a".repeat(25)}${ESC}[0m`;
  const lines = wrapAnsi(coloured, 10);
  assert.equal(lines.length, 3);
  for (const line of lines) assert.ok(ansiAwareWidth(line) <= 10, `line too wide: ${JSON.stringify(line)}`);
  assert.ok(lines.join("").includes(`${ESC}[31m`), "the colour escape was dropped");
  assert.ok(lines.join("").includes(`${ESC}[0m`), "the reset escape was dropped");
  assert.equal(lines.join("").replace(/\x1b\[[0-9;]*m/g, ""), "a".repeat(25));
});

test("wrapAnsi hard splits long words on grapheme boundaries", () => {
  const lines = wrapAnsi("👨‍👩‍👧".repeat(4), 4);
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.ok(ansiAwareWidth(line) <= 4);
    assert.ok(!hasLoneSurrogate(line));
  }
  assert.equal(lines.join(""), "👨‍👩‍👧".repeat(4));
});

test("wrapAnsiByWidth matches wrapAnsi and keeps the newlines", () => {
  const input = "one two\nthree four";
  assert.deepEqual(wrapAnsiByWidth(input, 8), wrapAnsi(input, 8));
  assert.deepEqual(wrapAnsiByWidth(input, 8), ["one two", "three", "four"]);
});

test("wrapAnsi never loops forever on a narrow budget", () => {
  const lines = wrapAnsi("abcdef", 1);
  assert.equal(lines.length, 6);
  assert.deepEqual(wrapAnsiByWidth("👨‍👩‍👧", 1), ["👨‍👩‍👧"]);
});

// ─── the pre-existing expectations (tests/width.test.js) ──────────────────────

test("the legacy width expectations still hold", () => {
  assert.equal(visibleWidth("hello"), 5);
  assert.equal(visibleWidth(`${ESC}[31mhello${ESC}[0m`), 5);
  assert.equal(visibleWidth(`${ESC}[38;2;1;2;3mhello${ESC}[0m`), 5);
  assert.ok(visibleWidth("नमस्ते") >= 3);
  assert.equal(visibleWidth("a\u0301"), 1);
  assert.equal(visibleWidth("你好"), 4);
  assert.equal(visibleWidth("🙂"), 2);
  const family = "👨‍👩‍👧‍👦";
  assert.ok(splitGraphemes(family).length < family.split("").length);
});
