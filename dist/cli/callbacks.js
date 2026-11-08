"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rendererCallbacks = rendererCallbacks;
function rendererCallbacks(renderer) {
    return {
        onText: (text) => renderer.text(text),
        onReasoning: (text) => renderer.reasoning(text),
        onToolCall: (call) => renderer.toolCall(call),
        onToolResult: (name, result) => renderer.toolResult(name, result),
        onUsage: (usage, model) => renderer.usage(usage, model),
        onStatus: (message) => renderer.status(message),
    };
}
//# sourceMappingURL=callbacks.js.map