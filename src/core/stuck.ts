/**
 * Stuck detection — stop the agent from burning turns on the same failure.
 *
 * Two shapes of being stuck:
 *  1. the *same* action (tool + arguments) keeps failing;
 *  2. a streak of errors, each one different.
 *
 * The first gets a single corrective nudge ("do not run it unchanged"), the
 * second stops the run. Both are cheap and offline — no model call.
 */
import { createHash } from "node:crypto";

export interface StuckThresholds {
  /** how many recent actions to look at */
  readonly actionErrorWindow: number;
  /** how many identical repeats count as stuck */
  readonly repeatThreshold: number;
  /** how many consecutive errors trigger the single nudge */
  readonly errorStreakNudge: number;
}

export const DEFAULT_STUCK_THRESHOLDS: StuckThresholds = {
  actionErrorWindow: 10,
  repeatThreshold: 3,
  errorStreakNudge: 3,
};

export interface StuckAction {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly isError: boolean;
  /** the first line of the error, for the nudge message */
  readonly detail?: string;
}

export interface StuckAnalysis {
  readonly stuck: boolean;
  readonly kind: "repeat" | "error_streak" | null;
  readonly fingerprint?: string;
  readonly occurrences?: number;
  readonly reason?: string;
}

/** A stable fingerprint for an action (tool + canonical arguments). */
export function actionFingerprint(tool: string, args: Record<string, unknown>): string {
  const canonical = Object.keys(args)
    .sort()
    .map((key) => `${key}=${String(args[key] ?? "").replace(/\s+/g, " ").trim()}`)
    .join("\0");
  return createHash("sha256").update(`${tool}\0${canonical}`).digest("hex").slice(0, 16);
}

export class StuckDetector {
  private readonly actions: StuckAction[] = [];
  private nudged = false;

  constructor(private readonly thresholds: StuckThresholds = DEFAULT_STUCK_THRESHOLDS) {}

  /** Record an action and its outcome. */
  note(action: StuckAction): void {
    this.actions.push(action);
    if (this.actions.length > this.thresholds.actionErrorWindow * 2) {
      this.actions.splice(0, this.actions.length - this.thresholds.actionErrorWindow);
    }
  }

  /** The recent failures (the window). */
  private window(): StuckAction[] {
    return this.actions.slice(-this.thresholds.actionErrorWindow);
  }

  /** Has the agent repeated the same failing action? */
  analyze(): StuckAnalysis {
    const window = this.window();
    const counts = new Map<string, { action: StuckAction; count: number }>();
    for (const action of window) {
      if (!action.isError) continue;
      const fingerprint = actionFingerprint(action.tool, action.args);
      const entry = counts.get(fingerprint);
      if (entry) entry.count += 1;
      else counts.set(fingerprint, { action, count: 1 });
    }
    let worst: { fingerprint: string; action: StuckAction; count: number } | undefined;
    for (const [fingerprint, entry] of counts) {
      if (!worst || entry.count > worst.count) worst = { fingerprint, ...entry };
    }
    if (worst && worst.count >= this.thresholds.repeatThreshold) {
      return {
        stuck: true,
        kind: "repeat",
        fingerprint: worst.fingerprint,
        occurrences: worst.count,
        reason: `the same action failed ${worst.count} times`,
      };
    }
    // a streak of different errors is also a sign of being lost
    let streak = 0;
    for (let i = window.length - 1; i >= 0; i -= 1) {
      if (!window[i].isError) break;
      streak += 1;
    }
    if (streak >= this.thresholds.errorStreakNudge) {
      return {
        stuck: true,
        kind: "error_streak",
        occurrences: streak,
        reason: `${streak} consecutive tool calls failed`,
      };
    }
    return { stuck: false, kind: null };
  }

  /**
   * The corrective message — returned at most once per run.
   * It names the command and the failure so the model can act on it.
   */
  nudge(): string | undefined {
    if (this.nudged) return undefined;
    const analysis = this.analyze();
    if (!analysis.stuck) return undefined;
    this.nudged = true;
    if (analysis.kind === "repeat") {
      const failed = this.window().filter((a) => a.isError).slice(-1)[0];
      const command = failed ? describeAction(failed) : "the same action";
      const detail = failed?.detail ? ` — ${failed.detail.slice(0, 200)}` : "";
      return (
        `The last ${analysis.occurrences} attempts ran \`${command}\` and failed the same way${detail}. ` +
        "Do not retry it unchanged: read the error, fix the cause, or report that you are blocked."
      );
    }
    return (
      `The last ${analysis.occurrences} tool calls all failed. Stop and look at the errors before continuing — ` +
      "fix the cause first, or report what is blocking you."
    );
  }

  /** True when the run should stop. */
  isStuck(): boolean {
    return this.analyze().stuck;
  }

  reset(): void {
    this.actions.length = 0;
    this.nudged = false;
  }
}

/** A short description of an action, for the nudge message. */
export function describeAction(action: StuckAction): string {
  const command = action.args.command ?? action.args.path ?? action.args.pattern ?? action.args.query;
  if (typeof command === "string" && command.trim()) return command.trim().slice(0, 120);
  return action.tool;
}
