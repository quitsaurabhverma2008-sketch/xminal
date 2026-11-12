/**
 * Task understanding — turn a coding request into a brief the agent can keep
 * for the whole turn.
 *
 * The brief is deterministic (no model call, no network): goal, constraints,
 * acceptance criteria, edge cases and how the result will be verified. It is
 * injected into the prompt so the requirements survive implementation, and it
 * is what decides whether the request is clear enough to start or whether one
 * clarifying question is worth asking.
 *
 * The rule from the workflow: ask only when the request is genuinely
 * ambiguous or risky — never to stall a clear request.
 */

export type TaskKind = "create" | "fix" | "refactor" | "explain" | "review" | "chat" | "unknown";
export type Ambiguity = "none" | "low" | "high";

export interface TaskBrief {
  /** one-line restatement of the request */
  readonly goal: string;
  readonly kind: TaskKind;
  /** explicit limits the user gave ("keep the API stable") */
  readonly constraints: string[];
  /** what "done" looks like */
  readonly acceptance: string[];
  /** cases the change must survive */
  readonly edgeCases: string[];
  /** how the result will be checked */
  readonly verification: string[];
  readonly ambiguity: Ambiguity;
  /** the single clarifying question to ask (only when ambiguity is high) */
  readonly question?: string;
  /** the rendered brief for the prompt */
  readonly summary: string;
}

const KIND_PATTERNS: Array<[TaskKind, RegExp]> = [
  // order matters: the more specific intent wins ("refactor X to use the new
  // module" is a refactor, not a "create" because it contains "new")
  ["fix", /\b(fix|bug|error|crash|broken|not working|doesn'?t work|fail(s|ing|ed)?|regression|typo)\b/i],
  ["refactor", /\b(refactor|rename|clean\s?up|migrate|optimi[sz]e|simplif|restructure|extract|rewrite)\b/i],
  ["review", /\b(review|audit|inspect)\b/i],
  ["create", /\b(create|make|build|generate|add|write|scaffold|implement)\b/i],
  ["explain", /\b(explain|how does|why|what is|what does|walk me through|understand)\b/i],
];

/** Words that signal the request is not concrete enough to act on. */
const VAGUE = /\b(better|improve|optimi[sz]e|clean\s?up|nice|good|proper|properly|fix it|fix this|that thing|somehow|etc\.?|whatever|kuch|jo bhi|sab|the same thing|more)\b/i;

/** Actions that deserve a confirmation before they run. */
const RISKY = /\b(delete|remove|drop|migrat|deploy|production|prod\b|password|secret|token|api key|credit card|payment|database|schema|force push|reset --hard|rm -rf)\b/i;

/** A concrete target: a file, a path, an identifier or a quoted phrase. */
const TARGET = /(\.[A-Za-z]{1,5}\b|\b[\w-]+\/[\w.-]+\b|`[^`]+`|"[^"]+"|\b[A-Z][a-zA-Z0-9_]{2,}\b|\b[\w-]+\(\)|\b[\w-]+\.(ts|tsx|js|jsx|py|go|rs|java|kt|rb|php|c|cpp|h|md|json|ya?ml|toml)\b)/;

function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const cut = flat.match(/^(.+?[.!?])(\s|$)/);
  const sentence = (cut ? cut[1] : flat).trim();
  return sentence.length > 160 ? `${sentence.slice(0, 159)}…` : sentence;
}

function kindOf(text: string): TaskKind {
  for (const [kind, pattern] of KIND_PATTERNS) {
    if (pattern.test(text)) return kind;
  }
  // a question without an action verb is a chat/question, not a coding task
  if (/\?\s*$/.test(text.trim()) || /^(what|why|how|who|when|where|is|are|do|does|can)\b/i.test(text.trim())) return "chat";
  return "unknown";
}

const ACCEPTANCE_BY_KIND: Record<TaskKind, string[]> = {
  create: ["the new file/module exists and does what the request describes", "no unrelated files were touched"],
  fix: ["the reported behaviour is fixed", "the failure no longer reproduces", "no unrelated behaviour changed"],
  refactor: ["the public behaviour is unchanged", "the change is small and reviewable"],
  explain: ["the explanation covers what was asked, with file references where useful"],
  review: ["findings are concrete, with file:line and a severity", "no speculative findings are reported"],
  chat: ["the reply answers the question directly"],
  unknown: ["the request is addressed as stated"],
};

const EDGE_CASES_BY_KIND: Record<TaskKind, string[]> = {
  create: ["empty and malformed input", "the change works without the new optional setup"],
  fix: ["the same input that triggered the bug", "the surrounding behaviour stays intact"],
  refactor: ["callers outside the touched code still work", "error paths still behave the same"],
  explain: [],
  review: ["the diff, not the whole repository", "changed code paths and their tests"],
  chat: [],
  unknown: [],
};

/**
 * Build the task brief.
 *
 * `verifyCommand` is the project's own check (detected elsewhere) — it becomes
 * the primary verification step.
 */
export function analyzeRequest(text: string, options: { verifyCommand?: string } = {}): TaskBrief {
  const goal = firstSentence(text);
  const kind = kindOf(text);
  const hasTarget = TARGET.test(text);
  const vague = VAGUE.test(text);
  const risky = RISKY.test(text);

  const constraints: string[] = [];
  if (/keep|preserve|don'?t change|no refactor|backward|compatib/i.test(text)) {
    constraints.push("keep existing behaviour and public interfaces intact");
  }
  if (/only|just|minimal|small|focused/i.test(text)) {
    constraints.push("make the smallest change that satisfies the request");
  }
  if (/no (test|new dep|dependenc)/i.test(text)) constraints.push("do not add tests or new dependencies");
  if (risky) constraints.push("this touches something destructive — confirm before acting");

  const acceptance = [...ACCEPTANCE_BY_KIND[kind]];
  const edgeCases = [...EDGE_CASES_BY_KIND[kind]];

  const verification: string[] = [];
  if (options.verifyCommand) verification.push(`run \`${options.verifyCommand}\` and report the real result`);
  else verification.push("check the change by running it (or explain why that is not possible)");
  if (kind === "fix") verification.push("re-run the reproduction before reporting the fix");
  if (kind === "refactor") verification.push("confirm the existing tests still pass");

  // ambiguity: an action without a target, or a vague goal, is worth one question
  let ambiguity: Ambiguity = "none";
  let question: string | undefined;
  const actionVerb = /\b(create|make|build|fix|add|implement|refactor|clean|rename|migrate|optimi[sz]e|remove|delete|update)\b/i.test(text);
  if (actionVerb && !hasTarget && (vague || text.trim().length < 18)) {
    ambiguity = "high";
    question = `Which file or function should I change for "${goal.slice(0, 80)}"?`;
  } else if (actionVerb && vague) {
    ambiguity = "low";
  } else if (actionVerb && !hasTarget && text.trim().length < 30) {
    ambiguity = "low";
  }
  if (risky && ambiguity === "none") ambiguity = "low";

  const summary = renderTaskBrief({ goal, kind, constraints, acceptance, edgeCases, verification, ambiguity, question });
  return { goal, kind, constraints, acceptance, edgeCases, verification, ambiguity, question, summary };
}

/** Render the brief for the prompt — bounded. */
function renderTaskBrief(brief: Omit<TaskBrief, "summary">, maxChars = 800): string {
  const lines: string[] = [];
  lines.push(`Goal: ${brief.goal}`);
  lines.push(`Kind: ${brief.kind}${brief.ambiguity === "high" ? " (ambiguous — ask one question first)" : brief.ambiguity === "low" ? " (slightly vague — state your assumption)" : ""}`);
  if (brief.constraints.length) lines.push(`Constraints: ${brief.constraints.join("; ")}`);
  if (brief.acceptance.length) lines.push(`Done when: ${brief.acceptance.join("; ")}`);
  if (brief.edgeCases.length) lines.push(`Edge cases: ${brief.edgeCases.join("; ")}`);
  if (brief.verification.length) lines.push(`Verify: ${brief.verification.join("; ")}`);
  const text = lines.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}
