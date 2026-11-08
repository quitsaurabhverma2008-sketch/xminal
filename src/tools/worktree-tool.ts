import { spawn } from "node:child_process";
import type { Tool } from "./types";
import { booleanArg, errorResult, stringArg, textResult } from "./types";
import { truncateText } from "../util/fs";

function runGitWorktree(args: string[], cwd: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", ["worktree", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("error", (error) => resolve({ code: 127, out: out + error.message }));
    child.on("close", (code) => resolve({ code, out }));
  });
}

const worktreeTool: Tool = {
  name: "worktree",
  description:
    "Manage git worktrees for parallel agent work. Actions: list, create (path, branch, base), remove (path, force), merge (branch).",
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
    const action = stringArg(args, "action", "list");
    if (action === "list") {
      const result = await runGitWorktree(["list", "--porcelain"], context.cwd);
      return textResult(truncateText(result.out || "(no worktrees)", 20_000));
    }
    if (action === "create") {
      const target = stringArg(args, "path");
      const branch = stringArg(args, "branch");
      if (!target || !branch) return errorResult("path and branch are required for create.");
      const base = stringArg(args, "base", "HEAD");
      const result = await runGitWorktree(["add", "-b", branch, target, base], context.cwd);
      return textResult(`exit ${result.code}\n${result.out}`);
    }
    if (action === "remove") {
      const target = stringArg(args, "path");
      if (!target) return errorResult("path is required for remove.");
      const removeArgs = ["remove"];
      if (booleanArg(args, "force", false)) removeArgs.push("--force");
      removeArgs.push(target);
      const result = await runGitWorktree(removeArgs, context.cwd);
      return textResult(`exit ${result.code}\n${result.out}`);
    }
    if (action === "merge") {
      const branch = stringArg(args, "branch");
      if (!branch) return errorResult("branch is required for merge.");
      const result = await new Promise<{ code: number | null; out: string }>((resolve) => {
        const child = spawn("git", ["merge", "--no-ff", branch], { cwd: context.cwd, stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        child.stdout.on("data", (chunk: Buffer) => {
          out += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk: Buffer) => {
          out += chunk.toString("utf8");
        });
        child.on("error", (error) => resolve({ code: 127, out: out + error.message }));
        child.on("close", (code) => resolve({ code, out }));
      });
      return textResult(`exit ${result.code}\n${result.out}`);
    }
    return errorResult(`Unknown worktree action: ${action}`);
  },
};

export const worktreeTools: Tool[] = [worktreeTool];
