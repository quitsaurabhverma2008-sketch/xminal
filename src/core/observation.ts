/**
 * The observation layer — how a tool result becomes what the model sees.
 *
 * A raw tool result is ambiguous: "exit 1" inside free text can be output the
 * command *printed*, or the command's actual status. This module gives every
 * tool call a typed outcome (ok / failed / empty / timeout / denied / error)
 * and renders it so the model can tell them apart — with the exit code, the
 * duration, and an explicit note when the output was empty, truncated or
 * timed out.
 *
 * Pure functions, no I/O: everything here is unit-testable.
 */
import type { ToolResult } from "../tools/types";

export type ObservationOutcome = "ok" | "failed" | "empty" | "timeout" | "denied" | "error";

export interface Observation {
  /** exactly what goes into the model's tool message */
  readonly text: string;
  readonly outcome: ObservationOutcome;
  readonly exitCode?: number | null;
  readonly timedOut: boolean;
  readonly truncated: boolean;
  /** how many characters were elided */
  readonly elidedChars: number;
  readonly durationMs?: number;
}

export interface ObservationOptions {
  /** character budget for the whole observation (default 12000) */
  readonly maxChars?: number;
  /** extra warning appended (e.g. "this command failed twice") */
  readonly extraWarning?: string;
}

/** Keep the head and the tail of a long output — the middle is the least useful. */
export function clipOutput(text: string, maxChars: number): { text: string; elided: number } {
  if (text.length <= maxChars) return { text, elided: 0 };
  const head = Math.floor(maxChars * 0.65);
  const tail = Math.max(0, maxChars - head);
  const elided = text.length - head - tail;
  return {
    text: `${text.slice(0, head)}\n… <${elided} characters elided> …\n${tail > 0 ? text.slice(text.length - tail) : ""}`,
    elided,
  };
}

/** Read the exit code / duration / timeout out of a tool result's meta. */
function metaOf(result: ToolResult): { exitCode?: number | null; durationMs?: number; timedOut: boolean } {
  const meta = (result.meta ?? {}) as Record<string, unknown>;
  const exitCode = typeof meta.exitCode === "number" ? meta.exitCode : meta.exitCode === null ? null : undefined;
  const durationMs = typeof meta.durationMs === "number" ? meta.durationMs : undefined;
  const timedOut = meta.timedOut === true;
  return { exitCode, durationMs, timedOut };
}

/**
 * Render a tool result as an observation.
 *
 * The result content is expected to already carry the command echo and the
 * stdout/stderr sections (that is what the bash tool produces); this function
 * adds the typed framing and the warnings.
 */
export function renderObservation(result: ToolResult, options: ObservationOptions = {}): Observation {
  const maxChars = options.maxChars ?? 12_000;
  const { exitCode, durationMs, timedOut } = metaOf(result);
  const isError = Boolean(result.isError);

  let outcome: ObservationOutcome = "ok";
  if (timedOut) outcome = "timeout";
  else if (isError && exitCode !== 0) outcome = "failed";
  else if (isError) outcome = "error";

  const body = result.content ?? "";
  const clipped = clipOutput(body, maxChars);
  const truncated = clipped.elided > 0;
  // "no output" means the command produced no stdout/stderr — the shell tool
  // still echoes the command and its exit code, so the body is never blank
  const hasOutput = /--- (stdout|stderr) ---/.test(body);
  const empty = body.trim().length === 0 || !hasOutput;

  const warnings: string[] = [];
  if (timedOut) {
    warnings.push(
      `The command was cancelled because it took too long. It may have been waiting for input or otherwise blocked. ` +
        `Run something that finishes quickly instead.`,
    );
  } else if (outcome === "failed") {
    warnings.push(
      `The command failed with exit code ${exitCode ?? "?"}. Read the output above before running it again — ` +
        `running the same command unchanged will fail the same way.`,
    );
  } else if (outcome === "error") {
    warnings.push("The tool reported an error. Fix the cause before continuing.");
  }
  if (empty && !timedOut) {
    warnings.push("The command ran successfully and did not produce any output.");
  }
  if (truncated) {
    warnings.push(
      `The output was too long: ${clipped.elided} characters were elided. Use a narrower command ` +
        `(head/tail/grep) or redirect the output to a file and search in it.`,
    );
  }
  if (options.extraWarning) warnings.push(options.extraWarning);

  const parts: string[] = [];
  if (outcome === "timeout") {
    parts.push(`<observation>\n${clipped.text}\n</observation>`);
  } else {
    parts.push(`<observation>\n${clipped.text}\n</observation>`);
  }
  for (const warning of warnings) parts.push(`<warning>\n${warning}\n</warning>`);

  return {
    text: parts.join("\n"),
    outcome: empty && outcome === "ok" ? "empty" : outcome,
    exitCode,
    timedOut,
    truncated,
    elidedChars: clipped.elided,
    durationMs,
  };
}

/** A short, human-readable line for the TUI (the tool row). */
export function observationSummary(observation: Observation): string {
  switch (observation.outcome) {
    case "ok":
      return "ok";
    case "empty":
      return "ok · no output";
    case "failed":
      return `failed (exit ${observation.exitCode ?? "?"})`;
    case "timeout":
      return "timed out";
    case "denied":
      return "denied";
    default:
      return "error";
  }
}
