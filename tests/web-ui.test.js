// Web UI server tests — offline (no model calls).
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const { startServer } = require("../dist/server/http");

test("the web UI page serves with the XMINAL wordmark", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-web-"));
  const running = await startServer({ cwd: dir, host: "127.0.0.1", port: 0 });
  const port = running.server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /XMINAL/);
  assert.match(body, /<script>/);
  assert.match(body, /id="sidebar"/);
  assert.match(body, /id="modelSelect"/);
  assert.match(body, /tool-head/);
  assert.match(body, /\/v1\/agent\/stream/);
  await running.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("text/html content type is set", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-web-"));
  const running = await startServer({ cwd: dir, host: "127.0.0.1", port: 0 });
  const port = running.server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/`);
  assert.match(res.headers.get("content-type") ?? "", /text\/html/);
  await running.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("/health reports ok", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-web-"));
  const running = await startServer({ cwd: dir, host: "127.0.0.1", port: 0 });
  const port = running.server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.name, "xminal");
  await running.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("/v1/models lists configured providers", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-web-"));
  const running = await startServer({ cwd: dir, host: "127.0.0.1", port: 0 });
  const port = running.server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/v1/models`);
  const body = await res.json();
  assert.equal(body.object, "list");
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length > 0, "at least the default model should appear");
  assert.ok(Array.isArray(body.providers));
  await running.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("/v1/chat/completions rejects an empty prompt without calling the model", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-web-"));
  const running = await startServer({ cwd: dir, host: "127.0.0.1", port: 0 });
  const port = running.server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [] }),
  });
  assert.equal(res.status, 400);
  await running.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("/v1/sessions is a JSON list", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-web-"));
  const running = await startServer({ cwd: dir, host: "127.0.0.1", port: 0 });
  const port = running.server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/v1/sessions`);
  const body = await res.json();
  assert.ok(Array.isArray(body.data));
  await running.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("/v1/agent/stream rejects an empty prompt without calling the model", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-web-"));
  const running = await startServer({ cwd: dir, host: "127.0.0.1", port: 0 });
  const port = running.server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/v1/agent/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "" }),
  });
  assert.equal(res.status, 400);
  await running.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
