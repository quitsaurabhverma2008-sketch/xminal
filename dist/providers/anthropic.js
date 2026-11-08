"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicAdapter = void 0;
exports.toAnthropicMessages = toAnthropicMessages;
const types_1 = require("./types");
const config_1 = require("../config/config");
const sse_1 = require("./sse");
class AnthropicAdapter {
    providerType = "anthropic";
    async *chat(request) {
        const { model, messages, tools, temperature, maxTokens, signal } = request;
        const apiKey = (0, config_1.getApiKey)(model.providerConfig);
        if (!apiKey) {
            throw new types_1.ProviderError(`Missing API key for provider "${model.provider}" (${model.providerConfig.apiKeyEnv ?? "apiKey"}).`);
        }
        const baseUrl = model.providerConfig.baseUrl ?? "https://api.anthropic.com";
        const system = messages
            .filter((message) => message.role === "system")
            .map((message) => message.content)
            .join("\n\n");
        const body = {
            model: model.model,
            max_tokens: maxTokens ?? Math.min(model.maxOutput, 8192),
            messages: toAnthropicMessages(messages),
            stream: true,
        };
        if (system)
            body.system = system;
        if (tools.length > 0) {
            body.tools = tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.parameters,
            }));
        }
        if (temperature !== undefined)
            body.temperature = temperature;
        let response;
        try {
            response = await fetch((0, sse_1.joinUrl)(baseUrl, "v1/messages"), {
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new types_1.ProviderError(`request to ${baseUrl} failed: ${message}`, undefined, true);
        }
        if (!response.ok) {
            throw new types_1.ProviderError(await (0, sse_1.readError)(response), response.status, response.status >= 500 || response.status === 429);
        }
        const blocks = new Map();
        let inputTokens = 0;
        let outputTokens = 0;
        let stopReason;
        for await (const event of (0, sse_1.sseJson)(response)) {
            const type = event.type;
            if (type === "message_start") {
                const message = event.message;
                const usage = message?.usage;
                if (usage?.input_tokens)
                    inputTokens = usage.input_tokens;
            }
            else if (type === "content_block_start") {
                const index = event.index;
                const block = event.content_block;
                blocks.set(index, {
                    type: block.type,
                    id: block.id,
                    name: block.name,
                    json: "",
                    text: "",
                });
            }
            else if (type === "content_block_delta") {
                const index = event.index;
                const delta = event.delta;
                const block = blocks.get(index);
                if (!block)
                    continue;
                if (delta.type === "text_delta" && typeof delta.text === "string") {
                    block.text += delta.text;
                    yield { type: "text", text: delta.text };
                }
                else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
                    block.json += delta.partial_json;
                }
                else if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
                    yield { type: "reasoning", text: delta.thinking };
                }
            }
            else if (type === "content_block_stop") {
                const index = event.index;
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
            }
            else if (type === "message_delta") {
                const delta = event.delta;
                if (typeof delta?.stop_reason === "string")
                    stopReason = delta.stop_reason;
                const usage = event.usage;
                if (usage?.output_tokens)
                    outputTokens = usage.output_tokens;
            }
            else if (type === "error") {
                const error = event.error;
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
exports.AnthropicAdapter = AnthropicAdapter;
function toAnthropicMessages(messages) {
    const out = [];
    for (const message of messages) {
        if (message.role === "system")
            continue;
        if (message.role === "tool") {
            const block = {
                type: "tool_result",
                tool_use_id: message.toolCallId,
                content: message.content,
            };
            const last = out[out.length - 1];
            if (last && last.role === "user")
                last.content.push(block);
            else
                out.push({ role: "user", content: [block] });
            continue;
        }
        if (message.role === "assistant") {
            const content = [];
            if (message.content)
                content.push({ type: "text", text: message.content });
            for (const call of message.toolCalls ?? []) {
                content.push({
                    type: "tool_use",
                    id: call.id,
                    name: call.name,
                    input: safeParse(call.arguments),
                });
            }
            if (content.length === 0)
                content.push({ type: "text", text: "" });
            const last = out[out.length - 1];
            if (last && last.role === "assistant")
                last.content.push(...content);
            else
                out.push({ role: "assistant", content });
            continue;
        }
        const block = { type: "text", text: message.content };
        const last = out[out.length - 1];
        if (last && last.role === "user")
            last.content.push(block);
        else
            out.push({ role: "user", content: [block] });
    }
    if (out.length === 0)
        out.push({ role: "user", content: [{ type: "text", text: "" }] });
    return out;
}
function safeParse(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return {};
    }
}
//# sourceMappingURL=anthropic.js.map