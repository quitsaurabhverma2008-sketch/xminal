// secret-scan: allow
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CACHE = path.join(os.tmpdir(), `xminal-test-models-${process.pid}.json`);
process.env.XMINAL_MODELS_CACHE = CACHE;
delete process.env.XMINAL_MODELS_TTL_HOURS;

const { buildAliasesFromSnapshot, effectiveModelMap, invalidateModelsCatalog, listEffectiveAliases } = require("../dist/config/models-catalog");
const { resolveModel } = require("../dist/config/config");
const { defaultConfig } = require("../dist/config/config");

const SNAP = {
  openrouter: {
    models: {
      "vendor/cool-free:free": {
        id: "vendor/cool-free:free",
        modalities: { input: ["text"] },
        tool_call: true,
        limit: { context: 8192, output: 2048 },
        cost: { input: 0, output: 0 },
      },
      "vendor/paid-model": {
        id: "vendor/paid-model",
        modalities: { input: ["text"] },
        tool_call: true,
        limit: { context: 16384, output: 4096 },
        cost: { input: 1, output: 2 },
      },
      "vendor/vision-only": {
        id: "vendor/vision-only",
        modalities: { input: ["image"] },
        tool_call: true,
        limit: { context: 4096, output: 1024 },
        cost: { input: 0, output: 0 },
      },
    },
  },
  google: {
    models: {
      "gemini-x-flash": {
        id: "gemini-x-flash",
        modalities: { input: ["text"] },
        tool_call: true,
        limit: { context: 32000, output: 8192 },
        cost: { input: 0, output: 0 },
      },
    },
  },
};

test("buildAliasesFromSnapshot keeps text+tool models, skips non-text, prefixes provider, marks free via zero cost", () => {
  const aliases = buildAliasesFromSnapshot(SNAP);
  assert.ok(aliases["openrouter/vendor/cool-free:free"], "openrouter free alias exists");
  assert.equal(aliases["openrouter/vendor/cool-free:free"].provider, "openrouter");
  assert.equal(aliases["openrouter/vendor/cool-free:free"].contextWindow, 8192);
  assert.deepEqual(aliases["openrouter/vendor/cool-free:free"].capabilities, ["tools", "streaming"]);
  assert.ok(aliases["gemini/gemini-x-flash"], "google models are prefixed with the xminal provider key");
  assert.equal(aliases["gemini/gemini-x-flash"].provider, "gemini");
  assert.ok(!aliases["openrouter/vendor/vision-only"], "non-text models are skipped");
});

test("effectiveModelMap merges bundled defaults underneath and cache on top, user models win", () => {
  invalidateModelsCatalog();
  fs.writeFileSync(CACHE, JSON.stringify({ fetchedAt: new Date().toISOString(), models: buildAliasesFromSnapshot(SNAP) }));
  const userModels = { "openrouter/vendor/cool-free:free": { provider: "openrouter", model: "custom-free", inputPricePerMTok: 0, outputPricePerMTok: 0 } };
  const { models } = effectiveModelMap(userModels);
  assert.equal(models["openrouter/vendor/cool-free:free"].model, "custom-free", "user alias wins over catalog");
  assert.ok(models["openrouter/vendor/paid-model"], "cache aliases are visible");
  assert.ok(Object.keys(models).length > 250, "bundled defaults are present");
  fs.unlinkSync(CACHE);
  invalidateModelsCatalog();
});

test("listEffectiveAliases orders free models before paid", () => {
  fs.writeFileSync(CACHE, JSON.stringify({ fetchedAt: new Date().toISOString(), models: buildAliasesFromSnapshot(SNAP) }));
  const aliases = listEffectiveAliases({});
  const firstPaid = aliases.findIndex((m) => !m.free);
  const lastFree = aliases.map((m, i) => (m.free ? i : -1)).filter((i) => i >= 0).pop();
  assert.ok(firstPaid === -1 || lastFree < firstPaid, `free models (${lastFree}) must sort before paid (${firstPaid})`);
  fs.unlinkSync(CACHE);
  invalidateModelsCatalog();
});

test("resolveModel resolves a catalog-only alias from the cached catalog", () => {
  fs.writeFileSync(CACHE, JSON.stringify({ fetchedAt: new Date().toISOString(), models: buildAliasesFromSnapshot(SNAP) }));
  const config = defaultConfig();
  delete config.models["openrouter/vendor/cool-free:free"];
  const resolved = resolveModel(config, "openrouter/vendor/cool-free:free");
  assert.equal(resolved.provider, "openrouter");
  assert.equal(resolved.model, "vendor/cool-free:free");
  assert.equal(resolved.contextWindow, 8192);
  assert.equal(resolved.inputPricePerMTok, 0);
  fs.unlinkSync(CACHE);
  invalidateModelsCatalog();
});
