import fs from "node:fs";
import path from "node:path";
import type { Tool } from "./types";
import { errorResult, numberArg, stringArg } from "./types";
import { runShellCommand } from "./bash-tool";
import { truncateText } from "../util/fs";

export function detectVerifyCommand(cwd: string, fallback?: string): string | undefined {
  if (fallback) return fallback;
  const packageFile = path.join(cwd, "package.json");
  if (fs.existsSync(packageFile)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8")) as { scripts?: Record<string, string> };
      const scripts = pkg.scripts ?? {};
      for (const name of ["verify", "test", "lint", "typecheck", "build"]) {
        if (scripts[name]) return `npm run ${name}`;
      }
    } catch {
      // ignore
    }
  }
  if (fs.existsSync(path.join(cwd, "tsconfig.json"))) return "npx --no-install tsc --noEmit";
  if (fs.existsSync(path.join(cwd, "pyproject.toml"))) return "python -m pytest -q";
  if (fs.existsSync(path.join(cwd, "Cargo.toml"))) return "cargo test --quiet";
  if (fs.existsSync(path.join(cwd, "go.mod"))) return "go test ./...";
  return undefined;
}

const verifyTool: Tool = {
  name: "verify",
  description:
    "Run the project's verification command (tests/lint/typecheck/build) and report pass/fail. Auto-detects npm scripts, tsc, pytest, cargo, or go test.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Override verification command." },
      timeoutMs: { type: "number", description: "Timeout (default 300000)." },
    },
  },
  async run(args, context) {
    const command = detectVerifyCommand(context.cwd, stringArg(args, "command") || context.config.verifyCommand);
    if (!command) {
      return errorResult("No verification command found. Pass one explicitly or set verifyCommand in config.");
    }
    const result = await runShellCommand(command, {
      cwd: context.cwd,
      timeoutMs: numberArg(args, "timeoutMs", 300_000),
      signal: context.signal,
      sandbox: context.config.sandbox,
    });
    const passed = result.exitCode === 0 && !result.timedOut;
    const body = [
      passed ? `PASS: ${command}` : `FAIL: ${command}`,
      `exit ${result.exitCode ?? "?"} · ${result.durationMs}ms${result.timedOut ? " · timed out" : ""}`,
      result.stdout ? `--- stdout ---\n${truncateText(result.stdout, 20_000)}` : "",
      result.stderr ? `--- stderr ---\n${truncateText(result.stderr, 20_000)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return { content: body, isError: !passed, meta: { passed, exitCode: result.exitCode } };
  },
};

export const verifyTools: Tool[] = [verifyTool];
