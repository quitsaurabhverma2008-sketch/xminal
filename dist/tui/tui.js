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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTui = startTui;
const config_1 = require("../config/config");
const node_path_1 = __importDefault(require("node:path"));
const ansi_1 = require("../util/ansi");
const version_1 = require("../version");
const engine_1 = require("./engine");
const state_1 = require("./state");
const layout_1 = require("./layout");
const render_1 = require("../cli/render");
const LOGO = [
    "███╗   ███╗██╗███╗   ██╗ █████╗ ██╗     ",
    "████╗ ████║██║████╗  ██║██╔══██╗██║     ",
    "██╔████╔██║██║██╔██╗ ██║███████║██║     ",
    "██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║     ",
    "██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗",
    "╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝",
];
const COMMANDS = [
    { name: "/help", desc: "show all commands" },
    { name: "/model", desc: "show or switch model (provider/model)" },
    { name: "/models", desc: "list providers and aliases" },
    { name: "/mode", desc: "switch plan/build/compose/review/yolo" },
    { name: "/permissions", desc: "show or set ask/auto/full" },
    { name: "/status", desc: "session and agent status" },
    { name: "/cost", desc: "token usage and spend" },
    { name: "/tools", desc: "per-tool token usage" },
    { name: "/sessions", desc: "list sessions" },
    { name: "/new", desc: "start a new session" },
    { name: "/resume", desc: "resume a session (latest)" },
    { name: "/undo", desc: "undo last checkpoint" },
    { name: "/rewind", desc: "restore a checkpoint" },
    { name: "/checkpoints", desc: "list checkpoints" },
    { name: "/compact", desc: "compact conversation" },
    { name: "/memory", desc: "memory list/add/search/forget" },
    { name: "/skills", desc: "list skills; --lock/--verify to trust" },
    { name: "/mcp", desc: "list MCP servers + per-tool usage" },
    { name: "/audit", desc: "verify hash-chained audit log" },
    { name: "/doctor", desc: "environment diagnostics" },
    { name: "/verify", desc: "run project verification" },
    { name: "/ralph", desc: "iterate until verify passes" },
    { name: "/tasks", desc: "show the task list" },
    { name: "/diff", desc: "git diff" },
    { name: "/git", desc: "run a git command" },
    { name: "/init", desc: "initialize .xminal in this project" },
    { name: "/brain", desc: "show BRAIN.md" },
    { name: "/features", desc: "show the feature matrix" },
    { name: "/clear", desc: "clear this screen" },
    { name: "/exit", desc: "quit XMINAL" },
];
async function startTui(runtime) {
    const cwd = runtime.cwd;
    let closed = false;
    let busy = false;
    let scroll = 0;
    let statusHint = "";
    let panelMode = "chat";
    let sidebarVisible = (process.stdout.columns ?? 80) >= 100;
    let paletteOpen = false;
    let paletteIndex = 0;
    let todos = (0, state_1.loadTodos)(cwd);
    const gitBranch = (0, state_1.detectGitBranch)(cwd);
    let mcpSummary = runtime.mcp
        .listServerNames()
        .map((server) => ({ server, tools: "?" }));
    const lines = [];
    let input = "";
    let cursor = 0;
    let pendingPermission = null;
    let inCodeBlock = false;
    const cols = () => Math.max(40, process.stdout.columns ?? 80);
    const rows = () => Math.max(16, process.stdout.rows ?? 24);
    const sidebarWidth = () => (sidebarVisible ? 44 : 0);
    const chatWidth = () => Math.max(20, cols() - sidebarWidth());
    const sbHeight = () => Math.max(4, rows() - 5);
    const sessionTitle = runtime.session.meta.title === "untitled" ? "new session" : runtime.session.meta.title;
    const shortId = runtime.session.id.slice(0, 8);
    // ---------- rendering helpers ----------
    const wrapKindPrefix = (kind) => {
        const w = chatWidth();
        switch (kind) {
            case "user": return { prefix: engine_1.theme.cyan + "you ▸ " + engine_1.reset, body: w - 6 };
            case "assistant": return { prefix: engine_1.theme.accent + "xminal ▸ " + engine_1.reset, body: w - 9 };
            case "tool": return { prefix: engine_1.theme.yellow + " ● " + engine_1.reset, body: w - 3 };
            case "ok": return { prefix: engine_1.theme.green + " ✓ " + engine_1.reset, body: w - 3 };
            case "err": return { prefix: engine_1.theme.red + " ✗ " + engine_1.reset, body: w - 3 };
            default: return { prefix: engine_1.theme.muted + " · " + engine_1.reset, body: w - 3 };
        }
    };
    const renderLines = () => {
        const out = [];
        for (const line of lines) {
            const { prefix, body } = wrapKindPrefix(line.kind);
            const parts = (0, layout_1.wrapText)(line.text, Math.max(4, body));
            for (let i = 0; i < parts.length; i++) {
                out.push((i === 0 ? prefix : " ".repeat(2)) + parts[i]);
            }
        }
        return out;
    };
    const renderSidebar = (x, y, width, height) => {
        const inner = width - 2;
        const out = [];
        const line = (content) => engine_1.theme.border + "│" + engine_1.reset + (0, ansi_1.pad)((0, ansi_1.truncate)(content, inner), inner) + engine_1.theme.border + "│" + engine_1.reset;
        out.push(engine_1.theme.border + "┌" + "─".repeat(width === 44 ? 1 : 0) + "─".repeat(Math.max(0, inner - 1)) + "┐" + engine_1.reset);
        out.push(line(`${engine_1.theme.accent}◆${engine_1.reset} ${engine_1.theme.text}${(0, ansi_1.truncate)(sessionTitle, inner - 4)}`));
        out.push(line(`${engine_1.theme.muted}${shortId}${engine_1.reset}`));
        out.push(line(""));
        out.push(line(`${engine_1.theme.muted}LOCATION${engine_1.reset}`));
        out.push(line(`${engine_1.theme.text}${node_path_1.default.basename(cwd)}${engine_1.reset}`));
        if (gitBranch)
            out.push(line(`${engine_1.theme.muted}⎇ ${engine_1.theme.accent2}${(0, ansi_1.truncate)(gitBranch, inner - 4)}${engine_1.reset}`));
        out.push(line(""));
        const done = todos.filter((t) => t.status === "completed").length;
        out.push(line(`${engine_1.theme.muted}TODOS${engine_1.reset} ${engine_1.theme.muted}${done}/${todos.length}${engine_1.reset}`));
        if (todos.length === 0) {
            out.push(line(`${engine_1.theme.muted}(no tasks — ask xminal to plan one)${engine_1.reset}`));
        }
        else {
            for (const todo of todos.slice(0, 8)) {
                out.push(line(`${(0, engine_1.statusPill)(todo.status)}${engine_1.theme.text}${(0, ansi_1.truncate)(todo.text, inner - 4)}${engine_1.reset}`));
            }
            if (todos.length > 8)
                out.push(line(`${engine_1.theme.muted}… +${todos.length - 8} more${engine_1.reset}`));
        }
        out.push(line(""));
        const anyMcp = mcpSummary.length > 0;
        out.push(line(`${engine_1.theme.muted}MCP SERVERS${engine_1.reset}`));
        if (!anyMcp) {
            out.push(line(`${engine_1.theme.muted}(none configured)${engine_1.reset}`));
        }
        else {
            for (const { server, tools } of mcpSummary) {
                out.push(line(`${engine_1.theme.green}●${engine_1.reset} ${engine_1.theme.text}${(0, ansi_1.truncate)(server, inner - 8)}${engine_1.reset} ${engine_1.theme.muted}${tools}t${engine_1.reset}`));
            }
        }
        out.push(line(""));
        out.push(line(`${engine_1.theme.muted}SKILLS${engine_1.reset} ${engine_1.theme.text}${runtime.skills.list().length}${engine_1.reset}`));
        out.push(line(`${engine_1.theme.muted}TOOLS${engine_1.reset} ${engine_1.theme.text}${runtime.tools.names().length}${engine_1.reset}`));
        out.push(engine_1.theme.border + "└" + "─".repeat(inner) + "┘" + engine_1.reset);
        return out.slice(0, height);
    };
    const renderHeader = () => {
        const w = cols();
        const cost = runtime.agent.getCost();
        const logo = engine_1.theme.accent + LOGO[0] + engine_1.reset;
        const titleRight = engine_1.theme.muted + (sessionTitle === "new session" ? "new session" : sessionTitle) + engine_1.reset;
        const line0 = engine_1.theme.accent + logo + " " + engine_1.reset + titleRight;
        const metaLeft = `${engine_1.theme.accent}${runtime.agent.modelSpec}${engine_1.reset} ${engine_1.theme.muted}·${engine_1.reset} ${(0, engine_1.modeColor)(runtime.agent.mode)}${runtime.agent.mode}${engine_1.reset} ${engine_1.theme.muted}·${engine_1.reset} ${engine_1.theme.yellow}${runtime.permissions.mode}${engine_1.reset}`;
        const metaRight = `${engine_1.theme.muted}${(0, engine_1.formatCost)(cost.costUsd)} · ${cost.turns} turns${engine_1.reset}`;
        const line1 = (0, ansi_1.truncate)(metaLeft, Math.max(10, w - (0, ansi_1.visibleLength)(metaRight) - 2)) +
            " ".repeat(Math.max(1, w - (0, ansi_1.visibleLength)(metaLeft) - (0, ansi_1.visibleLength)(metaRight) - 1)) + metaRight;
        return [(0, ansi_1.pad)((0, ansi_1.truncate)(line0, w), w), (0, ansi_1.pad)((0, ansi_1.truncate)(line1, w), w), (0, engine_1.rule)(w)];
    };
    const renderInput = () => {
        const w = chatWidth();
        const out = [];
        const border = engine_1.theme.border;
        const line = `${border}│${engine_1.reset} `;
        out.push(border + "┌" + "─".repeat(Math.max(0, w - 2)) + "┐" + engine_1.reset);
        if (pendingPermission) {
            const ask = pendingPermission;
            const prompt = `${engine_1.theme.yellow}? allow ${ask.tool}${engine_1.reset} ${engine_1.theme.muted}(${(0, ansi_1.truncate)(ask.reason, w - 20)})${engine_1.reset} ${engine_1.theme.cyan}[y/N]${engine_1.reset}`;
            out.push(line + (0, ansi_1.pad)((0, ansi_1.truncate)(prompt, w - 3), w - 3) + border + "│" + engine_1.reset);
        }
        else {
            const placeholder = input === "" ? `${engine_1.theme.muted}ask anything…  ( / for commands )${engine_1.reset}` : "";
            out.push(line + (0, ansi_1.pad)((0, ansi_1.truncate)(engine_1.theme.accent + "› " + engine_1.reset + input + placeholder, w - 3), w - 3) + border + "│" + engine_1.reset);
        }
        out.push(border + "└" + "─".repeat(Math.max(0, w - 2)) + "┘" + engine_1.reset);
        return out;
    };
    const renderPalette = () => {
        if (!paletteOpen)
            return [];
        const w = Math.min(64, cols() - 8);
        const q = input.toLowerCase();
        const items = COMMANDS.filter((c) => c.name.startsWith(q));
        const shown = items.slice(0, 8);
        const out = [];
        out.push(engine_1.theme.border + "┌─ " + engine_1.theme.accent + "COMMANDS" + engine_1.theme.muted + `  ${items.length} match${items.length === 1 ? "" : "es"}` + engine_1.theme.border + " " + "─".repeat(Math.max(0, w - 22)) + "┐" + engine_1.reset);
        if (shown.length === 0) {
            out.push(engine_1.theme.border + "│ " + engine_1.theme.muted + "no matches" + engine_1.reset + (0, ansi_1.pad)("", w - 13) + engine_1.theme.border + "│" + engine_1.reset);
        }
        else {
            shown.forEach((item, i) => {
                const selected = i === paletteIndex;
                const marker = selected ? engine_1.theme.accent + "› " + engine_1.reset : "  ";
                const text = `${marker}${engine_1.theme.text}${item.name}${engine_1.reset} ${engine_1.theme.muted}— ${item.desc}${engine_1.reset}`;
                out.push(engine_1.theme.border + "│ " + engine_1.reset + (0, ansi_1.pad)((0, ansi_1.truncate)(text, w - 3), w - 3) + engine_1.theme.border + "│" + engine_1.reset);
            });
        }
        out.push(engine_1.theme.border + "└" + "─".repeat(Math.max(0, w - 2)) + "┘" + engine_1.reset);
        return out;
    };
    const renderFooter = () => {
        const w = cols();
        const left = `${engine_1.theme.muted} / commands  ·  Tab mode  ·  Ctrl+B sidebar  ·  Ctrl+C ${busy ? "abort" : "quit"}  ·  Esc palette${engine_1.reset}`;
        return [(0, ansi_1.pad)((0, ansi_1.truncate)(left, w), w)];
    };
    const render = () => {
        const w = cols();
        const messageLines = renderLines();
        const end = Math.max(0, messageLines.length - scroll);
        const view = messageLines.slice(Math.max(0, end - sbHeight()), end);
        const out = [];
        out.push(...renderHeader());
        const palette = paletteOpen ? renderPalette() : [];
        const effSb = Math.max(2, sbHeight() - palette.length);
        for (let row = 0; row < effSb; row++) {
            const line = view[row] ?? "";
            const chatCol = (0, ansi_1.pad)((0, ansi_1.truncate)(line, chatWidth()), chatWidth());
            if (sidebarVisible) {
                const sidebar = renderSidebar(0, row, sidebarWidth(), effSb);
                const sideCol = sidebar[row] ?? " ".repeat(sidebarWidth());
                out.push(chatCol + sideCol);
            }
            else {
                out.push(chatCol);
            }
        }
        if (palette.length) {
            for (const p of palette)
                out.push((0, ansi_1.pad)((0, ansi_1.truncate)(p, w), w));
        }
        out.push((0, engine_1.rule)(w));
        out.push(...renderInput());
        out.push(...renderFooter());
        process.stdout.write("\x1b[H" + out.map((l) => l + "\x1b[K").join("\n"));
    };
    // ---------- runtime plumbing ----------
    const push = (kind, text) => {
        lines.push({ kind, text });
        scroll = 0;
        render();
    };
    const appendAssistant = (text) => {
        inCodeBlock = text.includes("```") ? !inCodeBlock : inCodeBlock;
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
    const callbacks = {
        onText: (t) => appendAssistant(t),
        onToolCall: (call) => push("tool", `${call.name}(${(0, ansi_1.truncate)(call.arguments, 100)})`),
        onToolResult: (_name, result) => push(result.isError ? "err" : "ok", (result.content.split("\n")[0] ?? "").slice(0, 200)),
        onStatus: (m) => push("system", m),
        onUsage: () => render(),
    };
    runtime.agent.setCallbacks?.(callbacks);
    const askPermission = (tool, reason) => new Promise((resolve) => {
        pendingPermission = { tool, reason: reason ?? "needs approval", resolve };
        render();
    });
    runtime.setAskHandler(askPermission);
    const runAgent = async (text) => {
        busy = true;
        statusHint = "working…";
        push("user", text);
        try {
            const result = await runtime.agent.run(text);
            if (result.stoppedReason !== "done")
                push("err", `stopped: ${result.stoppedReason}`);
        }
        catch (error) {
            push("err", error.message);
        }
        finally {
            busy = false;
            statusHint = "";
            render();
        }
    };
    const refreshTodos = () => {
        todos = (0, state_1.loadTodos)(cwd);
        render();
    };
    const close = () => {
        if (closed)
            return;
        closed = true;
        process.stdout.write("\x1b[?1049l\x1b[?25h\x1b[0m\n");
        runtime.close();
        process.exit(0);
    };
    // MCP summary (async, best effort)
    void (async () => {
        try {
            const tools = await Promise.race([
                runtime.mcp.listAllTools(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15_000)),
            ]);
            const counts = new Map();
            for (const { server } of tools)
                counts.set(server, (counts.get(server) ?? 0) + 1);
            mcpSummary = runtime.mcp.listServerNames().map((server) => ({ server, tools: counts.get(server) ?? 0 }));
        }
        catch {
            mcpSummary = runtime.mcp.listServerNames().map((server) => ({ server, tools: 0 }));
        }
        render();
    })();
    // ---------- raw key handling ----------
    const submitInput = () => {
        const text = input.trim();
        input = "";
        cursor = 0;
        paletteOpen = false;
        if (!text) {
            render();
            return;
        }
        if (text.startsWith("/")) {
            const cmd = text;
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
            return classicCommand(cmd);
        }
        scroll = 0;
        render();
        void runAgent(text);
    };
    const classicCommand = async (cmdLine) => {
        process.stdout.write("\x1b[?1049l\x1b[?25h\n");
        const { handleCommand } = await Promise.resolve().then(() => __importStar(require("../cli/commands")));
        const cliRenderer = new render_1.Renderer();
        const ctx = {
            runtime,
            renderer: cliRenderer,
            cwd,
            exit: () => { closed = true; },
            restart: () => undefined,
            ask: async () => null,
        };
        try {
            await handleCommand(cmdLine, ctx);
        }
        catch (error) {
            cliRenderer.error(error.message);
        }
        refreshTodos();
        process.stdout.write("\npress any key to return…\n");
        await new Promise((resolve) => {
            const onData = () => { process.stdin.removeListener("data", onData); resolve(); };
            process.stdin.once("data", onData);
        });
        process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
        render();
    };
    const cycleMode = () => {
        const modes = ["build", "plan", "compose", "review", "yolo"];
        const index = modes.indexOf(runtime.agent.mode);
        const next = modes[(index + 1) % modes.length];
        runtime.setMode(next);
        push("system", `mode → ${next}`);
    };
    const submitLine = () => submitInput();
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
        if (s === "\x1b[5~") {
            scroll = Math.min(scroll + Math.floor(sbHeight() / 2), Math.max(0, renderLines().length - sbHeight()));
            render();
            return;
        } // PgUp
        if (s === "\x1b[6~") {
            scroll = Math.max(0, scroll - Math.floor(sbHeight() / 2));
            render();
            return;
        } // PgDn
        if (s === "\x1b[H" || s === "\x1b[1~") {
            scroll = Math.max(0, renderLines().length - sbHeight());
            render();
            return;
        } // Home
        if (s === "\x1b[F" || s === "\x1b[4~") {
            scroll = 0;
            render();
            return;
        } // End
        if (s === "\x1b") {
            paletteOpen = false;
            render();
            return;
        } // Esc
        if (s === "\t") {
            if (paletteOpen) {
                const items = COMMANDS.filter((c) => c.name.startsWith(input.toLowerCase()));
                if (items.length > 0) {
                    input = items[paletteIndex % items.length].name + " ";
                    cursor = input.length;
                    paletteOpen = false;
                    render();
                }
                return;
            }
            cycleMode();
            return;
        }
        if (s === "\x1b[B" || s === "\x1b[A") { // down/up in palette
            if (paletteOpen) {
                const items = COMMANDS.filter((c) => c.name.startsWith(input.toLowerCase()));
                paletteIndex = Math.max(0, Math.min(items.length - 1, paletteIndex + (s === "\x1b[B" ? 1 : -1)));
                render();
                return;
            }
        }
        if (s === "\x02") {
            sidebarVisible = !sidebarVisible;
            render();
            return;
        } // Ctrl+B sidebar
        if (s === "\r" || s === "\n") {
            submitInput();
            return;
        }
        if (s === "\x7f" || s === "\b") {
            if (cursor > 0) {
                input = input.slice(0, cursor - 1) + input.slice(cursor);
                cursor -= 1;
                if (!input.startsWith("/"))
                    paletteOpen = false;
                render();
            }
            return;
        }
        if (s === "\x1b[D") {
            cursor = Math.max(0, cursor - 1);
            render();
            return;
        }
        if (s === "\x1b[C") {
            cursor = Math.min(input.length, cursor + 1);
            render();
            return;
        }
        // split embedded newlines: text before each newline is submitted
        let rest = s;
        for (;;) {
            const idx = rest.search(/[\r\n]/);
            if (idx === -1) {
                if (rest) {
                    for (const ch of rest) {
                        if (ch === "\x1b")
                            continue;
                        if (ch >= " " && ch !== "\x7f") {
                            input = input.slice(0, cursor) + ch + input.slice(cursor);
                            cursor += 1;
                        }
                    }
                    if (input.startsWith("/")) {
                        paletteOpen = true;
                        paletteIndex = 0;
                    }
                    else if (paletteOpen && !input.startsWith("/")) {
                        paletteOpen = false;
                    }
                }
                break;
            }
            const head = rest.slice(0, idx);
            for (const ch of head) {
                if (ch === "\x1b")
                    continue;
                if (ch >= " " && ch !== "\x7f") {
                    input = input.slice(0, cursor) + ch + input.slice(cursor);
                    cursor += 1;
                }
            }
            submitLine();
            rest = rest.slice(idx + 1);
            if (closed)
                return;
        }
        render();
    };
    // ---------- enter alternate screen ----------
    process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
    process.stdout.on("resize", render);
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
    push("system", `xminal v${version_1.VERSION} — ${version_1.TAGLINE}`);
    push("system", `session ${shortId} · model ${runtime.agent.modelSpec} · folder ${node_path_1.default.basename(cwd)}`);
    try {
        (0, config_1.resolveModel)(runtime.config, runtime.agent.modelSpec);
    }
    catch {
        push("err", "no working provider yet — run /doctor or set OPENROUTER_API_KEY / ANTHROPIC_API_KEY");
    }
    await new Promise((resolve) => {
        const check = () => (closed ? resolve() : setTimeout(check, 200));
        check();
    });
}
//# sourceMappingURL=tui.js.map