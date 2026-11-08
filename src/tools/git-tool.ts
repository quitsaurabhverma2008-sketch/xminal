import { spawn } from "node:child_process";
import type { Tool } from "./types";
import { booleanArg, errorResult, stringArg, textResult } from "./types";
import { truncateText } from "../util/fs";

function git(args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => resolve({ code: 127, stdout, stderr: stderr + error.message }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function format(result: { code: number | null; stdout: string; stderr: string }): string {
  const parts = [`exit ${result.code ?? "?"}`];
  if (result.stdout) parts.push(result.stdout.trimEnd());
  if (result.stderr) parts.push(result.stderr.trimEnd());
  return truncateText(parts.join("\n"), 30_000);
}

const gitTool: Tool = {
  name: "git",
  description:
    "Run git operations. Actions: status, diff, log, add, commit, branch, show. Commits and adds require approval in auto mode.",
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
    const action = stringArg(args, "action", "status");
    if (action === "status") {
      return textResult(format(await git(["status", "--short", "--branch"], context.cwd)));
    }
    if (action === "diff") {
      const diffArgs = ["diff"];
      if (booleanArg(args, "staged", false)) diffArgs.push("--staged");
      const target = stringArg(args, "path");
      if (target) diffArgs.push("--", target);
      return textResult(format(await git(diffArgs, context.cwd)));
    }
    if (action === "log") {
      const limit = Math.max(1, Math.min(100, Number(args.limit ?? 20)));
      return textResult(format(await git(["log", "--oneline", "--decorate", "-n", String(limit)], context.cwd)));
    }
    if (action === "add") {
      const target = stringArg(args, "path", ".");
      return textResult(format(await git(["add", "--", target], context.cwd)));
    }
    if (action === "commit") {
      const message = stringArg(args, "message");
      if (!message) return errorResult("message is required for commit.");
      const add = await git(["add", "-A"], context.cwd);
      if (add.code !== 0) return errorResult(format(add));
      return textResult(format(await git(["commit", "-m", message], context.cwd)));
    }
    if (action === "branch") {
      const branch = stringArg(args, "branch");
      if (branch && booleanArg(args, "create", false)) {
        return textResult(format(await git(["checkout", "-b", branch], context.cwd)));
      }
      if (branch) return textResult(format(await git(["checkout", branch], context.cwd)));
      return textResult(format(await git(["branch", "--all"], context.cwd)));
    }
    if (action === "show") {
      const ref = stringArg(args, "ref", "HEAD");
      return textResult(format(await git(["show", "--stat", "--oneline", ref], context.cwd)));
    }
    return errorResult(`Unknown git action: ${action}`);
  },
};

export const gitTools: Tool[] = [gitTool];
