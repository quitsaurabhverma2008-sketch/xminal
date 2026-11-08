"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.diagnosticsTools = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const types_1 = require("./types");
const bash_tool_1 = require("./bash-tool");
const fs_1 = require("../util/fs");
const diagnosticsTool = {
    name: "diagnostics",
    description: "Run project diagnostics (TypeScript typecheck when tsconfig.json exists). Use after edits to catch type errors before running tests.",
    readOnly: true,
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Project directory. Default project root." },
        },
    },
    async run(args, context) {
        const cwd = node_path_1.default.resolve(context.cwd, typeof args.path === "string" ? args.path : ".");
        if (node_fs_1.default.existsSync(node_path_1.default.join(cwd, "tsconfig.json"))) {
            const localTsc = node_path_1.default.join(cwd, "node_modules", ".bin", "tsc");
            const command = node_fs_1.default.existsSync(localTsc) ? `${localTsc} --noEmit --pretty false` : "npx --no-install tsc --noEmit --pretty false";
            const result = await (0, bash_tool_1.runShellCommand)(command, {
                cwd,
                timeoutMs: 180_000,
                signal: context.signal,
                sandbox: context.config.sandbox,
            });
            const passed = result.exitCode === 0;
            return {
                content: `${passed ? "PASS" : "FAIL"}: TypeScript diagnostics\n${(0, fs_1.truncateText)(result.stdout + "\n" + result.stderr, 30_000)}`,
                isError: !passed,
                meta: { passed },
            };
        }
        if (node_fs_1.default.existsSync(node_path_1.default.join(cwd, "pyproject.toml")) || node_fs_1.default.existsSync(node_path_1.default.join(cwd, "setup.py"))) {
            const result = await (0, bash_tool_1.runShellCommand)("python -m compileall -q .", {
                cwd,
                timeoutMs: 120_000,
                signal: context.signal,
                sandbox: context.config.sandbox,
            });
            return {
                content: `${result.exitCode === 0 ? "PASS" : "FAIL"}: Python compile check\n${(0, fs_1.truncateText)(result.stdout + result.stderr, 20_000)}`,
                isError: result.exitCode !== 0,
            };
        }
        return (0, types_1.errorResult)("No supported diagnostics configuration found (tsconfig.json or Python project).");
    },
};
exports.diagnosticsTools = [diagnosticsTool];
//# sourceMappingURL=diagnostics-tool.js.map