"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.worktreeTools = void 0;
const node_child_process_1 = require("node:child_process");
const types_1 = require("./types");
const fs_1 = require("../util/fs");
function runGitWorktree(args, cwd) {
    return new Promise((resolve) => {
        const child = (0, node_child_process_1.spawn)("git", ["worktree", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        child.stdout.on("data", (chunk) => {
            out += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk) => {
            out += chunk.toString("utf8");
        });
        child.on("error", (error) => resolve({ code: 127, out: out + error.message }));
        child.on("close", (code) => resolve({ code, out }));
    });
}
const worktreeTool = {
    name: "worktree",
    description: "Manage git worktrees for parallel agent work. Actions: list, create (path, branch, base), remove (path, force), merge (branch).",
    parameters: {
        type: "object",
        properties: {
            action: { type: "string", enum: ["list", "create", "remove", "merge"], description: "Action." },
            path: { type: "string", description: "Worktree path." },
            branch: { type: "string", description: "Branch name." },
            base: { type: "string", description: "Base ref (default HEAD)." },
            force: { type: "boolean", description: "Force remove." },
        },
        required: ["action"],
    },
    async run(args, context) {
        const action = (0, types_1.stringArg)(args, "action", "list");
        if (action === "list") {
            const result = await runGitWorktree(["list", "--porcelain"], context.cwd);
            return (0, types_1.textResult)((0, fs_1.truncateText)(result.out || "(no worktrees)", 20_000));
        }
        if (action === "create") {
            const target = (0, types_1.stringArg)(args, "path");
            const branch = (0, types_1.stringArg)(args, "branch");
            if (!target || !branch)
                return (0, types_1.errorResult)("path and branch are required for create.");
            const base = (0, types_1.stringArg)(args, "base", "HEAD");
            const result = await runGitWorktree(["add", "-b", branch, target, base], context.cwd);
            return (0, types_1.textResult)(`exit ${result.code}\n${result.out}`);
        }
        if (action === "remove") {
            const target = (0, types_1.stringArg)(args, "path");
            if (!target)
                return (0, types_1.errorResult)("path is required for remove.");
            const removeArgs = ["remove"];
            if ((0, types_1.booleanArg)(args, "force", false))
                removeArgs.push("--force");
            removeArgs.push(target);
            const result = await runGitWorktree(removeArgs, context.cwd);
            return (0, types_1.textResult)(`exit ${result.code}\n${result.out}`);
        }
        if (action === "merge") {
            const branch = (0, types_1.stringArg)(args, "branch");
            if (!branch)
                return (0, types_1.errorResult)("branch is required for merge.");
            const result = await new Promise((resolve) => {
                const child = (0, node_child_process_1.spawn)("git", ["merge", "--no-ff", branch], { cwd: context.cwd, stdio: ["ignore", "pipe", "pipe"] });
                let out = "";
                child.stdout.on("data", (chunk) => {
                    out += chunk.toString("utf8");
                });
                child.stderr.on("data", (chunk) => {
                    out += chunk.toString("utf8");
                });
                child.on("error", (error) => resolve({ code: 127, out: out + error.message }));
                child.on("close", (code) => resolve({ code, out }));
            });
            return (0, types_1.textResult)(`exit ${result.code}\n${result.out}`);
        }
        return (0, types_1.errorResult)(`Unknown worktree action: ${action}`);
    },
};
exports.worktreeTools = [worktreeTool];
//# sourceMappingURL=worktree-tool.js.map