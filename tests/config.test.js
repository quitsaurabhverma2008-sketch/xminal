const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const { defaultConfig, resolveModel } = require("../dist/config/config");

test("default config ships providers and rejects unknown models", () => {
  const config = defaultConfig();
  assert.ok(Object.keys(config.providers).length >= 5);
  assert.throws(() => resolveModel(config, "definitely-not-a-model-or-provider"), /Unknown model/);
});

test("resolveModel resolves a local provider without a key", () => {
  const config = defaultConfig();
  const model = resolveModel(config, "ollama");
  assert.equal(model.provider, "ollama");
  assert.equal(model.providerConfig.type, "openai");
});

test("resolveModel(auto) fails clearly when no provider is available", () => {
  const config = defaultConfig();
  config.providers = {};
  assert.throws(() => resolveModel(config, "auto"), /No provider credentials/);
});
