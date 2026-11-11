export type PermissionMode = "ask" | "auto" | "full";
export type SandboxBackend = "none" | "bwrap" | "docker";

export interface ProviderConfig {
  type: "openai" | "anthropic" | "gemini";
  requiresKey?: boolean;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
}

export interface ModelConfig {
  provider: string;
  model: string;
  contextWindow?: number;
  maxOutput?: number;
  inputPricePerMTok?: number;
  outputPricePerMTok?: number;
  capabilities?: string[];
}

export interface McpServerConfig {
  command: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  timeoutMs?: number;
  /** docs / homepage — XMINAL never dials it, it is there for humans */
  url?: string;
}

export interface XminalConfig {
  version: number;
  providers: Record<string, ProviderConfig>;
  models: Record<string, ModelConfig>;
  defaultModel: string;
  plannerModel?: string;
  executorModel?: string;
  fallbackModels: string[];
  router: {
    policy: string[];
  };
  limits: {
    maxTurns: number;
    maxTokensPerTurn: number;
    maxCostPerSession: number;
  };
  permissions: {
    mode: PermissionMode;
    protectedPaths: string[];
  };
  sandbox: {
    enabled: boolean;
    backend: SandboxBackend;
    allowNetwork: boolean;
  };
  mcpServers: Record<string, McpServerConfig>;
  ui: {
    theme: "dark" | "light";
    showCost: boolean;
    stream: boolean;
  };
  verifyCommand?: string;
}

export interface ResolvedModel {
  alias: string;
  provider: string;
  providerConfig: ProviderConfig;
  model: string;
  contextWindow: number;
  maxOutput: number;
  inputPricePerMTok: number;
  outputPricePerMTok: number;
  capabilities: string[];
}
