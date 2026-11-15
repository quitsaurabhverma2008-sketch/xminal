import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Runtime } from "../runtime";
import { Session } from "../core/session";
import { VERSION } from "../version";
import { listModelAliases } from "../config/config";
import type { AgentCallbacks, AgentEffort, AgentMode } from "../core/agent";
import type { ToolCall } from "../providers/types";
import type { Tool, ToolResult } from "../tools/types";
import type { McpServerConfig } from "../config/types";
import { newTextFor, readIfExists, toolKind, toolLocations, toolTitle } from "./mapping";
import {
  ACP_PROTOCOL_VERSION,
  RPC_INTERNAL_ERROR,
  RPC_INVALID_PARAMS,
  RPC_METHOD_NOT_FOUND,
  RPC_UNKNOWN_SESSION,
  RpcError,
  type ClientCapabilities,
  type ContentBlock,
  type Implementation,
  type JsonRpcResponse,
  type PermissionOption,
  type SessionConfigOption,
  type SessionMode,
  type SessionModeState,
  type StopReason,
  type ToolCallContent,
} from "./protocol";

export interface AcpOptions {
  cwd: string;
  mode?: AgentMode;
  model?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  /** MCP servers the ACP client asked us to connect to */
  mcpServers?: Record<string, McpServerConfig>;
}

interface PendingCall {
  id: string;
  name: string;
  title: string;
  args: Record<string, unknown>;
  /** the file content before the tool ran — the diff's old text */
  preContent: string | null;
  prePath: string | null;
}

interface AcpSession {
  id: string;
  runtime: Runtime;
  mode: AgentMode;
  model: string;
  effort: AgentEffort;
  /** the tool call currently executing */
  current: PendingCall | null;
  /** set when the client cancels the turn */
  cancelled: boolean;
  /** true while a prompt turn is running */
  running: boolean;
  /** permission requests we sent to the client for this session */
  pendingAsks: Set<string>;
}

/** The agent modes XMINAL can run in, in ACP terms. */
const SESSION_MODES: SessionMode[] = [
  { id: "build", name: "Build", description: "Write and modify code with full tool access" },
  { id: "plan", name: "Plan", description: "Design and plan the work without touching files" },
  { id: "review", name: "Review", description: "Analyse the changes and report findings" },
  { id: "compose", name: "Compose", description: "Write prose, docs and messages" },
  { id: "yolo", name: "Yolo", description: "No permission prompts — every tool is allowed" },
];

const EFFORTS: Array<{ id: AgentEffort; name: string }> = [
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High" },
  { id: "max", name: "Max" },
];

const PERMISSION_OPTIONS: PermissionOption[] = [
  { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
  { optionId: "allow-always", name: "Allow this tool for the rest of the session", kind: "allow_always" },
  { optionId: "reject-once", name: "Reject", kind: "reject_once" },
  { optionId: "reject-always", name: "Reject this tool for the rest of the session", kind: "reject_always" },
];

function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* malformed arguments are reported to the model, not here */
  }
  return {};
}

/** ACP content blocks → the plain text the model sees. */
export function promptToText(blocks: ContentBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
      continue;
    }
    if (block.type === "resource" && block.resource && typeof block.resource.text === "string") {
      const uri = typeof block.resource.uri === "string" ? block.resource.uri : "";
      parts.push(uri ? `<resource ${uri}>\n${block.resource.text}\n</resource>` : block.resource.text);
      continue;
    }
    if (block.type === "resource_link" && typeof block.uri === "string") {
      parts.push(`<resource_link ${block.uri}>`);
      continue;
    }
    if (block.type === "image" && typeof block.uri === "string") {
      parts.push(`<image ${block.uri}>`);
    }
  }
  return parts.join("\n\n").trim();
}

function mapStopReason(reason: string): StopReason {
  switch (reason) {
    case "aborted":
      return "cancelled";
    case "max_turns":
      return "max_turn_requests";
    case "budget":
      return "max_tokens";
    case "error":
      return "refusal";
    default:
      return "end_turn";
  }
}

/**
 * The Agent Client Protocol agent.
 *
 * Speaks newline-delimited JSON-RPC 2.0 over stdio, exactly like Zed, Cursor
 * and every other ACP client expects. The XMINAL runtime does the work; this
 * class translates between the protocol and the agent callbacks.
 */
export class AcpAgent {
  private readonly options: AcpOptions;
  private readonly input: NodeJS.ReadableStream;
  private readonly output: NodeJS.WritableStream;
  private readonly sessions = new Map<string, AcpSession>();
  /** requests we sent to the client and are still waiting on */
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private clientCapabilities: ClientCapabilities = {};
  private clientInfo: Implementation | undefined;
  private buffer = "";
  private nextId = 1;
  private closed = false;

  constructor(options: AcpOptions) {
    this.options = options;
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
  }

  /** Start reading from the client. */
  start(): void {
    this.input.on("data", (chunk: Buffer | string) => this.onData(chunk));
    this.input.on("end", () => this.close());
    this.input.on("error", () => this.close());
    this.input.resume?.();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const [, entry] of this.pending) entry.reject(new Error("connection closed"));
    this.pending.clear();
  }

  // ── transport ────────────────────────────────────────────────────────────

  private onData(chunk: Buffer | string): void {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let index = this.buffer.indexOf("\n");
    while (index !== -1) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) this.onLine(line);
      index = this.buffer.indexOf("\n");
    }
  }

  private onLine(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      this.respondError(null, -32700, "parse error");
      return;
    }
    const method = typeof message.method === "string" ? message.method : "";
    const id = (message.id as string | number | undefined) ?? undefined;
    if (!method) {
      // a response to a request we sent
      this.onClientResponse(message);
      return;
    }
    if (id === undefined) {
      void this.handleNotification(method, message.params);
      return;
    }
    void this.handleRequest(method, id, message.params);
  }

  private write(message: unknown): void {
    if (this.closed) return;
    try {
      this.output.write(`${JSON.stringify(message)}\n`);
    } catch {
      /* the client went away */
    }
  }

  private respond(id: string | number | null, result: unknown): void {
    const response: JsonRpcResponse = { jsonrpc: "2.0", id, result: result ?? {} };
    this.write(response);
  }

  private respondError(id: string | number | null, code: number, message: string, data?: unknown): void {
    this.write({ jsonrpc: "2.0", id, error: { code, message, data } });
  }

  private notify(method: string, params: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  /** A `session/update` notification. */
  private update(sessionId: string, update: Record<string, unknown>): void {
    this.notify("session/update", { sessionId, update });
  }

  /** A request we send to the client (permission, fs, terminal). */
  private requestClient<T = Record<string, unknown>>(method: string, params: unknown): Promise<T> {
    return this.requestClientWithId<T>(`xm-${this.nextId++}`, method, params);
  }

  /** The same, with a request id we already know (so it can be cancelled). */
  private requestClientWithId<T = Record<string, unknown>>(
    requestId: string,
    method: string,
    params: unknown,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
      this.write({ jsonrpc: "2.0", id: requestId, method, params });
    });
  }

  private onClientResponse(message: Record<string, unknown>): void {
    const id = String(message.id ?? "");
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    const error = message.error as { code?: number; message?: string } | undefined;
    if (error) {
      entry.reject(new RpcError(error.code ?? RPC_INTERNAL_ERROR, error.message ?? "client error"));
      return;
    }
    entry.resolve(message.result ?? {});
  }

  // ── dispatch ─────────────────────────────────────────────────────────────

  private async handleRequest(method: string, id: string | number, params: unknown): Promise<void> {
    try {
      const result = await this.dispatch(method, params);
      this.respond(id, result);
    } catch (error) {
      if (error instanceof RpcError) {
        this.respondError(id, error.code, error.message, error.data);
        return;
      }
      this.respondError(id, RPC_INTERNAL_ERROR, error instanceof Error ? error.message : String(error));
    }
  }

  private async handleNotification(method: string, params: unknown): Promise<void> {
    if (method === "session/cancel") {
      const sessionId = String((params as { sessionId?: string })?.sessionId ?? "");
      const session = this.sessions.get(sessionId);
      if (session) {
        session.cancelled = true;
        session.runtime.agent.abort();
        // the client must answer every open permission request
        for (const requestId of session.pendingAsks) {
          const entry = this.pending.get(requestId);
          if (entry) {
            this.pending.delete(requestId);
            entry.reject(new RpcError(-32800, "cancelled"));
          }
        }
        session.pendingAsks.clear();
      }
      return;
    }
    if (method === "$/cancel_request") {
      const requestId = String((params as { requestId?: string })?.requestId ?? "");
      const entry = this.pending.get(requestId);
      if (entry) {
        this.pending.delete(requestId);
        entry.reject(new RpcError(-32800, "request cancelled"));
      }
    }
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "initialize":
        return this.onInitialize(params);
      case "authenticate":
        // XMINAL stores provider keys locally — there is nothing to hand over
        return {};
      case "logout":
        return {};
      case "session/new":
        return this.onSessionNew(params);
      case "session/load":
        return this.onSessionLoad(params);
      case "session/resume":
        return this.onSessionResume(params);
      case "session/close":
        return this.onSessionClose(params);
      case "session/delete":
        return this.onSessionDelete(params);
      case "session/list":
        return this.onSessionList(params);
      case "session/prompt":
        return this.onSessionPrompt(params);
      case "session/set_mode":
        return this.onSetMode(params);
      case "session/set_model":
        return this.onSetModel(params);
      case "session/set_config_option":
        return this.onSetConfigOption(params);
      default:
        throw new RpcError(RPC_METHOD_NOT_FOUND, `method not found: ${method}`);
    }
  }

  // ── methods ──────────────────────────────────────────────────────────────

  private onInitialize(params: unknown): unknown {
    const request = (params ?? {}) as { protocolVersion?: number; clientCapabilities?: ClientCapabilities; clientInfo?: Implementation };
    this.clientCapabilities = request.clientCapabilities ?? {};
    this.clientInfo = request.clientInfo;
    const requested = Number(request.protocolVersion ?? ACP_PROTOCOL_VERSION);
    const version = Number.isFinite(requested) && requested >= 1 && requested <= ACP_PROTOCOL_VERSION ? requested : ACP_PROTOCOL_VERSION;
    return {
      protocolVersion: version,
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: { image: false, audio: false, embeddedContext: true },
        mcpCapabilities: { http: false, sse: false },
        sessionCapabilities: { resume: {}, close: {}, list: {}, delete: {} },
      },
      agentInfo: { name: "xminal", title: "XMINAL", version: VERSION },
      authMethods: [],
    };
  }

  private modeState(session: AcpSession): SessionModeState {
    return { currentModeId: session.mode, availableModes: SESSION_MODES };
  }

  private configOptions(session: AcpSession): SessionConfigOption[] {
    const models = listModelAliases(session.runtime.config).map((alias) => ({ value: alias, name: alias }));
    if (!models.some((model) => model.value === session.model)) {
      models.unshift({ value: session.model, name: session.model });
    }
    return [
      {
        id: "model",
        name: "Model",
        description: "The model that answers this session",
        category: "model",
        type: "select",
        currentValue: session.model,
        options: models,
      },
      {
        id: "effort",
        name: "Effort",
        description: "How much the model thinks before answering",
        category: "thought_level",
        type: "select",
        currentValue: session.effort,
        options: EFFORTS.map((effort) => ({ value: effort.id, name: effort.name })),
      },
    ];
  }

  private async onSessionNew(params: unknown): Promise<unknown> {
    const request = (params ?? {}) as { cwd?: string; mcpServers?: unknown };
    const cwd = typeof request.cwd === "string" && request.cwd ? path.resolve(request.cwd) : this.options.cwd;
    const session = this.createSession(cwd, request.mcpServers);
    return {
      sessionId: session.id,
      modes: this.modeState(session),
      configOptions: this.configOptions(session),
    };
  }

  private async onSessionLoad(params: unknown): Promise<unknown> {
    const request = (params ?? {}) as { sessionId?: string; cwd?: string; mcpServers?: unknown };
    const sessionId = String(request.sessionId ?? "");
    const cwd = typeof request.cwd === "string" && request.cwd ? path.resolve(request.cwd) : this.options.cwd;
    const session = this.createSession(cwd, request.mcpServers, sessionId);
    this.replayHistory(session);
    return {
      modes: this.modeState(session),
      configOptions: this.configOptions(session),
    };
  }

  private async onSessionResume(params: unknown): Promise<unknown> {
    const request = (params ?? {}) as { sessionId?: string; cwd?: string; mcpServers?: unknown };
    const sessionId = String(request.sessionId ?? "");
    const cwd = typeof request.cwd === "string" && request.cwd ? path.resolve(request.cwd) : this.options.cwd;
    const session = this.createSession(cwd, request.mcpServers, sessionId);
    return {
      modes: this.modeState(session),
      configOptions: this.configOptions(session),
    };
  }

  private async onSessionClose(params: unknown): Promise<unknown> {
    const sessionId = String((params as { sessionId?: string })?.sessionId ?? "");
    const session = this.sessions.get(sessionId);
    if (session) {
      session.runtime.agent.abort();
      session.runtime.close();
      this.sessions.delete(sessionId);
    }
    return {};
  }

  private async onSessionDelete(params: unknown): Promise<unknown> {
    const sessionId = String((params as { sessionId?: string })?.sessionId ?? "");
    const session = this.sessions.get(sessionId);
    if (session) {
      session.runtime.agent.abort();
      session.runtime.close();
      this.sessions.delete(sessionId);
    }
    Session.remove(this.options.cwd, sessionId);
    return {};
  }

  private async onSessionList(params: unknown): Promise<unknown> {
    const request = (params ?? {}) as { cwd?: string };
    const cwd = typeof request.cwd === "string" && request.cwd ? path.resolve(request.cwd) : this.options.cwd;
    const sessions = Session.list(cwd).map((meta) => ({
      sessionId: meta.id,
      cwd: meta.cwd,
      title: meta.title === "untitled" ? null : meta.title,
      updatedAt: meta.updatedAt,
    }));
    return { sessions };
  }

  private async onSetMode(params: unknown): Promise<unknown> {
    const request = (params ?? {}) as { sessionId?: string; modeId?: string };
    const session = this.requireSession(request.sessionId);
    const modeId = String(request.modeId ?? "");
    if (!SESSION_MODES.some((mode) => mode.id === modeId)) {
      throw new RpcError(RPC_INVALID_PARAMS, `unknown mode: ${modeId}`);
    }
    session.mode = modeId as AgentMode;
    session.runtime.setMode(session.mode);
    this.update(session.id, { sessionUpdate: "current_mode_update", currentModeId: session.mode });
    return {};
  }

  private async onSetModel(params: unknown): Promise<unknown> {
    const request = (params ?? {}) as { sessionId?: string; modelId?: string };
    const session = this.requireSession(request.sessionId);
    const modelId = String(request.modelId ?? "");
    if (!modelId) throw new RpcError(RPC_INVALID_PARAMS, "modelId is required");
    session.model = modelId;
    session.runtime.agent.setModel(modelId);
    this.update(session.id, { sessionUpdate: "config_option_update", configOptions: this.configOptions(session) });
    return {};
  }

  private async onSetConfigOption(params: unknown): Promise<unknown> {
    const request = (params ?? {}) as { sessionId?: string; configId?: string; value?: { value?: unknown; type?: string } };
    const session = this.requireSession(request.sessionId);
    const configId = String(request.configId ?? "");
    const value = request.value as { value?: unknown } | undefined;
    const selected = typeof value?.value === "string" ? value.value : "";
    if (configId === "model") {
      if (!selected) throw new RpcError(RPC_INVALID_PARAMS, "a model id is required");
      session.model = selected;
      session.runtime.agent.setModel(selected);
    } else if (configId === "effort") {
      const effort = selected as AgentEffort;
      if (!EFFORTS.some((item) => item.id === effort)) {
        throw new RpcError(RPC_INVALID_PARAMS, `unknown effort: ${selected}`);
      }
      session.effort = effort;
      session.runtime.setEffort(effort);
    } else {
      throw new RpcError(RPC_INVALID_PARAMS, `unknown config option: ${configId}`);
    }
    const options = this.configOptions(session);
    this.update(session.id, { sessionUpdate: "config_option_update", configOptions: options });
    return { configOptions: options };
  }

  private async onSessionPrompt(params: unknown): Promise<{ stopReason: StopReason }> {
    const request = (params ?? {}) as { sessionId?: string; prompt?: ContentBlock[] };
    const session = this.requireSession(request.sessionId);
    const blocks = Array.isArray(request.prompt) ? request.prompt : [];
    const text = promptToText(blocks);
    if (!text.trim()) throw new RpcError(RPC_INVALID_PARAMS, "prompt is empty");

    if (session.running) {
      throw new RpcError(RPC_INVALID_PARAMS, "a prompt turn is already running for this session");
    }
    session.cancelled = false;
    session.running = true;
    const agentMessageId = id("msg");
    const callbacks = this.callbacksFor(session, agentMessageId);
    session.runtime.agent.setCallbacks(callbacks);

    let result;
    try {
      result = await session.runtime.agent.run(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.update(session.id, {
        sessionUpdate: "agent_message_chunk",
        messageId: agentMessageId,
        content: { type: "text", text: `The agent stopped: ${message}` },
      });
      session.running = false;
      return { stopReason: session.cancelled ? "cancelled" : "refusal" };
    }
    session.running = false;
    return { stopReason: session.cancelled ? "cancelled" : mapStopReason(result.stoppedReason) };
  }

  // ── sessions ─────────────────────────────────────────────────────────────

  private requireSession(sessionId: string | undefined): AcpSession {
    const id = String(sessionId ?? "");
    const session = this.sessions.get(id);
    if (!session) throw new RpcError(RPC_UNKNOWN_SESSION, `unknown session: ${id}`);
    return session;
  }

  private createSession(cwd: string, mcpServers: unknown, existingId?: string): AcpSession {
    const runtime = new Runtime(cwd, {
      mode: this.options.mode,
      model: this.options.model,
      sessionId: existingId,
      newSession: !existingId,
      mcpServers: this.mcpServersFrom(mcpServers),
    });
    const session: AcpSession = {
      id: runtime.session.id,
      runtime,
      mode: (runtime.session.meta.agentMode as AgentMode) ?? this.options.mode ?? "build",
      model: runtime.session.meta.model,
      effort: runtime.agent.effort,
      current: null,
      cancelled: false,
      running: false,
      pendingAsks: new Set<string>(),
    };
    runtime.setAskHandler((tool, detail, args) => this.askPermission(session, tool, detail, args));
    this.installClientTools(session);
    this.sessions.set(session.id, session);
    return session;
  }

  /** The MCP servers the client listed in session/new, session/load or session/resume. */
  private mcpServersFrom(raw: unknown): Record<string, McpServerConfig> | undefined {
    if (!Array.isArray(raw) || raw.length === 0) return undefined;
    const servers: Record<string, McpServerConfig> = {};
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const server = entry as { name?: string; command?: string; args?: string[]; env?: Array<{ name: string; value: string }>; type?: string };
      if (!server.name || typeof server.command !== "string") continue;
      if (server.type && server.type !== "stdio") continue;
      const env: Record<string, string> = {};
      for (const variable of server.env ?? []) {
        if (variable && typeof variable.name === "string") env[variable.name] = String(variable.value ?? "");
      }
      servers[server.name] = { command: [server.command, ...(server.args ?? [])], env };
    }
    return Object.keys(servers).length > 0 ? servers : undefined;
  }

  /** Replay a loaded session's history back to the client. */
  private replayHistory(session: AcpSession): void {
    for (const message of session.runtime.session.messages) {
      if (message.role === "user") {
        this.update(session.id, {
          sessionUpdate: "user_message_chunk",
          messageId: id("msg"),
          content: { type: "text", text: message.content },
        });
        continue;
      }
      if (message.role === "assistant") {
        const text = typeof message.content === "string" ? message.content : "";
        if (text.trim()) {
          this.update(session.id, {
            sessionUpdate: "agent_message_chunk",
            messageId: id("msg"),
            content: { type: "text", text },
          });
        }
        const calls = (message as { toolCalls?: Array<{ id: string; name: string; arguments: string }> }).toolCalls ?? [];
        for (const call of calls) {
          const args = parseArgs(call.arguments);
          this.update(session.id, {
            sessionUpdate: "tool_call",
            toolCallId: call.id,
            title: toolTitle(call.name, args, session.runtime.cwd),
            name: call.name,
            kind: toolKind(call.name),
            status: "pending",
            rawInput: args,
          });
        }
        continue;
      }
      if (message.role === "tool") {
        const tool = message as unknown as { toolCallId?: string; content?: string };
        if (!tool.toolCallId) continue;
        this.update(session.id, {
          sessionUpdate: "tool_call_update",
          toolCallId: tool.toolCallId,
          status: "completed",
          content: [{ type: "content", content: { type: "text", text: tool.content ?? "" } }],
        });
      }
    }
  }

  // ── streaming ────────────────────────────────────────────────────────────

  private callbacksFor(session: AcpSession, agentMessageId: string): AgentCallbacks {
    const cwd = session.runtime.cwd;
    return {
      onText: (text) => {
        this.update(session.id, {
          sessionUpdate: "agent_message_chunk",
          messageId: agentMessageId,
          content: { type: "text", text },
        });
      },
      onReasoning: (text) => {
        this.update(session.id, {
          sessionUpdate: "agent_thought_chunk",
          messageId: agentMessageId,
          content: { type: "text", text },
        });
      },
      onToolCall: (call: ToolCall) => {
        const args = parseArgs(call.arguments);
        const absolute = this.absolutePath(args, cwd);
        session.current = {
          id: call.id,
          name: call.name,
          title: toolTitle(call.name, args, cwd),
          args,
          preContent: absolute ? readIfExists(absolute) : null,
          prePath: absolute,
        };
        this.update(session.id, {
          sessionUpdate: "tool_call",
          toolCallId: call.id,
          title: session.current.title,
          name: call.name,
          kind: toolKind(call.name),
          status: "pending",
          rawInput: args,
          locations: toolLocations(call.name, args, cwd),
        });
        if (!session.runtime.permissions.willAsk(call.name, args)) {
          this.update(session.id, { sessionUpdate: "tool_call_update", toolCallId: call.id, status: "in_progress" });
        }
      },
      onToolResult: (name: string, result: ToolResult) => {
        const current = session.current;
        const toolCallId = current?.id ?? id("call");
        const content: ToolCallContent[] = [];
        const diff = this.diffFor(current);
        if (diff) content.push(diff);
        content.push({ type: "content", content: { type: "text", text: result.content } });
        this.update(session.id, {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: result.isError ? "failed" : "completed",
          content,
        });
        session.current = null;
      },
      onUsage: (usage, model) => {
        const size = model?.contextWindow ?? 0;
        if (!size) return;
        const cost = session.runtime.agent.getCost();
        this.update(session.id, {
          sessionUpdate: "usage_update",
          used: usage.inputTokens,
          size,
          cost: { amount: cost.costUsd, currency: "USD" },
        });
      },
      onStatus: (message) => {
        const notices = (this.clientCapabilities.session?.notices ?? null) as unknown;
        if (!notices) return;
        this.update(session.id, {
          sessionUpdate: "notice",
          severity: "info",
          title: "XMINAL",
          description: message,
        });
      },
    };
  }

  private absolutePath(args: Record<string, unknown>, cwd: string): string | null {
    const value = args.path ?? args.file ?? args.filePath;
    if (typeof value !== "string" || !value) return null;
    return path.isAbsolute(value) ? value : path.resolve(cwd, value);
  }

  private diffFor(current: PendingCall | null): ToolCallContent | null {
    if (!current || !current.prePath) return null;
    if (!["write", "edit", "multi_edit", "patch"].includes(current.name)) return null;
    const newText = newTextFor(current.name, current.args, current.prePath);
    if (newText === null) return null;
    return { type: "diff", path: current.prePath, oldText: current.preContent, newText };
  }

  // ── permission ───────────────────────────────────────────────────────────

  private async askPermission(
    session: AcpSession,
    tool: string,
    detail: string | undefined,
    args: Record<string, unknown> | undefined,
  ): Promise<boolean> {
    const current = session.current;
    const toolCallId = current?.id ?? id("call");
    const title = current?.title ?? toolTitle(tool, args ?? {}, session.runtime.cwd);
    let outcome: { outcome?: string; optionId?: string };
    const requestId = `perm-${this.nextId++}`;
    session.pendingAsks.add(requestId);
    try {
      const response = await this.requestClientWithId<{ outcome?: { outcome?: string; optionId?: string } }>(requestId, "session/request_permission", {
        sessionId: session.id,
        toolCall: {
          toolCallId,
          title,
          kind: toolKind(tool),
          status: "pending",
          content: [{ type: "content", content: { type: "text", text: detail ? `${tool}: ${detail}` : tool } }],
        },
        options: PERMISSION_OPTIONS,
      });
      outcome = response.outcome ?? { outcome: "cancelled" };
    } catch {
      // the client went away or cancelled the turn
      return false;
    } finally {
      session.pendingAsks.delete(requestId);
    }
    if (outcome.outcome !== "selected" || !outcome.optionId) return false;
    if (outcome.optionId === "allow-once") {
      this.update(session.id, { sessionUpdate: "tool_call_update", toolCallId, status: "in_progress" });
      return true;
    }
    if (outcome.optionId === "allow-always") {
      session.runtime.permissions.allowTool(tool);
      this.update(session.id, { sessionUpdate: "tool_call_update", toolCallId, status: "in_progress" });
      return true;
    }
    if (outcome.optionId === "reject-always") {
      session.runtime.permissions.denyTool(tool);
    }
    return false;
  }

  // ── client-side tools (terminal, filesystem) ──────────────────────────────

  /**
   * When the client offers a terminal, shell commands run there — the user
   * sees them in their IDE. Otherwise XMINAL runs them itself.
   */
  private installClientTools(session: AcpSession): void {
    if (this.clientCapabilities.terminal === true) {
      const original = session.runtime.tools.get("bash");
      if (original) session.runtime.tools.register(this.terminalBashTool(session, original));
    }
  }

  private terminalBashTool(session: AcpSession, original: Tool): Tool {
    const agent = this;
    return {
      ...original,
      async run(args, context): Promise<ToolResult> {
        const command = typeof args.command === "string" ? args.command : "";
        if (!command.trim()) return original.run(args, context);
        try {
          const created = await agent.requestClient<{ terminalId?: string }>("terminal/create", {
            sessionId: session.id,
            command: "/bin/sh",
            args: ["-c", command],
            cwd: context.cwd,
            outputByteLimit: 1_000_000,
          });
          const terminalId = created.terminalId;
          if (!terminalId) return original.run(args, context);
          if (session.current) {
            agent.update(session.id, {
              sessionUpdate: "tool_call_update",
              toolCallId: session.current.id,
              status: "in_progress",
              content: [{ type: "terminal", terminalId }],
            });
          }
          let exitStatus: { exitCode?: number | null; signal?: string | null } = {};
          try {
            exitStatus = await agent.requestClient<{ exitCode?: number | null; signal?: string | null }>("terminal/wait_for_exit", {
              sessionId: session.id,
              terminalId,
            });
          } catch {
            /* the client may not implement wait_for_exit */
          }
          let output = "";
          try {
            const result = await agent.requestClient<{ output?: string; truncated?: boolean }>("terminal/output", {
              sessionId: session.id,
              terminalId,
            });
            output = result.output ?? "";
          } catch {
            output = "";
          }
          try {
            await agent.requestClient("terminal/release", { sessionId: session.id, terminalId });
          } catch {
            /* releasing is best effort */
          }
          const code = exitStatus.exitCode ?? 0;
          const body = output.trim() ? output : "(no output)";
          return {
            content: `$ ${command}\n${body}\n[exit ${code}]`,
            isError: code !== 0,
          };
        } catch (error) {
          // the client refused or failed the terminal — fall back to running it here
          return original.run(args, context);
        }
      },
    };
  }
}

/** Start the ACP agent on stdio. */
export function startAcpAgent(options: AcpOptions): AcpAgent {
  const agent = new AcpAgent(options);
  agent.start();
  return agent;
}

/** Read a file the client can see — used by the fs bridge and the tests. */
export function readClientFile(cwd: string, file: string): string | undefined {
  const absolute = path.isAbsolute(file) ? file : path.resolve(cwd, file);
  if (!fs.existsSync(absolute)) return undefined;
  return fs.readFileSync(absolute, "utf8");
}
