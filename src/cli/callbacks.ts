import type { AgentCallbacks } from "../core/agent";
import type { Renderer } from "./render";

export function rendererCallbacks(renderer: Renderer): AgentCallbacks {
  return {
    onText: (text) => renderer.text(text),
    onReasoning: (text) => renderer.reasoning(text),
    onToolCall: (call) => renderer.toolCall(call),
    onToolResult: (name, result) => renderer.toolResult(name, result),
    onUsage: (usage, model) => renderer.usage(usage, model),
    onStatus: (message) => renderer.status(message),
  };
}
