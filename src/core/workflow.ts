/**
 * The coding workflow — understand → inspect → plan → implement → verify →
 * review → summarize.
 *
 * The phases are not a ceremony: each one has a rule, the agent tracks which
 * ones it has already done during the turn, and the prompt states the phase
 * that is expected next. In compose mode the whole sequence is explicit; in
 * build mode the same order applies without the ceremony.
 *
 * The state is tracked per turn, so a new turn starts from "understand"
 * again — but the session keeps the last known phase for the TUI.
 */

export type WorkflowPhase = "understand" | "inspect" | "plan" | "implement" | "verify" | "review" | "summarize";

export const WORKFLOW_ORDER: readonly WorkflowPhase[] = [
  "understand",
  "inspect",
  "plan",
  "implement",
  "verify",
  "review",
  "summarize",
];

export interface WorkflowState {
  /** phases already done in this turn */
  readonly done: Set<WorkflowPhase>;
  /** tools used in this turn, by name */
  readonly tools: Set<string>;
}

export function newWorkflowState(): WorkflowState {
  return { done: new Set(), tools: new Set() };
}

/** Tool groups that count as "I looked at the repository". */
const INSPECT_TOOLS = new Set(["read", "glob", "grep", "list", "git"]);
const PLAN_TOOLS = new Set(["todo", "plan"]);
const EDIT_TOOLS = new Set(["write", "edit", "multi_edit"]);

/** Record a tool call and mark the phases it proves. */
export function noteTool(state: WorkflowState, tool: string): WorkflowState {
  state.tools.add(tool);
  // acting at all means the request was understood
  state.done.add("understand");
  if (INSPECT_TOOLS.has(tool)) state.done.add("inspect");
  if (PLAN_TOOLS.has(tool)) state.done.add("plan");
  if (EDIT_TOOLS.has(tool)) {
    state.done.add("plan");
    state.done.add("implement");
  }
  return state;
}

/** Mark verification as done (the verify command ran and passed). */
export function noteVerified(state: WorkflowState): WorkflowState {
  state.done.add("implement");
  state.done.add("verify");
  return state;
}

/** Mark the review phase as done (the agent reviewed its own change). */
export function noteReviewed(state: WorkflowState): WorkflowState {
  state.done.add("review");
  return state;
}

/** The phase the agent is expected to be in right now. */
export function currentPhase(state: WorkflowState): WorkflowPhase {
  for (const phase of WORKFLOW_ORDER) {
    if (!state.done.has(phase)) return phase;
  }
  return "summarize";
}

/** The rule for a phase — one line, injected into the prompt. */
export const PHASE_RULES: Record<WorkflowPhase, string> = {
  understand: "Restate the goal, the constraints and what 'done' means before touching anything.",
  inspect: "Read the relevant files, the project instructions and the tests. Do not guess a file's content.",
  plan: "Write a short plan (or a todo list) with the concrete steps before editing.",
  implement: "Make focused, reviewable edits that follow the project's conventions. No unrelated refactors.",
  verify: "Run the project's verification command and fix what your change broke. Never report success you did not observe.",
  review: "Re-read your own diff: correctness, regressions, missing tests, edge cases, security.",
  summarize: "Report what changed, how it was verified (with the real output) and what is left.",
};

/**
 * The workflow block for the prompt.
 *
 * `mode` decides how explicit it is: compose/plan show the full sequence,
 * build shows the same order in one line, review/chat keep it short.
 */
export function renderWorkflow(mode: string, state: WorkflowState): string {
  const phase = currentPhase(state);
  if (mode === "chat") return "";
  if (mode === "review") {
    return `Workflow (review mode): inspect the diff → report concrete findings with file:line and a severity.\nCurrent phase: ${phase}`;
  }
  const rule = PHASE_RULES[phase];
  const explicit = mode === "compose" || mode === "plan";
  const sequence = WORKFLOW_ORDER.join(" → ");
  return explicit
    ? `Workflow: ${sequence}\nCurrent phase: ${phase} — ${rule}`
    : `Workflow: ${sequence} (keep the order, skip what does not apply).\nCurrent phase: ${phase} — ${rule}`;
}
