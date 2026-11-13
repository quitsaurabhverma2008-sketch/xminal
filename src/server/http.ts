import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { Runtime } from "../runtime";
import { Session } from "../core/session";
import { loadConfig } from "../config/config";
import { VERSION } from "../version";
import { WEB_PAGE } from "./web";
import type { AgentMode, AgentEffort } from "../core/agent";
import type { AgentCallbacks } from "../core/agent";
import type { PermissionMode } from "../config/types";
import type { PermissionManager } from "../core/permissions";

export interface ServeOptions {
  cwd: string;
  host: string;
  port: number;
  token?: string;
  mode?: AgentMode;
  model?: string;
}

export interface RunningServer {
  server: http.Server;
  close: () => Promise<void>;
}

const MODES: AgentMode[] = ["plan", "build", "compose", "review", "yolo"];
const EFFORTS: AgentEffort[] = ["low", "medium", "high", "max"];
const PERMISSION_MODES: PermissionMode[] = ["ask", "auto", "full"];

interface PendingPermission {
  tool: string;
  sessionKey: string;
  permissions: PermissionManager;
  resolve: (allow: boolean) => void;
}

/** Map an ask-reason like "dangerous: rm -rf /" to the UI's risk vocabulary. */
function riskFromDetail(detail?: string): "high" | "medium" | "low" {
  if (!detail) return "medium";
  if (/^dangerous\b/i.test(detail)) return "high";
  if (/^risky\b/i.test(detail)) return "medium";
  if (/^safe\b/i.test(detail)) return "low";
  return "medium";
}

export async function startServer(options: ServeOptions): Promise<RunningServer> {
  // Pending permission asks, keyed by opaque id. Lives at server scope so the
  // /v1/agent/permission endpoint can resolve a wait that is blocked inside an
  // open /v1/agent/stream SSE connection.
  const pendingPermissions = new Map<string, PendingPermission>();
  const alwaysAllowed = new Map<string, Set<string>>();
  let pendingCounter = 0;

  const denyPendingForSession = (sessionKey: string): void => {
    for (const [id, pending] of pendingPermissions) {
      if (pending.sessionKey === sessionKey) {
        pendingPermissions.delete(id);
        pending.resolve(false);
      }
    }
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "content-type, authorization");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const publicPaths = new Set(["/health", "/", "/web", "/landing"]);
    if (options.token && !publicPaths.has(url.pathname) && req.headers.authorization !== `Bearer ${options.token}`) {
      sendJson(res, 401, { error: { message: "unauthorized", type: "auth_error" } });
      return;
    }

    try {
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/web")) {
        const body = WEB_PAGE;
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(body) });
        res.end(body);
        return;
      }

      if (req.method === "GET" && url.pathname === "/landing") {
        const packageSite = path.resolve(__dirname, "../../site/index.html");
        const cwdSite = path.join(options.cwd, "site", "index.html");
        let body: string | undefined;
        try {
          body = fs.readFileSync(packageSite, "utf8");
        } catch {
          try {
            body = fs.readFileSync(cwdSite, "utf8");
          } catch {
            body = undefined;
          }
        }
        if (body === undefined) {
          sendJson(res, 404, { error: { message: "site/index.html not found (build it first)", type: "not_found" } });
          return;
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(body) });
        res.end(body);
        return;
      }

      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { status: "ok", name: "xminal", version: VERSION });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/models") {
        const { config } = loadConfig(options.cwd);
        const providers = Object.entries(config.providers).map(([name, provider]) => ({
          name,
          type: provider.type,
          baseUrl: provider.baseUrl,
        }));
        const enrich = (alias: string, model?: { provider: string; model: string; contextWindow?: number; maxOutput?: number; inputPricePerMTok?: number; outputPricePerMTok?: number }) => ({
          id: alias,
          object: "model" as const,
          owned_by: model?.provider ?? "xminal",
          model: model?.model ?? alias,
          context_window: model?.contextWindow ?? null,
          max_output_tokens: model?.maxOutput ?? null,
          pricing: {
            prompt: model?.inputPricePerMTok ?? 0,
            completion: model?.outputPricePerMTok ?? 0,
          },
          free: (model?.inputPricePerMTok ?? 0) === 0 && (model?.outputPricePerMTok ?? 0) === 0,
        });
        const data = Object.entries(config.models).map(([alias, model]) => enrich(alias, model));
        if (!config.models[config.defaultModel]) {
          data.unshift(enrich(config.defaultModel));
        }
        sendJson(res, 200, { object: "list", data, providers });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/sessions") {
        sendJson(res, 200, { data: Session.list(options.cwd) });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/agent") {
        const body = await readJsonBody(req);
        const prompt = String(body.prompt ?? body.input ?? "");
        if (!prompt.trim()) {
          sendJson(res, 400, { error: { message: "prompt is required", type: "invalid_request" } });
          return;
        }
        const runtime = new Runtime(options.cwd, {
          mode: normalizeMode(body.mode) ?? options.mode,
          model: typeof body.model === "string" ? body.model : options.model,
          sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
          newSession: !body.sessionId,
        });
        try {
          const result = await runtime.agent.run(prompt);
          sendJson(res, 200, {
            text: result.text,
            sessionId: runtime.session.id,
            model: result.model,
            turns: result.turns,
            cost: result.cost,
            stoppedReason: result.stoppedReason,
          });
        } finally {
          runtime.close();
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/agent/stream") {
        const body = await readJsonBody(req);
        const prompt = String(body.prompt ?? body.message ?? body.input ?? "");
        if (!prompt.trim()) {
          sendJson(res, 400, { error: { message: "prompt is required", type: "invalid_request" } });
          return;
        }
        const writeSse = (event: string, data: unknown) => {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        const writeSafe = (event: string, data: unknown): void => {
          if (res.writableEnded || res.destroyed) return;
          try {
            writeSse(event, data);
          } catch {
            /* client went away mid-stream */
          }
        };
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        });
        const callbacks: AgentCallbacks = {
          onText: (text) => writeSafe("text", { text }),
          onReasoning: (text) => writeSafe("reasoning", { text }),
          onToolCall: (call) => writeSafe("tool_call", { id: call.id, name: call.name, arguments: call.arguments }),
          onToolResult: (name, result) =>
            writeSafe("tool_result", { name, content: result.content, isError: Boolean(result.isError) }),
          onStatus: (message) => writeSafe("status", { message }),
          onUsage: (usage, model) => writeSafe("usage", { usage, model: model?.alias }),
        };
        const runtime = new Runtime(options.cwd, {
          mode: normalizeMode(body.mode) ?? options.mode,
          model: typeof body.model === "string" ? body.model : options.model,
          sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
          newSession: !body.sessionId,
          callbacks,
        });
        // effort drives the per-turn output token budget (low/medium/high/max)
        if (typeof body.effort === "string" && EFFORTS.includes(body.effort as AgentEffort)) {
          runtime.setEffort(body.effort as AgentEffort);
        }
        if (
          typeof body.permissionMode === "string" &&
          PERMISSION_MODES.includes(body.permissionMode as PermissionMode)
        ) {
          runtime.permissions.setMode(body.permissionMode as PermissionMode);
        }
        const sessionKey = runtime.session.id;
        for (const tool of alwaysAllowed.get(sessionKey) ?? []) runtime.permissions.allowTool(tool);
        // Bridge the agent's ask-permission flow to the browser: the wait
        // resolves when the client POSTs to /v1/agent/permission (or the
        // connection drops, which denies).
        const ownPending = new Set<string>();
        runtime.setAskHandler(
          (tool, detail, args) =>
            new Promise<boolean>((resolve) => {
              const id = `perm-${++pendingCounter}`;
              ownPending.add(id);
              pendingPermissions.set(id, {
                tool,
                sessionKey,
                permissions: runtime.permissions,
                resolve: (allow) => {
                  ownPending.delete(id);
                  resolve(allow);
                },
              });
              writeSafe("permission", {
                id,
                name: tool,
                tool,
                arguments: args ?? {},
                risk: riskFromDetail(detail),
                reason: detail ?? "",
              });
            }),
        );
        res.on("close", () => {
          for (const id of ownPending) {
            const pending = pendingPermissions.get(id);
            if (pending) {
              pendingPermissions.delete(id);
              pending.resolve(false);
            }
          }
        });
        try {
          writeSafe("session", { sessionId: runtime.session.id, mode: body.mode ?? options.mode ?? "build" });
          const result = await runtime.agent.run(prompt);
          writeSafe("done", {
            sessionId: runtime.session.id,
            model: result.model,
            turns: result.turns,
            costUsd: result.cost.costUsd,
            inputTokens: result.cost.inputTokens,
            outputTokens: result.cost.outputTokens,
            stoppedReason: result.stoppedReason,
          });
        } catch (error) {
          writeSafe("error", { message: (error as Error)?.message ?? String(error) });
        } finally {
          for (const id of ownPending) {
            const pending = pendingPermissions.get(id);
            if (pending) {
              pendingPermissions.delete(id);
              pending.resolve(false);
            }
          }
          runtime.close();
          res.end();
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/agent/permission") {
        const body = await readJsonBody(req);
        const id = typeof body.id === "string" ? body.id : "";
        const approve = body.approve === true || body.decision === "approve";
        const always = body.always === true;
        const pending = pendingPermissions.get(id);
        if (!pending) {
          sendJson(res, 404, { error: { message: "unknown or expired permission id", type: "not_found" } });
          return;
        }
        pendingPermissions.delete(id);
        if (always) {
          let alwaysSet = alwaysAllowed.get(pending.sessionKey);
          if (!alwaysSet) {
            alwaysSet = new Set();
            alwaysAllowed.set(pending.sessionKey, alwaysSet);
          }
          alwaysSet.add(pending.tool);
          pending.permissions.allowTool(pending.tool);
        }
        pending.resolve(approve);
        sendJson(res, 200, { ok: true, decision: approve ? "approve" : "deny", alwaysApplied: always });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
        const body = await readJsonBody(req);
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const lastUser = [...messages].reverse().find((message: { role?: string }) => message.role === "user");
        const prompt = typeof lastUser?.content === "string" ? lastUser.content : "";
        if (!prompt.trim()) {
          sendJson(res, 400, { error: { message: "a user message is required", type: "invalid_request" } });
          return;
        }
        const wantStream = body.stream === true;
        const id = `chatcmpl-${Date.now().toString(36)}`;
        const created = Math.floor(Date.now() / 1000);

        let sseStarted = false;
        const callbacks: AgentCallbacks | undefined = wantStream
          ? {
              onText: (text) => {
                if (!sseStarted) {
                  res.writeHead(200, {
                    "content-type": "text/event-stream",
                    "cache-control": "no-cache",
                    connection: "keep-alive",
                  });
                  sseStarted = true;
                }
                res.write(
                  `data: ${JSON.stringify({
                    id,
                    object: "chat.completion.chunk",
                    created,
                    model: String(body.model ?? "xminal"),
                    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
                  })}\n\n`,
                );
              },
            }
          : undefined;

        const runtime = new Runtime(options.cwd, {
          mode: normalizeMode(body.mode) ?? options.mode,
          model: typeof body.model === "string" ? body.model : options.model,
          newSession: true,
          callbacks,
        });
        try {
          const result = await runtime.agent.run(prompt);
          if (wantStream) {
            if (!sseStarted) {
              res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
            }
            res.write(
              `data: ${JSON.stringify({
                id,
                object: "chat.completion.chunk",
                created,
                model: result.model,
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              })}\n\n`,
            );
            res.write("data: [DONE]\n\n");
            res.end();
          } else {
            sendJson(res, 200, {
              id,
              object: "chat.completion",
              created,
              model: result.model,
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: result.text },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: result.cost.inputTokens,
                completion_tokens: result.cost.outputTokens,
                total_tokens: result.cost.totalTokens,
              },
              x_xminal: { sessionId: runtime.session.id, turns: result.turns, costUsd: result.cost.costUsd },
            });
          }
        } finally {
          runtime.close();
        }
        return;
      }

      sendJson(res, 404, { error: { message: "not found", type: "not_found" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isClientError =
        message === "invalid JSON body" || message === "request body too large" || message.startsWith("request body");
      if (!res.headersSent) {
        sendJson(res, isClientError ? 400 : 500, {
          error: { message, type: isClientError ? "invalid_request" : "server_error" },
        });
      } else {
        res.end();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => resolve());
  });

  return {
    server,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeMode(value: unknown): AgentMode | undefined {
  return typeof value === "string" && MODES.includes(value as AgentMode) ? (value as AgentMode) : undefined;
}
