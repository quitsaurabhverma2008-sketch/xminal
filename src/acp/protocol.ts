/**
 * Agent Client Protocol (ACP) v1 — wire types.
 *
 * Reference: https://agentclientprotocol.com/protocol/v1/schema
 *
 * Transport: newline-delimited JSON-RPC 2.0 over stdio. Every message is one
 * line of UTF-8 JSON with no embedded newlines.
 */

export const ACP_PROTOCOL_VERSION = 1;

/** JSON-RPC error codes. */
export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_INTERNAL_ERROR = -32603;
/** the agent needs authentication before it can create a session */
export const RPC_AUTH_REQUIRED = -32000;
/** the session id is unknown to the agent */
export const RPC_UNKNOWN_SESSION = -32002;

export type ToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "switch_mode"
  | "other";

export type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed";

export type PermissionOptionKind = "allow_once" | "allow_always" | "reject_once" | "reject_always";

export type StopReason = "end_turn" | "max_tokens" | "max_turn_requests" | "refusal" | "cancelled";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

/** A content block — the MCP-compatible shape ACP reuses. */
export interface ContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
  resource?: { uri?: string; mimeType?: string; text?: string; blob?: string };
  [key: string]: unknown;
}

export interface ToolCallLocation {
  path: string;
  line?: number | null;
}

export interface DiffToolCallContent {
  type: "diff";
  path: string;
  oldText: string | null;
  newText: string;
}

export interface TerminalToolCallContent {
  type: "terminal";
  terminalId: string;
}

export interface ContentToolCallContent {
  type: "content";
  content: ContentBlock;
}

export type ToolCallContent = ContentToolCallContent | DiffToolCallContent | TerminalToolCallContent;

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: PermissionOptionKind;
}

export interface SessionMode {
  id: string;
  name: string;
  description?: string;
}

export interface SessionModeState {
  currentModeId: string;
  availableModes: SessionMode[];
}

export interface SessionConfigSelectOption {
  /** the value id — the official schema calls it `value`, not `id` */
  value: string;
  name: string;
  description?: string | null;
}

/** A single-value selector (model picker, effort picker, …). */
export interface SessionConfigOption {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  type: "select";
  currentValue: string;
  options: SessionConfigSelectOption[];
}

export interface ClientCapabilities {
  fs?: { readTextFile?: boolean; writeTextFile?: boolean };
  terminal?: boolean;
  auth?: { terminal?: boolean };
  elicitation?: unknown;
  session?: { configOptions?: unknown; compaction?: unknown; notices?: unknown };
  [key: string]: unknown;
}

export interface Implementation {
  name: string;
  title?: string;
  version: string;
}

/** Thrown by handlers to produce a JSON-RPC error response. */
export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "RpcError";
  }
}
