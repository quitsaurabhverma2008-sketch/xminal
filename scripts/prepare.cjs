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
  // dist/ is gitignored, so a checkout without devDependencies cannot build.
  // A published tarball already ships dist/ → nothing to do.
  if (existsSync(path.join(process.cwd(), "dist", "index.js"))) {
    console.log("xminal: typescript not present; using the prebuilt dist/ (no build step needed).");
    process.exit(0);
  }
  console.error("xminal: cannot build — typescript is not installed and no prebuilt dist/ is present.");
  console.error("xminal: run `npm install` first (it installs devDependencies), then retry.");
  process.exit(1);
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
