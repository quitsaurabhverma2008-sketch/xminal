"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_DEV_URL = void 0;
exports.isFreeModel = isFreeModel;
exports.buildAliasesFromSnapshot = buildAliasesFromSnapshot;
exports.effectiveModelMap = effectiveModelMap;
exports.lookupModelAlias = lookupModelAlias;
exports.listEffectiveAliases = listEffectiveAliases;
exports.catalogMeta = catalogMeta;
exports.invalidateModelsCatalog = invalidateModelsCatalog;
exports.isFreeAlias = isFreeAlias;
exports.refreshModelsCatalog = refreshModelsCatalog;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const paths_1 = require("./paths");
const version_1 = require("../version");
exports.MODEL_DEV_URL = "https://models.dev/api.json";
const CACHE_FILE = process.env.XMINAL_MODELS_CACHE ?? node_path_1.default.join((0, paths_1.globalXminalDir)(), "cache", "models.json");
const TTL_HOURS = Number(process.env.XMINAL_MODELS_TTL_HOURS ?? "24");
const TTL_MS = Math.max(0, TTL_HOURS) * 3600_000;
const MD_TO_XM = {
    "302ai": "302ai",
    alibaba: "alibaba",
    anthropic: "anthropic",
    cerebras: "cerebras",
    cohere: "cohere",
    deepinfra: "deepinfra",
    deepseek: "deepseek",
    friendli: "friendli",
    google: "gemini",
    huggingface: "huggingface",
    lmstudio: "lmstudio",
    minimax: "minimax",
    mistral: "mistral",
    moonshotai: "moonshotai",
    "moonshotai-cn": "moonshotai_cn",
    nebius: "nebius",
    nvidia: "nvidia",
    openai: "openai",
    opencode: "opencode",
    openrouter: "openrouter",
    poe: "poe",
    sambanova: "sambanova",
    siliconflow: "siliconflow",
    stepfun: "stepfun",
    togetherai: "togetherai",
    venice: "venice",
    vercel: "vercel",
    volcengine: "volcengine",
    xai: "xai",
    zai: "zai",
    zhipuai: "zhipuai",
};
function isZeroCost(input, output) {
    return Number(input ?? -1) === 0 && Number(output ?? -1) === 0;
}
function isFreeModel(m) {
    return isZeroCost(m.inputPricePerMTok, m.outputPricePerMTok);
}
function buildAliasesFromSnapshot(snapshot) {
    const root = (snapshot ?? {});
    const out = {};
    for (const [mdId, xmKey] of Object.entries(MD_TO_XM)) {
        const provider = root[mdId];
        const models = provider?.models;
        if (!models)
            continue;
        for (const [modelId, raw] of Object.entries(models)) {
            if (!raw || typeof raw !== "object")
                continue;
            const modalities = (raw.modalities ?? {});
            if (Array.isArray(modalities.input) && !modalities.input.includes("text"))
                continue;
            const cost = (raw.cost ?? {});
            const capabilities = [
                ...(raw.tool_call ? ["tools"] : []),
                "streaming",
            ];
            const alias = `${xmKey}/${modelId}`;
            out[alias] = {
                provider: xmKey,
                model: modelId,
                contextWindow: raw.limit ? Number(raw.limit.context ?? 0) || undefined : undefined,
                maxOutput: raw.limit ? Number(raw.limit.output ?? 0) || undefined : undefined,
                inputPricePerMTok: Number(cost.input ?? 0),
                outputPricePerMTok: Number(cost.output ?? 0),
                capabilities,
            };
        }
    }
    return out;
}
let bundledAliases;
function bundled() {
    if (!bundledAliases) {
        bundledAliases = require("./default-models").DEFAULT_MODELS;
    }
    return bundledAliases;
}
let cachedFile;
function readCache() {
    try {
        const stat = node_fs_1.default.statSync(CACHE_FILE);
        if (cachedFile && cachedFile.mtimeMs === stat.mtimeMs)
            return cachedFile;
        const parsed = JSON.parse(node_fs_1.default.readFileSync(CACHE_FILE, "utf8"));
        if (!parsed || !parsed.models || typeof parsed.models !== "object")
            return undefined;
        cachedFile = { mtimeMs: stat.mtimeMs, models: parsed.models, fetchedAt: parsed.fetchedAt ?? new Date(stat.mtimeMs).toISOString() };
        return cachedFile;
    }
    catch {
        return undefined;
    }
}
function mergeAliases(userModels) {
    const cache = readCache();
    const bundledMap = bundled();
    const models = { ...bundledMap, ...(cache?.models ?? {}), ...userModels };
    const all = Object.values(models);
    const free = all.filter((m) => isZeroCost(m.inputPricePerMTok, m.outputPricePerMTok)).length;
    const providerCount = new Set(all.map((m) => m.provider)).size;
    const meta = {
        source: cache ? "cache" : "bundled",
        fetchedAt: cache?.fetchedAt,
        modelCount: all.length,
        providerCount,
        freeCount: free,
        cachePath: CACHE_FILE,
    };
    return { models, meta };
}
function effectiveModelMap(userModels = {}) {
    return mergeAliases(userModels);
}
function lookupModelAlias(userModels, alias) {
    return mergeAliases(userModels).models[alias];
}
function listEffectiveAliases(userModels = {}) {
    const { models } = mergeAliases(userModels);
    return Object.entries(models)
        .map(([alias, m]) => ({
        alias,
        provider: m.provider,
        model: m.model,
        free: isZeroCost(m.inputPricePerMTok, m.outputPricePerMTok),
    }))
        .sort((a, b) => (Number(b.free) - Number(a.free)) ||
        a.provider.localeCompare(b.provider) ||
        a.model.localeCompare(b.model));
}
function catalogMeta(userModels = {}) {
    return mergeAliases(userModels).meta;
}
function invalidateModelsCatalog() {
    cachedFile = undefined;
}
function isFreeAlias(config, alias) {
    const m = effectiveModelMap(config.models).models[alias];
    return Boolean(m) && isZeroCost(m.inputPricePerMTok, m.outputPricePerMTok);
}
async function refreshModelsCatalog(opts = {}) {
    const cache = readCache();
    if (!opts.force && cache && Number.isFinite(TTL_MS) && Date.now() - Date.parse(cache.fetchedAt) < TTL_MS) {
        const meta = catalogMeta();
        return { ...meta, source: "cache", ok: true, newModels: 0 };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
        const response = await fetch(exports.MODEL_DEV_URL, {
            signal: controller.signal,
            headers: { "user-agent": `xminal/${version_1.VERSION} (+https://github.com/quitsaurabhverma2008-sketch/xminal)`, accept: "application/json" },
        });
        if (!response.ok) {
            const meta = catalogMeta();
            return { ...meta, source: "stale-cache", ok: false, newModels: 0, error: `models.dev returned HTTP ${response.status}` };
        }
        const snapshot = (await response.json());
        const aliases = buildAliasesFromSnapshot(snapshot);
        const previous = cache?.models ?? {};
        const newModels = Object.keys(aliases).filter((alias) => !previous[alias]).length;
        node_fs_1.default.mkdirSync(node_path_1.default.dirname(CACHE_FILE), { recursive: true });
        node_fs_1.default.writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: new Date().toISOString(), source: exports.MODEL_DEV_URL, models: aliases }), "utf8");
        try {
            node_fs_1.default.chmodSync(CACHE_FILE, 0o600);
        }
        catch { /* best effort */ }
        invalidateModelsCatalog();
        const all = Object.values(aliases);
        const free = all.filter((m) => isZeroCost(m.inputPricePerMTok, m.outputPricePerMTok)).length;
        return {
            source: "fresh",
            fetchedAt: new Date().toISOString(),
            modelCount: all.length,
            providerCount: new Set(all.map((m) => m.provider)).size,
            freeCount: free,
            cachePath: CACHE_FILE,
            ok: true,
            newModels,
        };
    }
    catch (error) {
        const meta = catalogMeta();
        return { ...meta, source: "stale-cache", ok: false, newModels: 0, error: error.message };
    }
    finally {
        clearTimeout(timer);
    }
}
//# sourceMappingURL=models-catalog.js.map