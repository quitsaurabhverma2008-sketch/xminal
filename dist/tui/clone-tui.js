"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOpenCodeClone = startOpenCodeClone;
const render_1 = require("../cli/render");
const commands_1 = require("../cli/commands");
const state_1 = require("./state");
// Design tokens sampled directly from the opencode TUI screenshots
const C = {
    bg: [16, 17, 20],
    panel: [27, 29, 34],
    panel2: [35, 38, 45],
    border: [46, 49, 58],
    accent: [110, 168, 254],
    amber: [224, 179, 65],
    text: [230, 232, 236],
    muted: [138, 143, 154],
    green: [126, 231, 135],
    red: [255, 123, 114],
};
const rgb = (c) => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
const bgRgb = (c) => `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const paintLine = (content) => `${bgRgb(C.bg)}${content}${RESET}`;
const fgMuted = (t) => `${rgb(C.muted)}${t}${RESET}`;
const fgText = (t) => `${rgb(C.text)}${t}${RESET}`;
const fgAccent = (t) => `${rgb(C.accent)}${t}${RESET}`;
const fgAmber = (t) => `${rgb(C.amber)}${t}${RESET}`;
const fgGreen = (t) => `${rgb(C.green)}${t}${RESET}`;
const fgRed = (t) => `${rgb(C.red)}${t}${RESET}`;
const bold = (t) => `${BOLD}${t}${RESET}`;
const COMMANDS = [
    { name: "/help", desc: "show commands" },
    { name: "/mode", desc: "plan · build · compose · review · yolo" },
    { name: "/model", desc: "switch model" },
    { name: "/models", desc: "list providers" },
    { name: "/cost", desc: "token usage & spend" },
    { name: "/tools", desc: "per-tool usage" },
    { name: "/sessions", desc: "list sessions" },
    { name: "/new", desc: "new session" },
    { name: "/undo", desc: "undo last edit" },
    { name: "/checkpoints", desc: "list checkpoints" },
    { name: "/memory", desc: "memory list · add · search" },
    { name: "/skills", desc: "list skills" },
    { name: "/mcp", desc: "MCP servers & tools" },
    { name: "/audit", desc: "verify audit chain" },
    { name: "/doctor", desc: "diagnostics" },
    { name: "/verify", desc: "run verification" },
    { name: "/ralph", desc: "iterate until verify passes" },
    { name: "/tasks", desc: "task list" },
    { name: "/diff", desc: "git diff" },
    { name: "/exit", desc: "quit XMINAL" },
];
async function startOpenCodeClone(runtime) {
    const cwd = runtime.cwd;
    const sessionTitle = runtime.session.meta.title === "untitled" ? "new session" : runtime.session.meta.title;
    const shortId = runtime.session.id.slice(0, 8);
    const todos = (0, state_1.loadTodos)(cwd);
    const branch = (0, state_1.detectGitBranch)(cwd);
    let busy = false;
    let closed = false;
    let input = "";
    let cursor = 0;
    let scroll = 0;
    let paletteOpen = false;
    let paletteIndex = 0;
    let pendingPermission = null;
    const lines = [];
    const renderer = new render_1.Renderer();
    const cols = () => Math.max(40, process.stdout.columns ?? 80);
    const rows = () => Math.max(16, process.stdout.rows ?? 24);
    const sidebarWidth = () => (cols() >= 100 ? 30 : 0);
    const contentWidth = () => cols() - sidebarWidth();
    const wrap = (text, width) => {
        const out = [];
        for (const raw of text.split("\n")) {
            let line = raw;
            while (line.length > width) {
                let cut = width;
                while (cut > 1 && line[cut - 1] !== " ")
                    cut -= 1;
                if (cut <= 1)
                    cut = width;
                out.push(line.slice(0, cut));
                line = line.slice(cut).trimStart();
            }
            out.push(line);
        }
        return out;
    };
    const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, "");
    const styledLine = (line) => {
        const w = Math.max(8, contentWidth() - 2);
        const prefixFor = (k) => {
            switch (k) {
                case "user": return ` ${fgAccent("▍")} ${fgAccent(BOLD + "you" + RESET)}`;
                case "assistant": return ` ${fgAmber("▍")}`;
                case "tool": return ` ${fgAmber("$")}`;
                case "ok": return ` ${fgGreen("✓")}`;
                case "err": return ` ${fgRed("✗")}`;
                default: return "  ";
            }
        };
        const prefix = prefixFor(line.kind);
        const body = line.text;
        const firstPrefixVisible = stripAnsi(prefix).length;
        const parts = wrap(body, Math.max(4, w - firstPrefixVisible));
        const out = [];
        for (let i = 0; i < parts.length; i++) {
            out.push((i === 0 ? prefix : " ".repeat(firstPrefixVisible)) + " " + parts[i]);
        }
        return out;
    };
    const renderChatLines = () => {
        const out = [];
        for (const line of lines)
            out.push(...styledLine(line));
        return out;
    };
    const visible = (s) => stripAnsi(s).length;
    const padRight = (s, width) => {
        const v = visible(s);
        return v >= width ? s : s + " ".repeat(width - v);
    };
    const clip = (s, width) => {
        if (visible(s) <= width)
            return s;
        // naive clip by visible columns — keeps ANSI simple for our known content
        return s.slice(0, width);
    };
    const renderRow = (row) => {
        const w = cols();
        if (row === 0) {
            const title = ` ${fgText(BOLD + sessionTitle + RESET)}`;
            const plus = `${fgMuted("+")} `;
            const left = title;
            const right = plus;
            return padRight(left + " ".repeat(Math.max(1, w - visible(left) - visible(right))) + right, w);
        }
        if (row === 1)
            return `${rgb(C.border)}${"─".repeat(w)}${RESET}`;
        // input box rows are near the bottom
        const inputTop = rows() - 5;
        if (row === inputTop) {
            return `${bgRgb(C.panel)}${fgAccent("▍")}${" ".repeat(w - 1)}${RESET}`;
        }
        if (row === inputTop + 1) {
            if (pendingPermission) {
                const p = pendingPermission;
                const text = ` ${fgAmber("?")} allow ${p.tool}${p.reason ? fgMuted(" · " + p.reason) : ""} ${fgAccent("[y/N]")}`;
                return `${bgRgb(C.panel)}${fgAccent("▍")}${padRight(text, w - 1)}${RESET}`;
            }
            const placeholder = input === "" ? fgMuted('Ask anything…  "fix the failing test"') : fgText(input);
            const caret = fgAccent("▌");
            return `${bgRgb(C.panel)}${fgAccent("▍")}${padRight(" " + placeholder + (input === "" ? caret : ""), w - 1)}${RESET}`;
        }
        if (row === inputTop + 2) {
            const model = runtime.agent.modelSpec.split("/").pop() ?? runtime.agent.modelSpec;
            const mode = runtime.agent.mode;
            const line = `${fgAccent(" " + mode)}${fgMuted(" · ")}${fgText(model)}${fgMuted("  ")}${fgAmber("max")}`;
            return `${bgRgb(C.bg)}${padRight(line, w)}${RESET}`;
        }
        if (row === rows() - 1) {
            const left = busy ? `${fgAmber("esc")}${fgMuted(" interrupt")}` : `${fgMuted("~")}`;
            const cost = runtime.agent.getCost();
            const right = `${fgMuted(`${(cost.inputTokens / 1000).toFixed(1)}K`)} ${fgMuted("·")} ${fgMuted("ctrl+p commands")}`;
            return `${bgRgb(C.bg)}${padRight(left + " ".repeat(Math.max(1, w - visible(left) - visible(right))) + right, w)}${RESET}`;
        }
        // chat area
        const chatLines = renderChatLines();
        const end = Math.max(0, chatLines.length - scroll);
        const start = Math.max(0, end - (inputTop - 2));
        const line = chatLines[start + (row - 2)] ?? "";
        if (sidebarWidth() > 0 && row <= rows() - 6) {
            const sideW = sidebarWidth();
            const sideX = cols() - sideW;
            const side = renderSidebarRow(row - 2);
            const clipped = line.length > sideX ? line.slice(0, sideX) : padRight(line, sideX);
            return `${clipped}${side}`;
        }
        return padRight(line, w);
    };
    const renderSidebarRow = (row) => {
        const w = sidebarWidth();
        const line = (t) => `${bgRgb(C.panel)}${padRight(" " + t, w)}${RESET}`;
        const boldText = (t) => `${fgText(BOLD + t + RESET)}`;
        const mutedText = (t) => fgMuted(t);
        switch (row) {
            case 0: return line(boldText("Greeting"));
            case 2: return line(mutedText("Context"));
            case 3: return line(`${fgText((runtime.agent.getCost().inputTokens / 1000).toFixed(1) + "K tokens")}`);
            case 4: return line(mutedText("1% used"));
            case 6: return line(mutedText("Session"));
            case 7: return line(fgText(sessionTitle));
            case 8: return line(mutedText(`${shortId} · ${cwd.split("/").pop() ?? cwd}`));
            case 10: return line(mutedText("TODOS"));
            case 11: return line(todos.length ? fgText(`${todos.filter((t) => t.status === "completed").length}/${todos.length} done`) : mutedText("(none)"));
            case 13: return line(mutedText("SKILLS"));
            case 14: return line(fgText(`${runtime.skills.list().length}`));
            case 16: return line(mutedText("MCP"));
            case 17: return line(fgText(`${runtime.mcp.listServerNames().length} servers`));
            default: return line("");
        }
    };
    const render = () => {
        process.stdout.write("\x1b[H");
        for (let r = 0; r < rows(); r++) {
            process.stdout.write(clip(renderRow(r), cols()) + "\x1b[K\n");
        }
    };
    const pushLine = (kind, text) => {
        lines.push({ kind, text });
        scroll = 0;
        render();
    };
    const appendAssistant = (text) => {
        const last = lines[lines.length - 1];
        if (last && last.kind === "assistant") {
            last.text += text;
            render();
        }
        else {
            pushLine("assistant", text);
        }
    };
    const callbacks = {
        onText: (t) => appendAssistant(t),
        onToolCall: (call) => pushLine("tool", `${call.name}(${call.arguments.slice(0, 80)})`),
        onToolResult: (_n, r) => pushLine(r.isError ? "err" : "ok", (r.content.split("\n")[0] ?? "").slice(0, 160)),
        onStatus: (m) => pushLine("system", `· ${m}`),
        onUsage: () => render(),
    };
    runtime.agent.setCallbacks?.(callbacks);
    const close = () => {
        if (closed)
            return;
        closed = true;
        process.stdout.write("\x1b[?1049l\x1b[?25h\x1b[0m\n");
        runtime.close();
        process.exit(0);
    };
    const askPermission = (tool, reason) => new Promise((resolve) => {
        pendingPermission = { tool, reason: reason ?? "", resolve };
        render();
    });
    runtime.setAskHandler(askPermission);
    const submitInput = () => {
        const text = input.trim();
        input = "";
        cursor = 0;
        paletteOpen = false;
        if (!text) {
            render();
            return;
        }
        if (text === "/exit" || text === "/quit") {
            close();
            return;
        }
        if (text.startsWith("/")) {
            classicCommand(text);
            return;
        }
        scroll = 0;
        pushLine("user", text);
        busy = true;
        render();
        void (async () => {
            try {
                await runtime.agent.run(text);
            }
            catch (error) {
                pushLine("err", error.message);
            }
            finally {
                busy = false;
                render();
            }
        })();
    };
    const classicCommand = async (cmdLine) => {
        process.stdout.write("\x1b[?1049l\x1b[?25h\n");
        const cliRenderer = new render_1.Renderer();
        const ctx = {
            runtime,
            renderer: cliRenderer,
            cwd,
            exit: () => { process.exit(0); },
            restart: () => undefined,
            ask: async () => null,
        };
        try {
            await (0, commands_1.handleCommand)(cmdLine, ctx);
        }
        catch (error) {
            cliRenderer.error(error.message);
        }
        process.stdout.write("\npress any key to return…\n");
        await new Promise((resolve) => {
            const onData = () => {
                process.stdin.removeListener("data", onData);
                resolve();
            };
            process.stdin.once("data", onData);
        });
        process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
        render();
    };
    const appendText = (text) => {
        for (const ch of text) {
            if (ch >= " " && ch !== "\x7f") {
                input = input.slice(0, cursor) + ch + input.slice(cursor);
                cursor += 1;
            }
        }
        if (input.startsWith("/")) {
            paletteOpen = true;
            paletteIndex = 0;
        }
        else if (paletteOpen) {
            paletteOpen = false;
        }
    };
    const onData = (chunk) => {
        const s = chunk.toString("utf8");
        if (pendingPermission) {
            const ch = s.trim().toLowerCase()[0];
            const allow = ch === "y";
            const ask = pendingPermission;
            pendingPermission = null;
            pushLine(allow ? "ok" : "err", allow ? `allowed ${ask.tool}` : `denied ${ask.tool}`);
            ask.resolve(allow);
            return;
        }
        if (s === "\x03") {
            close();
            return;
        } // Ctrl+C
        if (s === "\x0c") {
            render();
            return;
        } // Ctrl+L
        if (s === "\x1b[5~") {
            scroll = Math.min(scroll + 8, Math.max(0, renderChatLines().length - (rows() - 7)));
            render();
            return;
        } // PgUp
        if (s === "\x1b[6~") {
            scroll = Math.max(0, scroll - 8);
            render();
            return;
        } // PgDn
        if (s === "\x1b") {
            paletteOpen = false;
            render();
            return;
        } // Esc
        if (s === "\t") {
            cycleMode();
            return;
        }
        if (s === "\r" || s === "\n") {
            submitInput();
            return;
        }
        if (s === "\x7f" || s === "\b") {
            if (cursor > 0) {
                input = input.slice(0, cursor - 1) + input.slice(cursor);
                cursor -= 1;
                if (paletteOpen && !input.startsWith("/"))
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
        if (s === "\x1b[B" || s === "\x1b[A") {
            if (paletteOpen) {
                const items = COMMANDS.filter((c) => c.name.startsWith(input.toLowerCase()));
                paletteIndex = Math.max(0, Math.min(items.length - 1, paletteIndex + (s === "\x1b[B" ? 1 : -1)));
                render();
                return;
            }
        }
        if (s === "\x10") {
            paletteOpen = !paletteOpen;
            render();
            return;
        } // Ctrl+P
        // split embedded newlines and submit per line
        let rest = s;
        for (;;) {
            const idx = rest.search(/[\r\n]/);
            if (idx === -1) {
                if (rest)
                    appendText(rest);
                break;
            }
            const head = rest.slice(0, idx);
            if (head)
                appendText(head);
            submitInput();
            if (closed)
                return;
            rest = rest.slice(idx + 1);
        }
        render();
    };
    const cycleMode = () => {
        const MODES = ["build", "plan", "compose", "review", "yolo"];
        const idx = MODES.indexOf(runtime.agent.mode);
        runtime.setMode(MODES[(idx + 1) % MODES.length]);
        pushLine("system", `mode → ${MODES[(idx + 1) % MODES.length]}`);
    };
    process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l\x1b[48;2;16;17;20m\x1b[38;2;230;232;236m");
    process.stdout.on("resize", render);
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
    pushLine("system", `${fgText(BOLD + "◆ " + sessionTitle + RESET)}${branch ? fgMuted("  ⎇ " + branch) : ""}`);
    pushLine("system", `${fgAccent("You are XMINAL — Every coding agent. One terminal.")}`);
    await new Promise((resolve) => {
        const check = () => (closed ? resolve() : setTimeout(check, 200));
        check();
    });
}
//# sourceMappingURL=clone-tui.js.map