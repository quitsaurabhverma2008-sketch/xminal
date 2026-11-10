const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SKIP = new Set(["node_modules", "dist", ".git", ".github"]);
// vendor/ is verbatim MIT upstream (opencode); its test fixtures contain intentional fake
// token-shaped strings, so we scan only our own bridge inside it, not upstream's tree.
const SKIP_UNDER_VENDOR = /vendor(?!\/packages\/xminal-bridge)/;
const SKIP_FILES = new Set(["package-lock.json", "LEARNINGS.md"]);

const PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /sk-or-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /gho_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /xox[baprs]-[0-9A-Za-z-]{10,}/,
  /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/,
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile()) {
      if (SKIP_UNDER_VENDOR.test(full)) continue;
      if (SKIP_FILES.has(entry.name)) continue;
      out.push(full);
    }
  }
  return out;
}

test("repository contains no committed secrets", () => {
  const offenders = [];
  for (const file of walk(ROOT)) {
    const rel = path.relative(ROOT, file);
    if (/\.(png|jpg|jpeg|gif|ico|svg|woff2?|ttf|map)$/i.test(rel)) continue;
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (text.includes("secret-scan: allow")) continue;
    for (const pattern of PATTERNS) {
      if (pattern.test(text)) {
        offenders.push(`${rel} (${pattern})`);
      }
    }
  }
  assert.deepEqual(offenders, [], `possible secrets committed:\n${offenders.join("\n")}`);
});
