const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { Session } = require("../dist/core/session");

function tempCwd() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "xminal-session-"));
}

test("create, list, load roundtrip", () => {
  const cwd = tempCwd();
  const session = Session.create(cwd, { model: "auto", mode: "auto" });
  session.addMessage({ role: "user", content: "hello" });
  session.note("test note");
  const list = Session.list(cwd);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, session.id);
  const loaded = Session.load(cwd, session.id);
  assert.equal(loaded.meta.id, session.id);
  assert.equal(loaded.messages.length, 1);
  assert.equal(loaded.messages[0].content, "hello");
});

test("checkpoints and undo restore file contents", () => {
  const cwd = tempCwd();
  const file = path.join(cwd, "sample.txt");
  fs.writeFileSync(file, "before");
  const session = Session.create(cwd, { model: "auto", mode: "auto" });
  const checkpointId = session.createCheckpoint("before edit", ["sample.txt"]);
  fs.writeFileSync(file, "after");
  const restored = session.restoreCheckpoint(checkpointId);
  assert.equal(restored, 1);
  assert.equal(fs.readFileSync(file, "utf8"), "before");
});

test("undoLast restores the latest checkpoint and removes it", () => {
  const cwd = tempCwd();
  const file = path.join(cwd, "sample.txt");
  fs.writeFileSync(file, "one");
  const session = Session.create(cwd, { model: "auto", mode: "auto" });
  session.createCheckpoint("one", ["sample.txt"]);
  fs.writeFileSync(file, "two");
  const undone = session.undoLast();
  assert.ok(undone);
  assert.equal(fs.readFileSync(file, "utf8"), "one");
  assert.equal(session.listCheckpoints().length, 0);
});
