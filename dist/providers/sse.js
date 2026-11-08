"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sseJson = sseJson;
exports.readError = readError;
exports.joinUrl = joinUrl;
async function* sseJson(response) {
    const reader = response.body?.getReader();
    if (!reader)
        throw new Error("Response has no body stream");
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        let index = buffer.indexOf("\n");
        while (index >= 0) {
            const rawLine = buffer.slice(0, index).trimEnd();
            buffer = buffer.slice(index + 1);
            const line = rawLine.trimStart();
            if (line.startsWith("data:")) {
                const payload = line.slice(5).trim();
                if (payload && payload !== "[DONE]") {
                    try {
                        yield JSON.parse(payload);
                    }
                    catch {
                        // ignore malformed keep-alive lines
                    }
                }
            }
            index = buffer.indexOf("\n");
        }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) {
        const payload = tail.slice(5).trim();
        if (payload && payload !== "[DONE]") {
            try {
                yield JSON.parse(payload);
            }
            catch {
                // ignore
            }
        }
    }
}
async function readError(response) {
    try {
        const text = await response.text();
        return text.slice(0, 2000) || `${response.status} ${response.statusText}`;
    }
    catch {
        return `${response.status} ${response.statusText}`;
    }
}
function joinUrl(base, suffix) {
    return `${base.replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`;
}
//# sourceMappingURL=sse.js.map