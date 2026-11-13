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
  assert.match(body, /id="sbar"/);
  assert.match(body, /id="rail"/);
  assert.match(body, /id="ta"/);
  assert.match(body, /data-act="send"/);
  assert.match(body, /class="tools"/);
  assert.match(body, /\/v1\/agent\/stream/);
  assert.match(body, /\/v1\/agent\/permission/);
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

test("/v1/agent/permission rejects an unknown id", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-web-"));
  const running = await startServer({ cwd: dir, host: "127.0.0.1", port: 0 });
  const port = running.server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/v1/agent/permission`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "perm-does-not-exist", approve: true }),
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.type, "not_found");
  await running.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("invalid JSON bodies are rejected with 400, not 500", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-web-"));
  const running = await startServer({ cwd: dir, host: "127.0.0.1", port: 0 });
  const port = running.server.address().port;
  for (const pathname of ["/v1/agent/stream", "/v1/agent/permission", "/v1/chat/completions"]) {
    const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    assert.equal(res.status, 400, `${pathname} should reject malformed JSON`);
  }
  await running.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("/v1/agent/stream rejects an empty prompt without calling the model", async () => {
  for (const promptBody of [{ prompt: "" }, { message: "" }, { input: "" }]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-web-"));
    const running = await startServer({ cwd: dir, host: "127.0.0.1", port: 0 });
    const port = running.server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/v1/agent/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(promptBody),
    });
    assert.equal(res.status, 400);
    await running.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
