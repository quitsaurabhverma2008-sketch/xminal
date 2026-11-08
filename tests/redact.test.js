// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");

const { redactSecrets } = require("../dist/util/redact");

test("redacts common secret shapes", () => {
  const leaky = [
    "key: sk-live-1234567890abcdef1234567890abcdef",
    "ghp_abcdefghij1234567890abcdefghij123456",
    "token=github_pat_11ABCDEFGHIJKLMNOP_abcdefghij1234567890",
    "AIzaSyD4iE8kXM3lM4yL5x6w7y8z9a0b1c2d3e4f",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG91IiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQss5c",
  ].join("\n");
  const { text, count } = redactSecrets(leaky);
  assert.ok(count >= 4, `expected >=4 redactions, got ${count}`);
  for (const marker of ["sk-live-1234567890", "ghp_abcdefghij", "github_pat_11ABC", "AIzaSyD4"]) {
    assert.ok(!text.includes(marker), `leaked: ${marker}`);
  }
});

test("redacts private key blocks", () => {
  const pem = "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwDQEBA\n-----END PRIVATE KEY-----";
  const { text, count } = redactSecrets(pem);
  assert.equal(count, 1);
  assert.ok(!text.includes("MIIEvw"));
  assert.ok(text.includes("[REDACTED:private-key]"));
});

test("leaves ordinary output untouched", () => {
  const plain = "total 128\n-rw-r--r-- 1 user 1.2K Nov 8 README.md";
  const { text, count } = redactSecrets(plain);
  assert.equal(count, 0);
  assert.equal(text, plain);
});
