#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const args_1 = require("./cli/args");
const render_1 = require("./cli/render");
const callbacks_1 = require("./cli/callbacks");
const repl_1 = require("./cli/repl");
const tui_1 = require("./tui/tui");
const runtime_1 = require("./runtime");
const config_1 = require("./config/config");
const paths_1 = require("./config/paths");
const doctor_1 = require("./config/doctor");
const session_1 = require("./core/session");
const loader_1 = require("./skills/loader");
const install_1 = require("./skills/install");
const client_1 = require("./mcp/client");
const ralph_1 = require("./orchestration/ralph");
const verify_tool_1 = require("./tools/verify-tool");
const http_1 = require("./server/http");
const server_1 = require("./mcp/server");
const telegram_1 = require("./bridges/telegram");
const audit_1 = require("./cli/audit");
const tool_usage_1 = require("./core/tool-usage");
const fs_1 = require("./util/fs");
const ansi_1 = require("./util/ansi");
const version_1 = require("./version");
async function main() {
    const args = (0, args_1.parseArgs)(process.argv.slice(2));
    if (args.flags["no-color"])
        process.env.NO_COLOR = "1";
    if (typeof args.flags.permission === "string")
        process.env.XMINAL_PERMISSION_MODE = args.flags.permission;
    const cwd = typeof args.flags.cwd === "string" ? node_path_1.default.resolve(args.flags.cwd) : process.cwd();
    const renderer = new render_1.Renderer();
    if (args.flags.help || args.flags.h || args.command === "help" || (!args.command && args.flags.version)) {
        console.log(args_1.CLI_HELP);
        return;
    }
    if (args.flags.version || args.flags.v || args.command === "version") {
        console.log(`xminal ${version_1.VERSION} — ${version_1.TAGLINE}`);
        return;
    }
    switch (args.command) {
        case "init":
            commandInit(cwd, renderer);
            return;
        case "doctor":
            commandDoctor(cwd);
            return;
        case "models":
            commandModels(cwd, renderer);
            return;
        case "sessions":
            commandSessions(cwd, renderer);
            return;
        case "skills": {
            if (args.positionals[0] === "install") {
                const target = args.positionals[1];
                if (!target) {
                    console.error("Usage: xminal skills install <path|git-url> [--global]");
                    process.exitCode = 1;
                    return;
                }
                try {
                    const result = (0, install_1.installSkill)(cwd, target, { global: Boolean(args.flags.global) });
                    console.log(`installed skill ${result.name} → ${result.destination}`);
                }
                catch (error) {
                    console.error(error.message);
                    process.exitCode = 1;
                }
                return;
            }
            if (args.flags.lock) {
                const count = (0, loader_1.writeSkillsLock)(cwd);
                renderer.success(`skills lock written: ${count} skill(s) → ${node_path_1.default.join(cwd, ".xminal", "skills.lock.json")}`);
                return;
            }
            if (args.flags.verify) {
                const verification = (0, loader_1.verifySkills)(cwd);
                const drift = [
                    verification.added.length ? `+${verification.added.join(", ")}` : "",
                    verification.changed.length ? `~${verification.changed.join(", ")}` : "",
                    verification.removed.length ? `-${verification.removed.join(", ")}` : "",
                ].filter(Boolean).join(" ");
                if (verification.ok) {
                    renderer.success(`skills lock OK · ${verification.total} skill(s) trusted (${verification.lockPath})`);
                }
                else {
                    renderer.warn(`skills lock drift: ${drift || "unknown"} — run xminal skills --lock to trust`);
                    process.exitCode = 1;
                }
                return;
            }
            const skills = new loader_1.SkillRegistry(cwd).list();
            renderer.info(skills.length
                ? skills.map((skill) => `${skill.name} (${skill.source}) · ${skill.description}`).join("\n")
                : "(no skills installed)");
            return;
        }
        case "mcp":
            if (args.flags.serve) {
                await (0, server_1.startMcpStdioServer)(cwd);
                return;
            }
            await commandMcp(cwd, renderer);
            return;
        case "audit": {
            const which = args.positionals[0]?.toLowerCase();
            if (!which || which === "verify") {
                const result = (0, audit_1.verifyAudit)(cwd);
                if (result.valid) {
                    console.log(`audit chain valid · ${result.entries} entr${result.entries === 1 ? "y" : "ies"} (${node_path_1.default.join(cwd, ".xminal", "receipts", "audit.jsonl")})`);
                }
                else {
                    console.error(`audit chain BROKEN at seq ${result.firstBrokenSeq ?? "?"}: ${result.reason ?? "unknown"}`);
                    process.exitCode = 1;
                }
                return;
            }
            if (which === "tail") {
                const count = (0, args_1.parseNumberFlag)(args.flags, "tail", 10);
                for (const entry of (0, audit_1.tailAudit)(cwd, count)) {
                    console.log(`${entry.seq} · ${String(entry.ts ?? "").slice(0, 19)} · ${entry.action} · ${entry.decision}`);
                }
                return;
            }
            console.error(`Unknown audit action: ${which}. Use: xminal audit verify | xminal audit tail [--tail N]`);
            process.exitCode = 1;
            return;
        }
        case "config":
            commandConfig(cwd, args.positionals);
            return;
        case "worktree":
            commandWorktree(cwd, args.positionals, args.flags);
            return;
        case "serve":
            await commandServe(cwd, args);
            return;
        case "telegram":
            await commandTelegram(cwd, args);
            return;
        case "ralph":
            await commandRalph(cwd, args, renderer);
            return;
        case "run":
            await commandRun(cwd, args, renderer);
            return;
        case "resume": {
            const requested = args.positionals[0] || (typeof args.flags.session === "string" ? args.flags.session : undefined);
            let sessionId = requested;
            if (!sessionId || sessionId === "latest")
                sessionId = session_1.Session.latest(cwd)?.id;
            if (!sessionId) {
                renderer.warn("No sessions found; starting a new session.");
            }
            const runtime = new runtime_1.Runtime(cwd, {
                mode: modeFlag(args.flags.mode),
                model: stringFlag(args.flags.model) ?? stringFlag(args.flags.m),
                sessionId,
                newSession: !sessionId,
                callbacks: (0, callbacks_1.rendererCallbacks)(renderer),
            });
            await (0, repl_1.startRepl)(runtime, { renderer });
            return;
        }
        case "repl":
        default: {
            const runtime = new runtime_1.Runtime(cwd, {
                mode: modeFlag(args.flags.mode),
                model: stringFlag(args.flags.model) ?? stringFlag(args.flags.m),
                sessionId: stringFlag(args.flags.session),
                newSession: Boolean(args.flags.new) || !stringFlag(args.flags.session),
                callbacks: (0, callbacks_1.rendererCallbacks)(renderer),
            });
            if ((process.stdin.isTTY && !args.flags["no-tui"]) || process.env.XMINAL_TUI === "1") {
                try {
                    await (0, tui_1.startTui)(runtime);
                    return;
                }
                catch (error) {
                    renderer.warn(`TUI failed (${error.message}); falling back to classic REPL.`);
                }
            }
            {
                await (0, repl_1.startRepl)(runtime, { renderer });
            }
            return;
        }
    }
}
function commandInit(cwd, renderer) {
    if (!(0, fs_1.exists)((0, paths_1.globalConfigPath)())) {
        (0, config_1.saveGlobalConfig)((0, config_1.defaultConfig)());
        renderer.success(`created ${(0, paths_1.globalConfigPath)()}`);
    }
    const { configPath } = (0, config_1.initProject)(cwd);
    ensureGitignore(cwd);
    renderer.success(`created ${configPath}`);
    renderer.info([
        `project: ${cwd}`,
        `global config: ${(0, paths_1.globalConfigPath)()}`,
        "",
        "Next: set a provider key and run xminal doctor, e.g.",
        "  export OPENROUTER_API_KEY=sk-or-...",
        "  xminal doctor",
        "  xminal",
    ].join("\n"));
}
function commandDoctor(cwd) {
    const loaded = (0, config_1.loadConfig)(cwd);
    const checks = (0, doctor_1.runDoctor)(cwd, loaded);
    console.log((0, doctor_1.formatDoctor)(checks));
    if (checks.some((check) => check.status === "fail"))
        process.exitCode = 1;
}
function commandModels(cwd, renderer) {
    const { config } = (0, config_1.loadConfig)(cwd);
    const lines = Object.entries(config.providers).map(([name, provider]) => {
        const status = (0, config_1.providerReady)(provider)
            ? provider.requiresKey === false
                ? ansi_1.ansi.cyan("free")
                : ansi_1.ansi.green("key")
            : ansi_1.ansi.gray("no key");
        return `  ${name.padEnd(12)} ${provider.type.padEnd(10)} ${(provider.baseUrl ?? "").padEnd(44)} ${status}`;
    });
    renderer.info(`providers:\n${lines.join("\n")}`);
    const aliases = (0, config_1.listModelAliases)(config);
    renderer.info(`default: ${config.defaultModel}\naliases: ${aliases.length} configured (showing 12): ${aliases.slice(0, 12).join(", ")}${aliases.length > 12 ? " …" : ""}`);
    renderer.info(`full catalog: src/config/default-models.ts (grep for any provider/model to use it)`);
    renderer.info(`config: ${(0, paths_1.globalConfigPath)()} · ${(0, paths_1.projectConfigPath)(cwd)}`);
}
function commandSessions(cwd, renderer) {
    const sessions = session_1.Session.list(cwd);
    renderer.info(sessions.length
        ? sessions
            .slice(0, 50)
            .map((meta) => `${meta.id} · ${meta.updatedAt} · ${meta.model} · ${meta.messageCount} msg · ${meta.title}`)
            .join("\n")
        : "(no sessions)");
}
async function commandMcp(cwd, renderer) {
    const { config } = (0, config_1.loadConfig)(cwd);
    const servers = Object.keys(config.mcpServers);
    if (servers.length === 0) {
        renderer.info("(no MCP servers configured — add mcpServers to ~/.xminal/config.json)");
        return;
    }
    const mcp = new client_1.McpManager(config.mcpServers);
    try {
        const tools = await Promise.race([
            mcp.listAllTools(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), 15_000)),
        ]);
        renderer.info(`servers: ${servers.join(", ")}`);
        renderer.info(tools.length
            ? tools.map(({ server, tool }) => `${server}/${tool.name} · ${tool.description ?? ""}`).join("\n")
            : "(no tools reported)");
    }
    finally {
        mcp.closeAll();
    }
}
function commandConfig(cwd, positionals) {
    const which = positionals[0];
    if (which === "global") {
        console.log(node_fs_1.default.existsSync((0, paths_1.globalConfigPath)()) ? node_fs_1.default.readFileSync((0, paths_1.globalConfigPath)(), "utf8") : "(missing)");
        return;
    }
    if (which === "project") {
        console.log(node_fs_1.default.existsSync((0, paths_1.projectConfigPath)(cwd)) ? node_fs_1.default.readFileSync((0, paths_1.projectConfigPath)(cwd), "utf8") : "(missing)");
        return;
    }
    const loaded = (0, config_1.loadConfig)(cwd);
    console.log(JSON.stringify({
        cwd,
        globalDir: (0, paths_1.globalXminalDir)(),
        globalConfig: (0, paths_1.globalConfigPath)(),
        projectConfig: (0, paths_1.projectConfigPath)(cwd),
        projectConfigExists: loaded.projectExists,
        config: loaded.config,
    }, null, 2));
}
function commandWorktree(cwd, positionals, flags) {
    const action = positionals[0] || "list";
    const pathArg = stringFlag(flags.path) ?? positionals[1];
    const branch = stringFlag(flags.branch) ?? positionals[2];
    const base = stringFlag(flags.base) ?? "HEAD";
    let gitArgs;
    if (action === "list") {
        gitArgs = ["worktree", "list", "--porcelain"];
    }
    else if (action === "create") {
        if (!pathArg || !branch) {
            console.error("Usage: xminal worktree create <path> <branch> [--base ref]");
            process.exitCode = 1;
            return;
        }
        gitArgs = ["worktree", "add", "-b", branch, pathArg, base];
    }
    else if (action === "remove") {
        if (!pathArg) {
            console.error("Usage: xminal worktree remove <path> [--force]");
            process.exitCode = 1;
            return;
        }
        gitArgs = ["worktree", "remove", ...(flags.force ? ["--force"] : []), pathArg];
    }
    else if (action === "merge") {
        if (!branch) {
            console.error("Usage: xminal worktree merge <branch>");
            process.exitCode = 1;
            return;
        }
        gitArgs = ["merge", "--no-ff", branch];
    }
    else {
        console.error(`Unknown worktree action: ${action}`);
        process.exitCode = 1;
        return;
    }
    const result = (0, node_child_process_1.spawnSync)("git", gitArgs, { cwd, encoding: "utf8" });
    if (result.stdout)
        process.stdout.write(result.stdout);
    if (result.stderr)
        process.stderr.write(result.stderr);
    if (result.status !== 0)
        process.exitCode = result.status ?? 1;
}
async function commandServe(cwd, args) {
    const port = (0, args_1.parseNumberFlag)(args.flags, "port", 8787);
    const host = stringFlag(args.flags.host) ?? "127.0.0.1";
    const token = stringFlag(args.flags.token) ?? process.env.XMINAL_SERVER_TOKEN;
    const running = await (0, http_1.startServer)({
        cwd,
        host,
        port,
        token,
        mode: modeFlag(args.flags.mode),
        model: stringFlag(args.flags.model) ?? stringFlag(args.flags.m),
    });
    console.log(`xminal server listening on http://${host}:${port}`);
    console.log("  GET  /health · GET /v1/models · GET /v1/sessions");
    console.log("  POST /v1/agent · POST /v1/chat/completions (OpenAI-compatible)");
    if (token)
        console.log("  auth: Authorization: Bearer <token>");
    const shutdown = async () => {
        await running.close();
        process.exit(0);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
}
async function commandTelegram(cwd, args) {
    const token = stringFlag(args.flags.token) ?? process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.error("Telegram bot token required: --token <token> or TELEGRAM_BOT_TOKEN");
        process.exitCode = 1;
        return;
    }
    await (0, telegram_1.startTelegram)({
        cwd,
        token,
        mode: modeFlag(args.flags.mode),
        model: stringFlag(args.flags.model) ?? stringFlag(args.flags.m),
    });
}
async function commandRalph(cwd, args, renderer) {
    const task = args.positionals.join(" ").trim() || args.prompt || "";
    if (!task) {
        console.error("Usage: xminal ralph <task> --verify <command> [--iterations N]");
        process.exitCode = 1;
        return;
    }
    const runtime = new runtime_1.Runtime(cwd, {
        mode: "build",
        model: stringFlag(args.flags.model) ?? stringFlag(args.flags.m),
        newSession: true,
        callbacks: (0, callbacks_1.rendererCallbacks)(renderer),
    });
    try {
        const result = await (0, ralph_1.runRalph)(runtime, {
            task,
            verifyCommand: stringFlag(args.flags.verify) ?? runtime.config.verifyCommand ?? (0, verify_tool_1.detectVerifyCommand)(cwd),
            maxIterations: (0, args_1.parseNumberFlag)(args.flags, "iterations", 5),
            callbacks: (0, callbacks_1.rendererCallbacks)(renderer),
        });
        renderer.flush();
        if (result.passed) {
            renderer.success(`Ralph passed in ${result.iterations} iteration(s) using: ${result.command}`);
            process.stdout.write(result.reports[result.reports.length - 1] + "\n");
        }
        else {
            renderer.error(`Ralph failed after ${result.iterations} iteration(s): ${result.command}`);
            if (result.lastOutput)
                renderer.info((0, fs_1.truncateText)(result.lastOutput, 6000));
            process.exitCode = 1;
        }
    }
    finally {
        runtime.close();
    }
}
async function commandRun(cwd, args, renderer) {
    const prompt = args.prompt ?? args.positionals.join(" ");
    if (!prompt.trim()) {
        console.error('Usage: xminal run "your task" [--model provider/model] [--json]');
        process.exitCode = 1;
        return;
    }
    const quiet = Boolean(args.flags.quiet);
    const verbose = Boolean(args.flags.verbose);
    const json = Boolean(args.flags.json);
    const callbacks = {
        onText: (text) => {
            if (verbose && !json)
                process.stderr.write(text);
        },
        onToolCall: (call) => {
            if (!quiet && !json)
                process.stderr.write(`\n● ${call.name}\n`);
        },
        onToolResult: (name, result) => {
            if (!quiet && !json)
                process.stderr.write(`  ${result.isError ? "✗" : "✓"} ${name}\n`);
        },
        onStatus: (message) => {
            if (!quiet && !json)
                process.stderr.write(`· ${message}\n`);
        },
    };
    const runtime = new runtime_1.Runtime(cwd, {
        mode: modeFlag(args.flags.mode),
        model: stringFlag(args.flags.model) ?? stringFlag(args.flags.m),
        sessionId: stringFlag(args.flags.session),
        newSession: !stringFlag(args.flags.session),
        callbacks,
    });
    try {
        if (verbose && !json)
            process.stderr.write("\n");
        const result = await runtime.agent.run(prompt);
        if (json) {
            const payload = {
                text: result.text,
                sessionId: runtime.session.id,
                model: result.model,
                turns: result.turns,
                cost: result.cost,
                stoppedReason: result.stoppedReason,
                error: result.error,
                toolUsage: (0, tool_usage_1.loadToolUsage)(cwd),
            };
            process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
        }
        else {
            if (result.text.trim())
                process.stdout.write(result.text.trimEnd() + "\n");
            if (result.error && !json)
                console.error(result.error);
            if (!quiet) {
                process.stderr.write(`\n${result.turns} turn(s) · ${result.cost.inputTokens} in / ${result.cost.outputTokens} out · $${result.cost.costUsd.toFixed(6)}\n`);
            }
        }
        if (result.stoppedReason === "error" || result.stoppedReason === "budget")
            process.exitCode = 1;
    }
    catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
    finally {
        runtime.close();
    }
}
function modeFlag(value) {
    if (typeof value !== "string")
        return undefined;
    const modes = ["plan", "build", "compose", "review", "yolo"];
    if (!modes.includes(value)) {
        console.error(`Invalid --mode "${value}". Use: ${modes.join(", ")}`);
        process.exit(1);
    }
    return value;
}
function stringFlag(value) {
    return typeof value === "string" && value.trim() ? value : undefined;
}
function ensureGitignore(cwd) {
    const file = node_path_1.default.join(cwd, ".gitignore");
    const current = node_fs_1.default.existsSync(file) ? node_fs_1.default.readFileSync(file, "utf8") : "";
    if (current.split(/\r?\n/).some((line) => line.trim() === ".xminal/" || line.trim() === ".xminal"))
        return;
    const next = current === "" || current.endsWith("\n") ? current : current + "\n";
    node_fs_1.default.writeFileSync(file, `${next}.xminal/\n`);
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map