import type { ChatEvent, ChatMessage, ChatRequest, ProviderAdapter, ToolCall } from "./types";
import { ProviderError } from "./types";
import { getApiKey } from "../config/config";
import { joinUrl, readErrorDetail, sseJson } from "./sse";

interface AnthropicBlock {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly providerType = "anthropic";

  async *chat(request: ChatRequest): AsyncIterable<ChatEvent> {
    const { model, messages, tools, temperature, maxTokens, signal } = request;
    const apiKey = getApiKey(model.providerConfig);
    if (!apiKey) {
      throw new ProviderError(
        `Missing API key for provider "${model.provider}" (${model.providerConfig.apiKeyEnv ?? "apiKey"}).`,
      );
    }
    const baseUrl = model.providerConfig.baseUrl ?? "https://api.anthropic.com";
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const body: Record<string, unknown> = {
      model: model.model,
      max_tokens: maxTokens ?? Math.min(model.maxOutput, 8192),
      messages: toAnthropicMessages(messages),
      stream: true,
    };
    if (system) body.system = system;
    if (tools.length > 0) {
      body.tools = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }));
    }
    if (temperature !== undefined) body.temperature = temperature;

    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(joinUrl(baseUrl, "v1/messages"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        ...(model.providerConfig.headers ?? {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ProviderError(`request to ${baseUrl} failed: ${message}`, undefined, true);
    }
    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new ProviderError(detail.message, response.status, response.status >= 500 || response.status === 429, detail.code, detail.retryAfterMs);
    }

    const blocks = new Map<number, { type: string; id?: string; name?: string; json: string; text: string }>();
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: string | undefined;

    for await (const event of sseJson(response)) {
      const type = event.type as string;
      if (type === "message_start") {
        const message = event.message as Record<string, unknown> | undefined;
        const usage = message?.usage as Record<string, number> | undefined;
        if (usage?.input_tokens) inputTokens = usage.input_tokens;
      } else if (type === "content_block_start") {
        const index = event.index as number;
        const block = event.content_block as AnthropicBlock;
        blocks.set(index, {
          type: block.type,
          id: block.id,
          name: block.name,
          json: "",
          text: "",
        });
      } else if (type === "content_block_delta") {
        const index = event.index as number;
        const delta = event.delta as Record<string, unknown>;
        const block = blocks.get(index);
        if (!block) continue;
        if (delta.type === "text_delta" && typeof delta.text === "string") {
          block.text += delta.text;
          yield { type: "text", text: delta.text };
        } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
          block.json += delta.partial_json;
        } else if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
          yield { type: "reasoning", text: delta.thinking };
        }
      } else if (type === "content_block_stop") {
        const index = event.index as number;
        const block = blocks.get(index);
        if (block?.type === "tool_use" && block.name) {
          yield {
            type: "tool_call",
            call: {
              id: block.id ?? `toolu_${Math.random().toString(36).slice(2, 10)}`,
              name: block.name,
              arguments: block.json || "{}",
            },
          };
        }
      } else if (type === "message_delta") {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (typeof delta?.stop_reason === "string") stopReason = delta.stop_reason;
        const usage = event.usage as Record<string, number> | undefined;
        if (usage?.output_tokens) outputTokens = usage.output_tokens;
      } else if (type === "error") {
        const error = event.error as Record<string, unknown> | undefined;
        const message = typeof error?.message === "string" ? error.message : "Anthropic stream error";
        yield { type: "error", message };
      }
    }

    if (inputTokens || outputTokens) {
      yield { type: "usage", usage: { inputTokens, outputTokens } };
    }
    yield { type: "done", stopReason };
  }
}

export function toAnthropicMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  const out: Array<{ role: "user" | "assistant"; content: Array<Record<string, unknown>> }> = [];

  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      const block = {
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: message.content,
      };
      const last = out[out.length - 1];
      if (last && last.role === "user") last.content.push(block);
      else out.push({ role: "user", content: [block] });
      continue;
    }
    if (message.role === "assistant") {
      const content: Array<Record<string, unknown>> = [];
      if (message.content) content.push({ type: "text", text: message.content });
      for (const call of message.toolCalls ?? []) {
        content.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: safeParse(call.arguments),
        });
      }
      if (content.length === 0) content.push({ type: "text", text: "" });
      const last = out[out.length - 1];
      if (last && last.role === "assistant") last.content.push(...content);
      else out.push({ role: "assistant", content });
      continue;
    }
    const block = { type: "text", text: message.content };
    const last = out[out.length - 1];
    if (last && last.role === "user") last.content.push(block);
    else out.push({ role: "user", content: [block] });
  }

  if (out.length === 0) out.push({ role: "user", content: [{ type: "text", text: "" }] });
  return out;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
