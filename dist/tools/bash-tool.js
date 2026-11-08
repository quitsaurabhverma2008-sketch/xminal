"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bashTools = void 0;
exports.runShellCommand = runShellCommand;
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
const types_1 = require("./types");
const fs_1 = require("../util/fs");
function runShellCommand(command, options) {
    const timeoutMs = Math.max(1000, Math.min(600_000, options.timeoutMs ?? 120_000));
    const shell = process.env.SHELL && process.env.SHELL !== "/bin/false" ? process.env.SHELL : "/bin/sh";
    let bin = shell;
    let args = ["-lc", command];
    let sandbox = "none";
    if (options.sandbox?.enabled && options.sandbox.backend === "bwrap" && hasBinary("bwrap")) {
        const bwrapArgs = [
            "--ro-bind",
            "/",
            "/",
            "--dev",
            "/dev",
            "--proc",
            "/proc",
            "--tmpfs",
            "/tmp",
            "--bind",
            options.cwd,
            options.cwd,
            "--chdir",
            options.cwd,
            "--die-with-parent",
        ];
        if (!options.sandbox.allowNetwork)
            bwrapArgs.push("--unshare-net");
        bwrapArgs.push("--", shell, "-lc", command);
        bin = "bwrap";
        args = bwrapArgs;
        sandbox = "bwrap";
    }
    return new Promise((resolve) => {
        const start = Date.now();
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const child = (0, node_child_process_1.spawn)(bin, args, {
            cwd: options.cwd,
            env: { ...process.env, XMINAL: "1" },
            stdio: ["ignore", "pipe", "pipe"],
        });
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
        }, timeoutMs);
        const onAbort = () => {
            timedOut = true;
            child.kill("SIGKILL");
        };
        options.signal?.addEventListener("abort", onAbort, { once: true });
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString("utf8");
            if (stdout.length > 2_000_000)
                stdout = stdout.slice(-1_500_000);
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString("utf8");
            if (stderr.length > 2_000_000)
                stderr = stderr.slice(-1_500_000);
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            options.signal?.removeEventListener("abort", onAbort);
            resolve({
                exitCode: 127,
                stdout,
                stderr: stderr + `\n${error.message}`,
                durationMs: Date.now() - start,
                timedOut,
                sandbox,
            });
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            options.signal?.removeEventListener("abort", onAbort);
            resolve({
                exitCode: code,
                stdout,
                stderr,
                durationMs: Date.now() - start,
                timedOut,
                sandbox,
            });
        });
    });
}
const bashTool = {
    name: "bash",
    description: "Execute a shell command in the project directory. Returns exit code, stdout, stderr, and duration. Use for builds, tests, git, and inspection. Dangerous commands require approval.",
    parameters: {
        type: "object",
        properties: {
            command: { type: "string", description: "Shell command to run." },
            timeoutMs: { type: "number", description: "Timeout in milliseconds (default 120000, max 600000)." },
            cwd: { type: "string", description: "Working directory relative to project root. Default project root." },
        },
        required: ["command"],
    },
    async run(args, context) {
        const command = (0, types_1.stringArg)(args, "command");
        if (!command.trim())
            return (0, types_1.errorResult)("command is required.");
        const cwdArg = (0, types_1.stringArg)(args, "cwd", ".");
        const cwd = node_path_1.default.resolve(context.cwd, cwdArg);
        const result = await runShellCommand(command, {
            cwd,
            timeoutMs: (0, types_1.numberArg)(args, "timeoutMs", 120_000),
            signal: context.signal,
            sandbox: context.config.sandbox,
        });
        const parts = [];
        parts.push(`$ ${command}`);
        if (result.timedOut)
            parts.push("(timed out)");
        parts.push(`exit ${result.exitCode ?? "?"} · ${result.durationMs}ms${result.sandbox !== "none" ? ` · sandbox=${result.sandbox}` : ""}`);
        if (result.stdout)
            parts.push(`--- stdout ---\n${(0, fs_1.truncateText)(result.stdout, 30_000)}`);
        if (result.stderr)
            parts.push(`--- stderr ---\n${(0, fs_1.truncateText)(result.stderr, 20_000)}`);
        if (!result.stdout && !result.stderr)
            parts.push("(no output)");
        return {
            content: parts.join("\n"),
            isError: (result.exitCode ?? 1) !== 0,
            meta: { exitCode: result.exitCode, durationMs: result.durationMs, timedOut: result.timedOut },
        };
    },
};
function hasBinary(name) {
    const result = (0, node_child_process_1.spawnSync)("sh", ["-c", `command -v ${name}`], { stdio: "ignore" });
    return result.status === 0;
}
exports.bashTools = [bashTool];
//# sourceMappingURL=bash-tool.js.map