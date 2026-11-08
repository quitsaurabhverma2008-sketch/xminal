import type { McpManager } from "../mcp/client";
import type { PermissionManager } from "../core/permissions";
import type { Session } from "../core/session";
import type { MemoryStore } from "../memory/store";
import type { SkillRegistry } from "../skills/loader";
import type { XminalConfig } from "../config/types";

export interface ToolResult {
  content: string;
  isError?: boolean;
  meta?: Record<string, unknown>;
}

export interface SubagentOptions {
  type?: "general" | "explore" | "plan" | "review";
  readOnly?: boolean;
  maxTurns?: number;
}

export interface ToolContext {
  cwd: string;
  session: Session;
  config: XminalConfig;
  permissions: PermissionManager;
  memory: MemoryStore;
  skills: SkillRegistry;
  mcp: McpManager;
  signal?: AbortSignal;
  runSubagent?: (prompt: string, options?: SubagentOptions) => Promise<string>;
  notify?: (message: string) => void;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  readOnly?: boolean;
  run(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

export function textResult(content: string, meta?: Record<string, unknown>): ToolResult {
  return { content, meta };
}

export function errorResult(content: string): ToolResult {
  return { content, isError: true };
}

export function stringArg(args: Record<string, unknown>, key: string, fallback = ""): string {
  const value = args[key];
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return fallback;
  return String(value);
}

export function numberArg(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

export function booleanArg(args: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}
