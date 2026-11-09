"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOpenCodeClone = startOpenCodeClone;
const config_1 = require("../config/config");
const render_1 = require("../cli/render");
const commands_1 = require("../cli/commands");
const state_1 = require("./state");
// ─── design tokens (opencode screenshot-derived) ───────────────────
const C = {
    bg: [16, 17, 20], panel: [27, 29, 34], panel2: [35, 38, 45],
    border: [46, 49, 58], accent: [110, 168, 254], amber: [224, 179, 65],
    text: [230, 232, 236], muted: [138, 143, 154],
    green: [126, 231, 135], red: [255, 123, 114],
};
const rgb = (c) => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
const bgRgb = (c) => `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;
const RESET = "\x1b[0m", BOLD = "\x1b[1m";
const fgMuted = (t) => `${rgb(C.muted)}${t}${RESET}`;
const fgText = (t) => `${rgb(C.text)}${t}${RESET}`;
const fgAccent = (t) => `${rgb(C.accent)}${t}${RESET}`;
const fgAmber = (t) => `${rgb(C.amber)}${t}${RESET}`;
const fgGreen = (t) => `${rgb(C.green)}${t}${RESET}`;
const fgRed = (t) => `${rgb(C.red)}${t}${RESET}`;
const bold = (t) => `${BOLD}${t}${RESET}`;
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, "");
const visible = (s) => stripAnsi(s).length;
const padRight = (s, w) => (visible(s) >= w ? s : s + " ".repeat(w - visible(s)));
const clip = (s, w) => (visible(s) <= w ? s : s.slice(0, w));
const COMMANDS = [
    { name: "/new", desc: "start a new session", group: "Session" },
    { name: "/resume", desc: "resume previous session", group: "Session" },
    { name: "/continue", desc: "continue with saved state", group: "Session" },
    { name: "/sessions", desc: "list all sessions", group: "Session" },
    { name: "/rename", desc: "rename the current session", group: "Session" },
    { name: "/branch", desc: "branch session into alternate history", group: "Session" },
    { name: "/rewind", desc: "restore a checkpoint", group: "Session" },
    { name: "/checkpoints", desc: "list checkpoints", group: "Session" },
    { name: "/undo", desc: "undo last file edit", group: "Session" },
    { name: "/mode", desc: "switch plan/build/compose/review/yolo", group: "Agent" },
    { name: "/model", desc: "pick default model", group: "Agent" },
    { name: "/models", desc: "list all 258 model aliases", group: "Agent" },
    { name: "/variant", desc: "set effort (low/medium/high/max)", group: "Agent" },
    { name: "/effort", desc: "alias for /variant", group: "Agent" },
    { name: "/reasoning", desc: "alias for /variant", group: "Agent" },
    { name: "/provider", desc: "pick provider → enter API key → save", group: "Providers", action: "provider" },
    { name: "/connect", desc: "connect a provider (same as /provider)", group: "Providers", action: "provider" },
    { name: "/set-key", desc: "set provider key interactively", group: "Providers", action: "provider" },
    { name: "/clear-key", desc: "clear a provider key", group: "Providers" },
    { name: "/tasks", desc: "the task list (.xminal/todos.json)", group: "Tasks" },
    { name: "/todo", desc: "add a todo item", group: "Tasks" },
    { name: "/memory", desc: "memory list · add · search · forget", group: "Tasks" },
    { name: "/skills", desc: "list installed skills", group: "Skills" },
    { name: "/skill", desc: "print a skill by name", group: "Skills" },
    { name: "/skill-lock", desc: "lock current skills (.xminal/skills.lock.json)", group: "Skills" },
    { name: "/skill-verify", desc: "verify skills against lockfile", group: "Skills" },
    { name: "/mcp", desc: "list MCP servers + tools", group: "MCP" },
    { name: "/mcp-tools", desc: "list all MCP tool names", group: "MCP" },
    { name: "/mcp-call", desc: "call a tool on an MCP server", group: "MCP" },
    { name: "/verify", desc: "run project tests/lint/typecheck", group: "Dev" },
    { name: "/test", desc: "alias for /verify", group: "Dev" },
    { name: "/build", desc: "run project build", group: "Dev" },
    { name: "/lint", desc: "run project linter", group: "Dev" },
    { name: "/ralph", desc: "iterate impl until verify passes", group: "Dev" },
    { name: "/diagnose", desc: "run diagnostics tool", group: "Dev" },
    { name: "/diff", desc: "git diff", group: "Git" },
    { name: "/git", desc: "run a git command", group: "Git" },
    { name: "/status", desc: "git status --short --branch", group: "Git" },
    { name: "/log", desc: "git log --oneline -n 15", group: "Git" },
    { name: "/branch", desc: "git branch -vv", group: "Git" },
    { name: "/worktree", desc: "git worktree list / add / remove / merge", group: "Git" },
    { name: "/stash", desc: "git stash push / pop", group: "Git" },
    { name: "/cost", desc: "token spend breakdown", group: "Usage" },
    { name: "/usage", desc: "alias for /cost", group: "Usage" },
    { name: "/tools", desc: "per-tool token usage", group: "Usage" },
    { name: "/budget", desc: "set max cost per session", group: "Usage" },
    { name: "/doctor", desc: "environment diagnostics", group: "Setup" },
    { name: "/env", desc: "show env var names (masked)", group: "Setup" },
    { name: "/init", desc: "create .xminal in this project", group: "Setup" },
    { name: "/setup", desc: "guided first-run setup", group: "Setup" },
    { name: "/permissions", desc: "review or change ask/auto/full", group: "Setup" },
    { name: "/compact", desc: "compact in-memory conversation", group: "Session" },
    { name: "/audit", desc: "verify hash-chained audit log", group: "Audit" },
    { name: "/brain", desc: "show BRAIN.md", group: "Audit" },
    { name: "/features", desc: "show FEATURE_MATRIX.md", group: "Audit" },
    { name: "/plan", desc: "show EXECUTION-PLAN.md", group: "Audit" },
    { name: "/version", desc: "print xminal version", group: "System" },
    { name: "/about", desc: "about XMINAL", group: "System" },
    { name: "/help", desc: "this command list", group: "System" },
    { name: "/clear", desc: "clear the screen", group: "System" },
    { name: "/theme", desc: "toggle dark/light (light = coming)", group: "System" },
    { name: "/exit", desc: "quit XMINAL", group: "System" },
];
const PROVIDERS = [
    { key: "opencode", label: "OpenCode (free)", kind: "free", env: "", baseUrl: "https://opencode.ai/inference/openai/v1", defaultModel: "inkling-2-small-free" },
    { key: "openrouter", label: "OpenRouter (free tier)", kind: "byok", env: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "openrouter/auto" },
    { key: "ollama", label: "Ollama (local)", kind: "local", env: "", baseUrl: "http://localhost:11434/v1", defaultModel: "llama3.2" },
    { key: "lmstudio", label: "LM Studio (local)", kind: "local", env: "", baseUrl: "http://localhost:1234/v1", defaultModel: "local-model" },
    { key: "vllm", label: "vLLM (local)", kind: "local", env: "", baseUrl: "http://localhost:8000/v1", defaultModel: "local-model" },
    { key: "llama_cpp", label: "llama.cpp (local)", kind: "local", env: "", baseUrl: "http://localhost:8080/v1", defaultModel: "local-model" },
    { key: "koboldcpp", label: "KoboldCpp (local)", kind: "local", env: "", baseUrl: "http://localhost:5001/v1", defaultModel: "koboldcpp" },
    { key: "textgen", label: "text-generation-webui", kind: "local", env: "", baseUrl: "http://localhost:5000/v1", defaultModel: "local-model" },
    { key: "gpt4all", label: "GPT4All (local)", kind: "local", env: "", baseUrl: "http://localhost:4891/v1", defaultModel: "local-model" },
    { key: "openwebui", label: "Open WebUI (local)", kind: "local", env: "", baseUrl: "http://localhost:3000/v1", defaultModel: "local-model" },
    { key: "openai", label: "OpenAI", kind: "byok", env: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" },
    { key: "anthropic", label: "Anthropic (Claude)", kind: "byok", env: "ANTHROPIC_API_KEY", baseUrl: "https://api.anthropic.com", defaultModel: "claude-sonnet-4-5" },
    { key: "gemini", label: "Google Gemini", kind: "byok", env: "GEMINI_API_KEY", baseUrl: "https://generativelanguage.googleapis.com", defaultModel: "gemini-2.5-flash" },
    { key: "groq", label: "Groq", kind: "byok", env: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile" },
    { key: "deepseek", label: "DeepSeek", kind: "byok", env: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat" },
    { key: "mistral", label: "Mistral", kind: "byok", env: "MISTRAL_API_KEY", baseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-large-latest" },
    { key: "xai", label: "xAI (Grok)", kind: "byok", env: "XAI_API_KEY", baseUrl: "https://api.x.ai/v1", defaultModel: "grok-4" },
    { key: "cerebras", label: "Cerebras", kind: "byok", env: "CEREBRAS_API_KEY", baseUrl: "https://api.cerebras.ai/v1", defaultModel: "llama3.3-70b" },
    { key: "cohere", label: "Cohere", kind: "byok", env: "COHERE_API_KEY", baseUrl: "https://api.cohere.com/compatibility/v1", defaultModel: "command-a-03-2025" },
    { key: "togetherai", label: "Together AI", kind: "byok", env: "TOGETHER_API_KEY", baseUrl: "https://api.together.xyz/v1", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
    { key: "fireworks", label: "Fireworks AI", kind: "byok", env: "FIREWORKS_API_KEY", baseUrl: "https://api.fireworks.ai/inference/v1", defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct" },
    { key: "perplexity", label: "Perplexity", kind: "byok", env: "PERPLEXITY_API_KEY", baseUrl: "https://api.perplexity.ai", defaultModel: "sonar-pro" },
    { key: "moonshotai", label: "Moonshot AI (Kimi)", kind: "byok", env: "MOONSHOT_API_KEY", baseUrl: "https://api.moonshot.ai/v1", defaultModel: "moonshot-v1-auto" },
    { key: "huggingface", label: "Hugging Face", kind: "byok", env: "HF_TOKEN", baseUrl: "https://router.huggingface.co/v1", defaultModel: "deepseek-ai/DeepSeek-R1" },
    { key: "github", label: "GitHub Models", kind: "byok", env: "GITHUB_TOKEN", baseUrl: "https://models.github.ai/inference", defaultModel: "openai/gpt-4o-mini" },
    { key: "nvidia", label: "NVIDIA NIM", kind: "byok", env: "NVIDIA_API_KEY", baseUrl: "https://integrate.api.nvidia.com/v1", defaultModel: "nvidia/llama-3.1-nemotron-70b-instruct" },
    { key: "deepinfra", label: "DeepInfra", kind: "byok", env: "DEEPINFRA_API_KEY", baseUrl: "https://api.deepinfra.com/v1/openai", defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct" },
    { key: "sambanova", label: "SambaNova", kind: "byok", env: "SAMBANOVA_API_KEY", baseUrl: "https://api.sambanova.ai/v1", defaultModel: "Meta-Llama-3.3-70B-Instruct" },
    { key: "novita", label: "Novita AI", kind: "byok", env: "NOVITA_API_KEY", baseUrl: "https://api.novita.ai/openai", defaultModel: "deepseek/deepseek-r1" },
    { key: "poe", label: "Poe", kind: "byok", env: "POE_API_KEY", baseUrl: "https://api.poe.com/v1", defaultModel: "GPT-4o-mini" },
    { key: "zai", label: "Z.AI (GLM)", kind: "byok", env: "ZAI_API_KEY", baseUrl: "https://api.z.ai/api/paas/v4", defaultModel: "glm-4-plus" },
    { key: "zhipuai", label: "Zhipu AI (GLM)", kind: "byok", env: "ZHIPU_API_KEY", baseUrl: "https://open.bigmodel.cn/api/paas/v4", defaultModel: "glm-4-plus" },
    { key: "minimax", label: "MiniMax", kind: "byok", env: "MINIMAX_API_KEY", baseUrl: "https://api.minimax.chat/v1", defaultModel: "abab6.5s-chat" },
    { key: "siliconflow", label: "SiliconFlow", kind: "byok", env: "SILICONFLOW_API_KEY", baseUrl: "https://api.siliconflow.cn/v1", defaultModel: "deepseek-ai/DeepSeek-V3" },
    { key: "volcengine", label: "Volcengine (Doubao)", kind: "byok", env: "VOLCENGINE_API_KEY", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", defaultModel: "doubao-seed-1-6-250615" },
    { key: "302ai", label: "302.AI", kind: "byok", env: "AI_302AI_API_KEY", baseUrl: "https://api.302.ai/v1", defaultModel: "gpt-4o" },
    { key: "venice", label: "Venice AI", kind: "byok", env: "VENICE_API_KEY", baseUrl: "https://api.venice.ai/api/v1", defaultModel: "llama-3.3-70b" },
    { key: "vercel", label: "Vercel AI Gateway", kind: "byok", env: "VERCEL_AI_GATEWAY_API_KEY", baseUrl: "https://ai-gateway.vercel.sh/v1", defaultModel: "openai/gpt-4o-mini" },
    { key: "alibaba", label: "Alibaba DashScope (Qwen)", kind: "byok", env: "DASHSCOPE_API_KEY", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", defaultModel: "qwen-plus" },
];
function providerKeyEnv(key) {
    return PROVIDERS.find((p) => p.key === key)?.env ?? "";
}
function providerIsReady(key) {
    const env = providerKeyEnv(key);
    if (!env)
        return true; // keyless (local / free)
    return Boolean(process.env[env]);
}
function kindLabel(kind) {
    return kind === "local" ? "LOCAL" : kind === "free" ? "FREE" : "BYOK";
}
async function validateKey(entry, key) {
    const url = entry.baseUrl.replace(/\/+$/, "") + "/chat/completions";
    const body = JSON.stringify({
        model: entry.defaultModel,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
    });
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
            body,
            signal: AbortSignal.timeout(15_000),
        });
        if (res.ok)
            return "ok";
        const text = await res.text();
        if (/insufficient|quota|credit|billing/i.test(text))
            return "insufficient_funds";
        if (res.status === 401 || res.status === 403)
            return "invalid_key";
        return `http_${res.status}`;
    }
    catch (error) {
        return error.message ?? "network_error";
    }
}
const EFFORTS = ["low", "medium", "high", "max"];
const MODEL_ALIASES = (() => {
    try {
        const { config } = (0, config_1.loadConfig)(process.cwd());
        return Object.entries(config.models).map(([alias, m]) => ({ alias, provider: m.provider, model: m.model }));
    }
    catch {
        return [];
    }
})();
// ─── utility ────────────────────────────────────────────────────────
const maskKey = (key) => {
    if (key.length <= 4)
        return "•".repeat(key.length);
    return "•".repeat(key.length - 4) + key.slice(-4);
};
const centerPanel = (rows, cols, height) => {
    const width = Math.min(cols - 4, 82);
    const top = Math.max(2, Math.floor((rows - height) / 2));
    const left = Math.max(0, Math.floor((cols - width) / 2));
    return { width, top, left, height };
};
const panelBorder = (title, width) => {
    const label = ` ${title} `;
    const left = "+-";
    const mid = label + "-".repeat(Math.max(0, width - left.length - label.length - 1));
    return `${rgb(C.border)}${left}${BOLD}${fgAccent(label)}${rgb(C.border)}${"-".repeat(Math.max(0, width - left.length - label.length - 1))}+${RESET}`;
};
const panelBottom = (width) => `${rgb(C.border)}+${"-".repeat(width - 2)}+${RESET}`;
const panelRow = (content, width, bg = C.panel) => `${bgRgb(bg)}${padRight(" " + content, width - 1)}${RESET}${rgb(C.border)}│${RESET}`;
const panelSide = (content, width, bg = C.panel) => `${rgb(C.border)}│${RESET}${bgRgb(bg)}${padRight(" " + content, width - 1)}${RESET}${rgb(C.border)}│${RESET}`;
const sectionLabel = (t) => fgMuted(t.toUpperCase());
const ok = (t) => fgGreen(t);
const warn = (t) => fgAmber(t);
const err = (t) => fgRed(t);
// ─── main entry ─────────────────────────────────────────────────────
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
    let overlay = { kind: "none" };
    let paletteIndex = 0;
    let pendingPermission = null;
    const lines = [];
    const cols = () => Math.max(40, process.stdout.columns ?? Number(process.env.COLUMNS) ?? 80);
    const rows = () => Math.max(16, process.stdout.rows ?? Number(process.env.LINES) ?? 24);
    const sidebarWidth = () => (cols() >= 100 ? 30 : 0);
    const contentWidth = () => cols() - sidebarWidth();
    const wrap = (text, width) => {
        if (!text)
            return [""];
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
    const styledLine = (line) => {
        const w = Math.max(8, contentWidth() - 2);
        const prefixFor = (k) => {
            switch (k) {
                case "user": return ` ${fgAccent("▍")}${fgAccent(BOLD + "you" + RESET)}`;
                case "assistant": return ` ${fgAmber("▍")}`;
                case "tool": return ` ${fgAmber("$")}`;
                case "ok": return ` ${fgGreen("✓")}`;
                case "err": return ` ${fgRed("✗")}`;
                default: return "  ";
            }
        };
        const prefix = prefixFor(line.kind);
        const firstPrefixVisible = stripAnsi(prefix).length;
        const parts = wrap(line.text, Math.max(4, w - firstPrefixVisible));
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
    // build base frame rows; overlay draws on top
    const renderRow = (row) => {
        const w = cols();
        if (row === 0) {
            const title = ` ${fgText(BOLD + sessionTitle + RESET)}`;
            const plus = `${fgMuted("+")} `;
            return padRight(title + " ".repeat(Math.max(1, w - visible(title) - visible(plus))) + plus, w);
        }
        if (row === 1)
            return `${rgb(C.border)}${"─".repeat(w)}${RESET}`;
        const inputTop = rows() - 5;
        if (row === inputTop)
            return `${bgRgb(C.panel)}${fgAccent("▍")}${" ".repeat(w - 1)}${RESET}`;
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
            const cost = runtime.agent.getCost();
            const left = busy ? `${fgAmber("esc")}${fgMuted(" interrupt")}` : `${fgMuted("~")}`;
            const right = `${fgMuted((cost.inputTokens / 1000).toFixed(1) + "K")} ${fgMuted("·")} ${fgMuted("ctrl+p commands")}`;
            return `${bgRgb(C.bg)}${padRight(left + " ".repeat(Math.max(1, w - visible(left) - visible(right))) + right, w)}${RESET}`;
        }
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
        switch (row) {
            case 0: return line(`${fgText(BOLD + "Greeting" + RESET)}`);
            case 2: return line(fgMuted("Context"));
            case 3: return line(fgText((runtime.agent.getCost().inputTokens / 1000).toFixed(1) + "K tokens"));
            case 4: return line(fgMuted("1% used"));
            case 6: return line(fgMuted("Session"));
            case 7: return line(fgText(sessionTitle));
            case 8: return line(fgMuted(`${shortId} · ${cwd.split("/").pop() ?? cwd}`));
            case 10: return line(fgMuted("TODOS"));
            case 11: {
                const done = todos.filter((t) => t.status === "completed").length;
                return line(todos.length ? fgText(`${done}/${todos.length} done`) : fgMuted("(none)"));
            }
            case 13: return line(fgMuted("SKILLS"));
            case 14: return line(fgText(String(runtime.skills.list().length)));
            case 16: return line(fgMuted("MCP"));
            case 17: return line(fgText(`${runtime.mcp.listServerNames().length} servers`));
            default: return line("");
        }
    };
    const render = () => {
        const w = cols();
        const r = rows();
        const frame = [];
        for (let row = 0; row < r; row++)
            frame.push(renderRow(row));
        if (overlay.kind !== "none")
            drawOverlay(frame, overlay);
        process.stdout.write("\x1b[H");
        for (let i = 0; i < frame.length; i++) {
            process.stdout.write(clip(frame[i], w) + "\x1b[K\r\n");
        }
    };
    // ─── overlay rendering ────────────────────────────────────────────
    const drawOverlay = (frame, ov) => {
        const r = rows(), w = cols();
        const dim = (s) => `${rgb(C.muted)}${s}${RESET}`;
        const blankRow = (y, innerW) => {
            if (y < 0 || y >= r)
                return;
            frame[y] = `${rgb(C.border)}│${RESET}${bgRgb(C.panel)}${" ".repeat(innerW)}${RESET}${rgb(C.border)}│${RESET}`;
        };
        if (ov.kind === "palette" || ov.kind === "model" || ov.kind === "provider") {
            const title = ov.kind === "palette" ? "Commands" : ov.kind === "model" ? "Models" : "Providers";
            const pBottom = ov.kind === "palette"
                ? `${fgMuted("↑↓ select  ·  type to filter  ·  PgUp/PgDn scroll  ·  Enter run  ·  Esc close")}`
                : `${fgMuted("↑↓ select  ·  PgUp/PgDn scroll  ·  Enter choose  ·  Esc close")}`;
            const items = ov.kind === "palette"
                ? COMMANDS.filter((c) => c.name.startsWith(input.toLowerCase()) || (input.length > 1 && c.name.includes(input.toLowerCase())))
                    .map((c) => ({ a: `${fgAmber(c.name.padEnd(14))}`, b: `${sectionLabel(c.group)}  ${c.desc}` }))
                : ov.kind === "model"
                    ? (() => {
                        const q = (ov.query ?? "").toLowerCase();
                        return MODEL_ALIASES.filter((m) => !q || m.alias.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q) || m.model.toLowerCase().includes(q)).map((m) => ({ a: `${fgAccent(m.alias.slice(0, 26).padEnd(26))}`, b: fgMuted(`${m.provider}/${m.model}`.slice(0, 44)) }));
                    })()
                    : PROVIDERS.map((p) => {
                        const ready = providerIsReady(p.key);
                        const dot = ready ? fgGreen("+") : fgMuted("-");
                        const tag = `${kindLabel(p.kind).padEnd(5)}`;
                        return { a: `${dot} ${fgText(p.label.padEnd(28))}`, b: `${fgMuted(tag)}  ${ready ? fgGreen("ready") : p.env ? fgMuted(p.env) : fgGreen("no key needed")}` };
                    });
            const height = Math.min(r - 4, 18);
            const { width, top, left, height: h } = centerPanel(r, w, height);
            const innerW = width - 2;
            const titleRow = panelBorder(title, width - 2);
            const visibleItems = h - 3;
            const maxIndex = Math.max(0, items.length - 1);
            const ovIndex = Math.min(ov.kind === "model" || ov.kind === "palette" ? paletteIndex : ov.index, maxIndex);
            const startIdx = Math.max(0, Math.min(Math.max(0, items.length - visibleItems), ovIndex - Math.floor(visibleItems / 2)));
            const lines = [];
            lines.push(titleRow);
            for (let i = startIdx; i < Math.min(items.length, startIdx + visibleItems); i++) {
                const selected = i === ovIndex;
                const row = `${selected ? bgRgb(C.amber) + rgb(C.bg) + BOLD : ""}${items[i].a}${selected ? " " : ""}${items[i].b}`;
                const cleaned = selected ? `${bgRgb(C.amber)}${rgb(C.bg)}${BOLD}${stripAnsi(items[i].a)} ${stripAnsi(items[i].b)}${RESET}` : row;
                lines.push(panelSide(cleaned, innerW, C.panel));
            }
            for (let i = startIdx + visibleItems; i < startIdx + visibleItems; i++)
                blankRow(0, innerW);
            while (lines.length < h - 1)
                lines.push(panelSide("", innerW, C.panel));
            lines.push(panelSide(pBottom, innerW, C.panel));
            if (lines.length > h)
                lines.length = h;
            for (let i = 0; i < lines.length; i++) {
                const y = top + i;
                frame[y] = overlayDim(lines[i], y, r, left, width, ov);
            }
            return;
        }
        if (ov.kind === "provider-key") {
            const entry = ov.entry;
            const height = 8;
            const { width, top, left } = centerPanel(r, w, height);
            const innerW = width - 2;
            const lines = [];
            lines.push(panelBorder(`Connect ${entry.label}`, width - 2));
            lines.push(panelSide(sectionLabel("API key"), innerW, C.panel));
            lines.push(panelSide(`${fgAccent("│")} ${padRight(fgText(maskKey(ov.input)), innerW - 4)}${RESET}`, innerW, C.panel));
            lines.push(panelSide("", innerW, C.panel));
            lines.push(panelSide(`${fgMuted("Get your key:")} ${fgAccent(entry.baseUrl)}`, innerW, C.panel));
            lines.push(panelSide("", innerW, C.panel));
            lines.push(panelSide(`${fgMuted("Enter = validate & save  ·  Esc = back")}`, innerW, C.panel));
            lines.push(panelBottom(width));
            for (let i = 0; i < lines.length; i++) {
                frame[top + i] = overlayDim(lines[i], top + i, r, left, width, ov);
            }
            return;
        }
        if (ov.kind === "provider-test") {
            const height = 7;
            const { width, top, left } = centerPanel(r, w, height);
            const innerW = width - 2;
            const statusLine = ov.status === "working" ? `${warn("* validating...")} ${fgMuted("(pinging " + ov.entry.baseUrl + ")")}`
                : ov.status === "ok" ? `${ok("✓ key saved")} ${fgMuted("· default model " + ov.entry.defaultModel)}`
                    : `${err("✗ " + ov.message)}`;
            const lines = [
                panelBorder(`Connect ${ov.entry.label}`, width - 2),
                panelSide("", innerW, C.panel),
                panelSide(statusLine, innerW, C.panel),
                panelSide("", innerW, C.panel),
                panelSide(`${fgMuted(ov.status === "ok" ? "Enter to continue  ·  Esc to stay" : "Esc to go back")}`, innerW, C.panel),
                panelSide("", innerW, C.panel),
                panelBottom(width),
            ];
            for (let i = 0; i < lines.length; i++) {
                frame[top + i] = overlayDim(lines[i], top + i, r, left, width, ov);
            }
            return;
        }
        if (ov.kind === "variant") {
            const height = EFFORTS.length + 4;
            const { width, top, left } = centerPanel(r, w, height);
            const innerW = width - 2;
            const lines = [
                panelBorder("Effort", innerW),
                panelSide(`${fgMuted("Set reasoning effort for this session:")}`, innerW, C.panel),
            ];
            EFFORTS.forEach((effort, i) => {
                const selected = i === ov.index;
                const marker = selected ? `${bgRgb(C.amber)}${rgb(C.bg)}${BOLD} › ${effort.padEnd(8)}${RESET}` : `   ${fgText(effort)}`;
                lines.push(panelSide(marker, innerW, C.panel));
            });
            lines.push(panelSide("", innerW, C.panel));
            lines.push(panelSide(`${fgMuted("↑↓ select  ·  Enter set  ·  Esc cancel")}`, innerW, C.panel));
            lines.push(panelBottom(width));
            for (let i = 0; i < lines.length; i++) {
                frame[top + i] = overlayDim(lines[i], top + i, r, left, width, ov);
            }
            return;
        }
    };
    // Panel lines are written over the base frame; the base frame is already fully rendered.
    const overlayDim = (line, _y, _rows, _left, _width, _ov) => line;
    // ─── agent plumbing ──────────────────────────────────────────────
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
    // current defaultEffort from global config if any (persisted across sessions)
    let defaultEffort = "max";
    try {
        const raw = process.env.XMINAL_DEFAULT_EFFORT;
        if (raw && ["low", "medium", "high", "max"].includes(raw))
            defaultEffort = raw;
    }
    catch { /* ignore */ }
    const getEffort = () => defaultEffort;
    const setEffort = (effort) => {
        defaultEffort = effort;
        pushLine("ok", `effort → ${effort} (this session)`);
    };
    // ─── command execution ───────────────────────────────────────────
    const runCommandLine = (cmdLine) => {
        const parts = cmdLine.trim().split(/\s+/);
        const name = parts[0].toLowerCase();
        if (name === "/exit" || name === "/quit") {
            close();
            return true;
        }
        if (name === "/clear") {
            lines.length = 0;
            render();
            return true;
        }
        if (name === "/help" || name === "/?") {
            overlay = { kind: "palette", index: 0 };
            paletteIndex = 0;
            render();
            return true;
        }
        if (name === "/model") {
            overlay = { kind: "model", query: "", index: 0 };
            paletteIndex = 0;
            render();
            return true;
        }
        if (name === "/provider" || name === "/connect" || name === "/set-key") {
            overlay = { kind: "provider", index: 0 };
            render();
            return true;
        }
        if (name === "/variant" || name === "/effort" || name === "/reasoning") {
            overlay = { kind: "variant", index: 3 };
            render();
            return true;
        }
        return false;
    };
    const submitInput = () => {
        const text = input.trim();
        input = "";
        cursor = 0;
        overlay = { kind: "none" };
        if (!text) {
            render();
            return;
        }
        // wizard-aware commands first
        if (text.startsWith("/")) {
            if (runCommandLine(text))
                return;
            // fall through to the classic command handler
            void classicCommand(text);
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
        // commands that live outside the wizard render via the classic renderer
        process.stdout.write("\x1b[?1049l\x1b[?25h\n");
        const cliRenderer = new render_1.Renderer();
        const ctx = {
            runtime,
            renderer: cliRenderer,
            cwd,
            exit: () => process.exit(0),
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
    // ─── input handling (key-by-key) ────────────────────────────────
    const appendText = (text) => {
        for (const ch of text) {
            if (ch >= " " && ch !== "\x7f") {
                input = input.slice(0, cursor) + ch + input.slice(cursor);
                cursor += 1;
            }
        }
        if (input.startsWith("/")) {
            overlay = { kind: "palette", index: 0 };
            paletteIndex = 0;
        }
        else if (overlay.kind === "palette") {
            overlay = { kind: "none" };
        }
    };
    const overlayUp = () => { if (overlay.kind === "palette" || overlay.kind === "model") {
        paletteIndex = Math.max(0, paletteIndex - 1);
    }
    else if (overlay.kind === "provider") {
        overlay.index = Math.max(0, overlay.index - 1);
    }
    else if (overlay.kind === "variant") {
        overlay.index = Math.max(0, overlay.index - 1);
    } };
    const overlayDown = () => {
        if (overlay.kind === "palette" || overlay.kind === "model") {
            const count = overlay.kind === "palette"
                ? COMMANDS.filter((c) => c.name.startsWith(input.toLowerCase())).length
                : MODEL_ALIASES.filter((m) => {
                    const q = overlay.kind === "model" ? overlay.query.toLowerCase() : "";
                    return !q || m.alias.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q) || m.model.toLowerCase().includes(q);
                }).length;
            paletteIndex = Math.min(Math.max(0, count - 1), paletteIndex + 1);
        }
        else if (overlay.kind === "provider") {
            overlay.index = Math.min(PROVIDERS.length - 1, overlay.index + 1);
        }
        else if (overlay.kind === "variant") {
            overlay.index = Math.min(EFFORTS.length - 1, overlay.index + 1);
        }
    };
    const selectOverlay = () => {
        if (process.env.XMINAL_DEBUG_TUI) {
            process.stderr.write(`[debug] selectOverlay kind=${overlay.kind} input=${JSON.stringify(input)} palIdx=${paletteIndex}\n`);
        }
        if (overlay.kind === "palette" || overlay.kind === "model") {
            const filtered = overlay.kind === "palette"
                ? COMMANDS.filter((c) => c.name.startsWith(input.toLowerCase()))
                : MODEL_ALIASES.filter((m) => {
                    const q = overlay.kind === "model" ? overlay.query.toLowerCase() : "";
                    return !q || m.alias.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q) || m.model.toLowerCase().includes(q);
                });
            const item = filtered[Math.min(paletteIndex, Math.max(0, filtered.length - 1))];
            if (!item) {
                overlay = { kind: "none" };
                render();
                return true;
            }
            if (overlay.kind === "palette") {
                const cmd = item;
                if (cmd.action === "provider") {
                    overlay = { kind: "provider", index: 0 };
                    render();
                    return true;
                }
                runCommandLine(cmd.name);
                return true;
            }
            // model picked — apply it as the new default model for this session
            const picked = item;
            runtime.agent.setModel(`${picked.provider}/${picked.model}`);
            pushLine("ok", `model → ${picked.provider}/${picked.model}`);
            overlay = { kind: "none" };
            render();
            return true;
        }
        if (overlay.kind === "provider") {
            const entry = PROVIDERS[Math.min(overlay.index, PROVIDERS.length - 1)];
            if (!providerIsReady(entry.key) && entry.env) {
                overlay = { kind: "provider-key", entry, input: "" };
            }
            else {
                runtime.agent.setModel(`${entry.key}/${entry.defaultModel}`);
                pushLine("ok", `provider → ${entry.label} (default model ${entry.defaultModel})`);
                overlay = { kind: "none" };
            }
            render();
            return true;
        }
        if (overlay.kind === "provider-key") {
            const { entry, input: key } = overlay;
            if (!key.trim()) {
                pushLine("err", "API key cannot be empty");
                render();
                return true;
            }
            overlay = { kind: "provider-test", entry, status: "working", message: "" };
            overlay = { kind: "provider-test", entry, status: "working", message: "" };
            render();
            void (async () => {
                const result = await validateKey(entry, key.trim());
                if (result === "ok") {
                    try {
                        const loaded = (0, config_1.loadConfig)(process.cwd());
                        const next = { ...loaded.config, providers: { ...loaded.config.providers, [entry.key]: { ...loaded.config.providers[entry.key], apiKey: key.trim() } } };
                        (0, config_1.saveGlobalConfig)(next);
                    }
                    catch { /* best effort */ }
                    overlay = { kind: "provider-test", entry, status: "ok", message: "saved" };
                }
                else {
                    overlay = { kind: "provider-test", entry, status: "fail", message: result };
                }
                render();
            })();
            return true;
        }
        if (overlay.kind === "provider-test") {
            if (overlay.status === "ok") {
                runtime.agent.setModel(`${overlay.entry.key}/${overlay.entry.defaultModel}`);
                pushLine("ok", `${overlay.entry.label} connected — default model ${overlay.entry.defaultModel}`);
            }
            else {
                pushLine("err", `could not validate ${overlay.entry.label}: ${overlay.message}`);
            }
            overlay = { kind: "none" };
            render();
            return true;
        }
        if (overlay.kind === "variant") {
            const effort = EFFORTS[overlay.index];
            setEffort(effort);
            overlay = { kind: "none" };
            render();
            return true;
        }
        return false;
    };
    const onData = (chunk) => {
        const s = chunk.toString("utf8");
        if (process.env.XMINAL_DEBUG_TUI) {
            process.stderr.write(`[chunk] ${[...chunk].map((b) => b.toString(16)).join(" ")}\n`);
        }
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
        }
        if (s === "\x0c") {
            render();
            return;
        }
        if (s === "\x1b[5~") {
            scroll = Math.min(scroll + 8, Math.max(0, renderChatLines().length - (rows() - 7)));
            render();
            return;
        }
        if (s === "\x1b[6~") {
            scroll = Math.max(0, scroll - 8);
            render();
            return;
        }
        if (s === "\x1b") { // Esc
            if (overlay.kind !== "none") {
                overlay = { kind: "none" };
                render();
                return;
            }
            return;
        }
        if (s === "\t") {
            cycleMode();
            return;
        }
        if (s === "\r" || s === "\n") {
            const handled = selectOverlay();
            if (handled) {
                render();
                return;
            }
            submitInput();
            return;
        }
        if (s === "\x7f" || s === "\b") {
            if (cursor > 0) {
                if (overlay.kind === "provider-key") {
                    overlay.input = overlay.input.slice(0, overlay.input.length - 1);
                    render();
                    return;
                }
                if (overlay.kind === "model") {
                    overlay.query = overlay.query.slice(0, overlay.query.length - 1);
                    paletteIndex = 0;
                    render();
                    return;
                }
                input = input.slice(0, cursor - 1) + input.slice(cursor);
                cursor -= 1;
                if (overlay.kind === "palette" && !input.startsWith("/"))
                    overlay = { kind: "none" };
                render();
            }
            return;
        }
        if (s === "\x1b[A") {
            overlayUp();
            render();
            return;
        }
        if (s === "\x1b[B") {
            overlayDown();
            render();
            return;
        }
        if (s === "\x10") {
            overlay = overlay.kind === "palette" ? { kind: "none" } : { kind: "palette", index: 0 };
            render();
            return;
        }
        // printable path: dispatch to overlay-specific handler
        if (overlay.kind === "provider-key") {
            for (const ch of s)
                if (ch >= " " && ch !== "\x7f")
                    overlay.input += ch;
            render();
            return;
        }
        if (overlay.kind === "model") {
            for (const ch of s)
                if (ch >= " " && ch !== "\x7f") {
                    overlay.query += ch;
                    paletteIndex = 0;
                }
            render();
            return;
        }
        for (const ch of s) {
            if (ch === "\x1b")
                continue;
            if (ch >= " " && ch !== "\x7f") {
                if (overlay.kind === "palette") {
                    input += ch;
                    paletteIndex = 0;
                    continue;
                }
                input = input.slice(0, cursor) + ch + input.slice(cursor);
                cursor += 1;
            }
        }
        if (input.startsWith("/"))
            overlay = { kind: "palette", index: 0 };
        else if (overlay.kind === "palette")
            overlay = { kind: "none" };
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
    pushLine("system", fgAccent("You are XMINAL — Every coding agent. One terminal."));
    pushLine("system", fgMuted("/ commands · ↑↓ select · Enter run · Esc back"));
    await new Promise((resolve) => {
        const check = () => (closed ? resolve() : setTimeout(check, 200));
        check();
    });
}
//# sourceMappingURL=clone-tui.js.map