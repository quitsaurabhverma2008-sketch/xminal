import fs from "node:fs";
import path from "node:path";
import type { Tool } from "./types";
import { errorResult, textResult } from "./types";
import { runShellCommand } from "./bash-tool";
import { truncateText } from "../util/fs";

const diagnosticsTool: Tool = {
  name: "diagnostics",
  description:
    "Run project diagnostics (TypeScript typecheck when tsconfig.json exists). Use after edits to catch type errors before running tests.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Project directory. Default project root." },
    },
  },
  async run(args, context) {
    const cwd = path.resolve(context.cwd, typeof args.path === "string" ? args.path : ".");
    if (fs.existsSync(path.join(cwd, "tsconfig.json"))) {
      const localTsc = path.join(cwd, "node_modules", ".bin", "tsc");
      const command = fs.existsSync(localTsc) ? `${localTsc} --noEmit --pretty false` : "npx --no-install tsc --noEmit --pretty false";
      const result = await runShellCommand(command, {
        cwd,
        timeoutMs: 180_000,
        signal: context.signal,
        sandbox: context.config.sandbox,
      });
      const passed = result.exitCode === 0;
      return {
        content: `${passed ? "PASS" : "FAIL"}: TypeScript diagnostics\n${truncateText(result.stdout + "\n" + result.stderr, 30_000)}`,
        isError: !passed,
        meta: { passed },
      };
    }
    if (fs.existsSync(path.join(cwd, "pyproject.toml")) || fs.existsSync(path.join(cwd, "setup.py"))) {
      const result = await runShellCommand("python -m compileall -q .", {
        cwd,
        timeoutMs: 120_000,
        signal: context.signal,
        sandbox: context.config.sandbox,
      });
      return {
        content: `${result.exitCode === 0 ? "PASS" : "FAIL"}: Python compile check\n${truncateText(result.stdout + result.stderr, 20_000)}`,
        isError: result.exitCode !== 0,
      };
    }
    return errorResult("No supported diagnostics configuration found (tsconfig.json or Python project).");
  },
};

export const diagnosticsTools: Tool[] = [diagnosticsTool];
