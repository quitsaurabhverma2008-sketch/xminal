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
// Windows needs cmd.exe to run the npm.cmd shim (CreateProcess alone can't exec .cmd files)
const result = isWin
  ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npm", "run", "build"], { stdio: "inherit" })
  : spawnSync("npm", ["run", "build"], { stdio: "inherit" });
if (result.error) {
  console.error(`xminal: build failed: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
