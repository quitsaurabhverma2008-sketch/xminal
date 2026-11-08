import type { Runtime } from "../runtime";
import type { AgentCallbacks } from "../core/agent";
import { runShellCommand } from "../tools/bash-tool";
import { detectVerifyCommand } from "../tools/verify-tool";
import { truncateText } from "../util/fs";

export interface RalphOptions {
  task: string;
  verifyCommand?: string;
  maxIterations?: number;
  callbacks?: AgentCallbacks;
  onIteration?: (iteration: number, result: "pass" | "fail") => void;
}

export interface RalphResult {
  passed: boolean;
  iterations: number;
  command: string;
  lastOutput: string;
  reports: string[];
}

export async function runRalph(runtime: Runtime, options: RalphOptions): Promise<RalphResult> {
  const command = options.verifyCommand || runtime.config.verifyCommand || detectVerifyCommand(runtime.cwd);
  if (!command) throw new Error("Ralph needs a verification command (--verify or verifyCommand in config).");
  const maxIterations = Math.max(1, Math.min(20, options.maxIterations ?? 5));
  const reports: string[] = [];
  let lastOutput = "";

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    options.callbacks?.onStatus?.(`Ralph iteration ${iteration}/${maxIterations}`);
    const prompt =
      iteration === 1
        ? `Complete this task end-to-end. Run verification and keep iterating until it passes.\n\nTask:\n${options.task}\n\nVerification command: ${command}`
        : `The previous attempt failed verification. Fix the remaining problems, then make verification pass.\n\nTask:\n${options.task}\n\nVerification command: ${command}\n\nPrevious verification output:\n${truncateText(lastOutput, 6000)}\n\nDo not restart from scratch; inspect current state first.`;

    const agent = runtime.makeAgent({
      mode: "build",
      callbacks: options.callbacks,
      ephemeral: true,
      maxTurns: runtime.config.limits.maxTurns,
    });
    const result = await agent.run(prompt);
    reports.push(result.text);

    const verification = await runShellCommand(command, {
      cwd: runtime.cwd,
      timeoutMs: 300_000,
      sandbox: runtime.config.sandbox,
    });
    lastOutput = [verification.stdout, verification.stderr].filter(Boolean).join("\n");
    const passed = verification.exitCode === 0 && !verification.timedOut;
    options.onIteration?.(iteration, passed ? "pass" : "fail");
    options.callbacks?.onStatus?.(
      `Verification ${passed ? "passed" : "failed"} (exit ${verification.exitCode ?? "?"})`,
    );
    if (passed) {
      return { passed: true, iterations: iteration, command, lastOutput, reports };
    }
  }

  return { passed: false, iterations: maxIterations, command, lastOutput, reports };
}
