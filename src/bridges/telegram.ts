import { Runtime } from "../runtime";
import { resolveModel } from "../config/config";
import type { AgentMode } from "../core/agent";
import type { PermissionMode } from "../config/types";
import { truncateText } from "../util/fs";

export interface TelegramOptions {
  cwd: string;
  token: string;
  mode?: AgentMode;
  model?: string;
}

const MODES: AgentMode[] = ["plan", "build", "compose", "review", "yolo"];
const PERMISSIONS: PermissionMode[] = ["ask", "auto", "full"];

export async function startTelegram(options: TelegramOptions): Promise<void> {
  const runtimes = new Map<number, Runtime>();
  const busy = new Set<number>();
  let offset = 0;
  let stopped = false;

  const api = async (method: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch(`https://api.telegram.org/bot${options.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { ok?: boolean; result?: Record<string, unknown>; description?: string };
    if (!response.ok || data.ok === false) throw new Error(data.description ?? `Telegram API error (${response.status})`);
    return data.result ?? {};
  };

  const send = async (chatId: number, text: string): Promise<void> => {
    const chunks = chunkText(text, 4000);
    for (const chunk of chunks) {
      await api("sendMessage", { chat_id: chatId, text: chunk, disable_web_page_preview: true });
    }
  };

  const getRuntime = (chatId: number): Runtime => {
    let runtime = runtimes.get(chatId);
    if (!runtime) {
      runtime = new Runtime(options.cwd, { mode: options.mode, model: options.model, newSession: true });
      runtime.setAskHandler(async (tool, reason) => {
        await send(chatId, `auto-approved ${tool} (${reason})`);
        return true;
      });
      runtimes.set(chatId, runtime);
    }
    return runtime;
  };

  const stop = () => {
    stopped = true;
    for (const runtime of runtimes.values()) runtime.close();
    runtimes.clear();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log("xminal telegram bridge started (Ctrl+C to stop)");

  while (!stopped) {
    try {
      const result = (await api("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message"],
      })) as { updates?: TelegramUpdate[] };
      for (const update of result.updates ?? []) {
        offset = Math.max(offset, update.update_id + 1);
        const message = update.message;
        if (!message?.text || !message.chat?.id) continue;
        const chatId = message.chat.id;
        const text = message.text.trim();
        if (!text) continue;

        if (busy.has(chatId)) {
          await send(chatId, "Still working on the previous request. Send /new to start over.");
          continue;
        }

        if (text.startsWith("/")) {
          const { command, rest } = splitCommand(text);
          if (command === "new") {
            runtimes.get(chatId)?.close();
            runtimes.delete(chatId);
            const runtime = getRuntime(chatId);
            await send(chatId, `New session: ${runtime.session.id}`);
            continue;
          }
          if (command === "status") {
            const runtime = getRuntime(chatId);
            const cost = runtime.agent.getCost();
            await send(
              chatId,
              `session ${runtime.session.id}\nmodel ${runtime.agent.modelSpec}\nmode ${runtime.agent.mode}\npermissions ${runtime.permissions.mode}\nturns ${cost.turns} · $${cost.costUsd.toFixed(6)}`,
            );
            continue;
          }
          if (command === "cost") {
            const cost = getRuntime(chatId).agent.getCost();
            await send(chatId, `${cost.inputTokens} in / ${cost.outputTokens} out tokens · $${cost.costUsd.toFixed(6)}`);
            continue;
          }
          if (command === "mode") {
            if (!MODES.includes(rest as AgentMode)) {
              await send(chatId, `mode must be one of: ${MODES.join(", ")}`);
              continue;
            }
            const runtime = getRuntime(chatId);
            runtime.setMode(rest as AgentMode);
            if (rest === "yolo") runtime.session.setMode("full");
            await send(chatId, `mode → ${rest}`);
            continue;
          }
          if (command === "permissions") {
            if (!PERMISSIONS.includes(rest as PermissionMode)) {
              await send(chatId, `permissions must be one of: ${PERMISSIONS.join(", ")}`);
              continue;
            }
            const runtime = getRuntime(chatId);
            runtime.permissions.setMode(rest as PermissionMode);
            runtime.session.setMode(rest as PermissionMode);
            await send(chatId, `permissions → ${rest}`);
            continue;
          }
          if (command === "model") {
            const runtime = getRuntime(chatId);
            if (!rest) {
              await send(chatId, `model: ${runtime.agent.modelSpec}`);
              continue;
            }
            try {
              const resolved = resolveModel(runtime.config, rest);
              runtime.agent.setModel(rest);
              await send(chatId, `model → ${resolved.alias} (${resolved.provider}/${resolved.model})`);
            } catch (error) {
              await send(chatId, (error as Error).message);
            }
            continue;
          }
          if (command === "help") {
            await send(
              chatId,
              [
                "/new — new session",
                "/status — session status",
                "/cost — usage",
                "/model <spec> — switch model",
                "/mode <mode> — plan/build/compose/review/yolo",
                "/permissions <ask|auto|full>",
                "Send any other text to run the agent.",
              ].join("\n"),
            );
            continue;
          }
          if (command === "exit" || command === "stop") {
            runtimes.get(chatId)?.close();
            runtimes.delete(chatId);
            await send(chatId, "Session closed.");
            continue;
          }
        }

        const runtime = getRuntime(chatId);
        busy.add(chatId);
        void api("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
        try {
          const result = await runtime.agent.run(text);
          await send(chatId, result.text || "(no output)");
          if (result.stoppedReason !== "done") {
            await send(chatId, `stopped: ${result.stoppedReason} · $${result.cost.costUsd.toFixed(6)}`);
          }
        } catch (error) {
          await send(chatId, `error: ${truncateText((error as Error).message, 3000)}`);
        } finally {
          busy.delete(chatId);
        }
      }
    } catch (error) {
      if (stopped) break;
      console.error(`telegram poll error: ${(error as Error).message}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id?: number };
  };
}

function splitCommand(text: string): { command: string; rest: string } {
  const body = text.slice(1).trim();
  const space = body.indexOf(" ");
  return {
    command: (space === -1 ? body : body.slice(0, space)).toLowerCase(),
    rest: space === -1 ? "" : body.slice(space + 1).trim(),
  };
}

function chunkText(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) chunks.push(text.slice(index, index + size));
  return chunks;
}
