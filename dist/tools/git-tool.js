"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gitTools = void 0;
const node_child_process_1 = require("node:child_process");
const types_1 = require("./types");
const fs_1 = require("../util/fs");
function git(args, cwd) {
    return new Promise((resolve) => {
        const child = (0, node_child_process_1.spawn)("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString("utf8");
        });
        child.on("error", (error) => resolve({ code: 127, stdout, stderr: stderr + error.message }));
        child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
}
function format(result) {
    const parts = [`exit ${result.code ?? "?"}`];
    if (result.stdout)
        parts.push(result.stdout.trimEnd());
    if (result.stderr)
        parts.push(result.stderr.trimEnd());
    return (0, fs_1.truncateText)(parts.join("\n"), 30_000);
}
const gitTool = {
    name: "git",
    description: "Run git operations. Actions: status, diff, log, add, commit, branch, show. Commits and adds require approval in auto mode.",
    parameters: {
        type: "object",
        properties: {
            action: {
                type: "string",
                enum: ["status", "diff", "log", "add", "commit", "branch", "show"],
                description: "Git action.",
            },
            path: { type: "string", description: "Path for diff/add." },
            staged: { type: "boolean", description: "Use --staged for diff." },
            message: { type: "string", description: "Commit message." },
            branch: { type: "string", description: "Branch name (branch)." },
            create: { type: "boolean", description: "Create branch (branch)." },
            ref: { type: "string", description: "Git ref (show)." },
            limit: { type: "number", description: "Log entry limit (default 20)." },
        },
        required: ["action"],
    },
    async run(args, context) {
        const action = (0, types_1.stringArg)(args, "action", "status");
        if (action === "status") {
            return (0, types_1.textResult)(format(await git(["status", "--short", "--branch"], context.cwd)));
        }
        if (action === "diff") {
            const diffArgs = ["diff"];
            if ((0, types_1.booleanArg)(args, "staged", false))
                diffArgs.push("--staged");
            const target = (0, types_1.stringArg)(args, "path");
            if (target)
                diffArgs.push("--", target);
            return (0, types_1.textResult)(format(await git(diffArgs, context.cwd)));
        }
        if (action === "log") {
            const limit = Math.max(1, Math.min(100, Number(args.limit ?? 20)));
            return (0, types_1.textResult)(format(await git(["log", "--oneline", "--decorate", "-n", String(limit)], context.cwd)));
        }
        if (action === "add") {
            const target = (0, types_1.stringArg)(args, "path", ".");
            return (0, types_1.textResult)(format(await git(["add", "--", target], context.cwd)));
        }
        if (action === "commit") {
            const message = (0, types_1.stringArg)(args, "message");
            if (!message)
                return (0, types_1.errorResult)("message is required for commit.");
            const add = await git(["add", "-A"], context.cwd);
            if (add.code !== 0)
                return (0, types_1.errorResult)(format(add));
            return (0, types_1.textResult)(format(await git(["commit", "-m", message], context.cwd)));
        }
        if (action === "branch") {
            const branch = (0, types_1.stringArg)(args, "branch");
            if (branch && (0, types_1.booleanArg)(args, "create", false)) {
                return (0, types_1.textResult)(format(await git(["checkout", "-b", branch], context.cwd)));
            }
            if (branch)
                return (0, types_1.textResult)(format(await git(["checkout", branch], context.cwd)));
            return (0, types_1.textResult)(format(await git(["branch", "--all"], context.cwd)));
        }
        if (action === "show") {
            const ref = (0, types_1.stringArg)(args, "ref", "HEAD");
            return (0, types_1.textResult)(format(await git(["show", "--stat", "--oneline", ref], context.cwd)));
        }
        return (0, types_1.errorResult)(`Unknown git action: ${action}`);
    },
};
exports.gitTools = [gitTool];
//# sourceMappingURL=git-tool.js.map