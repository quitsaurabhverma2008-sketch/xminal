/**
 * The architect/editor split — a planner that cannot touch the code and an
 * editor that only sees the plan.
 *
 * Two models with two jobs: the planner studies the repository and writes a
 * plan (read-only, no file writes, no shell); the editor receives that plan
 * and implements it with a fresh history. The separation makes the plan
 * reviewable and keeps the implementation phase focused.
 */

/** One step of the plan. */
export interface PlanStep {
  readonly path: string;
  readonly action: "create" | "modify" | "delete";
  readonly rationale: string;
}

export interface Plan {
  readonly goal: string;
  readonly steps: PlanStep[];
  readonly notes: string;
}

export interface ArchitectResult {
  readonly plan: Plan;
  /** the raw planner output */
  readonly planText: string;
  /** what the editor said */
  readonly editorText: string;
  readonly plannerModel: string;
  readonly editorModel: string;
  readonly cost: number;
}

/** Parse a plan out of the planner's text (JSON or a bullet list). */
export function parsePlan(text: string): Plan {
  const trimmed = (text ?? "").trim();
  // 1. a JSON object (possibly wrapped in a code fence)
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidate = fence ? fence[1] : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1)) as Partial<Plan>;
      const steps = Array.isArray(parsed.steps)
        ? parsed.steps.map((step) => {
            const record = (step ?? {}) as unknown as Record<string, unknown>;
            const action = String(record.action ?? "modify").toLowerCase();
            return {
              path: String(record.path ?? ""),
              action: (action === "create" || action === "delete" ? action : "modify") as PlanStep["action"],
              rationale: String(record.rationale ?? ""),
            };
          })
        : [];
      return {
        goal: String(parsed.goal ?? ""),
        steps,
        notes: String(parsed.notes ?? ""),
      };
    } catch {
      // fall through to the bullet parser
    }
  }
  // 2. a bullet list: "- src/a.ts — because …"
  const steps: PlanStep[] = [];
  let goal = "";
  let notes = "";
  for (const line of trimmed.split("\n")) {
    const bullet = /^\s*[-*]\s*(.+)$/.exec(line);
    if (!bullet) {
      if (!goal && line.trim()) goal = line.trim().slice(0, 200);
      continue;
    }
    const body = bullet[1];
    const split = body.split(/\s+[—-]\s+|:\s+/);
    const path = (split[0] ?? "").trim();
    const rationale = (split.slice(1).join(" — ") ?? "").trim();
    if (!path) continue;
    const action = /\bcreate|add\b/i.test(path) ? "create" : /\bdelete|remove\b/i.test(path) ? "delete" : "modify";
    steps.push({ path, action, rationale });
  }
  if (!goal) goal = steps[0]?.rationale ?? "";
  return { goal, steps, notes };
}

/** Render the plan for the editor model. */
export function renderPlanForEditor(plan: Plan, request: string): string {
  const lines: string[] = [];
  lines.push(`Request: ${request}`);
  if (plan.goal) lines.push(`Goal: ${plan.goal}`);
  if (plan.steps.length) {
    lines.push("Plan:");
    for (const [index, step] of plan.steps.entries()) {
      lines.push(`${index + 1}. ${step.action} ${step.path}${step.rationale ? ` — ${step.rationale}` : ""}`);
    }
  }
  if (plan.notes) lines.push(`Notes: ${plan.notes}`);
  lines.push("");
  lines.push("Implement this plan step by step. Follow the project's conventions and verify the result.");
  return lines.join("\n");
}

/** The planner's instructions — the planner may look, but never touch. */
export const ARCHITECT_SYSTEM = `You are the architect of a coding agent.
Study the request and the repository (read files, search, list) and write a plan.

You must NOT change any file and you must NOT run commands that change state.
Your output is the plan the editor will follow, so make it unambiguous:
a goal, the files to create/modify/delete with a one-line reason each, and any
notes or constraints.

Answer with a JSON object:
{"goal": "...", "steps": [{"path": "src/x.ts", "action": "modify", "rationale": "..."}], "notes": "..."}`;

export interface ArchitectHandlers {
  /** the planner: receives the request, returns the plan text */
  planner: (request: string) => Promise<string>;
  /** the editor: receives the rendered plan, returns its reply */
  editor: (plan: string) => Promise<string>;
  readonly plannerModel: string;
  readonly editorModel: string;
  readonly cost?: number;
}

/** Run the planner, then the editor. */
export async function runArchitect(request: string, handlers: ArchitectHandlers): Promise<ArchitectResult> {
  const planText = await handlers.planner(request);
  const plan = parsePlan(planText);
  const editorText = await handlers.editor(renderPlanForEditor(plan, request));
  return {
    plan,
    planText,
    editorText,
    plannerModel: handlers.plannerModel,
    editorModel: handlers.editorModel,
    cost: handlers.cost ?? 0,
  };
}
