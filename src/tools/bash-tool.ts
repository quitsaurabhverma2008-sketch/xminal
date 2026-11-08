import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import type { Tool } from "./types";
import { errorResult, numberArg, stringArg, textResult } from "./types";
import { truncateText } from "../util/fs";

export interface ShellResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  sandbox: string;
}

export function runShellCommand(
  command: string,
  options: {
    cwd: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    sandbox?: { enabled: boolean; backend: "none" | "bwrap" | "docker"; allowNetwork: boolean };
  },
): Promise<ShellResult> {
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
    if (!options.sandbox.allowNetwork) bwrapArgs.push("--unshare-net");
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
    const child = spawn(bin, args, {
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
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 2_000_000) stdout = stdout.slice(-1_500_000);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_500_000);
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

const bashTool: Tool = {
  name: "bash",
  description:
    "Execute a shell command in the project directory. Returns exit code, stdout, stderr, and duration. Use for builds, tests, git, and inspection. Dangerous commands require approval.",
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
    const command = stringArg(args, "command");
    if (!command.trim()) return errorResult("command is required.");
    const cwdArg = stringArg(args, "cwd", ".");
    const cwd = path.resolve(context.cwd, cwdArg);
    const result = await runShellCommand(command, {
      cwd,
      timeoutMs: numberArg(args, "timeoutMs", 120_000),
      signal: context.signal,
      sandbox: context.config.sandbox,
    });
    const parts: string[] = [];
    parts.push(`$ ${command}`);
    if (result.timedOut) parts.push("(timed out)");
    parts.push(`exit ${result.exitCode ?? "?"} · ${result.durationMs}ms${result.sandbox !== "none" ? ` · sandbox=${result.sandbox}` : ""}`);
    if (result.stdout) parts.push(`--- stdout ---\n${truncateText(result.stdout, 30_000)}`);
    if (result.stderr) parts.push(`--- stderr ---\n${truncateText(result.stderr, 20_000)}`);
    if (!result.stdout && !result.stderr) parts.push("(no output)");
    return {
      content: parts.join("\n"),
      isError: (result.exitCode ?? 1) !== 0,
      meta: { exitCode: result.exitCode, durationMs: result.durationMs, timedOut: result.timedOut },
    };
  },
};

function hasBinary(name: string): boolean {
  const result = spawnSync("sh", ["-c", `command -v ${name}`], { stdio: "ignore" });
  return result.status === 0;
}

export const bashTools: Tool[] = [bashTool];
