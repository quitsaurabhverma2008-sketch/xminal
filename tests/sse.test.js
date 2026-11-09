// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");

const { readError } = require("../dist/providers/sse");

test("readError extracts message from OpenAI-style error envelopes", async () => {
  const body = JSON.stringify({
    error: {
      message: "Request too large for model `gpt-oss-120b`: Limit 8000, Requested 18216",
      type: "rate_limit_exceeded",
      code: "rate_limit_exceeded",
    },
  });
  const res = new Response(body, { status: 429, statusText: "Too Many Requests" });
  const message = await readError(res);
  assert.equal(message.includes("Request too large"), true);
  assert.equal(message.includes("rate_limit_exceeded"), true);
  assert.ok(message.length < 400, "message stays short");
});

test("readError falls back to trimmed text for non-JSON bodies", async () => {
  const res = new Response("upstream timeout\n", { status: 502 });
  const message = await readError(res);
  assert.equal(message, "upstream timeout");
});

test("readError extracts bare { message } shapes", async () => {
  const res = new Response(JSON.stringify({ message: "bad api key" }), { status: 401 });
  const message = await readError(res);
  assert.equal(message, "bad api key");
});
