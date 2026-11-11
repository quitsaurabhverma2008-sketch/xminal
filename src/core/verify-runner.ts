/**
 * Verification runner — run the project's own check after a change.
 *
 * The rule the agent must follow: never claim the tests passed unless they
 * were actually run and passed. This module runs the command, keeps the real
 * output, and reports what happened — including the failure, unchanged.
 *
 * Everything is local: the command runs in the project directory with a
 * timeout, and its output is truncated to stay inside the context budget.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { detectProjectCommands } from "./project-context";

export interface VerifyResult {
  /** the command that was run */
  readonly command: string;
  /** null when the process was killed by the timeout */
  readonly exitCode: number | null;
  readonly passed: boolean;
  readonly timedOut: boolean;
  readonly durationMs: number;
  /** the real output (truncated) */
  readonly output: string;
  /** why it did not run, when it did not run */
  readonly skipped?: string;
}

export interface VerifyOptions {
  /** kill the command after this many milliseconds (default 120s) */
  readonly timeoutMs?: number;
  /** keep at most this many characters of output (default 4000) */
  readonly maxOutputChars?: number;
  /** skip the run (e.g. in plan/review mode) */
  readonly skip?: string;
}

/** Find the command that verifies this project (config wins over detection). */
export function resolveVerifyCommand(cwd: string, configured?: string): string | undefined {
  if (configured?.trim()) return configured.trim();
  return detectProjectCommands(cwd).verify;
}

/** Run a shell command in the project directory and report what happened. */
export function runVerify(cwd: string, command: string, options: VerifyOptions = {}): VerifyResult {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const maxChars = options.maxOutputChars ?? 4000;
  if (options.skip) {
    return { command, exitCode: null, passed: false, timedOut: false, durationMs: 0, output: "", skipped: options.skip };
  }
  const started = Date.now();
  try {
    const result = spawnSync("/system/bin/sh", ["-c", command], {
      cwd,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, CI: process.env.CI ?? "1", NO_COLOR: "1" },
    });
    const durationMs = Date.now() - started;
    const errorCode = (result.error as (Error & { code?: string }) | undefined)?.code;
    const timedOut = result.signal === "SIGTERM" || errorCode === "ETIMEDOUT";
    const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    const output = combined.length > maxChars ? `${combined.slice(0, maxChars)}\n… (truncated)` : combined;
    return {
      command,
      exitCode: result.status,
      passed: !timedOut && result.status === 0,
      timedOut,
      durationMs,
      output,
    };
  } catch (error) {
    return {
      command,
      exitCode: null,
      passed: false,
      timedOut: false,
      durationMs: Date.now() - started,
      output: String((error as Error)?.message ?? error),
    };
  }
}

/** Render a verify result for the transcript and for the prompt. */
export function renderVerifyResult(result: VerifyResult): string {
  if (result.skipped) return `[verify skipped: ${result.skipped}]`;
  const head = result.passed
    ? `[verify] ${result.command} → passed (${(result.durationMs / 1000).toFixed(1)}s)`
    : result.timedOut
      ? `[verify] ${result.command} → timed out after ${(result.durationMs / 1000).toFixed(0)}s`
      : `[verify] ${result.command} → failed (exit ${result.exitCode}, ${(result.durationMs / 1000).toFixed(1)}s)`;
  if (!result.output) return head;
  return `${head}\n${result.output}`;
}

/** A short, honest one-liner for the turn summary line. */
export function verifySummary(result: VerifyResult | undefined): string {
  if (!result) return "";
  if (result.skipped) return "verify skipped";
  return result.passed ? "verify ✓" : result.timedOut ? "verify timeout" : "verify ✗";
}

/** Where the verify output should be kept — next to the project state. */
export function verifyLogPath(cwd: string): string {
  return path.join(cwd, ".xminal", "verify.log");
}
