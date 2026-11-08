"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTui = startTui;
const config_1 = require("../config/config");
const ansi_1 = require("../util/ansi");
const version_1 = require("../version");
const render_1 = require("../cli/render");
const tool_usage_1 = require("../core/tool-usage");
const layout_1 = require("./layout");
const LOGO = [
    "███╗   ███╗██╗███╗   ██╗ █████╗ ██╗     ",
    "████╗ ████║██║████╗  ██║██╔══██╗██║     ",
    "██╔████╔██║██║██╔██╗ ██║███████║██║     ",
    "██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║     ",
    "██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗",
    "╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝",
];
const COMMANDS = [
    "/help", "/model", "/models", "/mode", "/permissions", "/status", "/cost", "/tools",
    "/sessions", "/resume", "/new", "/undo", "/rewind", "/checkpoints", "/compact", "/clear",
    "/memory", "/skills", "/mcp", "/audit", "/doctor", "/verify", "/ralph", "/init",
    "/diff", "/git", "/tasks", "/brain", "/features", "/version", "/exit",
];
async function startTui(runtime) {
    const renderer = new render_1.Renderer();
    let busy = false;
    let closed = false;
    let panel = "none";
    let scroll = 0;
    let statusLine = "ready";
    let pendingPermission = null;
    const lines = [];
    const cols = () => Math.max(40, process.stdout.columns ?? 80);
    const rows = () => Math.max(14, process.stdout.rows ?? 24);
    let input = "";
    let cursor = 0;
    const sgr = {
        reset: "\x1b[0m",
        bold: "\x1b[1m",
        dim: "\x1b[2m",
        cyan: "\x1b[36m",
        brightCyan: "\x1b[96m",
        magenta: "\x1b[35m",
        yellow: "\x1b[33m",
        green: "\x1b[32m",
        red: "\x1b[31m",
        gray: "\x1b[90m",
        accent: "\x1b[38;5;51m",
        violet: "\x1b[38;5;141m",
    };
    const scrollbackHeight = () => Math.max(3, rows() - 6);
    const rolePrefix = (kind) => kind === "user" ? sgr.cyan + "  you › " + sgr.reset
        : kind === "assistant" ? sgr.accent + "agent › " + sgr.reset
            : kind === "tool" ? sgr.yellow + "  ●   " + sgr.reset
                : kind === "ok" ? sgr.green + "  ✓   " + sgr.reset
                    : kind === "err" ? sgr.red + "  ✗   " + sgr.reset
                        : sgr.gray + "  ·   " + sgr.reset;
    const allWrapped = () => {
        const width = cols();
        const body = Math.max(8, width - 8);
        const pad = " ".repeat(8);
        const out = [];
        for (const line of lines) {
            const prefix = rolePrefix(line.kind);
            const parts = (0, layout_1.wrapText)(line.text, body);
            for (let i = 0; i < parts.length; i++) {
                out.push((i === 0 ? prefix : pad) + parts[i]);
            }
        }
        return out;
    };
    const buildPanelLines = (width) => {
        const inner = Math.max(10, width - 4);
        const out = [];
        const hr = (title) => {
            const label = ` ${title} `;
            out.push(sgr.brightCyan + "┌─" + label + "─".repeat(Math.max(0, inner - label.length - 1)) + "┐" + sgr.reset);
        };
        const row = (text) => out.push(sgr.gray + "│ " + sgr.reset + (0, ansi_1.truncate)(text, inner - 2) + " ".repeat(Math.max(0, inner - 2 - (0, ansi_1.visibleLength)(text))) + sgr.gray + " │" + sgr.reset);
        const close = () => out.push(sgr.gray + "└" + "─".repeat(Math.max(0, inner)) + "┘" + sgr.reset);
        if (panel === "mcp") {
            hr("MCP · F1");
            const servers = runtime.mcp.listServerNames();
            row(servers.length ? `servers (${servers.length}): ${servers.join(", ")}` : "(no MCP servers configured — add mcpServers to ~/.xminal/config.json)");
            row("");
            row("tool usage (all-time, ≈ tokens from chars/4):");
            const usage = (0, tool_usage_1.loadToolUsage)(runtime.cwd);
            if (usage.byTool.length === 0) {
                row("  (no calls recorded yet)");
            }
            else {
                for (const bucket of usage.byTool.slice(0, Math.max(4, scrollbackHeight() - 8))) {
                    const name = bucket.name.padEnd(34).slice(0, 34);
                    const calls = String(bucket.calls).padStart(5);
                    const tokens = (0, tool_usage_1.formatTokens)(bucket.tokens).padStart(7);
                    const errs = bucket.errors > 0 ? ` ${bucket.errors} err` : "";
                    row(`  ${name} ${calls} ${tokens} tok${errs}`);
                }
                row(`total: ${usage.totalCalls} calls · ${(0, tool_usage_1.formatTokens)(usage.totalTokens)} tokens · ${usage.totalErrors} errors`);
            }
            close();
        }
        else if (panel === "skills") {
            hr("SKILLS · F2");
            const skills = runtime.skills.list();
            if (skills.length === 0) {
                row("(no skills installed — place SKILL.md folders in .xminal/skills or ~/.agents/skills)");
            }
            else {
                for (const skill of skills.slice(0, Math.max(4, scrollbackHeight() - 6))) {
                    row(`${sgr.brightCyan}${skill.name}${sgr.reset} ${sgr.gray}(${skill.source})${sgr.reset}`);
                    row(`  ${(0, ansi_1.truncate)(skill.description, inner - 4)}`);
                }
                row(`${skills.length} skill(s)`);
            }
            close();
        }
        else if (panel === "status") {
            hr("STATUS · F3");
            const cost = runtime.agent.getCost();
            const rows = [
                ["model", runtime.agent.modelSpec],
                ["mode", runtime.agent.mode],
                ["permission", runtime.permissions.mode],
                ["session", runtime.session.id.slice(0, 8)],
                ["cwd", runtime.cwd],
                ["turns", String(cost.turns)],
                ["tokens", `${cost.inputTokens} in / ${cost.outputTokens} out`],
                ["cost", `$${cost.costUsd.toFixed(6)}`],
                ["tools", String(runtime.tools.names().length)],
                ["skills", String(runtime.skills.list().length)],
                ["mcp servers", String(runtime.mcp.listServerNames().length)],
                ["session messages", String(runtime.session.messages.length)],
            ];
            for (const [key, value] of rows)
                row(`${sgr.gray}${key.padEnd(16)}${sgr.reset} ${value}`);
            close();
        }
        return out;
    };
    const render = () => {
        const width = cols();
        const sbHeight = scrollbackHeight();
        const wrapped = allWrapped();
        const end = Math.max(0, wrapped.length - scroll);
        const view = wrapped.slice(Math.max(0, end - sbHeight), end);
        const buf = [];
        const padLine = (s) => (s.length >= width ? s.slice(0, width) : s + " ".repeat(Math.max(0, width - s.length)));
        // 0: logo + session
        const sessionShort = runtime.session.id.slice(0, 8);
        buf.push(padLine((0, ansi_1.truncate)(sgr.accent + LOGO[0] + " " + sgr.reset + sgr.gray + "session " + sessionShort + " · " + runtime.cwd + sgr.reset, width)));
        // 1: model/mode/cost
        const cost = runtime.agent.getCost();
        const metaLeft = `${sgr.brightCyan}${runtime.agent.modelSpec}${sgr.reset}  ${sgr.gray}· mode ${sgr.reset}${sgr.violet}${runtime.agent.mode}${sgr.reset}  ${sgr.gray}· perm ${sgr.reset}${sgr.yellow}${runtime.permissions.mode}${sgr.reset}`;
        const metaRight = `${sgr.gray}$${cost.costUsd.toFixed(4)} · ${cost.turns} turns${sgr.reset}`;
        buf.push(padLine((0, ansi_1.truncate)(metaLeft + " ".repeat(Math.max(1, width - (0, ansi_1.visibleLength)(metaLeft) - (0, ansi_1.visibleLength)(metaRight))) + metaRight, width)));
        // 2: separator
        buf.push(padLine(sgr.gray + "─".repeat(width) + sgr.reset));
        // messages / panel
        if (panel !== "none") {
            const panelLines = buildPanelLines(width);
            for (let row = 0; row < sbHeight; row++) {
                buf.push(padLine((0, ansi_1.truncate)(panelLines[row] ?? "", width)));
            }
        }
        else {
            for (let row = 0; row < sbHeight; row++) {
                buf.push(padLine((0, ansi_1.truncate)(view[row] ?? "", width)));
            }
        }
        // scrollback indicator / separator
        if (scroll > 0) {
            buf.push(padLine(sgr.gray + `··· ${scroll} line(s) above · PgDn to return` + sgr.reset));
        }
        else {
            buf.push(padLine(sgr.gray + "─".repeat(width) + sgr.reset));
        }
        // palette popup (above input box)
        const palette = paletteItems();
        const paletteShown = palette.slice(0, 6);
        if (paletteShown.length > 0) {
            buf.push(padLine(sgr.gray + "  commands matching " + input + sgr.reset));
            for (const item of paletteShown) {
                const marker = item === paletteShown[0] ? sgr.brightCyan + "▸ " : "  ";
                buf.push(padLine(sgr.brightCyan + marker + item + sgr.reset));
            }
        }
        // input box (or permission prompt)
        const border = sgr.gray;
        buf.push(padLine(border + "┌" + "─".repeat(Math.max(0, width - 2)) + "┐" + sgr.reset));
        const inputWidth = Math.max(8, width - 4);
        if (pendingPermission) {
            const prompt = sgr.yellow + `? Allow ${pendingPermission.tool}` + sgr.reset + sgr.gray + ` (${pendingPermission.reason})` + sgr.reset;
            const hint = sgr.gray + " [y/N]" + sgr.reset;
            buf.push(padLine(border + "│" + sgr.reset + " " + (0, ansi_1.truncate)(prompt + hint, inputWidth) + " ".repeat(Math.max(0, inputWidth - (0, ansi_1.visibleLength)(prompt + hint))) + border + "│" + sgr.reset));
        }
        else {
            const prompt = sgr.accent + "› " + sgr.reset;
            const placeholder = input === "" ? sgr.gray + "ask xminal anything…  ( / for commands )" : "";
            buf.push(padLine(border + "│" + sgr.reset + " " + (0, ansi_1.pad)((0, ansi_1.truncate)(prompt + input + placeholder, inputWidth), inputWidth) + border + "│" + sgr.reset));
        }
        buf.push(padLine(border + "└" + "─".repeat(Math.max(0, width - 2)) + "┘" + sgr.reset));
        // hints (with status when busy)
        const hints = busy
            ? `  ${sgr.accent}●${sgr.reset} ${statusLine} · Ctrl+C abort`
            : `  / commands · F1 mcp · F2 skills · F3 status · PgUp scroll · Ctrl+C quit`;
        buf.push(padLine(sgr.gray + hints + sgr.reset));
        process.stdout.write("\x1b[H" + buf.map((l) => l + "\x1b[K").join("\n"));
    };
    const paletteItems = () => (0, layout_1.matchCommands)(input, COMMANDS);
    const push = (kind, text) => {
        lines.push({ kind, text });
        if (lines.reduce((acc, l) => acc + l.text.length, 0) > 400_000) {
            lines.splice(0, Math.floor(lines.length / 2));
        }
        scroll = 0;
        render();
    };
    const appendAssistant = (text) => {
        const last = lines[lines.length - 1];
        if (last && last.kind === "assistant") {
            last.text += text;
            scroll = 0;
            render();
        }
        else {
            push("assistant", text);
        }
    };
    const classic = async (cmdLine) => {
        // Temporarily leave the alternate screen for classic rendering of the command.
        process.stdout.write("\x1b[?1049l\x1b[?25h\n");
        const { handleCommand } = await Promise.resolve().then(() => __importStar(require("../cli/commands")));
        const cliRenderer = new render_1.Renderer();
        const ctx = {
            runtime,
            renderer: cliRenderer,
            cwd: runtime.cwd,
            exit: () => {
                closed = true;
            },
            restart: () => undefined,
            ask: async () => null,
        };
        try {
            await handleCommand(cmdLine, ctx);
        }
        catch (error) {
            cliRenderer.error(error.message);
        }
        process.stdout.write("\npress Enter to return to XMINAL…\n");
        await new Promise((resolve) => {
            const onData = (chunk) => {
                clearTimeout(timer);
                process.stdin.removeListener("data", onData);
                resolve();
            };
            const timer = setTimeout(() => {
                process.stdin.removeListener("data", onData);
                resolve();
            }, 3000);
            process.stdin.once("data", onData);
        });
        process.stdout.write("\x1b[?1049h\x1b[?25l");
        render();
    };
    const callbacks = {
        onText: (t) => appendAssistant(t),
        onToolCall: (call) => push("tool", `${call.name}(${call.arguments.slice(0, 120)})`),
        onToolResult: (name, result) => push(result.isError ? "err" : "ok", (result.content.split("\n")[0] ?? "").slice(0, 200)),
        onUsage: () => render(),
        onStatus: (message) => push("system", message),
    };
    runtime.agent.setCallbacks?.(callbacks);
    const askPermission = (tool, reason) => new Promise((resolve) => {
        pendingPermission = { tool, reason: reason ?? "needs approval", resolve };
        render();
    });
    runtime.setAskHandler(askPermission);
    const runAgent = async (text) => {
        busy = true;
        statusLine = "working…";
        push("user", text);
        try {
            const result = await runtime.agent.run(text);
            if (result.stoppedReason !== "done")
                push("err", `stopped: ${result.stoppedReason}`);
            else
                push("ok", "");
        }
        catch (error) {
            push("err", error.message);
        }
        finally {
            busy = false;
            statusLine = "ready";
            render();
        }
    };
    const close = () => {
        closed = true;
        process.stdout.write("\x1b[?1049l\x1b[?25h\x1b[0m\n");
        runtime.close();
        process.exit(0);
    };
    // enter alternate screen
    process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
    const onResize = () => render();
    process.stdout.on("resize", onResize);
    const appendInput = (text) => {
        for (const ch of text) {
            if (ch >= " " && ch !== "\x7f") {
                input = input.slice(0, cursor) + ch + input.slice(cursor);
                cursor += 1;
            }
        }
    };
    const submitInput = () => {
        const text = input.trim();
        input = "";
        cursor = 0;
        if (!text) {
            render();
            return;
        }
        if (text.startsWith("/")) {
            const cmd = text.trim();
            if (cmd === "/exit" || cmd === "/quit") {
                if (busy)
                    runtime.agent.abort();
                close();
                return;
            }
            if (cmd === "/clear") {
                lines.length = 0;
                render();
                return;
            }
            void classic(cmd);
            return;
        }
        scroll = 0;
        render();
        void runAgent(text);
    };
    const onData = (chunk) => {
        const s = chunk.toString("utf8");
        if (pendingPermission) {
            const ch = s.trim().toLowerCase()[0];
            const allow = ch === "y";
            const prompt = pendingPermission;
            pendingPermission = null;
            push(allow ? "ok" : "err", allow ? `allowed ${prompt.tool}` : `denied ${prompt.tool}`);
            prompt.resolve(allow);
            return;
        }
        if (s === "\x03") {
            // Ctrl+C
            if (busy) {
                runtime.agent.abort();
                push("err", "aborted current turn");
            }
            else {
                close();
            }
            return;
        }
        if (s === "\x0c") {
            render();
            return;
        } // Ctrl+L
        if (s === "\x1b[1;5D")
            return; // Ctrl+Left (ignore)
        if (s === "\x1b[1;5C")
            return; // Ctrl+Right (ignore)
        if (s === "\x1bP")
            return; // ignore
        if (s === "\x1b[5~") {
            scroll = Math.min(scroll + scrollbackHeight(), Math.max(0, allWrapped().length - scrollbackHeight()));
            render();
            return;
        } // PgUp
        if (s === "\x1b[6~") {
            scroll = Math.max(0, scroll - scrollbackHeight());
            render();
            return;
        } // PgDn
        if (s === "\x1bOP" || s === "\x1b[11~") {
            panel = panel === "mcp" ? "none" : "mcp";
            render();
            return;
        } // F1
        if (s === "\x1bOQ" || s === "\x1b[12~") {
            panel = panel === "skills" ? "none" : "skills";
            render();
            return;
        } // F2
        if (s === "\x1bOR" || s === "\x1b[13~") {
            panel = panel === "status" ? "none" : "status";
            render();
            return;
        } // F3
        if (s === "\x1b") {
            panel = "none";
            render();
            return;
        } // Esc closes panel
        if (s === "\x7f" || s === "\b") {
            if (cursor > 0) {
                input = input.slice(0, cursor - 1) + input.slice(cursor);
                cursor -= 1;
                render();
            }
            return;
        }
        if (s === "\x1b[D") {
            cursor = Math.max(0, cursor - 1);
            render();
            return;
        } // left
        if (s === "\x1b[C") {
            cursor = Math.min(input.length, cursor + 1);
            render();
            return;
        } // right
        if (s === "\x1b[H") {
            cursor = 0;
            render();
            return;
        } // home
        if (s === "\x1b[F") {
            cursor = input.length;
            render();
            return;
        } // end
        if (s === "\x1b[3~") {
            if (cursor < input.length) {
                input = input.slice(0, cursor) + input.slice(cursor + 1);
                render();
            }
            return;
        } // delete
        if (s === "\t") {
            const items = paletteItems();
            if (items.length > 0) {
                input = items[0] + " ";
                cursor = input.length;
                render();
            }
            return;
        }
        // split embedded newlines: append text, submit each line
        let rest = s;
        for (;;) {
            const idx = rest.search(/[\r\n]/);
            if (idx === -1) {
                if (rest)
                    appendInput(rest);
                break;
            }
            const head = rest.slice(0, idx);
            if (head)
                appendInput(head);
            submitInput();
            rest = rest.slice(idx + 1);
            if (closed)
                return;
        }
        render();
    };
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
    push("system", `XMINAL v${version_1.VERSION} — ${version_1.TAGLINE}`);
    push("system", `session ${runtime.session.id} · model ${runtime.agent.modelSpec} · mode ${runtime.agent.mode} · folder ${runtime.cwd}`);
    try {
        (0, config_1.resolveModel)(runtime.config, runtime.agent.modelSpec);
    }
    catch {
        push("err", "No working provider yet. Set one up:");
        push("err", "  • OPENROUTER_API_KEY=sk-or-...  (free tier: https://openrouter.ai/keys)");
        push("err", "  • or OPENCODE_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY");
        push("err", "  • or a local Ollama:  ollama serve && ollama pull qwen3:0.6b");
        push("err", "  • then restart xminal — or /model to switch");
    }
    render();
    await new Promise((resolve) => {
        const check = () => (closed ? resolve() : setTimeout(check, 250));
        check();
    });
}
//# sourceMappingURL=tui.js.map