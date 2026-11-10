const { existsSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function hasTypeScript() {
  for (const candidate of ["node_modules/.bin/tsc", "node_modules/.bin/tsc.cmd"]) {
    if (existsSync(path.join(process.cwd(), candidate))) return true;
  }
  try {
    require.resolve("typescript");
    return true;
  } catch {
    return false;
  }
}

if (!hasTypeScript()) {
  console.log("xminal: typescript not present; using the committed dist/ (no build step needed).");
  process.exit(0);
}

const isWin = process.platform === "win32";
// Windows cannot exec `npm` (an npm.cmd shim) without an explicit .cmd reference
const result = spawnSync(isWin ? "npm.cmd" : "npm", ["run", "build"], { stdio: "inherit" });
if (result.error) {
  console.error(`xminal: build failed: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
