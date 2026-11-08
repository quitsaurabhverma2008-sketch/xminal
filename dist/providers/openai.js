"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAiAdapter = void 0;
exports.toOpenAiMessages = toOpenAiMessages;
const types_1 = require("./types");
const config_1 = require("../config/config");
const sse_1 = require("./sse");
class OpenAiAdapter {
    providerType = "openai";
    async *chat(request) {
        const { model, messages, tools, temperature, maxTokens, signal } = request;
        const apiKey = (0, config_1.getApiKey)(model.providerConfig);
        if (!apiKey && model.providerConfig.requiresKey !== false) {
            throw new types_1.ProviderError(`Missing API key for provider "${model.provider}" (${model.providerConfig.apiKeyEnv ?? "apiKey"}).`);
        }
        const baseUrl = model.providerConfig.baseUrl ?? "https://api.openai.com/v1";
        const body = {
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
        if (temperature !== undefined)
            body.temperature = temperature;
        if (maxTokens !== undefined)
            body.max_tokens = maxTokens;
        let response;
        try {
            response = await fetch((0, sse_1.joinUrl)(baseUrl, "chat/completions"), {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
                    ...(model.providerConfig.headers ?? {}),
                },
                body: JSON.stringify(body),
                signal,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const cause = error instanceof Error && error.cause ? ` (${String(error.cause.message ?? error.cause)})` : "";
            throw new types_1.ProviderError(`request to ${baseUrl} failed: ${message}${cause}`, undefined, true);
        }
        if (!response.ok) {
            throw new types_1.ProviderError(await (0, sse_1.readError)(response), response.status, response.status >= 500 || response.status === 429);
        }
        const calls = new Map();
        let finishReason;
        for await (const chunk of (0, sse_1.sseJson)(response)) {
            const choices = chunk.choices ?? [];
            for (const choice of choices) {
                const delta = choice.delta ?? {};
                const text = delta.content;
                if (typeof text === "string" && text.length > 0) {
                    yield { type: "text", text };
                }
                const reasoning = delta.reasoning_content ?? delta.reasoning;
                if (typeof reasoning === "string" && reasoning.length > 0) {
                    yield { type: "reasoning", text: reasoning };
                }
                const deltaCalls = delta.tool_calls ?? [];
                for (const [position, call] of deltaCalls.entries()) {
                    const index = call.index ?? position;
                    const current = calls.get(index) ?? { id: "", name: "", arguments: "" };
                    if (call.id)
                        current.id = call.id;
                    if (call.function?.name)
                        current.name = call.function.name;
                    if (call.function?.arguments)
                        current.arguments += call.function.arguments;
                    calls.set(index, current);
                }
                if (typeof choice.finish_reason === "string")
                    finishReason = choice.finish_reason;
            }
            const usage = chunk.usage;
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
            if (!call.name)
                continue;
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
exports.OpenAiAdapter = OpenAiAdapter;
function toOpenAiMessages(messages) {
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
//# sourceMappingURL=openai.js.map