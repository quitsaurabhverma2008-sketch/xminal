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
const dynamicImport = new Function("specifier", "return import(specifier)");
async function loadOpenTui() {
    // @opentui/core is ESM-only and Bun-only for the native renderer.
    return dynamicImport("@opentui/core");
}
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("../config/config");
const version_1 = require("../version");
const state_1 = require("./state");
const render_1 = require("../cli/render");
const T = {
    bg: "#1a1b26",
    surface: "#1e2030",
    panel: "#222436",
    element: "#292e42",
    border: "#3b4261",
    borderSubtle: "#3b4261",
    text: "#c8d3f5",
    muted: "#828bb8",
    accent: "#82aaff",
    accent2: "#86e1fc",
    violet: "#c099ff",
    green: "#c3e88d",
    yellow: "#ffc777",
    red: "#ff757f",
};
const COMMANDS = [
    { name: "/help", desc: "show commands" },
    { name: "/model", desc: "switch model" },
    { name: "/mode", desc: "switch plan/build/compose/review/yolo" },
    { name: "/undo", desc: "undo last edit" },
    { name: "/sessions", desc: "list sessions" },
    { name: "/cost", desc: "token usage" },
    { name: "/tools", desc: "tool usage" },
    { name: "/mcp", desc: "MCP servers" },
    { name: "/skills", desc: "list skills" },
    { name: "/doctor", desc: "environment check" },
];
async function startTui(runtime) {
    const o = await loadOpenTui();
    const { createCliRenderer, BoxRenderable, TextRenderable, ScrollBoxRenderable, InputRenderable, InputRenderableEvents, TextAttributes, } = o;
    const cwd = runtime.cwd;
    const todos = (0, state_1.loadTodos)(cwd);
    const gitBranch = (0, state_1.detectGitBranch)(cwd);
    const mcpCount = runtime.mcp.listServerNames().length;
    const shortId = runtime.session.id.slice(0, 8);
    const sessionTitle = runtime.session.meta.title === "untitled" ? "new session" : runtime.session.meta.title;
    const renderer = await createCliRenderer({
        exitOnCtrlC: true,
        backgroundColor: T.bg,
    });
    // ---------- root layout ----------
    const width = renderer.terminalWidth;
    const height = renderer.terminalHeight;
    const sidebarWidth = 42;
    const root = new BoxRenderable(renderer, {
        flexDirection: "column",
        width,
        height,
        backgroundColor: T.bg,
    });
    const topRow = new BoxRenderable(renderer, {
        flexDirection: "row",
        flexGrow: 1,
        backgroundColor: T.bg,
    });
    const chatCol = new BoxRenderable(renderer, {
        flexDirection: "column",
        flexGrow: 1,
        backgroundColor: T.bg,
    });
    const header = new TextRenderable(renderer, {
        content: ` ${runtime.agent.modelSpec}  ·  mode ${runtime.agent.mode}  ·  $${runtime.agent.getCost().costUsd.toFixed(4)}`,
        fg: T.muted,
        height: 1,
    });
    chatCol.add(header);
    const scrollbox = new ScrollBoxRenderable(renderer, {
        flexGrow: 1,
        backgroundColor: T.bg,
        verticalScrollbarOptions: { visible: false },
        horizontalScrollbarOptions: { visible: false },
    });
    chatCol.add(scrollbox);
    const input = new InputRenderable(renderer, {
        id: "prompt",
        placeholder: "ask xminal…  (/ commands)",
        width: "100%",
        backgroundColor: T.surface,
        focusedBackgroundColor: T.panel,
        textColor: T.text,
        cursorColor: T.accent,
    });
    const promptBox = new BoxRenderable(renderer, {
        border: true,
        borderStyle: "rounded",
        borderColor: T.border,
        backgroundColor: T.surface,
        height: 3,
    });
    promptBox.add(input);
    chatCol.add(promptBox);
    // ---------- sidebar ----------
    const sidebar = new BoxRenderable(renderer, {
        width: sidebarWidth,
        height: "100%",
        flexDirection: "column",
        backgroundColor: T.surface,
        padding: 1,
        gap: 1,
    });
    const sessionNode = new TextRenderable(renderer, {
        content: `◆ ${sessionTitle}`,
        fg: T.text,
        attributes: TextAttributes.BOLD,
    });
    sidebar.add(sessionNode);
    const idNode = new TextRenderable(renderer, { content: shortId, fg: T.muted });
    sidebar.add(idNode);
    const locationNode = new TextRenderable(renderer, {
        content: `${node_path_1.default.basename(cwd)}${gitBranch ? `  ⎇ ${gitBranch}` : ""}`,
        fg: T.muted,
    });
    sidebar.add(locationNode);
    const todosNode = new TextRenderable(renderer, {
        content: renderTodos(todos),
        fg: T.text,
    });
    sidebar.add(todosNode);
    const mcpNode = new TextRenderable(renderer, {
        content: `MCP  ${mcpCount === 0 ? "(none)" : runtime.mcp.listServerNames().join(", ")}`,
        fg: T.muted,
    });
    sidebar.add(mcpNode);
    const countsNode = new TextRenderable(renderer, {
        content: `SKILLS  ${runtime.skills.list().length}   TOOLS  ${runtime.tools.names().length}`,
        fg: T.muted,
    });
    sidebar.add(countsNode);
    topRow.add(chatCol);
    topRow.add(sidebar);
    root.add(topRow);
    const footer = new TextRenderable(renderer, {
        content: " / commands · Tab mode · Ctrl+B sidebar · Ctrl+C quit",
        fg: T.muted,
        height: 1,
    });
    root.add(footer);
    renderer.root.add(root);
    // ---------- agent wiring ----------
    const pushLine = (kind, text) => {
        const fg = kind === "user" ? T.accent2
            : kind === "tool" ? T.yellow
                : kind === "ok" ? T.green
                    : kind === "err" ? T.red
                        : kind === "system" ? T.muted
                            : T.text;
        scrollbox.add(new TextRenderable(renderer, { content: text, fg }));
        input.focus();
    };
    let streamingNode = null;
    const callbacks = {
        onText: (text) => {
            if (!streamingNode) {
                streamingNode = new TextRenderable(renderer, { content: "", fg: T.text });
                scrollbox.add(streamingNode);
            }
            else {
                streamingNode.content += text;
            }
        },
        onToolCall: (call) => pushLine("tool", `● ${call.name}(${call.arguments.slice(0, 60)})`),
        onToolResult: (_n, r) => pushLine(r.isError ? "err" : "ok", `${r.isError ? "✗" : "✓"} ${(r.content.split("\n")[0] ?? "").slice(0, 100)}`),
        onStatus: (m) => pushLine("system", `· ${m}`),
        onUsage: () => {
            const cost = runtime.agent.getCost();
            header.content = ` ${runtime.agent.modelSpec}  ·  mode ${runtime.agent.mode}  ·  $${cost.costUsd.toFixed(4)}`;
        },
    };
    runtime.agent.setCallbacks?.(callbacks);
    // ---------- keyboard handling ----------
    const MODES = ["build", "plan", "compose", "review", "yolo"];
    renderer.keyInput.on("keypress", async (key) => {
        const k = key;
        if (k.name === "tab") {
            const idx = MODES.indexOf(runtime.agent.mode);
            const next = MODES[(idx + 1) % MODES.length];
            runtime.setMode(next);
            pushLine("system", `mode → ${next}`);
            header.content = ` ${runtime.agent.modelSpec}  ·  mode ${runtime.agent.mode}  ·  $${runtime.agent.getCost().costUsd.toFixed(4)}`;
            return;
        }
        if (k.ctrl && k.name === "b") {
            sidebar.destroy();
            return;
        }
        if (k.name === "pageup") {
            scrollbox.scrollBy(-Math.max(1, Math.floor(scrollbox.height / 2)));
            return;
        }
        if (k.name === "pagedown") {
            scrollbox.scrollBy(Math.max(1, Math.floor(scrollbox.height / 2)));
            return;
        }
    });
    input.on(InputRenderableEvents.ENTER, async (value) => {
        const text = value.trim();
        input.value = "";
        if (!text)
            return;
        if (text.startsWith("/")) {
            await handleSlash(text, runtime, renderer, pushLine);
            return;
        }
        pushLine("user", `you ▸ ${text}`);
        streamingNode = null;
        try {
            const result = await runtime.agent.run(text);
            streamingNode = null;
            if (result.stoppedReason !== "done")
                pushLine("err", `stopped: ${result.stoppedReason}`);
        }
        catch (error) {
            pushLine("err", error.message);
        }
    });
    // ---------- resize ----------
    renderer.on("resize", (size) => {
        renderer.resize(size.width, size.height);
        root.width = size.width;
        root.height = size.height;
    });
    // ---------- startup ----------
    const logo = [
        "███╗   ███╗██╗███╗   ██╗ █████╗ ██╗",
        "╚██╗██╔╝███╗ ████║██║██╔██╗ ██║██╔══██╗██║",
        " ╚███╔╝ ██╔████╔██║██║██╔██╗ ██║███████║██║",
        " ██╔██╗ ██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║",
        "██╔╝ ██╗██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗",
        "╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝",
    ].join("\n");
    pushLine("system", logo + "\n" + `xminal v${version_1.VERSION} — ${version_1.TAGLINE}`);
    pushLine("system", `session ${shortId} · model ${runtime.agent.modelSpec} · ${node_path_1.default.basename(cwd)}`);
    pushLine("system", "Tab switches plan/build/compose/review/yolo · Ctrl+B toggles sidebar · Ctrl+C quits · / commands");
    try {
        (0, config_1.resolveModel)(runtime.config, runtime.agent.modelSpec);
    }
    catch {
        pushLine("err", "no working provider — set OPENROUTER_API_KEY or run /doctor");
    }
    input.focus();
    await new Promise((resolve) => {
        renderer.on("destroy", () => resolve());
    });
    runtime.close();
}
function renderTodos(todos) {
    if (todos.length === 0)
        return "TODOS  (none)";
    const done = todos.filter((t) => t.status === "completed").length;
    const lines = todos.slice(0, 8).map((t) => {
        const box = t.status === "completed" ? "✓" : t.status === "in_progress" ? "▸" : "○";
        return `${box} ${t.text.slice(0, 34)}`;
    });
    return `TODOS  ${done}/${todos.length}\n${lines.join("\n")}`;
}
async function handleSlash(input, runtime, renderer, pushLine) {
    const cmd = input.trim();
    if (cmd === "/exit" || cmd === "/quit") {
        renderer.destroy();
        return;
    }
    if (cmd === "/doctor" || cmd === "/help" || cmd === "/model" || cmd === "/mcp" || cmd === "/skills" || cmd === "/cost" || cmd === "/tools" || cmd === "/sessions") {
        const { handleCommand } = await Promise.resolve().then(() => __importStar(require("../cli/commands")));
        const cliRenderer = new render_1.Renderer();
        // leave alternate screen temporarily
        process.stdout.write("\x1b[?1049l\x1b[?25h\n");
        const ctx = {
            runtime,
            renderer: cliRenderer,
            cwd: runtime.cwd,
            exit: () => process.exit(0),
            restart: () => undefined,
            ask: async () => null,
        };
        try {
            await handleCommand(cmd, ctx);
        }
        catch (error) {
            cliRenderer.error(error.message);
        }
        process.stdout.write("\npress Enter to return to XMINAL…\n");
        await new Promise((resolve) => {
            const onData = () => { process.stdin.removeListener("data", onData); resolve(); };
            process.stdin.once("data", onData);
        });
        process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
        return;
    }
    pushLine("system", `unknown command: ${cmd}`);
}
//# sourceMappingURL=tui.js.map