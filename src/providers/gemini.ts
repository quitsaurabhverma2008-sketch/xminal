import type { ChatEvent, ChatMessage, ChatRequest, ProviderAdapter, ToolCall } from "./types";
import { ProviderError } from "./types";
import { getApiKey } from "../config/config";
import { joinUrl, readError } from "./sse";

export class GeminiAdapter implements ProviderAdapter {
  readonly providerType = "gemini";

  async *chat(request: ChatRequest): AsyncIterable<ChatEvent> {
    const { model, messages, tools, temperature, maxTokens, signal } = request;
    const apiKey = getApiKey(model.providerConfig);
    if (!apiKey) {
      throw new ProviderError(
        `Missing API key for provider "${model.provider}" (${model.providerConfig.apiKeyEnv ?? "apiKey"}).`,
      );
    }
    const baseUrl = model.providerConfig.baseUrl ?? "https://generativelanguage.googleapis.com";
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const body: Record<string, unknown> = {
      contents: toGeminiContents(messages),
      generationConfig: {
        temperature: temperature ?? 0.2,
        maxOutputTokens: maxTokens ?? model.maxOutput,
      },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: sanitizeSchema(tool.parameters),
          })),
        },
      ];
    }

    const endpoint = joinUrl(baseUrl, `v1beta/models/${encodeURIComponent(model.model)}:generateContent`);
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
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
      throw new ProviderError(await readError(response), response.status, response.status >= 500 || response.status === 429);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const candidates = (data.candidates as Array<Record<string, unknown>> | undefined) ?? [];
    const candidate = candidates[0];
    const content = candidate?.content as Record<string, unknown> | undefined;
    const parts = (content?.parts as Array<Record<string, unknown>> | undefined) ?? [];

    for (const part of parts) {
      if (typeof part.text === "string" && part.text.length > 0) {
        yield { type: "text", text: part.text };
      }
      const functionCall = part.functionCall as Record<string, unknown> | undefined;
      if (functionCall && typeof functionCall.name === "string") {
        const call: ToolCall = {
          id: `call_${Math.random().toString(36).slice(2, 10)}`,
          name: functionCall.name,
          arguments: JSON.stringify(functionCall.args ?? {}),
        };
        yield { type: "tool_call", call };
      }
    }

    const usage = data.usageMetadata as Record<string, number> | undefined;
    if (usage) {
      yield {
        type: "usage",
        usage: {
          inputTokens: usage.promptTokenCount ?? 0,
          outputTokens: usage.candidatesTokenCount ?? 0,
          reasoningTokens: usage.thoughtsTokenCount,
          cacheReadTokens: usage.cachedContentTokenCount,
        },
      };
    }
    yield { type: "done", stopReason: typeof candidate?.finishReason === "string" ? candidate.finishReason : undefined };
  }
}

export function toGeminiContents(messages: ChatMessage[]): Array<Record<string, unknown>> {
  const out: Array<{ role: "user" | "model"; parts: Array<Record<string, unknown>> }> = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      const part = {
        functionResponse: {
          name: message.name ?? "tool",
          response: { content: message.content },
        },
      };
      const last = out[out.length - 1];
      if (last && last.role === "user") last.parts.push(part);
      else out.push({ role: "user", parts: [part] });
      continue;
    }
    if (message.role === "assistant") {
      const parts: Array<Record<string, unknown>> = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.toolCalls ?? []) {
        parts.push({
          functionCall: {
            name: call.name,
            args: safeParse(call.arguments),
          },
        });
      }
      if (parts.length === 0) parts.push({ text: "" });
      const last = out[out.length - 1];
      if (last && last.role === "model") last.parts.push(...parts);
      else out.push({ role: "model", parts });
      continue;
    }
    const part = { text: message.content };
    const last = out[out.length - 1];
    if (last && last.role === "user") last.parts.push(part);
    else out.push({ role: "user", parts: [part] });
  }
  if (out.length === 0) out.push({ role: "user", parts: [{ text: "" }] });
  return out;
}

function sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  delete clone.$schema;
  delete clone.additionalProperties;
  return clone;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
