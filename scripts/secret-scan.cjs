#!/usr/bin/env node
// secret-scan: allow — this file defines the patterns, so it trips itself
/**
 * Secret scan — fails when a credential-shaped string is committed.
 *
 * Scans the files git tracks (not the working tree) so local .env files and
 * scratch state are never touched. Run: node scripts/secret-scan.cjs
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SKIP_DIRS = new Set(["vendor", "node_modules", "dist", ".git", ".xminal", "site", "assets"]);
const MAX_BYTES = 2 * 1024 * 1024;

const RULES = [
  { name: "github-pat", re: /\bghp_[A-Za-z0-9]{30,}\b/g },
  { name: "github-pat-fine", re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g },
  { name: "npm-token", re: /\bnpm_[A-Za-z0-9]{30,}\b/g },
  { name: "openai-key", re: /\bsk-[A-Za-z0-9]{32,}\b/g },
  { name: "anthropic-key", re: /\bsk-ant-[A-Za-z0-9-]{40,}\b/g },
  { name: "google-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { name: "private-key", re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: "bearer-token", re: /\bBearer\s+[A-Za-z0-9._-]{40,}\b/g },
];

/**
 * Known fake credentials used by the test-suite. They are obvious placeholders
 * (sequential alphabets) and must never trip the scanner.
 */
const FIXTURES = new Set([
  "ghp_abcdefghij1234567890abcdefghij123456",
  "sk-live-1234567890abcdef1234567890abcdef",
  "github_pat_11ABCDEFG0",
  "AIzaSyD4",
  "-----BEGIN PRIVATE KEY-----",
]);

function trackedFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return out.split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

function isSkipped(file) {
  const parts = file.split("/");
  return parts.some((p) => SKIP_DIRS.has(p));
}

function main() {
  const files = trackedFiles();
  const findings = [];
  for (const file of files) {
    if (isSkipped(file)) continue;
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_BYTES) continue;
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue; // binary
    }
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let match;
      while ((match = rule.re.exec(text)) !== null) {
        const line = text.slice(0, match.index).split("\n").length;
        // the rule definitions themselves contain the patterns — ignore them
        if (file === path.join("scripts", "secret-scan.cjs")) continue;
        if (FIXTURES.has(match[0])) continue;
        // obvious placeholders ("abcdefghijklmnopqrstuvwxyz…") are test fixtures, not keys
        if (/abcdefghijklmnopqrstuvwxyz/i.test(match[0])) continue;
        findings.push({ file, line, rule: rule.name, sample: match[0].slice(0, 12) + "…" });
      }
    }
  }

  if (findings.length) {
    console.error("✗ secret scan failed:");
    for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.rule}  ${f.sample}`);
    console.error("\nRemove the credential, rotate it, then commit again.");
    process.exit(1);
  }
  console.log(`✓ secret scan clean (${files.length} tracked files, ${RULES.length} rules)`);
}

main();
