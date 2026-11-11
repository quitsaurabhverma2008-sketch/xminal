// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

const { ProviderRouter } = require("../dist/providers/router");

/** A local OpenAI-compatible server: one model is out of quota, the rest work. */
function fakeProvider(quotaModels) {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const model = (() => {
        try {
          return JSON.parse(body).model;
        } catch {
          return "";
        }
      })();
      if (quotaModels.includes(model)) {
        res.writeHead(429, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: { type: "rate_limit_error", message: "Free usage limit reached. Free models work in OpenCode" },
          }),
        );
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 2 } })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function makeConfig(port) {
  return {
    version: 1,
    providers: {
      pool: { type: "openai", baseUrl: `http://127.0.0.1:${port}/v1`, requiresKey: false },
    },
    models: {
      "pool/used-up": { provider: "pool", model: "used-up", contextWindow: 100000, maxOutput: 4096, inputPricePerMTok: 0, outputPricePerMTok: 0 },
      "pool/spare-one": { provider: "pool", model: "spare-one", contextWindow: 100000, maxOutput: 4096, inputPricePerMTok: 0, outputPricePerMTok: 0 },
      "pool/spare-two": { provider: "pool", model: "spare-two", contextWindow: 200000, maxOutput: 4096, inputPricePerMTok: 0, outputPricePerMTok: 0 },
    },
    defaultModel: "pool/used-up",
    fallbackModels: [],
    router: { policy: ["failover"] },
    limits: { maxTurns: 10, maxTokensPerTurn: 0, maxCostPerSession: 5 },
    permissions: { mode: "auto", protectedPaths: [] },
    sandbox: { enabled: false, backend: "none", allowNetwork: true },
    mcpServers: {},
    ui: { theme: "dark", showCost: true, stream: true },
  };
}

async function collect(router, spec) {
  const events = [];
  for await (const event of router.chat({ model: spec, messages: [{ role: "user", content: "hi" }], tools: [] })) {
    events.push(event);
  }
  return events;
}

test("a model that ran out of quota falls through to the provider's other free models", async () => {
  const { server, port } = await fakeProvider(["used-up"]);
  try {
    const router = new ProviderRouter(makeConfig(port));
    const events = await collect(router, "pool/used-up");
    const notice = events.find((e) => e.type === "notice");
    const text = events.find((e) => e.type === "text");
    const error = events.find((e) => e.type === "error");
    assert.ok(notice, `expected a notice about the switch, got ${JSON.stringify(events.map((e) => e.type))}`);
    assert.match(notice.message, /quota/i);
    assert.match(notice.message, /pool\/spare/);
    assert.ok(text, "the turn should have been answered by the fallback model");
    assert.equal(text.text, "ok");
    assert.equal(error, undefined, "a working sibling model must not surface an error");
  } finally {
    server.close();
  }
});

test("sibling models are ordered free-first and by context window", async () => {
  const { server, port } = await fakeProvider([]);
  try {
    const router = new ProviderRouter(makeConfig(port));
    const primary = router.resolve("pool/used-up");
    const siblings = router.siblings(primary, 5).map((m) => m.alias);
    assert.deepEqual(siblings, ["pool/spare-two", "pool/spare-one"]);
  } finally {
    server.close();
  }
});

test("when every model is out of quota the error names the real cause", async () => {
  const { server, port } = await fakeProvider(["used-up", "spare-one", "spare-two"]);
  try {
    const router = new ProviderRouter(makeConfig(port));
    const events = await collect(router, "pool/used-up");
    const error = events.find((e) => e.type === "error");
    assert.ok(error, "an error must be reported when nothing works");
    assert.match(error.message, /free usage limit/i);
  } finally {
    server.close();
  }
});
