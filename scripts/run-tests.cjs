// Cross-platform test discovery: pass test files explicitly so no shell glob
// expansion is required (Windows cmd does not expand globs).
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const dir = path.resolve(__dirname, "..", "tests");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".test.js"))
  .sort()
  .map((f) => path.join(dir, f));

const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
