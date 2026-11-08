const test = require("node:test");
const assert = require("node:assert");

const { wrapText, matchCommands } = require("../dist/tui/layout");

test("wrapText wraps on word boundaries and hard-cuts long words", () => {
  assert.deepEqual(wrapText("hello world", 80), ["hello world"]);
  assert.deepEqual(wrapText("one two three four five six", 12), ["one two", "three four", "five six"]);
  const wrapped = wrapText("supercalifragilisticexpialidocious", 10);
  assert.equal(wrapped.length, 4);
  assert.equal(wrapped[0], "supercalif");
  assert.deepEqual(wrapText("a\nb\nc", 10), ["a", "b", "c"]);
});

test("matchCommands returns slash-command matches by prefix", () => {
  const cmds = ["/help", "/model", "/models", "/mode", "/undo"];
  assert.deepEqual(matchCommands("/mo", cmds), ["/model", "/models", "/mode"]);
  assert.deepEqual(matchCommands("/he", cmds), ["/help"]);
  assert.deepEqual(matchCommands("/zz", cmds), []);
  assert.deepEqual(matchCommands("/model now", cmds), []);
  assert.deepEqual(matchCommands("hello", cmds), []);
});
