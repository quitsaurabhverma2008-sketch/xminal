/**
 * The trajectory — a durable record of what the agent did in a run.
 *
 * The session log keeps the messages; the trajectory keeps the *actions*:
 * which tool ran, what came back, how long it took and how the run ended.
 * It is what you read when a run goes wrong, and it is what a batch run
 * aggregates over.
 */
import fs from "node:fs";
import path from "node:path";

export interface TrajectoryStep {
  /** the tool that ran */
  readonly action: string;
  /** what the model saw */
  readonly observation: string;
  /** the model's own text for that turn */
  readonly response: string;
  /** how long the tool took (ms) */
  readonly executionTime: number;
  readonly exitCode?: number | null;
  readonly isError?: boolean;
}

export interface TrajectoryInfo {
  readonly model: string;
  readonly exitStatus: string;
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly turns: number;
  readonly startedAt: string;
  readonly endedAt: string;
}

export interface Trajectory {
  readonly info: TrajectoryInfo;
  readonly trajectory: TrajectoryStep[];
}

function trajectoryPath(cwd: string, sessionId: string): string {
  return path.join(cwd, ".xminal", "sessions", sessionId, "trajectory.json");
}

/** Write the trajectory — called after every step, so a crash keeps it. */
export function writeTrajectory(cwd: string, sessionId: string, trajectory: Trajectory): string {
  const file = trajectoryPath(cwd, sessionId);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(trajectory, null, 2)}\n`, "utf8");
  } catch {
    // a trajectory that cannot be written must never break the run
  }
  return file;
}

function readTrajectory(cwd: string, sessionId: string): Trajectory | undefined {
  try {
    const raw = fs.readFileSync(trajectoryPath(cwd, sessionId), "utf8");
    return JSON.parse(raw) as Trajectory;
  } catch {
    return undefined;
  }
}

export interface TrajectorySummary {
  readonly runs: number;
  readonly byStatus: Record<string, number>;
  readonly totalCost: number;
  readonly totalSteps: number;
  readonly avgSteps: number;
}

/** Aggregate the trajectories of a project. */
export function summarizeTrajectories(cwd: string): TrajectorySummary {
  const byStatus: Record<string, number> = {};
  let totalCost = 0;
  let totalSteps = 0;
  let runs = 0;
  const dir = path.join(cwd, ".xminal", "sessions");
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { runs: 0, byStatus, totalCost: 0, totalSteps: 0, avgSteps: 0 };
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const trajectory = readTrajectory(cwd, entry.name);
    if (!trajectory) continue;
    runs += 1;
    const status = trajectory.info.exitStatus || "unknown";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    totalCost += trajectory.info.costUsd ?? 0;
    totalSteps += trajectory.trajectory?.length ?? 0;
  }
  return {
    runs,
    byStatus,
    totalCost,
    totalSteps,
    avgSteps: runs ? Math.round((totalSteps / runs) * 10) / 10 : 0,
  };
}

/** A short, readable report for the TUI and the CLI. */
export function renderTrajectorySummary(summary: TrajectorySummary): string {
  if (!summary.runs) return "(no runs recorded yet)";
  const lines = [`runs: ${summary.runs}`, `steps: ${summary.totalSteps} (avg ${summary.avgSteps})`, `cost: $${summary.totalCost.toFixed(4)}`];
  for (const [status, count] of Object.entries(summary.byStatus).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${status}: ${count}`);
  }
  return lines.join("\n");
}
