"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfig = defaultConfig;
exports.loadConfig = loadConfig;
exports.saveGlobalConfig = saveGlobalConfig;
exports.saveProjectConfig = saveProjectConfig;
exports.initProject = initProject;
exports.getApiKey = getApiKey;
exports.providerReady = providerReady;
exports.listModelAliases = listModelAliases;
exports.resolveModel = resolveModel;
exports.resolveFallbacks = resolveFallbacks;
const node_path_1 = __importDefault(require("node:path"));
const fs_1 = require("../util/fs");
const paths_1 = require("./paths");
const default_models_1 = require("./default-models");
const provider_defaults_1 = require("./provider-defaults");
function defaultConfig() {
    const providers = {
        opencode: {
            type: "openai",
            baseUrl: "https://opencode.ai/inference/openai/v1",
            requiresKey: false,
        },
        openai: { type: "openai", baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY" },
        anthropic: { type: "anthropic", baseUrl: "https://api.anthropic.com", apiKeyEnv: "ANTHROPIC_API_KEY" },
        gemini: {
            type: "gemini",
            baseUrl: "https://generativelanguage.googleapis.com",
            apiKeyEnv: "GEMINI_API_KEY",
        },
        openrouter: {
            type: "openai",
            baseUrl: "https://openrouter.ai/api/v1",
            apiKeyEnv: "OPENROUTER_API_KEY",
        },
        groq: { type: "openai", baseUrl: "https://api.groq.com/openai/v1", apiKeyEnv: "GROQ_API_KEY" },
        deepseek: { type: "openai", baseUrl: "https://api.deepseek.com/v1", apiKeyEnv: "DEEPSEEK_API_KEY" },
        mistral: { type: "openai", baseUrl: "https://api.mistral.ai/v1", apiKeyEnv: "MISTRAL_API_KEY" },
        xai: { type: "openai", baseUrl: "https://api.x.ai/v1", apiKeyEnv: "XAI_API_KEY" },
        cerebras: { type: "openai", baseUrl: "https://api.cerebras.ai/v1", apiKeyEnv: "CEREBRAS_API_KEY" },
        cohere: { type: "openai", baseUrl: "https://api.cohere.com/compatibility/v1", apiKeyEnv: "COHERE_API_KEY" },
        togetherai: { type: "openai", baseUrl: "https://api.together.xyz/v1", apiKeyEnv: "TOGETHER_API_KEY" },
        fireworks: { type: "openai", baseUrl: "https://api.fireworks.ai/inference/v1", apiKeyEnv: "FIREWORKS_API_KEY" },
        perplexity: { type: "openai", baseUrl: "https://api.perplexity.ai", apiKeyEnv: "PERPLEXITY_API_KEY" },
        moonshotai: { type: "openai", baseUrl: "https://api.moonshot.ai/v1", apiKeyEnv: "MOONSHOT_API_KEY" },
        moonshotai_cn: { type: "openai", baseUrl: "https://api.moonshot.cn/v1", apiKeyEnv: "MOONSHOT_API_KEY" },
        huggingface: { type: "openai", baseUrl: "https://router.huggingface.co/v1", apiKeyEnv: "HF_TOKEN" },
        github: { type: "openai", baseUrl: "https://models.github.ai/inference", apiKeyEnv: "GITHUB_TOKEN" },
        nvidia: { type: "openai", baseUrl: "https://integrate.api.nvidia.com/v1", apiKeyEnv: "NVIDIA_API_KEY" },
        deepinfra: { type: "openai", baseUrl: "https://api.deepinfra.com/v1/openai", apiKeyEnv: "DEEPINFRA_API_KEY" },
        sambanova: { type: "openai", baseUrl: "https://api.sambanova.ai/v1", apiKeyEnv: "SAMBANOVA_API_KEY" },
        novita: { type: "openai", baseUrl: "https://api.novita.ai/openai", apiKeyEnv: "NOVITA_API_KEY" },
        friendli: { type: "openai", baseUrl: "https://api.friendli.ai/serverless/v1", apiKeyEnv: "FRIENDLI_API_KEY" },
        nebius: { type: "openai", baseUrl: "https://api.tokenfactory.nebius.com/v1", apiKeyEnv: "NEBIUS_API_KEY" },
        poe: { type: "openai", baseUrl: "https://api.poe.com/v1", apiKeyEnv: "POE_API_KEY" },
        ollama_cloud: { type: "openai", baseUrl: "https://ollama.com/v1", apiKeyEnv: "OLLAMA_API_KEY" },
        zai: { type: "openai", baseUrl: "https://api.z.ai/api/paas/v4", apiKeyEnv: "ZAI_API_KEY" },
        zhipuai: { type: "openai", baseUrl: "https://open.bigmodel.cn/api/paas/v4", apiKeyEnv: "ZHIPU_API_KEY" },
        minimax: { type: "anthropic", baseUrl: "https://api.minimax.io/anthropic", apiKeyEnv: "MINIMAX_API_KEY" },
        stepfun: { type: "openai", baseUrl: "https://api.stepfun.ai/v1", apiKeyEnv: "STEPFUN_API_KEY" },
        stepfun_cn: { type: "openai", baseUrl: "https://api.stepfun.com/v1", apiKeyEnv: "STEPFUN_API_KEY" },
        siliconflow: { type: "openai", baseUrl: "https://api.siliconflow.com/v1", apiKeyEnv: "SILICONFLOW_API_KEY" },
        volcengine: {
            type: "openai",
            baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
            apiKeyEnv: "VOLCENGINE_API_KEY",
        },
        "302ai": { type: "openai", baseUrl: "https://api.302.ai/v1", apiKeyEnv: "AI_302AI_API_KEY" },
        venice: { type: "openai", baseUrl: "https://api.venice.ai/api/v1", apiKeyEnv: "VENICE_API_KEY" },
        vercel: { type: "openai", baseUrl: "https://ai-gateway.vercel.sh/v1", apiKeyEnv: "VERCEL_AI_GATEWAY_API_KEY" },
        alibaba: {
            type: "openai",
            baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
            apiKeyEnv: "DASHSCOPE_API_KEY",
        },
        ollama: { type: "openai", baseUrl: "http://localhost:11434/v1", apiKey: "ollama" },
        ollama_cn: { type: "openai", baseUrl: "http://localhost:11435/v1", apiKey: "ollama" },
        lmstudio: { type: "openai", baseUrl: "http://localhost:1234/v1", apiKey: "lmstudio" },
        vllm: { type: "openai", baseUrl: "http://localhost:8000/v1", apiKey: "vllm" },
        llama_cpp: { type: "openai", baseUrl: "http://localhost:8080/v1", apiKey: "llama.cpp" },
        koboldcpp: { type: "openai", baseUrl: "http://localhost:5001/v1", apiKey: "koboldcpp" },
        textgen: { type: "openai", baseUrl: "http://localhost:5000/v1", apiKey: "textgen" },
        gpt4all: { type: "openai", baseUrl: "http://localhost:4891/v1", apiKey: "gpt4all" },
        openwebui: { type: "openai", baseUrl: "http://localhost:3000/v1", apiKey: "openwebui" },
    };
    return {
        version: 1,
        providers,
        models: { ...default_models_1.DEFAULT_MODELS },
        defaultModel: "opencode/inkling-2-small-free",
        fallbackModels: [],
        router: { policy: ["failover", "quota", "cost", "capability"] },
        limits: { maxTurns: 40, maxTokensPerTurn: 32000, maxCostPerSession: 5 },
        permissions: {
            mode: "auto",
            protectedPaths: ["~/.ssh", "~/.aws", "~/.gnupg", "~/.config/gh", ".env", ".env.local"],
        },
        sandbox: { enabled: false, backend: "none", allowNetwork: true },
        mcpServers: {},
        ui: { theme: "dark", showCost: true, stream: true },
    };
}
function mergeConfig(base, override) {
    return {
        ...base,
        ...override,
        providers: { ...base.providers, ...(override.providers ?? {}) },
        models: { ...base.models, ...(override.models ?? {}) },
        router: { ...base.router, ...(override.router ?? {}) },
        limits: { ...base.limits, ...(override.limits ?? {}) },
        permissions: { ...base.permissions, ...(override.permissions ?? {}) },
        sandbox: { ...base.sandbox, ...(override.sandbox ?? {}) },
        mcpServers: { ...base.mcpServers, ...(override.mcpServers ?? {}) },
        ui: { ...base.ui, ...(override.ui ?? {}) },
    };
}
function loadConfig(cwd) {
    const globalPath = (0, paths_1.globalConfigPath)();
    const projectPath = (0, paths_1.projectConfigPath)(cwd);
    let config = defaultConfig();
    if ((0, fs_1.exists)(globalPath)) {
        config = mergeConfig(config, (0, fs_1.readJson)(globalPath, {}));
    }
    if ((0, fs_1.exists)(projectPath)) {
        config = mergeConfig(config, (0, fs_1.readJson)(projectPath, {}));
    }
    if (process.env.XMINAL_MODEL) {
        config = { ...config, defaultModel: process.env.XMINAL_MODEL };
    }
    if (process.env.XMINAL_PERMISSION_MODE) {
        config = {
            ...config,
            permissions: { ...config.permissions, mode: process.env.XMINAL_PERMISSION_MODE },
        };
    }
    return { config, globalPath, projectPath, projectExists: (0, fs_1.exists)(projectPath) };
}
function saveGlobalConfig(config) {
    (0, fs_1.writeJson)((0, paths_1.globalConfigPath)(), config);
}
function saveProjectConfig(cwd, config) {
    (0, fs_1.writeJson)((0, paths_1.projectConfigPath)(cwd), config);
}
function initProject(cwd) {
    const file = (0, paths_1.projectConfigPath)(cwd);
    (0, fs_1.ensureDir)(node_path_1.default.dirname(file));
    if (!(0, fs_1.exists)(file)) {
        const projectConfig = {
            defaultModel: "auto",
            permissions: { mode: "auto", protectedPaths: [] },
        };
        (0, fs_1.writeJson)(file, projectConfig);
    }
    return { configPath: file };
}
function getApiKey(provider) {
    if (provider.apiKey)
        return provider.apiKey;
    if (provider.apiKeyEnv && process.env[provider.apiKeyEnv])
        return process.env[provider.apiKeyEnv];
    return undefined;
}
function providerReady(provider) {
    if (provider.requiresKey === false)
        return true;
    if (provider.type === "openai" && /localhost|127\.0\.0\.1/.test(provider.baseUrl ?? ""))
        return true;
    return Boolean(getApiKey(provider));
}
function providerHasCredentials(provider) {
    return providerReady(provider);
}
function listModelAliases(config) {
    return Object.keys(config.models).sort();
}
function resolveModel(config, spec) {
    const requested = (spec || config.defaultModel || "auto").trim();
    if (requested === "auto") {
        const candidates = Object.entries(config.providers).filter(([, provider]) => providerHasCredentials(provider));
        if (candidates.length === 0) {
            throw new Error("No provider credentials found. Set an API key env var (e.g. OPENROUTER_API_KEY) or run `xminal init` and configure ~/.xminal/config.json.");
        }
        const [name, providerConfig] = candidates[0];
        return buildResolved(name, providerConfig, config, defaultModelName(name));
    }
    if (config.models[requested]) {
        const modelConfig = config.models[requested];
        const providerConfig = config.providers[modelConfig.provider];
        if (!providerConfig) {
            throw new Error(`Model alias "${requested}" points to unknown provider "${modelConfig.provider}".`);
        }
        return {
            alias: requested,
            provider: modelConfig.provider,
            providerConfig,
            model: modelConfig.model,
            contextWindow: modelConfig.contextWindow ?? 128000,
            maxOutput: modelConfig.maxOutput ?? 8192,
            inputPricePerMTok: modelConfig.inputPricePerMTok ?? 0,
            outputPricePerMTok: modelConfig.outputPricePerMTok ?? 0,
            capabilities: modelConfig.capabilities ?? ["tools", "streaming"],
        };
    }
    const slash = requested.indexOf("/");
    if (slash > 0) {
        const providerName = requested.slice(0, slash);
        const modelName = requested.slice(slash + 1);
        const providerConfig = config.providers[providerName];
        if (!providerConfig) {
            throw new Error(`Unknown provider "${providerName}". Known providers: ${Object.keys(config.providers).join(", ")}`);
        }
        return buildResolved(providerName, providerConfig, config, modelName);
    }
    const providerConfig = config.providers[requested];
    if (providerConfig) {
        return buildResolved(requested, providerConfig, config, defaultModelName(requested));
    }
    throw new Error(`Unknown model "${requested}". Use provider/model, a configured alias, or "auto".`);
}
function buildResolved(providerName, providerConfig, config, model) {
    const alias = Object.entries(config.models).find(([, value]) => value.provider === providerName && value.model === model)?.[0];
    return {
        alias: alias ?? `${providerName}/${model}`,
        provider: providerName,
        providerConfig,
        model,
        contextWindow: 128000,
        maxOutput: 8192,
        inputPricePerMTok: 0,
        outputPricePerMTok: 0,
        capabilities: ["tools", "streaming"],
    };
}
function defaultModelName(providerKey) {
    return provider_defaults_1.PROVIDER_DEFAULT_MODELS[providerKey] ?? "gpt-4o-mini";
}
function resolveFallbacks(config) {
    return [...config.fallbackModels];
}
//# sourceMappingURL=config.js.map