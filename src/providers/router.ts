import type { ResolvedModel, XminalConfig } from "../config/types";
import { providerReady, resolveModel } from "../config/config";
import { PROVIDER_DEFAULT_MODELS } from "../config/providers";
import type { ChatEvent, ChatRequest, ProviderAdapter } from "./types";
import { ProviderError } from "./types";
import { OpenAiAdapter } from "./openai";
import { AnthropicAdapter } from "./anthropic";
import { GeminiAdapter } from "./gemini";
import { logEvent } from "../util/log";

export { ProviderError } from "./types";

export function createAdapter(model: ResolvedModel): ProviderAdapter {
  switch (model.providerConfig.type) {
    case "anthropic":
      return new AnthropicAdapter();
    case "gemini":
      return new GeminiAdapter();
    case "openai":
    default:
      return new OpenAiAdapter();
  }
}

const UNAVAILABLE = /model is unavailable|model not found|not available|no longer available|insufficient_quota|quota exceeded/i;

/** Errors that mean "this model is unusable" — another model may still work. */
const MODEL_LEVEL = /model is unavailable|model not found|no such model|not available|no longer available|insufficient_quota|quota exceeded|exceeded your current quota/i;

/**
 * Errors that mean "this model ran out of quota".
 *
 * opencode's free models each have their own daily allowance, so hitting one
 * does not mean the whole provider is dead — a sibling model may still work.
 */
const QUOTA = /free usage limit|free usage|usage limit reached|insufficient_quota|quota exceeded|exceeded your current quota/i;
const THROTTLE = /rate limit|rate_limit|too many requests|429|tpm|rpm|requests per minute/i;
const AUTH = /unauthor|forbidden|invalid api key|invalid credential|authentication|api key not|missing api key|permission denied/i;

/** Why a request failed — drives what we do next, and what we say. */
export function classifyFailure(error: unknown): {
  kind: "auth" | "quota" | "throttle" | "model" | "server" | "network" | "unknown";
  retryable: boolean;
  retryAfterMs?: number;
} {
  const message = String((error as Error)?.message ?? "");
  const status = (error as { status?: number })?.status;
  const code = (error as { code?: string })?.code;
  const retryAfterMs = (error as { retryAfterMs?: number })?.retryAfterMs;
  if (status === 401 || status === 403 || AUTH.test(message)) return { kind: "auth", retryable: false };
  if (code === "insufficient_quota" || status === 402 || QUOTA.test(message)) return { kind: "quota", retryable: true, retryAfterMs };
  if (status === 429 || THROTTLE.test(message) || THROTTLE.test(code ?? "")) return { kind: "throttle", retryable: true, retryAfterMs };
  if (MODEL_LEVEL.test(message)) return { kind: "model", retryable: true };
  if (status !== undefined && status >= 500) return { kind: "server", retryable: true };
  if (status === undefined && /fetch|network|ECONN|ENOTFOUND|ETIMEDOUT|socket/i.test(message)) return { kind: "network", retryable: true };
  return { kind: "unknown", retryable: false };
}

/** Actionable next step when the upstream model/provider is unusable. */
function hint(message: string): string {
  if (!UNAVAILABLE.test(message)) return "";
  return "\n→ that model is unavailable upstream (free-tier quota or the model was retired). " +
    "Switch with `/model` to a provider you hold a key for (groq/gpt-oss-120b, nvidia/nemotron, openrouter `:free`, zai/glm-4.7-flash) " +
    "or press Tab to cycle agents; `/new` starts a clean session.";
}

export class ProviderRouter {
  /** models already proven dead this session — never re-probe them */
  private readonly exhausted = new Map<string, { kind: string; until: number }>();

  constructor(readonly config: XminalConfig) {}

  /** Remember that a model failed (quota/auth) so later turns skip it. */
  markExhausted(provider: string, model: string, kind: string, retryAfterMs?: number): void {
    const until = retryAfterMs ? Date.now() + retryAfterMs : Number.POSITIVE_INFINITY;
    this.exhausted.set(`${provider}/${model}`, { kind, until });
  }

  isExhausted(provider: string, model: string): boolean {
    const entry = this.exhausted.get(`${provider}/${model}`);
    if (!entry) return false;
    if (entry.until <= Date.now()) {
      this.exhausted.delete(`${provider}/${model}`);
      return false;
    }
    return true;
  }

  exhaustedModels(): string[] {
    return [...this.exhausted.keys()];
  }

  resolve(spec?: string): ResolvedModel {
    return resolveModel(this.config, spec);
  }

  /**
   * Candidate chain for a request:
   *  1. the requested model
   *  2. explicit config.fallbackModels
   *  3. the default model of every provider that is actually usable
   *     (has a key, or is a keyless/free provider)
   * One model per provider — retrying the same upstream 13 times just burns
   * quota and hides the real cause behind "all N candidate providers failed".
   */
  candidates(primary?: string): ResolvedModel[] {
    const specs: string[] = [primary || this.config.defaultModel, ...this.config.fallbackModels];
    const catalog = this.config.models ?? {};
    const catalogEntries = Object.entries(catalog);
    for (const [name, provider] of Object.entries(this.config.providers)) {
      if (!providerReady(provider)) continue;
      // local servers are usually not running — only try them when asked for
      const isLocal = /localhost|127\.0\.0\.1|:11434|:1234|:8000|:8080|:5001|:5000|:4891|:3000/i.test(provider.baseUrl ?? "");
      if (isLocal && name !== (primary ?? "").split("/")[0]) continue;
      let picked: string | undefined;
      const hint = PROVIDER_DEFAULT_MODELS[name];
      if (hint) {
        const full = `${name}/${hint}`;
        if (catalog[full]) picked = full;
        else if (catalog[hint]?.provider === name) picked = hint;
      }
      if (!picked) {
        const first = catalogEntries.find(([, m]) => m.provider === name);
        if (first) picked = first[0];
      }
      if (picked) specs.push(picked);
    }
    const seen = new Set<string>();
    const seenProviders = new Set<string>();
    const out: ResolvedModel[] = [];
    for (const spec of specs) {
      if (!spec) continue;
      let model: ResolvedModel;
      try {
        model = resolveModel(this.config, spec);
      } catch {
        continue; // invalid fallback entry
      }
      const providerKey = `${model.provider}/${model.model}`;
      if (seen.has(providerKey)) continue;
      // primary always wins its slot; for the rest one model per provider
      // (dedupe by provider identity — NOT by adapter type, or every
      // OpenAI-compatible provider would collapse into the first one)
      if (spec !== (primary || this.config.defaultModel)) {
        if (seenProviders.has(model.provider)) continue;
        seenProviders.add(model.provider);
      } else {
        seenProviders.add(model.provider);
      }
      seen.add(providerKey);
      out.push(model);
    }
    if (out.length === 0) out.push(resolveModel(this.config, primary));
    return out;
  }

  /**
   * Other models of the same provider, free ones first.
   *
   * Used when a model runs out of quota: the daily allowance is usually
   * tracked per model, so trying the provider's next free model is the
   * cheapest way to keep the turn alive.
   */
  siblings(model: ResolvedModel, limit = 6): ResolvedModel[] {
    const catalog = this.config.models ?? {};
    const pool: ResolvedModel[] = [];
    for (const [alias, entry] of Object.entries(catalog)) {
      if (entry.provider !== model.provider) continue;
      if (alias === model.alias) continue;
      pool.push({
        alias,
        provider: entry.provider,
        model: entry.model,
        providerConfig: this.config.providers[entry.provider],
        contextWindow: entry.contextWindow ?? 128000,
        maxOutput: entry.maxOutput ?? 8192,
        inputPricePerMTok: entry.inputPricePerMTok ?? 0,
        outputPricePerMTok: entry.outputPricePerMTok ?? 0,
        capabilities: entry.capabilities ?? [],
      });
    }
    const free = (m: ResolvedModel) => m.inputPricePerMTok === 0 && m.outputPricePerMTok === 0;
    pool.sort((a, b) => {
      if (free(a) !== free(b)) return free(a) ? -1 : 1;
      return (b.contextWindow ?? 0) - (a.contextWindow ?? 0);
    });
    return pool.slice(0, limit);
  }

  async *chat(
    request: Omit<ChatRequest, "model"> & { model?: ResolvedModel | string },
  ): AsyncIterable<ChatEvent> {
    const base = request.model
      ? typeof request.model === "string"
        ? this.candidates(request.model)
        : [request.model]
      : this.candidates();
    // A queue, not a fixed list: when a model runs out of quota we add the
    // provider's other models to it. opencode's free allowance is tracked per
    // model, so the next free model usually still works.
    const queue: ResolvedModel[] = [...base];
    const tried = new Set<string>();
    let lastError: Error | undefined;
    let firstError: Error | undefined;
    let attempts = 0;

    while (queue.length) {
      const model = queue.shift()!;
      const key = `${model.provider}/${model.model}`;
      if (tried.has(key) || this.isExhausted(model.provider, model.model)) continue;
      tried.add(key);
      attempts++;
      const adapter = createAdapter(model);
      let emitted = false;
      try {
        const stream = adapter.chat({ ...request, model });
        for await (const event of stream) {
          if (event.type !== "done" && event.type !== "usage") emitted = true;
          if (event.type === "usage") yield { ...event, model };
          else yield event;
        }
        return;
      } catch (error) {
        lastError = error as Error;
        if (attempts === 1) firstError = lastError;
        const message = (error as Error)?.message ?? "";
        logEvent("warn", `provider failed: ${model.provider}/${model.model}`, { message });
        const failure = classifyFailure(error);
        const retryable = (error instanceof ProviderError ? error.retryable : true) || MODEL_LEVEL.test(message);
        if (failure.kind === "quota" || failure.kind === "auth") {
          this.markExhausted(model.provider, model.model, failure.kind, failure.retryAfterMs);
        }
        if (!emitted && retryable && (failure.kind === "quota" || failure.kind === "throttle")) {
          // the provider's other models are the cheapest next attempt — but
          // they may share this account's pool, so say so honestly
          const siblings = this.siblings(model, 8).filter((m) => !tried.has(`${m.provider}/${m.model}`) && !this.isExhausted(m.provider, m.model));
          for (const sibling of siblings) queue.push(sibling);
          const next = queue[0] ?? siblings[0];
          const sharedPool = !this.config.providers[model.provider]?.requiresKey && siblings.length > 0;
          if (next) {
            yield {
              type: "notice",
              message:
                `${model.alias}: ${failure.kind === "quota" ? "free-tier quota exhausted" : "rate limited"}${failure.retryAfterMs ? ` (retry after ${Math.max(1, Math.round(failure.retryAfterMs / 1000))}s)` : ""}` +
                ` → next up: ${next.alias}${sharedPool ? " (may share the same pool)" : ""}`,
            };
          }
          continue;
        }
        const exhausted = queue.length === 0;
        const capped = attempts >= 12;
        if (emitted || exhausted || capped) {
          const primary = firstError ?? lastError;
          const suffix = exhausted && attempts > 1 ? ` (all ${attempts} candidate models failed)` : capped ? ` (gave up after ${attempts} attempts)` : "";
          const finalMessage = (primary?.message ?? "provider request failed") + suffix + hint(primary?.message ?? "");
          logEvent("error", `all providers failed: ${finalMessage}`);
          yield { type: "error", message: finalMessage };
          return;
        }
        // nothing was emitted and another candidate exists — skip to it
        logEvent("info", `${model.alias} failed (${failure.kind}) — trying the next candidate`);
      }
    }

    if (lastError || firstError) {
      const primary = firstError ?? lastError;
      yield { type: "error", message: primary?.message ?? "provider request failed" };
    }
  }
}
