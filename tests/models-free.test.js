const test = require("node:test");
const assert = require("node:assert");

const { isFreeModel } = require("../dist/config/models-catalog");

test("a model with unknown pricing is NOT free", () => {
  // the bug: missing cost was defaulted to 0, so paid models showed a FREE badge
  assert.equal(isFreeModel({ provider: "x", model: "y" }), false);
  assert.equal(isFreeModel({ provider: "x", model: "y", inputPricePerMTok: undefined, outputPricePerMTok: undefined }), false);
});

test("an explicit 0/0 price is free", () => {
  assert.equal(isFreeModel({ provider: "x", model: "y", inputPricePerMTok: 0, outputPricePerMTok: 0 }), true);
});

test("a paid model is not free", () => {
  assert.equal(isFreeModel({ provider: "x", model: "y", inputPricePerMTok: 0.15, outputPricePerMTok: 0.6 }), false);
  assert.equal(isFreeModel({ provider: "x", model: "y", inputPricePerMTok: 0, outputPricePerMTok: 0.6 }), false);
});
