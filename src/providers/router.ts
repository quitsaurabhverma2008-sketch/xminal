import type { ResolvedModel, XminalConfig } from "../config/types";
import { providerReady, resolveModel } from "../config/config";
import type { ChatEvent, ChatRequest, ProviderAdapter } from "./types";
import { ProviderError } from "./types";
import { OpenAiAdapter } from "./openai";
import { AnthropicAdapter } from "./anthropic";
import { GeminiAdapter } from "./gemini";

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

export class ProviderRouter {
  constructor(readonly config: XminalConfig) {}

  resolve(spec?: string): ResolvedModel {
    return resolveModel(this.config, spec);
  }

  candidates(primary?: string): ResolvedModel[] {
    const specs = [primary || this.config.defaultModel, ...this.config.fallbackModels];
    for (const [name, provider] of Object.entries(this.config.providers)) {
      if (providerReady(provider)) specs.push(name);
    }
    const seen = new Set<string>();
    const out: ResolvedModel[] = [];
    for (const spec of specs) {
      if (!spec || seen.has(spec)) continue;
      seen.add(spec);
      try {
        out.push(resolveModel(this.config, spec));
      } catch {
        // skip invalid fallback entries
      }
    }
    if (out.length === 0) out.push(resolveModel(this.config, primary));
    return out;
  }

  async *chat(
    request: Omit<ChatRequest, "model"> & { model?: ResolvedModel | string },
  ): AsyncIterable<ChatEvent> {
    const candidates = request.model
      ? typeof request.model === "string"
        ? this.candidates(request.model)
        : [request.model]
      : this.candidates();
    let lastError: Error | undefined;
    let firstError: Error | undefined;

    for (const [index, model] of candidates.entries()) {
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
        if (index === 0) firstError = lastError;
        const retryable =
          error instanceof ProviderError ? error.retryable : true;
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
