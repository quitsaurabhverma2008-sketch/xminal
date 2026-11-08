"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderRouter = exports.ProviderError = void 0;
exports.createAdapter = createAdapter;
const config_1 = require("../config/config");
const types_1 = require("./types");
const openai_1 = require("./openai");
const anthropic_1 = require("./anthropic");
const gemini_1 = require("./gemini");
var types_2 = require("./types");
Object.defineProperty(exports, "ProviderError", { enumerable: true, get: function () { return types_2.ProviderError; } });
function createAdapter(model) {
    switch (model.providerConfig.type) {
        case "anthropic":
            return new anthropic_1.AnthropicAdapter();
        case "gemini":
            return new gemini_1.GeminiAdapter();
        case "openai":
        default:
            return new openai_1.OpenAiAdapter();
    }
}
class ProviderRouter {
    config;
    constructor(config) {
        this.config = config;
    }
    resolve(spec) {
        return (0, config_1.resolveModel)(this.config, spec);
    }
    candidates(primary) {
        const specs = [primary || this.config.defaultModel, ...this.config.fallbackModels];
        for (const [name, provider] of Object.entries(this.config.providers)) {
            if ((0, config_1.providerReady)(provider))
                specs.push(name);
        }
        const seen = new Set();
        const out = [];
        for (const spec of specs) {
            if (!spec || seen.has(spec))
                continue;
            seen.add(spec);
            try {
                out.push((0, config_1.resolveModel)(this.config, spec));
            }
            catch {
                // skip invalid fallback entries
            }
        }
        if (out.length === 0)
            out.push((0, config_1.resolveModel)(this.config, primary));
        return out;
    }
    async *chat(request) {
        const candidates = request.model
            ? typeof request.model === "string"
                ? this.candidates(request.model)
                : [request.model]
            : this.candidates();
        let lastError;
        let firstError;
        for (const [index, model] of candidates.entries()) {
            const adapter = createAdapter(model);
            let emitted = false;
            try {
                const stream = adapter.chat({ ...request, model });
                for await (const event of stream) {
                    if (event.type !== "done" && event.type !== "usage")
                        emitted = true;
                    if (event.type === "usage")
                        yield { ...event, model };
                    else
                        yield event;
                }
                return;
            }
            catch (error) {
                lastError = error;
                if (index === 0)
                    firstError = lastError;
                const retryable = error instanceof types_1.ProviderError ? error.retryable : true;
                if (emitted || !retryable || index === candidates.length - 1) {
                    const primary = firstError ?? lastError;
                    const suffix = candidates.length > 1 ? ` (all ${candidates.length} candidate providers failed)` : "";
                    yield {
                        type: "error",
                        message: (primary?.message ?? "provider request failed") + suffix,
                    };
                    return;
                }
            }
        }
        if (lastError || firstError) {
            const primary = firstError ?? lastError;
            yield { type: "error", message: primary?.message ?? "provider request failed" };
        }
    }
}
exports.ProviderRouter = ProviderRouter;
//# sourceMappingURL=router.js.map