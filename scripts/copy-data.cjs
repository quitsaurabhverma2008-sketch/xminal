// Copy non-TypeScript data files (the MCP catalog) into dist/ so the published
// package ships them next to the compiled code.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "data");
const dest = path.join(root, "dist", "data");

if (!fs.existsSync(src)) {
  console.log("copy-data: no data/ directory — skipped");
  process.exit(0);
}
fs.mkdirSync(dest, { recursive: true });
let copied = 0;
for (const file of fs.readdirSync(src)) {
  const from = path.join(src, file);
  if (!fs.statSync(from).isFile()) continue;
  fs.copyFileSync(from, path.join(dest, file));
  copied++;
}
console.log(`copy-data: ${copied} file(s) → dist/data`);
