// CLI routing regression tests.
// 0.25.0–0.27.0 shipped a bug: `case "web-ui"` existed in the switch but
// "web-ui" was missing from KNOWN_COMMANDS, so `xminal web-ui` silently
// became `xminal run "web-ui"` (the words became an agent prompt).
// These tests pin the invariant: every routed command is parseable.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { parseArgs, KNOWN_COMMANDS } = require("../dist/cli/args");

test("parseArgs routes web-ui to the web-ui command, not run", () => {
  const args = parseArgs(["web-ui"]);
  assert.equal(args.command, "web-ui");
  assert.deepEqual(args.positionals, []);
});

test("parseArgs routes web-ui with flags", () => {
  const args = parseArgs(["web-ui", "--port", "9999", "--host", "127.0.0.1"]);
  assert.equal(args.command, "web-ui");
  assert.equal(args.flags.port, "9999");
  assert.equal(args.flags.host, "127.0.0.1");
});

test("every case label in the CLI dispatch is a known command", () => {
  // the switch in src/index.ts is the source of truth for routed commands
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8");
  const cases = [...source.matchAll(/case "([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(cases.length >= 10, "expected CLI dispatch cases to be found");
  for (const command of new Set(cases)) {
    assert.ok(
      KNOWN_COMMANDS.has(command),
      `KNOWN_COMMANDS is missing "${command}" — it would silently fall back to \`run\` with the word as the prompt`,
    );
  }
});

test("unknown words still fall back to run (by design)", () => {
  const args = parseArgs(["fix", "the", "bug"]);
  assert.equal(args.command, "run");
  assert.deepEqual(args.positionals, ["fix", "the", "bug"]);
});
