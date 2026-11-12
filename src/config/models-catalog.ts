import fs from "node:fs";
import path from "node:path";
import { globalXminalDir } from "./paths";
import { VERSION } from "../version";
import type { ModelConfig } from "./types";

export const MODEL_DEV_URL = "https://models.dev/api.json";
const CACHE_FILE = process.env.XMINAL_MODELS_CACHE ?? path.join(globalXminalDir(), "cache", "models.json");
const TTL_HOURS = Number(process.env.XMINAL_MODELS_TTL_HOURS ?? "24");
const TTL_MS = Math.max(0, TTL_HOURS) * 3600_000;

const MD_TO_XM: Record<string, string> = {
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

export interface CatalogMeta {
  source: "bundled" | "cache" | "fresh" | "stale-cache";
  fetchedAt?: string;
  modelCount: number;
  providerCount: number;
  freeCount: number;
  cachePath: string;
}

export interface RefreshResult extends CatalogMeta {
  ok: boolean;
  newModels: number;
  error?: string;
}

function isZeroCost(input: unknown, output: unknown): boolean {
  // an explicit 0/0 means free; missing or unparsable pricing is NOT free
  const a = Number(input);
  const b = Number(output);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a === 0 && b === 0;
}

export function isFreeModel(m: ModelConfig): boolean {
  return isZeroCost(m.inputPricePerMTok, m.outputPricePerMTok);
}

export function buildAliasesFromSnapshot(snapshot: unknown): Record<string, ModelConfig> {
  const root = (snapshot ?? {}) as Record<string, { models?: Record<string, Record<string, unknown>> }>;
  const out: Record<string, ModelConfig> = {};
  for (const [mdId, xmKey] of Object.entries(MD_TO_XM)) {
    const provider = root[mdId];
    const models = provider?.models;
    if (!models) continue;
    for (const [modelId, raw] of Object.entries(models)) {
      if (!raw || typeof raw !== "object") continue;
      const modalities = (raw.modalities ?? {}) as { input?: string[] };
      if (Array.isArray(modalities.input) && !modalities.input.includes("text")) continue;
      const cost = (raw.cost ?? {}) as { input?: number; output?: number };
      // unknown price must stay unknown — defaulting to 0 wrongly marks paid models as FREE
      const price = (value: unknown): number | undefined => {
        if (value === undefined || value === null || value === "") return undefined;
        const n = Number(value);
        return Number.isFinite(n) ? n : undefined;
      };
      const capabilities = [
        ...(raw.tool_call ? ["tools"] : []),
        "streaming",
      ];
      const alias = `${xmKey}/${modelId}`;
      out[alias] = {
        provider: xmKey,
        model: modelId,
        contextWindow: raw.limit ? Number((raw.limit as Record<string, unknown>).context ?? 0) || undefined : undefined,
        maxOutput: raw.limit ? Number((raw.limit as Record<string, unknown>).output ?? 0) || undefined : undefined,
        inputPricePerMTok: price(cost.input),
        outputPricePerMTok: price(cost.output),
        capabilities,
      };
    }
  }
  return out;
}

let bundledAliases: Record<string, ModelConfig> | undefined;
function bundled(): Record<string, ModelConfig> {
  if (!bundledAliases) {
    bundledAliases = require("./default-models").DEFAULT_MODELS as Record<string, ModelConfig>;
  }
  return bundledAliases;
}

let cachedFile: { mtimeMs: number; models: Record<string, ModelConfig>; fetchedAt: string } | undefined;
function readCache(): { mtimeMs: number; models: Record<string, ModelConfig>; fetchedAt: string } | undefined {
  try {
    const stat = fs.statSync(CACHE_FILE);
    if (cachedFile && cachedFile.mtimeMs === stat.mtimeMs) return cachedFile;
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as {
      fetchedAt?: string;
      models?: Record<string, ModelConfig>;
    };
    if (!parsed || !parsed.models || typeof parsed.models !== "object") return undefined;
    cachedFile = { mtimeMs: stat.mtimeMs, models: parsed.models, fetchedAt: parsed.fetchedAt ?? new Date(stat.mtimeMs).toISOString() };
    return cachedFile;
  } catch {
    return undefined;
  }
}

function mergeAliases(userModels: Record<string, ModelConfig>): { models: Record<string, ModelConfig>; meta: CatalogMeta } {
  const cache = readCache();
  const bundledMap = bundled();
  const models: Record<string, ModelConfig> = { ...bundledMap, ...(cache?.models ?? {}), ...userModels };
  const all = Object.values(models);
  const free = all.filter((m) => isZeroCost(m.inputPricePerMTok, m.outputPricePerMTok)).length;
  const providerCount = new Set(all.map((m) => m.provider)).size;
  const meta: CatalogMeta = {
    source: cache ? "cache" : "bundled",
    fetchedAt: cache?.fetchedAt,
    modelCount: all.length,
    providerCount,
    freeCount: free,
    cachePath: CACHE_FILE,
  };
  return { models, meta };
}

export function effectiveModelMap(userModels: Record<string, ModelConfig> = {}): { models: Record<string, ModelConfig>; meta: CatalogMeta } {
  return mergeAliases(userModels);
}

export function lookupModelAlias(userModels: Record<string, ModelConfig>, alias: string): ModelConfig | undefined {
  return mergeAliases(userModels).models[alias];
}

export function listEffectiveAliases(userModels: Record<string, ModelConfig> = {}): Array<{ alias: string; provider: string; model: string; free: boolean }> {
  const { models } = mergeAliases(userModels);
  return Object.entries(models)
    .map(([alias, m]) => ({
      alias,
      provider: m.provider,
      model: m.model,
      free: isZeroCost(m.inputPricePerMTok, m.outputPricePerMTok),
    }))
    .sort((a, b) =>
      (Number(b.free) - Number(a.free)) ||
      a.provider.localeCompare(b.provider) ||
      a.model.localeCompare(b.model),
    );
}

export function catalogMeta(userModels: Record<string, ModelConfig> = {}): CatalogMeta {
  return mergeAliases(userModels).meta;
}

export function invalidateModelsCatalog(): void {
  cachedFile = undefined;
}

export async function refreshModelsCatalog(opts: { force?: boolean } = {}): Promise<RefreshResult> {
  const cache = readCache();
  if (!opts.force && cache && Number.isFinite(TTL_MS) && Date.now() - Date.parse(cache.fetchedAt) < TTL_MS) {
    const meta = catalogMeta();
    return { ...meta, source: "cache", ok: true, newModels: 0 };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(MODEL_DEV_URL, {
      signal: controller.signal,
      headers: { "user-agent": `xminal/${VERSION} (+https://github.com/quitsaurabhverma2008-sketch/xminal)`, accept: "application/json" },
    });
    if (!response.ok) {
      const meta = catalogMeta();
      return { ...meta, source: "stale-cache", ok: false, newModels: 0, error: `models.dev returned HTTP ${response.status}` };
    }
    const snapshot = (await response.json()) as unknown;
    const aliases = buildAliasesFromSnapshot(snapshot);
    const previous = cache?.models ?? {};
    const newModels = Object.keys(aliases).filter((alias) => !previous[alias]).length;
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: new Date().toISOString(), source: MODEL_DEV_URL, models: aliases }), "utf8");
    try { fs.chmodSync(CACHE_FILE, 0o600); } catch { /* best effort */ }
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
  } catch (error) {
    const meta = catalogMeta();
    return { ...meta, source: "stale-cache", ok: false, newModels: 0, error: (error as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
