import type { ChatEvent, ChatMessage, ChatRequest, ProviderAdapter } from "./types";
import { ProviderError } from "./types";
import { getApiKey } from "../config/config";
import { joinUrl, readErrorDetail, sseJson } from "./sse";

interface OpenAiToolCallDelta {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

export class OpenAiAdapter implements ProviderAdapter {
  readonly providerType = "openai";

  async *chat(request: ChatRequest): AsyncIterable<ChatEvent> {
    const { model, messages, tools, temperature, maxTokens, signal } = request;
    const apiKey = getApiKey(model.providerConfig);
    if (!apiKey && model.providerConfig.requiresKey !== false) {
      throw new ProviderError(
        `Missing API key for provider "${model.provider}" (${model.providerConfig.apiKeyEnv ?? "apiKey"}).`,
      );
    }
    const baseUrl = model.providerConfig.baseUrl ?? "https://api.openai.com/v1";
    const body: Record<string, unknown> = {
      model: model.model,
      messages: toOpenAiMessages(messages),
      stream: true,
      stream_options: { include_usage: true },
    };
    if (tools.length > 0) {
      body.tools = tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
      body.tool_choice = "auto";
    }
    if (temperature !== undefined) body.temperature = temperature;
    if (maxTokens !== undefined) body.max_tokens = maxTokens;

    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(joinUrl(baseUrl, "chat/completions"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          ...(model.providerConfig.headers ?? {}),
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error && error.cause ? ` (${String((error.cause as Error).message ?? error.cause)})` : "";
      throw new ProviderError(`request to ${baseUrl} failed: ${message}${cause}`, undefined, true);
    }
    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new ProviderError(detail.message, response.status, response.status >= 500 || response.status === 429, detail.code, detail.retryAfterMs);
    }

    const calls = new Map<number, { id: string; name: string; arguments: string }>();
    let finishReason: string | undefined;
    for await (const chunk of sseJson(response)) {
      const choices = (chunk.choices as Array<Record<string, unknown>> | undefined) ?? [];
      for (const choice of choices) {
        const delta = (choice.delta as Record<string, unknown> | undefined) ?? {};
        const text = delta.content;
        if (typeof text === "string" && text.length > 0) {
          yield { type: "text", text };
        }
        const reasoning = delta.reasoning_content ?? delta.reasoning;
        if (typeof reasoning === "string" && reasoning.length > 0) {
          yield { type: "reasoning", text: reasoning };
        }
        const deltaCalls = (delta.tool_calls as OpenAiToolCallDelta[] | undefined) ?? [];
        for (const [position, call] of deltaCalls.entries()) {
          const index = call.index ?? position;
          const current = calls.get(index) ?? { id: "", name: "", arguments: "" };
          if (call.id) current.id = call.id;
          if (call.function?.name) current.name = call.function.name;
          if (call.function?.arguments) current.arguments += call.function.arguments;
          calls.set(index, current);
        }
        if (typeof choice.finish_reason === "string") finishReason = choice.finish_reason;
      }
      const usage = chunk.usage as
        | {
            prompt_tokens?: number;
            completion_tokens?: number;
            completion_tokens_details?: { reasoning_tokens?: number };
            prompt_tokens_details?: { cached_tokens?: number };
          }
        | undefined;
      if (usage) {
        yield {
          type: "usage",
          usage: {
            inputTokens: usage.prompt_tokens ?? 0,
            outputTokens: usage.completion_tokens ?? 0,
            reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
            cacheReadTokens: usage.prompt_tokens_details?.cached_tokens,
          },
        };
      }
    }

    for (const call of calls.values()) {
      if (!call.name) continue;
      yield {
        type: "tool_call",
        call: {
          id: call.id || `call_${Math.random().toString(36).slice(2, 10)}`,
          name: call.name,
          arguments: call.arguments || "{}",
        },
      };
    }
    yield { type: "done", stopReason: finishReason };
  }
}

export function toOpenAiMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }
    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content,
      };
    }
    return { role: message.role, content: message.content };
  });
}
