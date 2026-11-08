"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTelegram = startTelegram;
const runtime_1 = require("../runtime");
const config_1 = require("../config/config");
const fs_1 = require("../util/fs");
const MODES = ["plan", "build", "compose", "review", "yolo"];
const PERMISSIONS = ["ask", "auto", "full"];
async function startTelegram(options) {
    const runtimes = new Map();
    const busy = new Set();
    let offset = 0;
    let stopped = false;
    const api = async (method, payload) => {
        const response = await fetch(`https://api.telegram.org/bot${options.token}/${method}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = (await response.json());
        if (!response.ok || data.ok === false)
            throw new Error(data.description ?? `Telegram API error (${response.status})`);
        return data.result ?? {};
    };
    const send = async (chatId, text) => {
        const chunks = chunkText(text, 4000);
        for (const chunk of chunks) {
            await api("sendMessage", { chat_id: chatId, text: chunk, disable_web_page_preview: true });
        }
    };
    const getRuntime = (chatId) => {
        let runtime = runtimes.get(chatId);
        if (!runtime) {
            runtime = new runtime_1.Runtime(options.cwd, { mode: options.mode, model: options.model, newSession: true });
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
        for (const runtime of runtimes.values())
            runtime.close();
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
            }));
            for (const update of result.updates ?? []) {
                offset = Math.max(offset, update.update_id + 1);
                const message = update.message;
                if (!message?.text || !message.chat?.id)
                    continue;
                const chatId = message.chat.id;
                const text = message.text.trim();
                if (!text)
                    continue;
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
                        await send(chatId, `session ${runtime.session.id}\nmodel ${runtime.agent.modelSpec}\nmode ${runtime.agent.mode}\npermissions ${runtime.permissions.mode}\nturns ${cost.turns} · $${cost.costUsd.toFixed(6)}`);
                        continue;
                    }
                    if (command === "cost") {
                        const cost = getRuntime(chatId).agent.getCost();
                        await send(chatId, `${cost.inputTokens} in / ${cost.outputTokens} out tokens · $${cost.costUsd.toFixed(6)}`);
                        continue;
                    }
                    if (command === "mode") {
                        if (!MODES.includes(rest)) {
                            await send(chatId, `mode must be one of: ${MODES.join(", ")}`);
                            continue;
                        }
                        const runtime = getRuntime(chatId);
                        runtime.setMode(rest);
                        if (rest === "yolo")
                            runtime.session.setMode("full");
                        await send(chatId, `mode → ${rest}`);
                        continue;
                    }
                    if (command === "permissions") {
                        if (!PERMISSIONS.includes(rest)) {
                            await send(chatId, `permissions must be one of: ${PERMISSIONS.join(", ")}`);
                            continue;
                        }
                        const runtime = getRuntime(chatId);
                        runtime.permissions.setMode(rest);
                        runtime.session.setMode(rest);
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
                            const resolved = (0, config_1.resolveModel)(runtime.config, rest);
                            runtime.agent.setModel(rest);
                            await send(chatId, `model → ${resolved.alias} (${resolved.provider}/${resolved.model})`);
                        }
                        catch (error) {
                            await send(chatId, error.message);
                        }
                        continue;
                    }
                    if (command === "help") {
                        await send(chatId, [
                            "/new — new session",
                            "/status — session status",
                            "/cost — usage",
                            "/model <spec> — switch model",
                            "/mode <mode> — plan/build/compose/review/yolo",
                            "/permissions <ask|auto|full>",
                            "Send any other text to run the agent.",
                        ].join("\n"));
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
                }
                catch (error) {
                    await send(chatId, `error: ${(0, fs_1.truncateText)(error.message, 3000)}`);
                }
                finally {
                    busy.delete(chatId);
                }
            }
        }
        catch (error) {
            if (stopped)
                break;
            console.error(`telegram poll error: ${error.message}`);
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }
}
function splitCommand(text) {
    const body = text.slice(1).trim();
    const space = body.indexOf(" ");
    return {
        command: (space === -1 ? body : body.slice(0, space)).toLowerCase(),
        rest: space === -1 ? "" : body.slice(space + 1).trim(),
    };
}
function chunkText(text, size) {
    if (text.length <= size)
        return [text];
    const chunks = [];
    for (let index = 0; index < text.length; index += size)
        chunks.push(text.slice(index, index + size));
    return chunks;
}
//# sourceMappingURL=telegram.js.map