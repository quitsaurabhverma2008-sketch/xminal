import { estimateTokens } from "./tool-usage";
/**
 * The condenser — what happens when the context grows past the window.
 *
 * A lossy truncation ("keep the last N messages, squash the rest to 160
 * characters each") destroys information on every pass: the summary of the
 * summary is worse than the summary. A condenser instead:
 *
 *   - triggers on a real budget (tokens), not a message count alone;
 *   - protects the head (the system prompt and the task brief);
 *   - keeps a suffix sized to the budget;
 *   - drops the middle **on tool-call boundaries**, so a request never carries
 *     an assistant tool call without its result;
 *   - summarises with a model when one is available, and falls back to a
 *     mechanical digest when it is not — the context is never simply lost;
 *   - keeps the previous summary, so the summary is cumulative.
 */

export type CondensationReason = "request" | "tokens" | "events";
export type CondensationRequirement = "hard" | "soft";

export interface CondenserOptions {
  /** how many messages may be kept before condensation is needed (default 80) */
  readonly maxEvents: number;
  /** how many messages at the head are never condensed (default 4) */
  readonly keepFirst: number;
  /** condense above this fraction of the context window (default 0.8) */
  readonly maxTokensRatio: number;
  /** refuse to condense when less than this fraction would be dropped (default 0.1) */
  readonly minProgress: number;
}

export const DEFAULT_CONDENSER_OPTIONS: CondenserOptions = {
  maxEvents: 80,
  keepFirst: 4,
  maxTokensRatio: 0.8,
  minProgress: 0.1,
};

export interface CondenserMessage {
  readonly role: string;
  readonly content: string;
  readonly toolCalls?: unknown[];
  readonly toolCallId?: string;
}

export interface CondensationResult {
  readonly messages: CondenserMessage[];
  /** true when something was condensed */
  readonly condensed: boolean;
  /** how many messages were dropped */
  readonly forgotten: number;
  readonly reason?: CondensationReason;
  /** why the condensation did not happen */
  readonly skipped?: string;
}

/** The estimated size of a message list, including the tool schemas. */
export function estimatePromptTokens(messages: CondenserMessage[], schemaChars = 0): number {
  // chars → tokens; the old code did estimateTokens(String(schemaChars)) which
  // measured the *digits* of the number, i.e. ~1 token no matter the schema size
  let total = Math.ceil(schemaChars / 4);
  for (const message of messages) {
    total += estimateTokens(message.content ?? "") + 4;
    if (message.toolCalls?.length) total += estimateTokens(JSON.stringify(message.toolCalls));
  }
  return total;
}

/** The reasons condensation is needed right now. */
export function condensationReasons(
  messages: CondenserMessage[],
  options: CondenserOptions = DEFAULT_CONDENSER_OPTIONS,
  contextWindow?: number,
): { reasons: Set<CondensationReason>; requirement: CondensationRequirement | undefined } {
  const reasons = new Set<CondensationReason>();
  if (messages.length > options.maxEvents) reasons.add("events");
  if (contextWindow && contextWindow > 0) {
    const used = estimatePromptTokens(messages);
    if (used > Math.floor(contextWindow * options.maxTokensRatio)) reasons.add("tokens");
  }
  if (reasons.size === 0) return { reasons, requirement: undefined };
  // token pressure is hard: the next request would fail before anything else
  // can run. The event count is only a heuristic, so it stays soft.
  const requirement: CondensationRequirement = reasons.has("tokens") ? "hard" : "soft";
  return { reasons, requirement };
}

/**
 * The range of messages to drop.
 *
 * The range never splits an assistant message that carries tool calls from
 * the tool results that answer it.
 */
export function pickForgetRange(
  messages: CondenserMessage[],
  keepFirst: number,
  keepLast: number,
): { start: number; end: number } {
  let start = Math.max(0, Math.min(keepFirst, messages.length));
  let end = Math.max(start, messages.length - Math.max(0, keepLast));
  // if the cut would separate a tool call from its result, move the cut back
  while (end < messages.length) {
    const boundary = messages[end];
    const previous = messages[end - 1];
    const breaksPair =
      (previous?.toolCalls?.length ?? 0) > 0 && boundary?.role !== "tool";
    if (!breaksPair) break;
    end -= 1;
    if (end <= start) {
      end = start;
      break;
    }
  }
  // never start in the middle of a tool result either
  while (start > 0 && messages[start]?.role === "tool") start -= 1;
  return { start, end };
}

/** The mechanical digest — used when no model is available to summarise. */
export function mechanicalSummary(messages: CondenserMessage[]): string {
  const lines: string[] = [];
  let lastRole = "";
  for (const message of messages) {
    const content = (message.content ?? "").replace(/\s+/g, " ").trim();
    if (!content) continue;
    if (message.role === lastRole) {
      lines[lines.length - 1] = `${lines[lines.length - 1]} | ${content.slice(0, 160)}`;
    } else {
      lines.push(`${message.role}: ${content.slice(0, 200)}`);
      lastRole = message.role;
    }
  }
  return lines.join("\n");
}

/** The prompt the summarising model receives. */
export const SUMMARIZE_SYSTEM = `You are maintaining a context-aware state summary for an interactive agent.
You will be given the events of an ongoing session, including the previous summary.
Keep the summary CUMULATIVE: the previous summary is part of the input, and your
output replaces it — never lose what it already contained.

Track:

USER_CONTEXT: (the user's requirements, goals and clarifications, in the user's voice)
TASK_TRACKING: (active tasks and their status)
COMPLETED: (what is finished, with the result)
PENDING: (what is still open)
CURRENT_STATE: (relevant variables, data structures, state)

For code tasks also include:
CODE_STATE: (file paths, function signatures, data structures)
TESTS: (failing cases, error messages, outputs)
CHANGES: (code edits)
DEPS: (dependencies, VERSION_CONTROL_STATUS: (branch, commits)

Write the summary in the USER's voice ("I asked you…", "you changed…").
Be concise. Do not invent facts that are not in the input.`;

/** The summarisation request for a model. */
export function summarizePrompt(previousSummary: string, messages: CondenserMessage[]): string {
  const events = messages
    .map((m) => `<EVENT role="${m.role}">\n${(m.content ?? "").slice(0, 4000)}\n</EVENT>`)
    .join("\n");
  const previous = previousSummary ? `<PREVIOUS SUMMARY>\n${previousSummary}\n</PREVIOUS SUMMARY>\n\n` : "";
  return `${previous}${events}\n\nNow write the updated summary using the rules.`;
}

/**
 * Condense a message list.
 *
 * `summarize` is called with the messages that are about to be dropped; it
 * returns the summary text. When it is missing or throws, the mechanical
 * digest is used instead — the context shrinks either way, it never vanishes.
 */
export function condense(
  messages: CondenserMessage[],
  options: CondenserOptions = DEFAULT_CONDENSER_OPTIONS,
  summarize?: (messages: CondenserMessage[], previousSummary: string) => string | Promise<string>,
  contextWindow?: number,
  force = false,
): CondensationResult {
  const { reasons, requirement } = condensationReasons(messages, options, contextWindow);
  if (!force && reasons.size === 0) {
    return { messages, condensed: false, forgotten: 0 };
  }
  const reason: CondensationReason = reasons.has("tokens") ? "tokens" : reasons.has("events") ? "events" : "request";
  const previousSummary = messages.find((m) => m.role === "summary")?.content ?? "";
  const keepLast = Math.max(4, Math.floor(messages.length / 2));
  const { start, end } = pickForgetRange(messages, options.keepFirst, keepLast);
  const forgotten = messages.slice(start, end);
  if (forgotten.length === 0) {
    return { messages, condensed: false, forgotten: 0, reason, skipped: "nothing to condense" };
  }
  if (forgotten.length < messages.length * options.minProgress) {
    return {
      messages,
      condensed: false,
      forgotten: 0,
      reason,
      skipped: `only ${forgotten.length} message(s) would be dropped — below the minimum progress`,
    };
  }
  const summaryText = (() => {
    try {
      const result = summarize?.(forgotten, previousSummary);
      if (typeof result === "string" && result.trim()) return result.trim();
    } catch {
      // fall through to the mechanical digest
    }
    return mechanicalSummary(forgotten);
  })();
  const head = messages.slice(0, start);
  const tail = messages.slice(end);
  const summaryMessage: CondenserMessage = {
    role: "summary",
    content: `[Session summary — ${forgotten.length} earlier message(s)]\n${summaryText}`,
  };
  return {
    messages: [...head, summaryMessage, ...tail],
    condensed: true,
    forgotten: forgotten.length,
    reason,
  };
}
