"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiAdapter = void 0;
exports.toGeminiContents = toGeminiContents;
const types_1 = require("./types");
const config_1 = require("../config/config");
const sse_1 = require("./sse");
class GeminiAdapter {
    providerType = "gemini";
    async *chat(request) {
        const { model, messages, tools, temperature, maxTokens, signal } = request;
        const apiKey = (0, config_1.getApiKey)(model.providerConfig);
        if (!apiKey) {
            throw new types_1.ProviderError(`Missing API key for provider "${model.provider}" (${model.providerConfig.apiKeyEnv ?? "apiKey"}).`);
        }
        const baseUrl = model.providerConfig.baseUrl ?? "https://generativelanguage.googleapis.com";
        const system = messages
            .filter((message) => message.role === "system")
            .map((message) => message.content)
            .join("\n\n");
        const body = {
            contents: toGeminiContents(messages),
            generationConfig: {
                temperature: temperature ?? 0.2,
                maxOutputTokens: maxTokens ?? model.maxOutput,
            },
        };
        if (system)
            body.systemInstruction = { parts: [{ text: system }] };
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
        const endpoint = (0, sse_1.joinUrl)(baseUrl, `v1beta/models/${encodeURIComponent(model.model)}:generateContent`);
        let response;
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new types_1.ProviderError(`request to ${baseUrl} failed: ${message}`, undefined, true);
        }
        if (!response.ok) {
            throw new types_1.ProviderError(await (0, sse_1.readError)(response), response.status, response.status >= 500 || response.status === 429);
        }
        const data = (await response.json());
        const candidates = data.candidates ?? [];
        const candidate = candidates[0];
        const content = candidate?.content;
        const parts = content?.parts ?? [];
        for (const part of parts) {
            if (typeof part.text === "string" && part.text.length > 0) {
                yield { type: "text", text: part.text };
            }
            const functionCall = part.functionCall;
            if (functionCall && typeof functionCall.name === "string") {
                const call = {
                    id: `call_${Math.random().toString(36).slice(2, 10)}`,
                    name: functionCall.name,
                    arguments: JSON.stringify(functionCall.args ?? {}),
                };
                yield { type: "tool_call", call };
            }
        }
        const usage = data.usageMetadata;
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
exports.GeminiAdapter = GeminiAdapter;
function toGeminiContents(messages) {
    const out = [];
    for (const message of messages) {
        if (message.role === "system")
            continue;
        if (message.role === "tool") {
            const part = {
                functionResponse: {
                    name: message.name ?? "tool",
                    response: { content: message.content },
                },
            };
            const last = out[out.length - 1];
            if (last && last.role === "user")
                last.parts.push(part);
            else
                out.push({ role: "user", parts: [part] });
            continue;
        }
        if (message.role === "assistant") {
            const parts = [];
            if (message.content)
                parts.push({ text: message.content });
            for (const call of message.toolCalls ?? []) {
                parts.push({
                    functionCall: {
                        name: call.name,
                        args: safeParse(call.arguments),
                    },
                });
            }
            if (parts.length === 0)
                parts.push({ text: "" });
            const last = out[out.length - 1];
            if (last && last.role === "model")
                last.parts.push(...parts);
            else
                out.push({ role: "model", parts });
            continue;
        }
        const part = { text: message.content };
        const last = out[out.length - 1];
        if (last && last.role === "user")
            last.parts.push(part);
        else
            out.push({ role: "user", parts: [part] });
    }
    if (out.length === 0)
        out.push({ role: "user", parts: [{ text: "" }] });
    return out;
}
function sanitizeSchema(schema) {
    const clone = JSON.parse(JSON.stringify(schema));
    delete clone.$schema;
    delete clone.additionalProperties;
    return clone;
}
function safeParse(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return {};
    }
}
//# sourceMappingURL=gemini.js.map