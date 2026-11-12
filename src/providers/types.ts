import type { ResolvedModel } from "../config/types";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  readOnly?: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
}

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; usage: ChatUsage; model?: ResolvedModel }
  | { type: "error"; message: string }
  | { type: "notice"; message: string }
  | { type: "done"; stopReason?: string };

export interface ChatRequest {
  model: ResolvedModel;
  messages: ChatMessage[];
  tools: ToolDef[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ProviderAdapter {
  readonly providerType: string;
  chat(request: ChatRequest): AsyncIterable<ChatEvent>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
    /** the upstream error code, e.g. insufficient_quota vs rate_limit_error */
    readonly code?: string,
    /** how long to wait before retrying (seconds or milliseconds from the header) */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Why a request failed — drives what we do next, and what we say. */
export type ProviderFailureKind = "auth" | "quota" | "throttle" | "model" | "server" | "network" | "unknown";
