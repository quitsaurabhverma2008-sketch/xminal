import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { Runtime } from "../runtime";
import { Session } from "../core/session";
import { loadConfig } from "../config/config";
import { VERSION } from "../version";
import { WEB_PAGE } from "./web";
import type { AgentMode } from "../core/agent";
import type { AgentCallbacks } from "../core/agent";

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

export async function startServer(options: ServeOptions): Promise<RunningServer> {
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
        const file = path.join(options.cwd, "site", "index.html");
        let body: string | undefined;
        try {
          body = fs.readFileSync(file, "utf8");
        } catch {
          body = undefined;
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
        const models = Object.entries(config.models).map(([alias, model]) => ({ id: alias, ...model }));
        sendJson(res, 200, {
          object: "list",
          data: [
            { id: config.defaultModel, object: "model", owned_by: "xminal" },
            ...models.map((model) => ({ id: model.id, object: "model", owned_by: model.provider })),
          ],
          providers,
        });
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
      if (!res.headersSent) sendJson(res, 500, { error: { message, type: "server_error" } });
      else res.end();
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
