"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRalph = runRalph;
const bash_tool_1 = require("../tools/bash-tool");
const verify_tool_1 = require("../tools/verify-tool");
const fs_1 = require("../util/fs");
async function runRalph(runtime, options) {
    const command = options.verifyCommand || runtime.config.verifyCommand || (0, verify_tool_1.detectVerifyCommand)(runtime.cwd);
    if (!command)
        throw new Error("Ralph needs a verification command (--verify or verifyCommand in config).");
    const maxIterations = Math.max(1, Math.min(20, options.maxIterations ?? 5));
    const reports = [];
    let lastOutput = "";
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
        options.callbacks?.onStatus?.(`Ralph iteration ${iteration}/${maxIterations}`);
        const prompt = iteration === 1
            ? `Complete this task end-to-end. Run verification and keep iterating until it passes.\n\nTask:\n${options.task}\n\nVerification command: ${command}`
            : `The previous attempt failed verification. Fix the remaining problems, then make verification pass.\n\nTask:\n${options.task}\n\nVerification command: ${command}\n\nPrevious verification output:\n${(0, fs_1.truncateText)(lastOutput, 6000)}\n\nDo not restart from scratch; inspect current state first.`;
        const agent = runtime.makeAgent({
            mode: "build",
            callbacks: options.callbacks,
            ephemeral: true,
            maxTurns: runtime.config.limits.maxTurns,
        });
        const result = await agent.run(prompt);
        reports.push(result.text);
        const verification = await (0, bash_tool_1.runShellCommand)(command, {
            cwd: runtime.cwd,
            timeoutMs: 300_000,
            sandbox: runtime.config.sandbox,
        });
        lastOutput = [verification.stdout, verification.stderr].filter(Boolean).join("\n");
        const passed = verification.exitCode === 0 && !verification.timedOut;
        options.onIteration?.(iteration, passed ? "pass" : "fail");
        options.callbacks?.onStatus?.(`Verification ${passed ? "passed" : "failed"} (exit ${verification.exitCode ?? "?"})`);
        if (passed) {
            return { passed: true, iterations: iteration, command, lastOutput, reports };
        }
    }
    return { passed: false, iterations: maxIterations, command, lastOutput, reports };
}
//# sourceMappingURL=ralph.js.map