import fs from "node:fs";
import path from "node:path";
import { exists, readJson, writeJson, ensureDir, chmodPrivate } from "../util/fs";
import { globalConfigPath, projectConfigPath, globalXminalDir } from "./paths";
import { DEFAULT_MODELS } from "./default-models";
import { PROVIDER_CATALOG, PROVIDER_DEFAULT_MODELS } from "./providers";
import { effectiveModelMap, isFreeModel, lookupModelAlias } from "./models-catalog";
import type { McpServerConfig, ProviderConfig, ResolvedModel, XminalConfig } from "./types";

export function defaultConfig(): XminalConfig {
  // built from the canonical catalog (src/config/providers.ts) — the only
  // place provider identity lives
  const providers: Record<string, ProviderConfig> = {};
  for (const entry of PROVIDER_CATALOG) {
    const requiresKey = entry.kind === "byok" && !entry.apiKey;
    providers[entry.key] = {
      type: entry.type,
      baseUrl: entry.baseUrl,
      ...(entry.env ? { apiKeyEnv: entry.env } : {}),
      ...(entry.apiKey ? { apiKey: entry.apiKey } : {}),
      ...(requiresKey ? {} : { requiresKey: false }),
    };
  }

  return {
    version: 1,
    providers,
    models: { ...DEFAULT_MODELS },
    defaultModel: "opencode/inkling-2-small-free",
    fallbackModels: [],
    router: { policy: ["failover", "quota", "cost", "capability"] },
    limits: { maxTurns: 40, maxTokensPerTurn: 0, maxCostPerSession: 5 }, // 0 = unlimited per-turn output
    autoVerify: true,
    autoVerifyRepairs: 1,
    permissions: {
      mode: "auto",
      // ~/.xminal holds the provider keys — the agent must not read it
      protectedPaths: ["~/.ssh", "~/.aws", "~/.gnupg", "~/.config/gh", "~/.xminal", "~/.config/xminal", ".env", ".env.local"],
    },
    sandbox: { enabled: false, backend: "none", allowNetwork: true },
    mcpServers: {},
    ui: { theme: "dark", showCost: true, stream: true },
  };
}

function mergeConfig(base: XminalConfig, override: Partial<XminalConfig>): XminalConfig {
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

export interface LoadedConfig {
  config: XminalConfig;
  globalPath: string;
  projectPath: string;
  projectExists: boolean;
}

export function loadConfig(cwd: string): LoadedConfig {
  const globalPath = globalConfigPath();
  const projectPath = projectConfigPath(cwd);
  let config = defaultConfig();
  if (exists(globalPath)) {
    config = mergeConfig(config, readJson<Partial<XminalConfig>>(globalPath, {}));
  }
  if (exists(projectPath)) {
    config = mergeConfig(config, readJson<Partial<XminalConfig>>(projectPath, {}));
  }
  if (process.env.XMINAL_MODEL) {
    config = { ...config, defaultModel: process.env.XMINAL_MODEL };
  }
  if (process.env.XMINAL_PERMISSION_MODE) {
    config = {
      ...config,
      permissions: { ...config.permissions, mode: process.env.XMINAL_PERMISSION_MODE as XminalConfig["permissions"]["mode"] },
    };
  }
  return { config, globalPath, projectPath, projectExists: exists(projectPath) };
}

export function saveGlobalConfig(config: XminalConfig): void {
  // the global config holds provider API keys → owner-read/write only
  try {
    fs.chmodSync(globalXminalDir(), 0o700);
  } catch {
    // best effort (shared storage does not support POSIX modes)
  }
  writeJson(globalConfigPath(), config, 0o600);
}

/**
 * Make sure the global config is not world/group readable.
 * Called at startup so a config written by an older version gets hardened.
 */
export function hardenConfigPermissions(): void {
  const file = globalConfigPath();
  if (exists(file)) chmodPrivate(file);
}

/**
 * Add (or replace) an MCP server in the global config.
 *
 * The existing file is backed up first — this writes to the user's config, so
 * it must never be able to lose data. The new entry stays `enabled: false`
 * until the user has filled in the real run command.
 */
export function addGlobalMcpServer(name: string, server: McpServerConfig): { path: string; backup?: string } {
  const file = globalConfigPath();
  const current = exists(file) ? readJson<Partial<XminalConfig>>(file, {}) : {};
  let backup: string | undefined;
  if (exists(file)) {
    backup = `${file}.bak`;
    try {
      fs.copyFileSync(file, backup);
    } catch {
      backup = undefined;
    }
  }
  const mcpServers = { ...(current.mcpServers ?? {}), [name]: server };
  writeJson(file, { ...current, mcpServers }, 0o600);
  return { path: file, backup };
}

export function initProject(cwd: string): { configPath: string } {
  const file = projectConfigPath(cwd);
  ensureDir(path.dirname(file));
  if (!exists(file)) {
    const projectConfig: Partial<XminalConfig> = {
      defaultModel: "auto",
      permissions: { mode: "auto", protectedPaths: [] },
    };
    writeJson(file, projectConfig);
  }
  return { configPath: file };
}

export function getApiKey(provider: ProviderConfig): string | undefined {
  if (provider.apiKey) return provider.apiKey;
  if (provider.apiKeyEnv && process.env[provider.apiKeyEnv]) return process.env[provider.apiKeyEnv];
  return undefined;
}

export function providerReady(provider: ProviderConfig): boolean {
  if (provider.requiresKey === false) return true;
  if (provider.type === "openai" && /localhost|127\.0\.0\.1/.test(provider.baseUrl ?? "")) return true;
  return Boolean(getApiKey(provider));
}

function providerHasCredentials(provider: ProviderConfig): boolean {
  return providerReady(provider);
}

export function listModelAliases(config: XminalConfig): string[] {
  return Object.entries(effectiveModelMap(config.models).models)
    .sort(([a, ma], [b, mb]) =>
      (Number(isFreeModel(mb)) - Number(isFreeModel(ma))) || a.localeCompare(b),
    )
    .map(([alias]) => alias);
}

export function resolveModel(config: XminalConfig, spec?: string): ResolvedModel {
  const requested = (spec || config.defaultModel || "auto").trim();

  if (requested === "auto") {
    const candidates = Object.entries(config.providers).filter(([, provider]) => providerHasCredentials(provider));
    if (candidates.length === 0) {
      throw new Error(
        "No provider credentials found. Set an API key env var (e.g. OPENROUTER_API_KEY) or run `xminal init` and configure ~/.xminal/config.json.",
      );
    }
    const [name, providerConfig] = candidates[0];
    return buildResolved(name, providerConfig, config, defaultModelName(name));
  }

  const effModels = effectiveModelMap(config.models).models;
  if (effModels[requested]) {
    const modelConfig = effModels[requested];
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
      throw new Error(
        `Unknown provider "${providerName}". Known providers: ${Object.keys(config.providers).join(", ")}`,
      );
    }
    const meta = lookupModelAlias(config.models, requested);
    if (meta) {
      return {
        alias: requested,
        provider: providerName,
        providerConfig,
        model: meta.model,
        contextWindow: meta.contextWindow ?? 128000,
        maxOutput: meta.maxOutput ?? 8192,
        inputPricePerMTok: meta.inputPricePerMTok ?? 0,
        outputPricePerMTok: meta.outputPricePerMTok ?? 0,
        capabilities: meta.capabilities ?? ["tools", "streaming"],
      };
    }
    return buildResolved(providerName, providerConfig, config, modelName);
  }

  const providerConfig = config.providers[requested];
  if (providerConfig) {
    return buildResolved(requested, providerConfig, config, defaultModelName(requested));
  }

  throw new Error(`Unknown model "${requested}". Use provider/model, a configured alias, or "auto".`);
}

function buildResolved(
  providerName: string,
  providerConfig: ProviderConfig,
  config: XminalConfig,
  model: string,
): ResolvedModel {
  const alias = Object.entries(effectiveModelMap(config.models).models).find(
    ([, value]) => value.provider === providerName && value.model === model,
  )?.[0];
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

function defaultModelName(providerKey: string): string {
  return PROVIDER_DEFAULT_MODELS[providerKey] ?? "gpt-4o-mini";
}

