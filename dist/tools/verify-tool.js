"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTools = void 0;
exports.detectVerifyCommand = detectVerifyCommand;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const types_1 = require("./types");
const bash_tool_1 = require("./bash-tool");
const fs_1 = require("../util/fs");
function detectVerifyCommand(cwd, fallback) {
    if (fallback)
        return fallback;
    const packageFile = node_path_1.default.join(cwd, "package.json");
    if (node_fs_1.default.existsSync(packageFile)) {
        try {
            const pkg = JSON.parse(node_fs_1.default.readFileSync(packageFile, "utf8"));
            const scripts = pkg.scripts ?? {};
            for (const name of ["verify", "test", "lint", "typecheck", "build"]) {
                if (scripts[name])
                    return `npm run ${name}`;
            }
        }
        catch {
            // ignore
        }
    }
    if (node_fs_1.default.existsSync(node_path_1.default.join(cwd, "tsconfig.json")))
        return "npx --no-install tsc --noEmit";
    if (node_fs_1.default.existsSync(node_path_1.default.join(cwd, "pyproject.toml")))
        return "python -m pytest -q";
    if (node_fs_1.default.existsSync(node_path_1.default.join(cwd, "Cargo.toml")))
        return "cargo test --quiet";
    if (node_fs_1.default.existsSync(node_path_1.default.join(cwd, "go.mod")))
        return "go test ./...";
    return undefined;
}
const verifyTool = {
    name: "verify",
    description: "Run the project's verification command (tests/lint/typecheck/build) and report pass/fail. Auto-detects npm scripts, tsc, pytest, cargo, or go test.",
    parameters: {
        type: "object",
        properties: {
            command: { type: "string", description: "Override verification command." },
            timeoutMs: { type: "number", description: "Timeout (default 300000)." },
        },
    },
    async run(args, context) {
        const command = detectVerifyCommand(context.cwd, (0, types_1.stringArg)(args, "command") || context.config.verifyCommand);
        if (!command) {
            return (0, types_1.errorResult)("No verification command found. Pass one explicitly or set verifyCommand in config.");
        }
        const result = await (0, bash_tool_1.runShellCommand)(command, {
            cwd: context.cwd,
            timeoutMs: (0, types_1.numberArg)(args, "timeoutMs", 300_000),
            signal: context.signal,
            sandbox: context.config.sandbox,
        });
        const passed = result.exitCode === 0 && !result.timedOut;
        const body = [
            passed ? `PASS: ${command}` : `FAIL: ${command}`,
            `exit ${result.exitCode ?? "?"} · ${result.durationMs}ms${result.timedOut ? " · timed out" : ""}`,
            result.stdout ? `--- stdout ---\n${(0, fs_1.truncateText)(result.stdout, 20_000)}` : "",
            result.stderr ? `--- stderr ---\n${(0, fs_1.truncateText)(result.stderr, 20_000)}` : "",
        ]
            .filter(Boolean)
            .join("\n");
        return { content: body, isError: !passed, meta: { passed, exitCode: result.exitCode } };
    },
};
exports.verifyTools = [verifyTool];
//# sourceMappingURL=verify-tool.js.map